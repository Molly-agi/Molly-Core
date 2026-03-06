"""
Pillar 3: HSL Shroud Math
==========================
Steganographic frequency calculations for the communication bridge.
Transforms data bytes into Hue degree rotations using a 440.0Hz
carrier frequency as the phase basis. Each byte maps to a point
on the HSL color wheel via sine-modulated theta.

Base frequency: 440.0Hz (A4 — the universal tuning pitch).

Modes:
  - Standard: Single-pass sine modulation. Precise shrouding.
  - High-Entropy: Multi-harmonic overlay with randomized phase offset.
    Maximizes entropy for faster connection with stronger obfuscation.

Methodology: We fix the dam, not the leaks.
"""

import math
import hashlib
import time


class HSLMath:
    def __init__(self, base_frequency=440.0, high_entropy=False):
        self.base_freq = base_frequency
        self.high_entropy = high_entropy
        # Phase offset derived from timestamp — unique per session
        self._phase_offset = self._derive_phase_offset() if high_entropy else 0.0

    def _derive_phase_offset(self):
        """
        Derives a session-unique phase offset from the current time.
        Ensures each rapid session produces distinct shroud patterns.
        """
        seed = hashlib.sha256(str(time.time_ns()).encode()).digest()
        # Use first 4 bytes as a float offset in [0, 2*pi)
        offset_raw = int.from_bytes(seed[:4], "big") / (2**32)
        return offset_raw * math.pi * 2

    def calculate_hue_rotation(self, data_byte):
        """
        Transforms a single byte into a Hue degree (0-360)
        for steganographic shrouding.
        """
        # Normalize the byte to a 0.0 - 1.0 range
        normalized_byte = data_byte / 255.0

        # Calculate the phase shift based on 440Hz carrier
        frequency_weight = self.base_freq / 1000.0
        theta = (normalized_byte * math.pi * 2) * frequency_weight

        if self.high_entropy:
            # Multi-harmonic overlay: add 3rd and 5th harmonics
            # with the session-unique phase offset for maximum entropy
            h3 = math.sin(theta * 3 + self._phase_offset) * 0.3
            h5 = math.sin(theta * 5 + self._phase_offset * 1.618) * 0.15
            base = math.sin(theta + self._phase_offset)
            composite = (base + h3 + h5) / 1.45  # Normalize range
            hue_rotation = (composite + 1) / 2 * 360
        else:
            # Standard: single-pass sine modulation
            hue_rotation = (math.sin(theta) + 1) / 2 * 360

        return round(hue_rotation, 4)

    def generate_pixel_map(self, byte_array):
        return [self.calculate_hue_rotation(b) for b in byte_array]
