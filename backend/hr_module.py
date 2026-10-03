from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from finance_module import Ledger


@dataclass
class PayrollRun:
    period: str
    total_minor: int
    status: str = "draft"


class PayrollService:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger
        self.runs: List[PayrollRun] = []

    def run_payroll(self, period: str, total_minor: int) -> PayrollRun:
        run = PayrollRun(period=period, total_minor=total_minor)
        self.runs.append(run)
        self.ledger.post_event(
            "payroll_run",
            {
                "aggregate": "payroll_run",
                "aggregate_id": period,
                "source_module": "hr",
                "amount_minor": total_minor,
                "currency": "KES",
                "created_by": "hr",
                "memo": f"Payroll for {period}",
            },
        )
        run.status = "posted"
        return run
