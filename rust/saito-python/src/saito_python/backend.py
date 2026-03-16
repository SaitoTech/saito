from collections.abc import Mapping
from typing import Any, Protocol, runtime_checkable

from .errors import BackendUnavailableError
from .models import TransactionRecord, TransactionRequest, WalletSnapshot


@runtime_checkable
class SaitoClientBackend(Protocol):
    async def start(self) -> None: ...

    async def close(self) -> None: ...

    async def get_wallet(self) -> WalletSnapshot: ...

    async def create_transaction(self, request: TransactionRequest) -> TransactionRecord: ...


@runtime_checkable
class SaitoNodeBackend(SaitoClientBackend, Protocol):
    async def wait_until_ready(self, timeout: float | None = None) -> None: ...

    async def connect_peer(self, peer_url: str) -> None: ...


@runtime_checkable
class SaitoBackendFactory(Protocol):
    async def create_client(self, config: Mapping[str, Any]) -> SaitoClientBackend: ...

    async def create_node(self, config: Mapping[str, Any]) -> SaitoNodeBackend: ...


class UnavailableBackendFactory:
    async def create_client(self, config: Mapping[str, Any]) -> SaitoClientBackend:
        raise BackendUnavailableError(
            "No Saito engine backend is configured for saito-python yet"
        )

    async def create_node(self, config: Mapping[str, Any]) -> SaitoNodeBackend:
        raise BackendUnavailableError(
            "No Saito engine backend is configured for saito-python yet"
        )
