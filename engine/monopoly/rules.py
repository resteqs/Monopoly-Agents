"""Rules configuration (mirrors the ``rules`` object of the replay header)."""

from __future__ import annotations

from dataclasses import asdict, dataclass

ENGINE_VERSION = "0.2.0"


@dataclass(frozen=True)
class RulesConfig:
    max_rounds: int = 200  # rounds; one round = every player takes one turn
    bankruptcy: str = "immediate"
    mortgages: bool = False
    auctions: bool = False
    trading: str = "off"
    free_parking_cash: bool = False
    auto_single_action: bool = True

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "RulesConfig":
        return cls(**d)

    def validate_supported(self) -> None:
        """v1 engine only implements one rule variant; fail loudly on the others."""
        if self.bankruptcy != "immediate":
            raise NotImplementedError("only bankruptcy='immediate' is implemented")
        if (
            self.mortgages
            or self.auctions
            or self.free_parking_cash
            or self.trading != "off"
        ):
            raise NotImplementedError(
                "mortgages/auctions/trading/free_parking_cash are not implemented in v1"
            )
