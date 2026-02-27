"""
Pillar 7: Secure Payload Validator
====================================
Validates research scripts against Pillar 5 sentinel status
before permitting interaction with the Kali-Proot environment.
Execution is denied if the environment is RED.

Methodology: We fix the dam, not the leaks.
"""

import os


class PayloadValidator:
    def __init__(self, sentinel_status):
        self.is_authorized = (sentinel_status == "GREEN")

    def validate_and_dispatch(self, script_path):
        if not self.is_authorized:
            return "BLOCK: Defense Sentinel is RED. Execution denied."

        proot_cmd = f"proot -0 -w /root/kali-arm64 -b /dev -b /proc -b /sys"
        return f"VALIDATED: Ready for dispatch via {proot_cmd}"
