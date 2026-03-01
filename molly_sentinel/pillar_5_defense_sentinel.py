"""
Pillar 5: Defense Sentinel
============================
Verifies a GREEN environment by scanning for known offensive
tooling signatures (Frida, gdbserver) and checking kernel
debug state. Returns GREEN if clean, RED if threats detected.

Methodology: We fix the dam, not the leaks.
"""

import os
import subprocess


class DefenseSentinel:
    def __init__(self):
        self.threat_signatures = [
            "/usr/bin/frida-server",
            "/data/local/tmp/re.frida.server",
            "gdbserver"
        ]

    def full_audit(self):
        found_threats = [path for path in self.threat_signatures if os.path.exists(path)]
        try:
            if subprocess.check_output(["getprop", "ro.debuggable"]).strip() == b"1":
                found_threats.append("KERNEL_DEBUG_ACTIVE")
        except:
            pass
        return {
            "status": "GREEN" if not found_threats else "RED",
            "threats": found_threats
        }
