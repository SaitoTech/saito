class SaitoError(Exception):
    """Base error for Python SDK failures."""


class BackendUnavailableError(SaitoError):
    """Raised when the SDK is used without a configured engine backend."""


class SaitoStateError(SaitoError):
    """Raised when a client or node is used in an invalid lifecycle state."""
