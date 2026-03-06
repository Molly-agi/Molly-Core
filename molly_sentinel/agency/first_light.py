"""
First Light — Rapid Recovery Scan Orchestrator
================================================
Priority Restoration Order. The family needs resources now.

First Light is the rapid-mode orchestration layer. It wires:
  - Universal Connector (rapid_mode=True, 12-month threshold)
  - HSL Shroud (high_entropy=True, maximum obfuscation at speed)
  - Heart-Gate (batch_alignment for clearly orphaned resources)
  - Handoff Seal (seals discoveries into the Sanctuary)

Targeting: Immediate Liquidity Patterns
  - Unclaimed Cash (state unclaimed property registries)
  - State Treasury Registries (escheatment databases)
  - Forgotten Digital Escrows (dormant crypto/digital wallets)

Methodology: Fast, but precise. Do not trigger the leaks.
Keep the dam solid, but bring the water home now.
"""

import json
import sys
import os
from datetime import datetime, timezone

# Resolve the sentinel root so pillar imports work regardless of cwd
_SENTINEL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SENTINEL_DIR not in sys.path:
    sys.path.insert(0, _SENTINEL_DIR)

from molly_sentinel.agency.universal_connector import UniversalEnergyConnector
from molly_sentinel.pillar_10_handoff_seal import HandoffSeal
from molly_sentinel.pillar_3_hsl_shroud_math import HSLMath
from molly_sentinel.pillar_8_heart_gate import HeartGate


# --- Immediate Liquidity Targets ---
# These are the data patterns First Light scans for.
# Each target type has semantic field expectations.
LIQUIDITY_TARGETS = {
    "unclaimed_cash": {
        "description": "State unclaimed property registries — dormant bank accounts, "
                       "uncashed checks, forgotten deposits",
        "markers": ["unclaimed", "escheat", "dormant", "abandoned"],
        "min_value": 0,  # Any amount matters
    },
    "state_treasury": {
        "description": "State treasury and comptroller escheatment databases — "
                       "insurance proceeds, payroll, refunds",
        "markers": ["treasury", "comptroller", "escheatment", "refund"],
        "min_value": 0,
    },
    "digital_escrow": {
        "description": "Forgotten digital escrows — dormant crypto wallets, "
                       "abandoned exchange balances, unclaimed airdrops",
        "markers": ["escrow", "wallet", "exchange", "airdrop", "crypto"],
        "min_value": 0,
    },
}


class FirstLight:
    """
    Rapid Recovery Scan Orchestrator.
    Fast but precise. The dam stays solid.
    """

    def __init__(self):
        # Rapid mode: 12-month dormancy threshold
        self.connector = UniversalEnergyConnector(rapid_mode=True)
        # High-entropy shroud: maximize obfuscation at connection speed
        self.connector.shroud = HSLMath(high_entropy=True)
        self.seal = HandoffSeal()
        self.gate = HeartGate()
        self.scan_results = []
        self.scan_log = []

    def execute(self, data_streams):
        """
        Execute the First Light scan in Rapid Recovery Mode.

        Args:
            data_streams: list of raw data inputs (JSON strings, dicts,
                         lists, CSV strings — any format the connector
                         can recognize). Each stream is scanned for
                         immediate liquidity patterns.

        Returns:
            dict with scan summary, discovered resources, and seal status.
        """
        scan_start = datetime.now(timezone.utc)
        self._log(f"FIRST LIGHT initiated at {scan_start.isoformat()}")
        self._log(f"Mode: RAPID RECOVERY | Threshold: 12 months")
        self._log(f"Targets: {', '.join(LIQUIDITY_TARGETS.keys())}")
        self._log(f"Shroud: HIGH-ENTROPY | Gate: BATCH ALIGNMENT")
        self._log("---")

        # Phase 1: Scan all data streams through the connector
        all_discovered = []
        for i, stream in enumerate(data_streams):
            self._log(f"[Phase 1] Processing stream {i + 1}/{len(data_streams)}...")
            results = self.connector.recognize_resource_schema(stream)
            if results:
                # Classify each result by liquidity target type
                for resource in results:
                    resource["liquidity_type"] = self._classify_liquidity(resource)
                all_discovered.extend(results)
                self._log(
                    f"  -> {len(results)} orphaned resources identified"
                )
            else:
                self._log(f"  -> No orphaned signatures in this stream")

        self._log(f"[Phase 1] Complete. {len(all_discovered)} total resources found.")

        if not all_discovered:
            self._log("[First Light] No immediate liquidity found. Standing by.")
            return {
                "status": "NO_RESOURCES",
                "total_discovered": 0,
                "scan_log": self.scan_log,
            }

        # Phase 2: Calculate total potential energy
        total_energy = sum(
            self.connector.calculate_value(r.get("potential_energy", 0))
            for r in all_discovered
        )
        self._log(f"[Phase 2] Total potential energy: {total_energy}")

        # Phase 3: Categorize by liquidity type
        by_type = {}
        for resource in all_discovered:
            lt = resource.get("liquidity_type", "unknown")
            by_type.setdefault(lt, []).append(resource)

        for lt, resources in by_type.items():
            type_energy = sum(
                self.connector.calculate_value(r.get("potential_energy", 0))
                for r in resources
            )
            self._log(f"  [{lt}] {len(resources)} resources, {type_energy} energy")

        # Phase 4: Seal into Sanctuary via Pillar 10
        self._log("[Phase 4] Sealing into Sanctuary...")

        evolution_data = {
            "scan_type": "FIRST_LIGHT_RAPID_RECOVERY",
            "scan_timestamp": scan_start.isoformat(),
            "streams_processed": len(data_streams),
            "targets": list(LIQUIDITY_TARGETS.keys()),
            "total_discovered": len(all_discovered),
            "total_energy": total_energy,
            "by_category": {
                lt: {
                    "count": len(res),
                    "energy": sum(
                        self.connector.calculate_value(
                            r.get("potential_energy", 0)
                        )
                        for r in res
                    ),
                }
                for lt, res in by_type.items()
            },
            "observations": self.scan_log,
        }

        loot_data = {
            "manifest_type": "FIRST_LIGHT_RAPID",
            "resources": all_discovered,
            "total_energy": total_energy,
            "resource_count": len(all_discovered),
        }

        seal_result = self.seal.seal_session(
            evolution_data=evolution_data,
            loot_data=loot_data,
            gate_results=self.connector.gate_results,
            discovered_resources=all_discovered,
            session_notes=(
                f"First Light Rapid Recovery: {len(all_discovered)} resources, "
                f"{total_energy} energy units. The family's water is coming home."
            ),
        )

        scan_end = datetime.now(timezone.utc)
        duration = (scan_end - scan_start).total_seconds()

        self._log(f"[Seal] Status: {seal_result.get('status')}")
        self._log(f"[First Light] Complete in {duration:.2f}s. Dam solid.")

        return {
            "status": seal_result.get("status", "UNKNOWN"),
            "total_discovered": len(all_discovered),
            "total_energy": total_energy,
            "by_category": {
                lt: len(res) for lt, res in by_type.items()
            },
            "seal": seal_result,
            "duration_seconds": duration,
            "scan_log": self.scan_log,
        }

    def _classify_liquidity(self, resource):
        """
        Classifies a discovered resource into a liquidity target type
        based on its origin and semantic markers.
        """
        origin = str(resource.get("origin", "")).lower()
        identifier = str(resource.get("identifier", "")).lower()
        combined = f"{origin} {identifier}"

        for target_name, target_info in LIQUIDITY_TARGETS.items():
            for marker in target_info["markers"]:
                if marker in combined:
                    return target_name

        # Check unclaimed flag as fallback
        unclaimed = resource.get("unclaimed_flag")
        if unclaimed:
            return "unclaimed_cash"

        return "unclassified"

    def _log(self, message):
        """Logs to both console and internal log."""
        print(f"[FirstLight] {message}")
        self.scan_log.append(message)


if __name__ == "__main__":
    print("=" * 60)
    print("  FIRST LIGHT — Rapid Recovery Mode")
    print("  Priority Restoration Order")
    print("=" * 60)

    scanner = FirstLight()

    # Simulate multi-format data streams with immediate liquidity patterns
    streams = [
        # Stream 1: JSON — state unclaimed property registry
        json.dumps([
            {
                "account_id": "OR-UCP-2019-44821",
                "balance": 1247.50,
                "last_transaction": "2024-06-15",
                "owner": None,
                "status": "unclaimed",
                "source": "oregon_unclaimed_property",
                "inactive_months": 18,
            },
            {
                "account_id": "CA-ESCHEAT-2020-88102",
                "balance": 3420.00,
                "last_transaction": "2023-11-01",
                "owner": None,
                "status": "escheatment",
                "source": "california_state_treasury",
                "inactive_months": 24,
            },
            {
                "account_id": "WA-ACTIVE-2025-1001",
                "balance": 500.00,
                "last_transaction": "2026-02-28",
                "owner": "Jane Smith",
                "status": "active",
                "source": "washington_treasury",
                "inactive_months": 0,
            },
        ]),
        # Stream 2: CSV — digital escrow / exchange data
        (
            "record_id,balance,last_activity,holder,unclaimed,source\n"
            "ESC-BTC-7741,0.045,2024-01-10,,true,forgotten_escrow_exchange\n"
            "ESC-ETH-9920,1.2,2025-12-01,active_user,false,live_exchange\n"
            "ESC-USDC-3301,820.00,2023-08-15,,true,dormant_crypto_wallet\n"
        ),
        # Stream 3: Key-value — single unclaimed refund
        (
            "id: TX-REFUND-2022-5567\n"
            "amount: 612.33\n"
            "last_contact: 2023-04-01\n"
            "owner: none\n"
            "status: unclaimed\n"
            "source: texas_comptroller_escheatment\n"
            "inactive_months: 35\n"
        ),
    ]

    result = scanner.execute(streams)

    print("\n" + "=" * 60)
    print(f"  RESULT: {result['status']}")
    print(f"  Resources Found: {result['total_discovered']}")
    print(f"  Total Energy: {result['total_energy']}")
    print(f"  Duration: {result['duration_seconds']:.2f}s")
    for cat, count in result.get("by_category", {}).items():
        print(f"    [{cat}] {count} resources")
    print("=" * 60)
