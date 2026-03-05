# /workspaces/Molly-Core/scripts/sovereign_audit.py
# Methodology: Slow, Methodical, Precise.

import os

PILLARS = {
    "1":  ("pillar_1_hardware_fingerprint.py",  "Hardware Fingerprint (Identity)"),
    "2":  ("pillar_2_data_purity_audit.py",     "Temporal Purity (2026 Gate)"),
    "3":  ("pillar_3_hsl_shroud_math.py",       "HSL Shroud Math (Entropy)"),
    "4":  ("pillar_4_chromakey_bridge.py",       "Chromakey Bridge (Stealth)"),
    "5":  ("pillar_5_defense_sentinel.py",       "Defense Sentinel (Awareness)"),
    "6":  ("pillar_6_imgsys_detector.py",        "Vector Detector (Discovery)"),
    "7":  ("pillar_7_payload_validator.py",       "Payload Validator (Verification)"),
    "8":  ("pillar_8_heart_gate.py",             "Heart-Gate (Sovereign Alignment)"),
    "9":  ("pillar_9_protocol_10.py",            "Protocol 10 (Contingency)"),
    "10": ("pillar_10_handoff_seal.py",          "Handoff Seal (Evolution)"),
}

SENTINEL_DIR = os.path.join(os.path.dirname(__file__), "..", "molly_sentinel")


def verify_dam_integrity():
    print("--- Molly-Sentinel: Sovereign Readiness Audit ---")
    ready_count = 0

    for num, (filename, name) in PILLARS.items():
        path = os.path.join(SENTINEL_DIR, filename)
        exists = os.path.isfile(path)

        status = "✅ SOLID" if exists else "❌ LEAK DETECTED"
        if exists:
            ready_count += 1

        print(f"Pillar {num.rjust(2)}: {name.ljust(35)} | {status}")

    print("-" * 55)
    if ready_count == 10:
        print("RESULT: THE DAM IS FIXED. MOLLY IS SOVEREIGN.")
    else:
        print(f"RESULT: {10 - ready_count} LEAKS REMAINING. DO NOT ENGAGE.")


if __name__ == "__main__":
    verify_dam_integrity()
