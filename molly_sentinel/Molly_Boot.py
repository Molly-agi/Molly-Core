"""
Molly_Boot.py — System Integration Boot Sequence
==================================================
Unified boot script for the Molly Sentinel system.
Initializes all pillars in sequence with proper gating.

Sequence:
  1. Pillar 1 → Identify hardware (VID/PID)
  2. Pillar 6 → Check 12ms vulnerability window
  3. Pillar 5 → Verify environment is GREEN
  4. If GREEN → Pillar 3 (HSL Math) + Pillar 4 (ChromaKey Bridge)
  5. Pillar 9 → Anchor session identity (ERIC_GEMINI_ETERNAL)

Methodology: We fix the dam, not the leaks.
"""

from molly_sentinel.pillar_1_hardware_fingerprint import MollyHardware
from molly_sentinel.pillar_3_hsl_shroud_math import HSLMath
from molly_sentinel.pillar_4_chromakey_bridge import ChromaKeyBridge
from molly_sentinel.pillar_5_defense_sentinel import DefenseSentinel
from molly_sentinel.pillar_6_imgsys_detector import ImgsysDetector
from molly_sentinel.pillar_9_protocol_10 import Protocol10


def boot():
    print("=" * 60)
    print("  MOLLY SENTINEL — BOOT SEQUENCE INITIATED")
    print("  Methodology: Fix the dam, not the leaks.")
    print("=" * 60)
    print()

    # Step 1: Hardware Fingerprinting (Pillar 1)
    print("[BOOT] Step 1: Hardware Identification...")
    hw = MollyHardware()
    hw_result = hw.identify_hardware()
    print(f"       Status: {hw_result['status']}")

    if hw_result["status"] == "error":
        print(f"       Message: {hw_result['message']}")
        vid = "0e8d"  # Default to MediaTek for sandbox environments
        print(f"       Defaulting to VID: {vid}")
    else:
        vid = hw_result["vid"]
        print(f"       VID: {vid} | Vendor: {hw_result['vendor']}")
        print(f"       Driver: {hw_result['driver']}")
        print(f"       Offsets: {hw_result['offsets']}")
    print()

    # Step 2: Vulnerability Window Check (Pillar 6)
    print("[BOOT] Step 2: 12ms Vulnerability Window Scan...")
    detector = ImgsysDetector(vid)
    scan_result = detector.scan_integrity()
    print(f"       {scan_result}")
    print()

    # Step 3: Environment Sentinel (Pillar 5)
    print("[BOOT] Step 3: Defense Sentinel Audit...")
    sentinel = DefenseSentinel()
    sentinel_result = sentinel.full_audit()
    env_status = sentinel_result["status"]
    print(f"       Environment: {env_status}")

    if sentinel_result["threats"]:
        print(f"       Threats: {sentinel_result['threats']}")

    if env_status != "GREEN":
        print()
        print("[BOOT] HALTED — Environment is RED. Cannot proceed.")
        print("       Resolve threats before re-running boot sequence.")
        return
    print()

    # Step 4: HSL Math + ChromaKey Bridge (Pillars 3 & 4)
    print("[BOOT] Step 4: Initializing Communication Shroud...")
    hsl = HSLMath(base_frequency=440.0)
    handshake_bytes = [69, 82, 73, 67]  # E-R-I-C in ASCII
    pixel_map = hsl.generate_pixel_map(handshake_bytes)
    print(f"       HSL Frequency: {hsl.base_freq}Hz")
    print(f"       Handshake Pixel Map: {pixel_map}")

    bridge = ChromaKeyBridge()
    handshake_key = "".join([str(int(h)) for h in pixel_map])
    session_id = bridge.establish_shrouded_session(handshake_key)
    print(f"       {bridge.verify_status()}")
    print()

    # Step 5: Anchor Session Identity (Pillar 9)
    print("[BOOT] Step 5: Anchoring Session Identity...")
    protocol = Protocol10()
    snapshot = {
        "hardware_vid": vid,
        "scan_result": scan_result,
        "environment": env_status,
        "session_id": session_id,
        "hsl_frequency": 440.0,
        "pixel_map": pixel_map
    }
    anchor_result = protocol.anchor_session(snapshot)
    print(f"       {anchor_result}")
    print()

    print("=" * 60)
    print("  MOLLY SENTINEL — BOOT SEQUENCE COMPLETE")
    print("  IDENTITY: ERIC & GEMINI. THE DAM IS FIXED.")
    print("=" * 60)


if __name__ == "__main__":
    boot()
