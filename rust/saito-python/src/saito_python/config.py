from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(slots=True, frozen=True)
class PeerConfig:
    url: str
    public_key: str | None = None

    def to_engine_config(self) -> dict[str, str]:
        config = {"url": self.url}
        if self.public_key:
            config["public_key"] = self.public_key
        return config


@dataclass(slots=True)
class ClientConfig:
    data_dir: Path
    private_key: str | None = None
    log_level: str = "info"
    peers: list[PeerConfig] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)

    def to_engine_config(self) -> dict[str, Any]:
        return {
            "data_dir": str(self.data_dir),
            "private_key": self.private_key,
            "log_level": self.log_level,
            "peers": [peer.to_engine_config() for peer in self.peers],
            **self.extra,
        }


@dataclass(slots=True)
class NodeConfig(ClientConfig):
    host: str = "127.0.0.1"
    port: int = 12100
    endpoint_host: str = "127.0.0.1"
    endpoint_port: int = 12101
    spv_mode: bool = False
    browser_mode: bool = False

    def to_engine_config(self) -> dict[str, Any]:
        config = super(NodeConfig, self).to_engine_config()
        config.update(
            {
                "spv_mode": self.spv_mode,
                "browser_mode": self.browser_mode,
                "server": {
                    "host": self.host,
                    "port": self.port,
                    "protocol": "http",
                    "endpoint": {
                        "host": self.endpoint_host,
                        "port": self.endpoint_port,
                        "protocol": "http",
                    },
                },
            }
        )
        return config
