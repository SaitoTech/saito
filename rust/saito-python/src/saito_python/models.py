from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True, frozen=True)
class TransactionRequest:
    recipient: str
    amount: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True, frozen=True)
class TransactionRecord:
    signature: str
    sender: str
    recipient: str
    amount: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True, frozen=True)
class WalletSnapshot:
    public_key: str
    balance: int
