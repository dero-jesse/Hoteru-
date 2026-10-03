from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass
class DomainEvent:
    event_type: str
    aggregate: str
    aggregate_id: str
    payload: Dict[str, Any]
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Optional[Dict[str, Any]] = None


class DomainEventBus:
    def __init__(self):
        self.events: List[DomainEvent] = []

    def publish(self, event: DomainEvent) -> DomainEvent:
        self.events.append(event)
        return event

    def replay(self, event_type: Optional[str] = None):
        if event_type:
            return [e for e in self.events if e.event_type == event_type]
        return list(self.events)


event_bus = DomainEventBus()
