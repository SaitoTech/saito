import asyncio
import json
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from .backend import SaitoBackendFactory, SaitoClientBackend, SaitoNodeBackend
from .errors import SaitoError
from .models import TransactionRecord, TransactionRequest, WalletSnapshot


@runtime_checkable
class SaitoWalletHandle(Protocol):
    async def get_public_key(self) -> str: ...

    async def get_balance(self) -> int: ...


@runtime_checkable
class SaitoTransactionHandle(Protocol):
    signature: str
    data: bytes | bytearray


@runtime_checkable
class SaitoRuntimeHandle(Protocol):
    def get_wallet(self) -> SaitoWalletHandle: ...

    async def create_transaction(
        self,
        public_key: str,
        amount: int,
        fee: int,
        force_merge: bool,
    ) -> SaitoTransactionHandle: ...

    async def process_timer_event(self, duration_in_ms: int) -> None: ...

    async def process_stat_interval(self, current_time: int) -> None: ...


@runtime_checkable
class SaitoHostBridge(Protocol):
    def bind_runtime(self, runtime: SaitoRuntimeHandle) -> None: ...

    async def start(self) -> None: ...

    async def close(self) -> None: ...

    async def wait_until_ready(self, timeout: float | None = None) -> None: ...

    async def connect_peer(self, peer_url: str) -> None: ...


@runtime_checkable
class SaitoRuntimeLoader(Protocol):
    async def initialize_runtime(
        self,
        config_json: str,
        private_key: str,
        log_level_num: int,
        haste_multiplier: int,
        delete_old_blocks: bool,
        host_bridge: SaitoHostBridge,
    ) -> SaitoRuntimeHandle: ...


class NullHostBridge:
    def __init__(self) -> None:
        self.runtime: SaitoRuntimeHandle | None = None

    def bind_runtime(self, runtime: SaitoRuntimeHandle) -> None:
        self.runtime = runtime

    async def start(self) -> None:
        return None

    async def close(self) -> None:
        return None

    async def wait_until_ready(self, timeout: float | None = None) -> None:
        return None

    async def connect_peer(self, peer_url: str) -> None:
        raise SaitoError("Configured host bridge does not support peer connections")


HostBridgeFactory = Callable[[Mapping[str, Any], bool], SaitoHostBridge]


@dataclass(slots=True, frozen=True)
class RuntimeBackendSettings:
    timer_interval_seconds: float = 0.1
    stat_interval_seconds: float = 5.0
    default_fee: int = 0
    force_merge: bool = False


class RuntimeBackendFactory(SaitoBackendFactory):
    def __init__(
        self,
        runtime_loader: SaitoRuntimeLoader,
        host_bridge_factory: HostBridgeFactory | None = None,
        settings: RuntimeBackendSettings = RuntimeBackendSettings(),
    ) -> None:
        self._runtime_loader = runtime_loader
        self._host_bridge_factory = host_bridge_factory
        self._settings = settings

    async def create_client(self, config: Mapping[str, Any]) -> SaitoClientBackend:
        return _RuntimeBackedClientBackend(
            config=config,
            runtime_loader=self._runtime_loader,
            host_bridge=self._build_host_bridge(config, is_node=False),
            settings=self._settings,
        )

    async def create_node(self, config: Mapping[str, Any]) -> SaitoNodeBackend:
        return _RuntimeBackedNodeBackend(
            config=config,
            runtime_loader=self._runtime_loader,
            host_bridge=self._build_host_bridge(config, is_node=True),
            settings=self._settings,
        )

    def _build_host_bridge(
        self,
        config: Mapping[str, Any],
        *,
        is_node: bool,
    ) -> SaitoHostBridge:
        if self._host_bridge_factory is None:
            return NullHostBridge()
        return self._host_bridge_factory(config, is_node)


class _RuntimeBackedClientBackend(SaitoClientBackend):
    def __init__(
        self,
        config: Mapping[str, Any],
        runtime_loader: SaitoRuntimeLoader,
        host_bridge: SaitoHostBridge,
        settings: RuntimeBackendSettings,
    ) -> None:
        self._config = dict(config)
        self._runtime_loader = runtime_loader
        self._host_bridge = host_bridge
        self._settings = settings
        self._runtime: SaitoRuntimeHandle | None = None
        self._timer_task: asyncio.Task[None] | None = None
        self._stat_task: asyncio.Task[None] | None = None
        self._last_timer_tick_ms: int | None = None

    async def start(self) -> None:
        if self._runtime is not None:
            return
        runtime = await self._runtime_loader.initialize_runtime(
            json.dumps(self._config),
            str(self._config.get("private_key") or ""),
            _normalize_log_level(self._config.get("log_level", "info")),
            int(self._config.get("haste_multiplier", 1)),
            bool(self._config.get("delete_old_blocks", False)),
            self._host_bridge,
        )
        self._runtime = runtime
        self._host_bridge.bind_runtime(runtime)
        await self._host_bridge.start()
        self._last_timer_tick_ms = _current_time_ms()
        self._timer_task = asyncio.create_task(self._run_timer_loop())
        self._stat_task = asyncio.create_task(self._run_stat_loop())

    async def close(self) -> None:
        await _cancel_task(self._timer_task)
        await _cancel_task(self._stat_task)
        self._timer_task = None
        self._stat_task = None
        await self._host_bridge.close()
        self._runtime = None
        self._last_timer_tick_ms = None

    async def get_wallet(self) -> WalletSnapshot:
        runtime = self._require_runtime()
        wallet = runtime.get_wallet()
        return WalletSnapshot(
            public_key=str(await wallet.get_public_key()),
            balance=int(await wallet.get_balance()),
        )

    async def create_transaction(self, request: TransactionRequest) -> TransactionRecord:
        runtime = self._require_runtime()
        wallet = runtime.get_wallet()
        tx = await runtime.create_transaction(
            request.recipient,
            request.amount,
            self._settings.default_fee,
            self._settings.force_merge,
        )
        if request.metadata:
            _apply_transaction_metadata(tx, request.metadata)
        return TransactionRecord(
            signature=str(getattr(tx, "signature", "")),
            sender=str(await wallet.get_public_key()),
            recipient=request.recipient,
            amount=request.amount,
            metadata=dict(request.metadata),
        )

    def _require_runtime(self) -> SaitoRuntimeHandle:
        if self._runtime is None:
            raise SaitoError("Runtime backend has not been started")
        return self._runtime

    async def _run_timer_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._settings.timer_interval_seconds)
                runtime = self._require_runtime()
                now = _current_time_ms()
                previous = self._last_timer_tick_ms or now
                self._last_timer_tick_ms = now
                await runtime.process_timer_event(max(now - previous, 0))
        except asyncio.CancelledError:
            raise

    async def _run_stat_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._settings.stat_interval_seconds)
                await self._require_runtime().process_stat_interval(_current_time_ms())
        except asyncio.CancelledError:
            raise


class _RuntimeBackedNodeBackend(_RuntimeBackedClientBackend, SaitoNodeBackend):
    async def wait_until_ready(self, timeout: float | None = None) -> None:
        self._require_runtime()
        await self._host_bridge.wait_until_ready(timeout=timeout)

    async def connect_peer(self, peer_url: str) -> None:
        self._require_runtime()
        await self._host_bridge.connect_peer(peer_url)


def _normalize_log_level(log_level: Any) -> int:
    if isinstance(log_level, int):
        return log_level
    normalized = str(log_level).strip().lower()
    mapping = {
        "error": 0,
        "warn": 1,
        "warning": 1,
        "info": 2,
        "debug": 3,
        "trace": 4,
    }
    if normalized not in mapping:
        raise SaitoError(f"Unsupported log level: {log_level}")
    return mapping[normalized]


def _apply_transaction_metadata(
    tx: SaitoTransactionHandle,
    metadata: Mapping[str, Any],
) -> None:
    if not hasattr(tx, "data"):
        raise SaitoError("Configured runtime transaction handle does not expose data")
    tx.data = json.dumps(metadata, separators=(",", ":")).encode("utf-8")


async def _cancel_task(task: asyncio.Task[None] | None) -> None:
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        return


def _current_time_ms() -> int:
    return int(time.time() * 1000)