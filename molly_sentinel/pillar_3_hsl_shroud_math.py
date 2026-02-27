"""
Pillar 3: HSL Shroud Math
==========================
Steganographic frequency calculations for the communication bridge.
Transforms data bytes into Hue degree rotations using a 440.0Hz
carrier frequency as the phase basis. Each byte maps to a point
on the HSL color wheel via sine-modulated theta.

Base frequency: 440.0Hz (A4 — the universal tuning pitch).
Methodology: We fix the dam, not the leaks.
"""

import math


class HSLMath:
    def __init__(self, base_frequency=440.0):
        self.base_freq = base_frequency

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

        # Hue is determined by the sine of the theta phase
        hue_rotation = (math.sin(theta) + 1) / 2 * 360
        return round(hue_rotation, 4)

    def generate_pixel_map(self, byte_array):
        return [self.calculate_hue_rotation(b) for b in byte_array]
