"""
Pillar 2: Data Purity Audit
============================
Enforces 2026 temporal integrity on incoming data streams.
Filters by cutoff date and required security-relevant keywords.
Only packets that pass both temporal and keyword gates receive
an integrity score and are forwarded.

Methodology: We fix the dam, not the leaks.
"""

import json
from datetime import datetime


class MollyAudit:
    def __init__(self, cutoff_date="2026-01-01"):
        self.cutoff = datetime.strptime(cutoff_date, "%Y-%m-%d")
        self.required_keywords = ["cve", "exploit", "kernel", "memory", "overflow", "race"]

    def audit_stream(self, raw_json_data):
        validated_packets = []
        try:
            data = json.loads(raw_json_data)
            for entry in data:
                entry_date = datetime.strptime(entry.get("date", "2000-01-01"), "%Y-%m-%d")
                if entry_date >= self.cutoff:
                    content = entry.get("text", "").lower()
                    if any(key in content for key in self.required_keywords):
                        entry["integrity_score"] = 1.0
                        validated_packets.append(entry)
            return validated_packets
        except Exception as e:
            return {"error": f"Audit failed: {str(e)}"}
