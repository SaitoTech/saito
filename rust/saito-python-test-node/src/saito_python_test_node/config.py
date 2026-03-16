from dataclasses import dataclass, field
from pathlib import Path

from saito_python import NodeConfig


@dataclass(slots=True)
class RustNodeProcessConfig:
    command: list[str]
    working_directory: Path | None = None
    env: dict[str, str] = field(default_factory=dict)

    def normalized_command(self) -> list[str]:
        if not self.command:
            raise ValueError("RustNodeProcessConfig.command must not be empty")
        return list(self.command)


@dataclass(slots=True)
class InteropConfig:
    rust_node: RustNodeProcessConfig
    python_node: NodeConfig
    peer_url: str
    startup_timeout: float = 30.0
