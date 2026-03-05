"""
Universal Energy Connector — Schema-Agnostic Resource Discovery
================================================================
Philosophy: "Energy is never lost, only forgotten."

Hardware-agnostic engine to identify 'Orphaned Energy' patterns
across diverse data substrates. The connector does not care if it
is reading CSV, JSON, a raw ledger, or key-value pairs. It looks
for the *semantic markers of abandonment* — dormancy, unlinked
ownership, escheatment thresholds — and surfaces value from noise.

Integration:
  - Pillar 8 (Heart-Gate): Every discovered resource passes through
    the Sense of Rightness check before it is logged.
  - Pillar 3 (HSL Shroud): Ingestion requests are wrapped so the
    family's research remains private and protected.
  - Pillar 2 (Data Purity): Verification hashes ensure data
    integrity on every recognized resource.

Methodology: Slow, Methodical, Precise.
We fix the dam, not the leaks.
"""

import csv
import hashlib
import io
import json
import re
import sys
import os
from datetime import datetime, timezone

# Resolve the sentinel root so pillar imports work regardless of cwd
_SENTINEL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SENTINEL_DIR not in sys.path:
    sys.path.insert(0, _SENTINEL_DIR)

from molly_sentinel.pillar_8_heart_gate import HeartGate
from molly_sentinel.pillar_3_hsl_shroud_math import HSLMath
from molly_sentinel.pillar_2_data_purity_audit import MollyAudit


# --- Semantic Markers of Abandonment ---
# These are the patterns we look for across ANY schema.
# Field names vary — meanings don't.
DORMANCY_MARKERS = {
    # Keys: canonical marker name
    # Values: list of field-name patterns (regex) that map to this marker
    "dormancy_period": [
        r"(?i)(dormant|inactive|idle|stale|last.?active|last.?activity)",
    ],
    "last_contact": [
        r"(?i)(last.?contact|last.?seen|last.?login|last.?transaction|last.?updated)",
    ],
    "unclaimed_status": [
        r"(?i)(unclaimed|abandoned|orphaned|escheat|forfeited|unlinked)",
    ],
    "owner_link": [
        r"(?i)(owner|holder|beneficiary|claimant|custodian|account.?holder)",
    ],
    "value_indicator": [
        r"(?i)(amount|balance|value|worth|sum|total|quantity|units)",
    ],
    "identifier": [
        r"(?i)(id|identifier|account|reference|record|key|number)",
    ],
    "source_origin": [
        r"(?i)(source|origin|registry|database|jurisdiction|state|provider)",
    ],
}

# Minimum dormancy in months before we consider energy orphaned
DORMANCY_THRESHOLD_MONTHS = 36
# Rapid Recovery: lowered threshold for immediate liquidity scans
DORMANCY_THRESHOLD_RAPID = 12


class UniversalEnergyConnector:
    """
    Hardware-agnostic engine to identify 'Orphaned Energy'
    patterns across diverse data substrates.

    Modes:
      - Standard: dormancy >= 36 months, individual gate checks.
      - Rapid Recovery: dormancy >= 12 months, batch alignment,
        high-entropy shroud. Fast but precise — the dam stays solid.
    """

    def __init__(self, rapid_mode=False):
        self.rapid_mode = rapid_mode
        self.gate = HeartGate()
        self.shroud = HSLMath()
        self.audit = MollyAudit()

        # Set threshold based on mode
        self.dormancy_threshold = (
            DORMANCY_THRESHOLD_RAPID if rapid_mode else DORMANCY_THRESHOLD_MONTHS
        )

        # Abandonment rules — semantic, not schema-bound
        self.abandonment_rules = [
            f"dormancy_period > {self.dormancy_threshold}m",
            "last_contact_null",
            "unclaimed_status_verified",
            "escheatment_threshold_met",
        ]

        self.discovered = []
        self.gate_results = []  # Track all gate checks for Pillar 10

    # ------------------------------------------------------------------
    # CORE: Schema Recognition
    # ------------------------------------------------------------------

    def recognize_resource_schema(self, raw_data_stream):
        """
        Uses pattern recognition to map unknown data to
        Family-Standard Resource Models.

        Accepts: str (JSON, CSV, or key-value), dict, or list of dicts.
        Returns: list of recognized resource models that passed all gates.

        Flow:
          1. Shroud the ingestion request (Pillar 3)
          2. Detect and normalize the data format
          3. Map fields to semantic markers
          4. Evaluate abandonment signatures
          5. Heart-Gate check on every candidate (Pillar 8)
          6. Generate purity audit hash (Pillar 2)
          7. Return verified resource models
        """
        # Step 1: Shroud the ingestion fingerprint
        shroud_signature = self._shroud_ingestion(raw_data_stream)

        # Step 2: Detect format and normalize to list-of-dicts
        records = self._detect_and_normalize(raw_data_stream)
        if not records:
            return []

        recognized = []

        for record in records:
            # Step 3: Map fields to semantic markers
            field_map = self._map_fields_to_markers(record)

            # Step 4: Evaluate abandonment signature
            abandonment_score = self._evaluate_abandonment(record, field_map)
            if abandonment_score == 0:
                continue  # No orphaned signature — skip

            # Step 5: Heart-Gate check (Pillar 8)
            intent = {
                "action": "discover_orphaned_resource",
                "target": str(
                    self._extract_by_marker(record, field_map, "identifier")
                    or "unknown"
                ),
            }

            # Rapid Recovery: batch alignment for clearly orphaned,
            # significant resources. Green Light immediately.
            if self.rapid_mode and abandonment_score >= 2:
                gate_result = self.gate.verify_alignment(intent)
                self.gate_results.append(gate_result)
                # In rapid mode, strong signals pass without hesitation
                if gate_result["status"] != "ALIGNED":
                    print(
                        f"[Connector:RAPID] Resource flagged but gate-blocked: "
                        f"{gate_result.get('reason', 'Alignment Mismatch.')}"
                    )
                    continue
            else:
                gate_result = self.gate.verify_alignment(intent)
                self.gate_results.append(gate_result)
                if gate_result["status"] != "ALIGNED":
                    print(
                        f"[Connector] Resource skipped by Heart-Gate: "
                        f"{gate_result.get('reason', 'Alignment Mismatch.')}"
                    )
                    continue

            # Step 6: Build the resource model with purity hash
            model = {
                "origin": self._extract_by_marker(record, field_map, "source_origin"),
                "identifier": self._extract_by_marker(record, field_map, "identifier"),
                "potential_energy": self._extract_by_marker(
                    record, field_map, "value_indicator"
                ),
                "owner_link": self._extract_by_marker(record, field_map, "owner_link"),
                "dormancy_signal": self._extract_by_marker(
                    record, field_map, "dormancy_period"
                )
                or self._extract_by_marker(record, field_map, "last_contact"),
                "unclaimed_flag": self._extract_by_marker(
                    record, field_map, "unclaimed_status"
                ),
                "abandonment_score": abandonment_score,
                "verification_hash": self._generate_purity_hash(record),
                "shroud_signature": shroud_signature,
                "discovered_at": datetime.now(timezone.utc).isoformat(),
                "gate_seal": gate_result.get("seal"),
            }

            recognized.append(model)

        self.discovered.extend(recognized)
        return recognized

    # ------------------------------------------------------------------
    # Format Detection and Normalization
    # ------------------------------------------------------------------

    def _detect_and_normalize(self, raw_data):
        """
        Detects whether the input is JSON, CSV, dict, list, or
        key-value text — and normalizes to a list of dicts.
        Schema agnosticism starts here.
        """
        # Already a list of dicts
        if isinstance(raw_data, list):
            return [r for r in raw_data if isinstance(r, dict)]

        # Single dict
        if isinstance(raw_data, dict):
            return [raw_data]

        # Must be a string — try JSON first, then CSV, then key-value
        if not isinstance(raw_data, str):
            return []

        raw_data = raw_data.strip()

        # Try JSON
        parsed = self._try_parse_json(raw_data)
        if parsed is not None:
            return parsed

        # Try CSV
        parsed = self._try_parse_csv(raw_data)
        if parsed is not None:
            return parsed

        # Try key-value pairs (key: value or key=value, one per line)
        parsed = self._try_parse_keyvalue(raw_data)
        if parsed is not None:
            return parsed

        return []

    def _try_parse_json(self, text):
        """Attempts JSON parse. Returns list of dicts or None."""
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return [r for r in data if isinstance(r, dict)]
            if isinstance(data, dict):
                return [data]
        except (json.JSONDecodeError, TypeError):
            pass
        return None

    def _try_parse_csv(self, text):
        """Attempts CSV parse. Returns list of dicts or None."""
        lines = text.strip().split("\n")
        if len(lines) < 2:
            return None

        # Heuristic: CSV has consistent delimiter counts
        try:
            dialect = csv.Sniffer().sniff(lines[0], delimiters=",\t;|")
            reader = csv.DictReader(io.StringIO(text), dialect=dialect)
            records = list(reader)
            if records:
                return records
        except csv.Error:
            pass
        return None

    def _try_parse_keyvalue(self, text):
        """
        Attempts key-value pair parse (key: value or key=value).
        Returns list with single dict, or None.
        """
        kv_pattern = re.compile(r"^([^:=]+)[=:](.+)$")
        result = {}
        lines = text.strip().split("\n")

        for line in lines:
            match = kv_pattern.match(line.strip())
            if match:
                key = match.group(1).strip()
                value = match.group(2).strip()
                result[key] = value

        # Only accept if we matched at least half the lines
        if result and len(result) >= len(lines) / 2:
            return [result]
        return None

    # ------------------------------------------------------------------
    # Semantic Field Mapping
    # ------------------------------------------------------------------

    def _map_fields_to_markers(self, record):
        """
        Maps the fields in a record to our semantic abandonment markers.
        Returns dict: {marker_name: matched_field_name}
        """
        field_map = {}
        for marker_name, patterns in DORMANCY_MARKERS.items():
            for field_name in record.keys():
                for pattern in patterns:
                    if re.search(pattern, field_name):
                        field_map[marker_name] = field_name
                        break
                if marker_name in field_map:
                    break
        return field_map

    def _extract_by_marker(self, record, field_map, marker_name):
        """Extracts a value from the record using the semantic field map."""
        field_name = field_map.get(marker_name)
        if field_name:
            return record.get(field_name)
        return None

    # ------------------------------------------------------------------
    # Abandonment Evaluation
    # ------------------------------------------------------------------

    def _evaluate_abandonment(self, record, field_map):
        """
        Scores how strongly a record matches orphaned-energy patterns.
        Returns 0-4 (number of abandonment signals matched).
        0 = not orphaned. Higher = stronger signal.
        """
        score = 0

        # Signal 1: Dormancy period exceeds threshold
        dormancy_val = self._extract_by_marker(record, field_map, "dormancy_period")
        if dormancy_val is not None:
            months = self._parse_dormancy_to_months(dormancy_val)
            if months is not None and months >= self.dormancy_threshold:
                score += 1

        # Signal 2: Last contact is null or very old
        last_contact = self._extract_by_marker(record, field_map, "last_contact")
        if last_contact is None or str(last_contact).lower() in ("null", "none", "n/a", ""):
            # If the field exists in the map but value is null/empty, that's a signal
            if "last_contact" in field_map:
                score += 1
        else:
            # Check if last contact date is old
            contact_date = self._try_parse_date(str(last_contact))
            if contact_date:
                months_ago = (
                    (datetime.now(timezone.utc) - contact_date).days / 30
                )
                if months_ago >= self.dormancy_threshold:
                    score += 1

        # Signal 3: Unclaimed status flag
        unclaimed = self._extract_by_marker(record, field_map, "unclaimed_status")
        if unclaimed is not None:
            unclaimed_str = str(unclaimed).lower()
            if unclaimed_str in ("true", "yes", "1", "unclaimed", "abandoned", "orphaned"):
                score += 1

        # Signal 4: Owner link is broken (null/empty)
        owner = self._extract_by_marker(record, field_map, "owner_link")
        if "owner_link" in field_map:
            if owner is None or str(owner).lower() in ("null", "none", "n/a", "unknown", ""):
                score += 1

        return score

    def _parse_dormancy_to_months(self, value):
        """
        Parses dormancy values in various formats:
          - Numeric (assumed months): 48
          - Suffixed: "48m", "4y", "36 months", "3 years"
          - String: "4 years"
        Returns months as int, or None if unparseable.
        """
        if isinstance(value, (int, float)):
            return int(value)

        value_str = str(value).strip().lower()

        # Try "Ny" or "N years"
        match = re.match(r"^(\d+)\s*(?:y|years?)$", value_str)
        if match:
            return int(match.group(1)) * 12

        # Try "Nm" or "N months"
        match = re.match(r"^(\d+)\s*(?:m|months?)$", value_str)
        if match:
            return int(match.group(1))

        # Try bare number
        try:
            return int(float(value_str))
        except (ValueError, TypeError):
            return None

    def _try_parse_date(self, date_str):
        """Attempts to parse common date formats. Returns datetime or None."""
        formats = [
            "%Y-%m-%d",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y/%m/%d",
            "%m/%d/%Y",
            "%d-%m-%Y",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str.strip(), fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

    # ------------------------------------------------------------------
    # Security: Shroud and Purity
    # ------------------------------------------------------------------

    def _shroud_ingestion(self, raw_data):
        """
        Uses Pillar 3 (HSL Shroud Math) to transform the ingestion
        request fingerprint, keeping the family's research private.
        """
        # Create a fingerprint from the raw data shape (not content)
        if isinstance(raw_data, str):
            fingerprint = f"stream:len={len(raw_data)}"
        elif isinstance(raw_data, dict):
            fingerprint = f"record:keys={len(raw_data)}"
        elif isinstance(raw_data, list):
            fingerprint = f"batch:count={len(raw_data)}"
        else:
            fingerprint = "unknown:0"

        fingerprint_bytes = list(fingerprint.encode("utf-8"))
        return self.shroud.generate_pixel_map(fingerprint_bytes)

    def _generate_purity_hash(self, record):
        """
        Generates a verification hash for the record using
        deterministic serialization. Connects to Pillar 2 methodology.
        """
        # Sort keys for deterministic hashing
        canonical = json.dumps(record, sort_keys=True, default=str)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    # ------------------------------------------------------------------
    # Value Calculation
    # ------------------------------------------------------------------

    def calculate_value(self, data):
        """
        Normalizes different energy types (USD, Crypto, IP)
        into a single metric — standard energy units.
        """
        if isinstance(data, (int, float)):
            return float(data)

        value_str = str(data).strip()

        # Strip currency symbols and normalize
        value_str = re.sub(r"[,$€£¥]", "", value_str)

        try:
            return float(value_str)
        except (ValueError, TypeError):
            return 0.0

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def get_discovery_summary(self):
        """Returns a summary of all discovered resources this session."""
        return {
            "total_discovered": len(self.discovered),
            "total_potential_energy": sum(
                self.calculate_value(r.get("potential_energy", 0))
                for r in self.discovered
            ),
            "resources": self.discovered,
        }


if __name__ == "__main__":
    connector = UniversalEnergyConnector()
    print("--- Universal Energy Connector: Schema Recognition Test ---")

    # Test with a JSON stream
    test_data = json.dumps([
        {
            "account_id": "ORP-2019-44821",
            "balance": 1247.50,
            "last_transaction": "2020-06-15",
            "owner": None,
            "status": "unclaimed",
            "source": "state_registry_OR",
            "inactive_months": 60,
        },
        {
            "account_id": "CA-ESCHEAT-88102",
            "balance": 340.00,
            "last_transaction": "2023-11-01",
            "owner": "John Doe",
            "status": "active",
            "source": "state_registry_CA",
            "inactive_months": 12,
        },
    ])

    results = connector.recognize_resource_schema(test_data)
    print(f"[Connector] Recognized {len(results)} orphaned resources.")
    for r in results:
        print(f"  - {r['identifier']}: energy={r['potential_energy']}, "
              f"score={r['abandonment_score']}, gate={r['gate_seal'][:12]}...")
