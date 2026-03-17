from pathlib import Path

import pytest

from saito_python import (
    ClientConfig,
    NodeConfig,
    RuntimeBackendFactory,
    RuntimeBackendSettings,
    SaitoClient,
    SaitoNode,
)


class FakeWallet:
    async def get_public_key(self) -> str:
        return "python-public-key"

    async def get_balance(self) -> int:
        return 42


class FakeTransaction:
    def __init__(self, recipient: str, amount: int) -> None:
        self.signature = "tx-signature"
        self.recipient = recipient
        self.amount = amount
        self.data = b""


class FakeRuntime:
    def __init__(self) -> None:
        self.created_transactions = []
        self.timer_events = []
        self.stat_events = []
        self.wallet = FakeWallet()

    def get_wallet(self) -> FakeWallet:
        return self.wallet

    async def create_transaction(
        self,
        public_key: str,
        amount: int,
        fee: int,
        force_merge: bool,
    ) -> FakeTransaction:
        self.created_transactions.append((public_key, amount, fee, force_merge))
        return FakeTransaction(public_key, amount)

    async def process_timer_event(self, duration_in_ms: int) -> None:
        self.timer_events.append(duration_in_ms)

    async def process_stat_interval(self, current_time: int) -> None:
        self.stat_events.append(current_time)


class FakeHostBridge:
    def __init__(self) -> None:
        self.runtime = None
        self.started = False
        self.closed = False
        self.connected_peers = []
        self.ready_timeouts = []

    def bind_runtime(self, runtime) -> None:
        self.runtime = runtime

    async def start(self) -> None:
        self.started = True

    async def close(self) -> None:
        self.closed = True

    async def wait_until_ready(self, timeout: float | None = None) -> None:
        self.ready_timeouts.append(timeout)

    async def connect_peer(self, peer_url: str) -> None:
        self.connected_peers.append(peer_url)


class FakeRuntimeLoader:
    def __init__(self) -> None:
        self.calls = []
        self.runtime = FakeRuntime()

    async def initialize_runtime(
        self,
        config_json,
        private_key,
        log_level_num,
        haste_multiplier,
        delete_old_blocks,
        host_bridge,
    ):
        self.calls.append(
            {
                "config_json": config_json,
                "private_key": private_key,
                "log_level_num": log_level_num,
                "haste_multiplier": haste_multiplier,
                "delete_old_blocks": delete_old_blocks,
                "host_bridge": host_bridge,
            }
        )
        return self.runtime


@pytest.mark.asyncio
async def test_client_uses_backend_factory_and_round_trips_transactions() -> None:
    runtime_loader = FakeRuntimeLoader()
    host_bridge = FakeHostBridge()
    factory = RuntimeBackendFactory(
        runtime_loader=runtime_loader,
        host_bridge_factory=lambda config, is_node: host_bridge,
        settings=RuntimeBackendSettings(
            timer_interval_seconds=3600,
            stat_interval_seconds=3600,
        ),
    )
    client = SaitoClient(
        config=ClientConfig(
            data_dir=Path("/tmp/saito-python-client"),
            log_level="debug",
            haste_multiplier=7,
            delete_old_blocks=True,
        ),
        backend_factory=factory,
    )

    await client.start()
    wallet = await client.get_wallet()
    tx = await client.create_transaction("receiver-key", 55, {"memo": "hello"})
    await client.close()

    assert runtime_loader.calls[0]["private_key"] == ""
    assert runtime_loader.calls[0]["log_level_num"] == 3
    assert runtime_loader.calls[0]["haste_multiplier"] == 7
    assert runtime_loader.calls[0]["delete_old_blocks"] is True
    assert host_bridge.runtime is runtime_loader.runtime
    assert wallet.public_key == "python-public-key"
    assert wallet.balance == 42
    assert tx.recipient == "receiver-key"
    assert tx.amount == 55
    assert tx.metadata == {"memo": "hello"}
    assert runtime_loader.runtime.created_transactions == [("receiver-key", 55, 0, False)]
    assert host_bridge.started is True
    assert host_bridge.closed is True


@pytest.mark.asyncio
async def test_node_exposes_ready_and_connect_operations() -> None:
    runtime_loader = FakeRuntimeLoader()
    host_bridge = FakeHostBridge()
    factory = RuntimeBackendFactory(
        runtime_loader=runtime_loader,
        host_bridge_factory=lambda config, is_node: host_bridge,
        settings=RuntimeBackendSettings(
            timer_interval_seconds=3600,
            stat_interval_seconds=3600,
        ),
    )
    node = SaitoNode(
        config=NodeConfig(data_dir=Path("/tmp/saito-python-node"), endpoint_port=12109),
        backend_factory=factory,
    )

    await node.start()
    await node.wait_until_ready(timeout=5.0)
    await node.connect_peer("http://127.0.0.1:12100")

    assert "\"port\": 12109" in runtime_loader.calls[0]["config_json"]
    assert host_bridge.ready_timeouts == [5.0]
    assert host_bridge.connected_peers == ["http://127.0.0.1:12100"]
    await node.close()
