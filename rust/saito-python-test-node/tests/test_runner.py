from pathlib import Path

import pytest

from saito_python import NodeConfig, SaitoNode
from saito_python_test_node import InteropConfig, InteropHarness, RustNodeProcess, RustNodeProcessConfig


class FakeProcess:
    def __init__(self) -> None:
        self.returncode = None
        self.terminated = False
        self.wait_calls = 0

    def terminate(self) -> None:
        self.terminated = True
        self.returncode = 0

    async def wait(self) -> int:
        self.wait_calls += 1
        return 0


class FakeNodeBackend:
    def __init__(self) -> None:
        self.started = False
        self.closed = False
        self.timeouts = []
        self.peers = []

    async def start(self) -> None:
        self.started = True

    async def close(self) -> None:
        self.closed = True

    async def wait_until_ready(self, timeout: float | None = None) -> None:
        self.timeouts.append(timeout)

    async def connect_peer(self, peer_url: str) -> None:
        self.peers.append(peer_url)

    async def get_wallet(self):
        raise AssertionError("get_wallet should not be called in this test")

    async def create_transaction(self, request):
        raise AssertionError("create_transaction should not be called in this test")


class FakeBackendFactory:
    def __init__(self) -> None:
        self.backend = FakeNodeBackend()

    async def create_client(self, config):
        raise AssertionError("create_client should not be used for node tests")

    async def create_node(self, config):
        return self.backend


@pytest.mark.asyncio
async def test_rust_node_process_uses_injected_spawn_and_stops_cleanly() -> None:
    process = FakeProcess()

    async def spawn(config: RustNodeProcessConfig) -> FakeProcess:
        assert config.normalized_command() == ["cargo", "run", "-p", "saito-rust"]
        return process

    rust_node = RustNodeProcess(
        config=RustNodeProcessConfig(command=["cargo", "run", "-p", "saito-rust"]),
        spawn=spawn,
    )

    await rust_node.start()
    await rust_node.stop()

    assert process.terminated is True
    assert process.wait_calls == 1


@pytest.mark.asyncio
async def test_interop_harness_starts_python_node_and_connects_peer() -> None:
    process = FakeProcess()
    factory = FakeBackendFactory()

    async def spawn(config: RustNodeProcessConfig) -> FakeProcess:
        return process

    python_node = SaitoNode(
        config=NodeConfig(data_dir=Path("/tmp/python-node")),
        backend_factory=factory,
    )
    harness = InteropHarness(
        config=InteropConfig(
            rust_node=RustNodeProcessConfig(command=["/bin/true"]),
            python_node=python_node.config,
            peer_url="http://127.0.0.1:12100",
            startup_timeout=3.0,
        ),
        python_node=python_node,
        rust_node=RustNodeProcess(
            config=RustNodeProcessConfig(command=["/bin/true"]),
            spawn=spawn,
        ),
    )

    await harness.run()
    await harness.close()

    assert factory.backend.started is True
    assert factory.backend.closed is True
    assert factory.backend.timeouts == [3.0]
    assert factory.backend.peers == ["http://127.0.0.1:12100"]