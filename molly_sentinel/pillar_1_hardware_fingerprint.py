"""
Pillar 1: Hardware Fingerprinting
==================================
Identifies target hardware via sysfs nodes — USB Vendor ID / Product ID.
Maps to known chipset families, kernel drivers, and memory offsets
for defensive monitoring.

Methodology: We fix the dam, not the leaks.
"""

import os
import json


class MollyHardware:
    def __init__(self):
        self.vid_path = "/sys/class/android_usb/android0/idVendor"
        self.pid_path = "/sys/class/android_usb/android0/idProduct"
        self.vendor_db = {
            "0e8d": {
                "name": "MediaTek Inc.",
                "chipsets": ["MT6785", "MT6833", "MT6877"],
                "target_driver": "/dev/mtk_imgsys",
                "offsets": [0x4000, 0x4080, 0x4100]
            },
            "04e8": {
                "name": "Samsung Electronics",
                "chipsets": ["Exynos990", "Exynos2100"],
                "target_driver": "/dev/s5p-mfc",
                "offsets": [0x8000, 0x8100, 0x8200]
            }
        }

    def identify_hardware(self):
        if not os.path.exists(self.vid_path):
            return {"status": "error", "message": "Sysfs hardware node not found"}
        try:
            with open(self.vid_path, "r") as f:
                vid = f.read().strip().lower()
            with open(self.pid_path, "r") as f:
                pid = f.read().strip().lower()
            hardware_data = self.vendor_db.get(vid, {
                "name": "Unknown",
                "chipsets": [],
                "target_driver": None,
                "offsets": []
            })
            return {
                "status": "success",
                "vid": vid,
                "pid": pid,
                "vendor": hardware_data["name"],
                "driver": hardware_data["target_driver"],
                "offsets": hardware_data["offsets"]
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}
