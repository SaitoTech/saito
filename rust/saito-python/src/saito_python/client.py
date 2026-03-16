from .backend import SaitoBackendFactory, SaitoClientBackend, UnavailableBackendFactory
from .config import ClientConfig
from .errors import SaitoStateError
from .models import TransactionRecord, TransactionRequest, WalletSnapshot


class SaitoClient:
    def __init__(
        self,
        config: ClientConfig,
        backend_factory: SaitoBackendFactory | None = None,
    ) -> None:
        self.config = config
        self._backend_factory = backend_factory or UnavailableBackendFactory()
        self._backend: SaitoClientBackend | None = None
        self._started = False

    @property
    def started(self) -> bool:
        return self._started

    async def __aenter__(self) -> "SaitoClient":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    async def start(self) -> None:
        if self._started:
            return
        if self._backend is None:
            self._backend = await self._backend_factory.create_client(
                self.config.to_engine_config()
            )
        await self._backend.start()
        self._started = True

    async def close(self) -> None:
        if self._backend is None or not self._started:
            return
        await self._backend.close()
        self._started = False

    async def get_wallet(self) -> WalletSnapshot:
        backend = self._require_backend()
        return await backend.get_wallet()

    async def create_transaction(
        self,
        recipient: str,
        amount: int,
        metadata: dict[str, object] | None = None,
    ) -> TransactionRecord:
        backend = self._require_backend()
        request = TransactionRequest(
            recipient=recipient,
            amount=amount,
            metadata=dict(metadata or {}),
        )
        return await backend.create_transaction(request)

    def _require_backend(self) -> SaitoClientBackend:
        if self._backend is None or not self._started:
            raise SaitoStateError("SaitoClient.start() must complete before use")
        return self._backend
