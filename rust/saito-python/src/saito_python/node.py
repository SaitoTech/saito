from .backend import SaitoBackendFactory, SaitoNodeBackend, UnavailableBackendFactory
from .client import SaitoClient
from .config import NodeConfig
from .errors import SaitoStateError


class SaitoNode(SaitoClient):
    def __init__(
        self,
        config: NodeConfig,
        backend_factory: SaitoBackendFactory | None = None,
    ) -> None:
        super().__init__(config=config, backend_factory=backend_factory or UnavailableBackendFactory())
        self.config = config

    async def start(self) -> None:
        if self.started:
            return
        if self._backend is None:
            self._backend = await self._backend_factory.create_node(
                self.config.to_engine_config()
            )
        await self._backend.start()
        self._started = True

    async def wait_until_ready(self, timeout: float | None = None) -> None:
        backend = self._require_node_backend()
        await backend.wait_until_ready(timeout=timeout)

    async def connect_peer(self, peer_url: str) -> None:
        backend = self._require_node_backend()
        await backend.connect_peer(peer_url)

    def _require_node_backend(self) -> SaitoNodeBackend:
        backend = self._require_backend()
        if not isinstance(backend, SaitoNodeBackend):
            raise SaitoStateError("Configured backend does not implement node operations")
        return backend
