import asyncio
from asyncio.subprocess import Process
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Protocol

from saito_python import (
    NodejsSidecarRuntimeLoader,
    RuntimeBackendFactory,
    RuntimeBackendSettings,
    SaitoHostBridge,
    SaitoNode,
    SaitoRuntimeLoader,
    SidecarHostBridge,
    SidecarProcessConfig,
)

from .config import InteropConfig, RustNodeProcessConfig


class ProcessHandle(Protocol):
    returncode: int | None

    def terminate(self) -> None: ...

    async def wait(self) -> int: ...


SpawnRustProcess = Callable[[RustNodeProcessConfig], Awaitable[ProcessHandle]]


async def _spawn_rust_process(config: RustNodeProcessConfig) -> Process:
    return await asyncio.create_subprocess_exec(
        *config.normalized_command(),
        cwd=str(config.working_directory) if config.working_directory else None,
        env=config.env or None,
    )


class RustNodeProcess:
    def __init__(
        self,
        config: RustNodeProcessConfig,
        spawn: SpawnRustProcess = _spawn_rust_process,
    ) -> None:
        self.config = config
        self._spawn = spawn
        self.process: ProcessHandle | None = None

    async def start(self) -> ProcessHandle:
        if self.process is not None:
            return self.process
        self.process = await self._spawn(self.config)
        return self.process

    async def stop(self) -> None:
        if self.process is None:
            return
        if self.process.returncode is None:
            self.process.terminate()
            await self.process.wait()
        self.process = None


class InteropHarness:
    def __init__(
        self,
        config: InteropConfig,
        python_node: SaitoNode,
        rust_node: RustNodeProcess,
    ) -> None:
        self.config = config
        self.python_node = python_node
        self.rust_node = rust_node

    async def run(self) -> None:
        await self.rust_node.start()
        await self.python_node.start()
        await self.python_node.wait_until_ready(timeout=self.config.startup_timeout)
        await self.python_node.connect_peer(self.config.peer_url)

    async def close(self) -> None:
        await self.python_node.close()
        await self.rust_node.stop()


def build_runtime_backed_harness(
    config: InteropConfig,
    runtime_loader: SaitoRuntimeLoader,
    host_bridge_factory: Callable[[dict[str, object], bool], SaitoHostBridge],
    *,
    runtime_settings: RuntimeBackendSettings = RuntimeBackendSettings(),
    spawn: SpawnRustProcess = _spawn_rust_process,
) -> InteropHarness:
    python_node = SaitoNode(
        config=config.python_node,
        backend_factory=RuntimeBackendFactory(
            runtime_loader=runtime_loader,
            host_bridge_factory=host_bridge_factory,
            settings=runtime_settings,
        ),
    )
    rust_node = RustNodeProcess(config=config.rust_node, spawn=spawn)
    return InteropHarness(config=config, python_node=python_node, rust_node=rust_node)


def build_sidecar_harness(
    config: InteropConfig,
    *,
    sidecar_config: SidecarProcessConfig | None = None,
    runtime_settings: RuntimeBackendSettings = RuntimeBackendSettings(),
    spawn: SpawnRustProcess = _spawn_rust_process,
) -> InteropHarness:
    resolved_sidecar_config = sidecar_config or SidecarProcessConfig(
        working_directory=Path(__file__).resolve().parents[3] / "saito-python",
    )
    host_bridge = SidecarHostBridge()
    return build_runtime_backed_harness(
        config=config,
        runtime_loader=NodejsSidecarRuntimeLoader(resolved_sidecar_config),
        host_bridge_factory=lambda _config, _is_node: host_bridge,
        runtime_settings=runtime_settings,
        spawn=spawn,
    )
