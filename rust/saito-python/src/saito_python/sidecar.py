import asyncio
import json
import os
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .errors import SaitoError
from .runtime import (
    SaitoHostBridge,
    SaitoRuntimeHandle,
    SaitoRuntimeLoader,
    SaitoTransactionHandle,
    SaitoWalletHandle,
)


def _default_sidecar_script() -> Path:
    return Path(__file__).resolve().parent / "bridge" / "node_runtime_sidecar.js"


@dataclass(slots=True)
class SidecarProcessConfig:
    command: list[str] = field(default_factory=list)
    host: str = "127.0.0.1"
    port: int = 3001
    startup_timeout: float = 30.0
    shutdown_timeout: float = 5.0
    working_directory: Path | None = None
    env: dict[str, str] = field(default_factory=dict)

    def normalized_command(self) -> list[str]:
        if self.command:
            return list(self.command)
        return ["node", str(_default_sidecar_script())]

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


class SidecarWalletHandle(SaitoWalletHandle):
    def __init__(self, runtime: "SidecarRuntimeHandle") -> None:
        self._runtime = runtime

    async def get_public_key(self) -> str:
        payload = await self._runtime._request_json("GET", "/wallet")
        return str(payload["public_key"])

    async def get_balance(self) -> int:
        payload = await self._runtime._request_json("GET", "/wallet")
        return int(payload["balance"])


class SidecarTransactionHandle(SaitoTransactionHandle):
    def __init__(self, signature: str, data: bytes | bytearray) -> None:
        self.signature = signature
        self.data = data


class SidecarRuntimeHandle(SaitoRuntimeHandle):
    def __init__(
        self,
        base_url: str,
        process: asyncio.subprocess.Process,
        shutdown_timeout: float,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._process = process
        self._shutdown_timeout = shutdown_timeout
        self._wallet = SidecarWalletHandle(self)

    def get_wallet(self) -> SaitoWalletHandle:
        return self._wallet

    async def create_transaction(
        self,
        public_key: str,
        amount: int,
        fee: int,
        force_merge: bool,
    ) -> SaitoTransactionHandle:
        payload = await self._request_json(
            "POST",
            "/transactions/create",
            {
                "recipient": public_key,
                "amount": amount,
                "fee": fee,
                "force_merge": force_merge,
            },
        )
        return SidecarTransactionHandle(str(payload["signature"]), b"")

    async def process_timer_event(self, duration_in_ms: int) -> None:
        _ = duration_in_ms

    async def process_stat_interval(self, current_time: int) -> None:
        _ = current_time

    async def get_latest_block_hash(self) -> str:
        payload = await self._request_json("GET", "/blocks/latest-hash")
        return str(payload["hash"])

    async def connect_peer(self, peer_url: str) -> None:
        await self._request_json("POST", "/peers/connect", {"peer_url": peer_url})

    async def close(self) -> None:
        try:
            await self._request_json("POST", "/shutdown")
        except SaitoError:
            pass
        if self._process.returncode is None:
            try:
                await asyncio.wait_for(self._process.wait(), timeout=self._shutdown_timeout)
            except asyncio.TimeoutError:
                self._process.terminate()
                await self._process.wait()

    async def _request_json(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        data: bytes | None = None
        headers = {"content-type": "application/json"}
        if payload is not None:
                        data = json.dumps(dict(payload)).encode("utf-8")
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            response_text = await asyncio.to_thread(_read_response_text, request)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise SaitoError(f"Sidecar request failed: {method} {path}: {detail}") from error
        except urllib.error.URLError as error:
            raise SaitoError(f"Sidecar request failed: {method} {path}: {error.reason}") from error

        if not response_text:
            return {}
        return json.loads(response_text)


class NodejsSidecarRuntimeLoader(SaitoRuntimeLoader):
    def __init__(self, config: SidecarProcessConfig | None = None) -> None:
        self._config = config or SidecarProcessConfig()
        self._process: asyncio.subprocess.Process | None = None

    async def initialize_runtime(
        self,
        config_json: str,
        private_key: str,
        log_level_num: int,
        haste_multiplier: int,
        delete_old_blocks: bool,
        host_bridge: SaitoHostBridge,
    ) -> SaitoRuntimeHandle:
        _ = host_bridge
        if self._process is not None and self._process.returncode is None:
            raise SaitoError("Sidecar runtime loader already has an active process")

        parsed_config = json.loads(config_json)
        env = os.environ.copy()
        env.update(self._config.env)
        env.update(
            {
                "SAITO_SIDECAR_HOST": self._config.host,
                "SAITO_SIDECAR_PORT": str(self._config.port),
                "SAITO_SIDECAR_DATA_DIR": str(parsed_config.get("data_dir", "")),
                "SAITO_CONFIG_JSON": config_json,
                "SAITO_PRIVATE_KEY": private_key,
                "SAITO_LOG_LEVEL_NUM": str(log_level_num),
                "SAITO_HASTE_MULTIPLIER": str(haste_multiplier),
                "SAITO_DELETE_OLD_BLOCKS": "true" if delete_old_blocks else "false",
            }
        )

        self._process = await asyncio.create_subprocess_exec(
            *self._config.normalized_command(),
            cwd=str(self._config.working_directory) if self._config.working_directory else None,
            env=env,
        )

        runtime = SidecarRuntimeHandle(
            base_url=self._config.base_url,
            process=self._process,
            shutdown_timeout=self._config.shutdown_timeout,
        )
        await wait_for_sidecar_health(runtime, timeout=self._config.startup_timeout)
        return runtime


class SidecarHostBridge(SaitoHostBridge):
    def __init__(self) -> None:
        self._runtime: SidecarRuntimeHandle | None = None

    def bind_runtime(self, runtime: SaitoRuntimeHandle) -> None:
        if not isinstance(runtime, SidecarRuntimeHandle):
            raise SaitoError("SidecarHostBridge requires a SidecarRuntimeHandle")
        self._runtime = runtime

    async def start(self) -> None:
        return None

    async def close(self) -> None:
        if self._runtime is not None:
            await self._runtime.close()
            self._runtime = None

    async def wait_until_ready(self, timeout: float | None = None) -> None:
        await wait_for_sidecar_health(self._require_runtime(), timeout=timeout)

    async def connect_peer(self, peer_url: str) -> None:
        await self._require_runtime().connect_peer(peer_url)

    def _require_runtime(self) -> SidecarRuntimeHandle:
        if self._runtime is None:
            raise SaitoError("Sidecar host bridge has not been bound to a runtime")
        return self._runtime


async def wait_for_sidecar_health(
    runtime: SidecarRuntimeHandle,
    timeout: float | None = None,
) -> None:
    timeout = 30.0 if timeout is None else timeout
    deadline = asyncio.get_running_loop().time() + timeout
    last_error: Exception | None = None
    while asyncio.get_running_loop().time() < deadline:
        try:
            payload = await runtime._request_json("GET", "/health")
            if payload.get("ready"):
                return
        except SaitoError as error:
            last_error = error
        await asyncio.sleep(0.2)
    raise SaitoError(f"Timed out waiting for sidecar health: {last_error}")


def _read_response_text(request: urllib.request.Request) -> str:
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.read().decode("utf-8")