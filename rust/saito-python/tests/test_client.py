from pathlib import Path

import pytest

from saito_python import ClientConfig, NodeConfig, SaitoClient, SaitoNode, WalletSnapshot
from saito_python.models import TransactionRecord


class FakeClientBackend:
    def __init__(self) -> None:
        self.started = False
        self.closed = False
        self.created_transactions = []

    async def start(self) -> None:
        self.started = True

    async def close(self) -> None:
        self.closed = True

    async def get_wallet(self) -> WalletSnapshot:
        return WalletSnapshot(public_key="python-public-key", balance=42)

    async def create_transaction(self, request) -> TransactionRecord:
        self.created_transactions.append(request)
        return TransactionRecord(
            signature="tx-signature",
            sender="python-public-key",
            recipient=request.recipient,
            amount=request.amount,
            metadata=request.metadata,
        )


class FakeNodeBackend(FakeClientBackend):
    def __init__(self) -> None:
        super().__init__()
        self.connected_peers = []
        self.ready_timeouts = []

    async def wait_until_ready(self, timeout: float | None = None) -> None:
        self.ready_timeouts.append(timeout)

    async def connect_peer(self, peer_url: str) -> None:
        self.connected_peers.append(peer_url)


class FakeBackendFactory:
    def __init__(self) -> None:
        self.client_configs = []
        self.node_configs = []
        self.client_backend = FakeClientBackend()
        self.node_backend = FakeNodeBackend()

    async def create_client(self, config):
        self.client_configs.append(config)
        return self.client_backend

    async def create_node(self, config):
        self.node_configs.append(config)
        return self.node_backend


@pytest.mark.asyncio
async def test_client_uses_backend_factory_and_round_trips_transactions() -> None:
    factory = FakeBackendFactory()
    client = SaitoClient(
        config=ClientConfig(data_dir=Path("/tmp/saito-python-client")),
        backend_factory=factory,
    )

    await client.start()
    wallet = await client.get_wallet()
    tx = await client.create_transaction("receiver-key", 55, {"memo": "hello"})
    await client.close()

    assert factory.client_configs[0]["data_dir"].endswith("saito-python-client")
    assert wallet.public_key == "python-public-key"
    assert wallet.balance == 42
    assert tx.recipient == "receiver-key"
    assert tx.amount == 55
    assert tx.metadata == {"memo": "hello"}
    assert factory.client_backend.started is True
    assert factory.client_backend.closed is True


@pytest.mark.asyncio
async def test_node_exposes_ready_and_connect_operations() -> None:
    factory = FakeBackendFactory()
    node = SaitoNode(
        config=NodeConfig(data_dir=Path("/tmp/saito-python-node"), endpoint_port=12109),
        backend_factory=factory,
    )

    await node.start()
    await node.wait_until_ready(timeout=5.0)
    await node.connect_peer("http://127.0.0.1:12100")

    assert factory.node_configs[0]["server"]["endpoint"]["port"] == 12109
    assert factory.node_backend.ready_timeouts == [5.0]
    assert factory.node_backend.connected_peers == ["http://127.0.0.1:12100"]
