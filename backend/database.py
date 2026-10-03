from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class DatabaseRecord:
    table: str
    payload: Dict[str, Any]


class InMemoryDatabase:
    """Simple local substitute for PostgreSQL during backend development and tests."""

    def __init__(self):
        self.tables: Dict[str, List[Dict[str, Any]]] = {}

    def insert(self, table: str, row: Dict[str, Any]) -> Dict[str, Any]:
        self.tables.setdefault(table, []).append(row)
        return row

    def query(self, table: str, **filters):
        rows = self.tables.get(table, [])
        if not filters:
            return rows.copy()
        result = []
        for row in rows:
            matched = True
            for key, value in filters.items():
                if row.get(key) != value:
                    matched = False
                    break
            if matched:
                result.append(row)
        return result

    def update(self, table: str, key_name: str, key_value: Any, updates: Dict[str, Any]) -> Dict[str, Any]:
        rows = self.tables.setdefault(table, [])
        for row in rows:
            if row.get(key_name) == key_value:
                row.update(updates)
                return row
        raise KeyError(f"{table}:{key_name}={key_value} not found")

    def delete(self, table: str, key_name: str, key_value: Any) -> None:
        rows = self.tables.setdefault(table, [])
        for idx, row in enumerate(rows):
            if row.get(key_name) == key_value:
                del rows[idx]
                return
        raise KeyError(f"{table}:{key_name}={key_value} not found")


db = InMemoryDatabase()
