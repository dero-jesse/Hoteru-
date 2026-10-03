from __future__ import annotations

from dataclasses import dataclass
from typing import List

from finance_module import Ledger


@dataclass
class FixedAsset:
    asset_code: str
    name: str
    cost_minor: int
    useful_life_months: int
    accumulated_depreciation_minor: int = 0
    status: str = "active"


class AssetService:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger
        self.assets: List[FixedAsset] = []

    def add_asset(self, asset_code: str, name: str, cost_minor: int, useful_life_months: int) -> FixedAsset:
        asset = FixedAsset(asset_code=asset_code, name=name, cost_minor=cost_minor, useful_life_months=useful_life_months)
        self.assets.append(asset)
        return asset

    def run_monthly_depreciation(self, asset_code: str, amount_minor: int) -> FixedAsset:
        asset = next(item for item in self.assets if item.asset_code == asset_code)
        asset.accumulated_depreciation_minor += amount_minor
        self.ledger.post_event(
            "depreciation_run",
            {
                "aggregate": "fixed_asset",
                "aggregate_id": asset_code,
                "source_module": "assets",
                "amount_minor": amount_minor,
                "currency": "KES",
                "created_by": "accountant",
                "memo": f"Depreciation for {asset_code}",
            },
        )
        return asset
