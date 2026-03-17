from pathlib import Path

import pytest

from saito_python import NodeConfig, RuntimeBackendSettings
from saito_python_test_node import (
    InteropConfig,
    InteropHarness,
    RustNodeProcess,
    RustNodeProcessConfig,
    build_runtime_backed_harness,
)


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


class FakeWallet:
    async def get_public_key(self) -> str:
        return "python-public-key"

    async def get_balance(self) -> int:
        return 42


class FakeRuntime:
    def __init__(self) -> None:
        self.wallet = FakeWallet()
        self.timer_events = []
        self.stat_events = []

    def get_wallet(self) -> FakeWallet:
        return self.wallet

    async def create_transaction(self, public_key, amount, fee, force_merge):
        raise AssertionError("create_transaction should not be called in this test")

    async def process_timer_event(self, duration_in_ms: int) -> None:
        self.timer_events.append(duration_in_ms)

    async def process_stat_interval(self, current_time: int) -> None:
        self.stat_events.append(current_time)


class FakeHostBridge:
    def __init__(self) -> None:
        self.runtime = None
        self.started = False
        self.closed = False
        self.timeouts = []
        self.peers = []

    def bind_runtime(self, runtime) -> None:
        self.runtime = runtime

    async def start(self) -> None:
        self.started = True

    async def close(self) -> None:
        self.closed = True

    async def wait_until_ready(self, timeout: float | None = None) -> None:
        self.timeouts.append(timeout)

    async def connect_peer(self, peer_url: str) -> None:
        self.peers.append(peer_url)

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
        self.calls.append(config_json)
        return self.runtime


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
    runtime_loader = FakeRuntimeLoader()
    host_bridge = FakeHostBridge()

    async def spawn(config: RustNodeProcessConfig) -> FakeProcess:
        return process

    harness = build_runtime_backed_harness(
        config=InteropConfig(
            rust_node=RustNodeProcessConfig(command=["/bin/true"]),
            python_node=NodeConfig(data_dir=Path("/tmp/python-node")),
            peer_url="http://127.0.0.1:12100",
            startup_timeout=3.0,
        ),
        runtime_loader=runtime_loader,
        host_bridge_factory=lambda config, is_node: host_bridge,
        runtime_settings=RuntimeBackendSettings(
            timer_interval_seconds=3600,
            stat_interval_seconds=3600,
        ),
        spawn=spawn,
    )

    await harness.run()
    await harness.close()

    assert runtime_loader.calls
    assert host_bridge.runtime is runtime_loader.runtime
    assert host_bridge.started is True
    assert host_bridge.closed is True
    assert host_bridge.timeouts == [3.0]
    assert host_bridge.peers == ["http://127.0.0.1:12100"]