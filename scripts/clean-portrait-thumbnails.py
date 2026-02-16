#!/usr/bin/env python3
"""
Portrait Image Cleaner for Molly
Removes thumbnail artifacts from mobile screenshot images
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("❌ Error: Pillow library not found")
    print("   Install with: pip install Pillow")
    sys.exit(1)

PORTRAITS_DIR = Path("public/molly-gallery/portraits")
CLEANED_DIR = Path("public/molly-gallery/portraits-clean")
BACKUP_DIR = Path("public/molly-gallery/portraits-backup")

# Thumbnail typically appears in bottom-left corner
# Standard crop: Remove bottom 200px to eliminate thumbnail
DEFAULT_CROP_BOTTOM = 200


def analyze_image(image_path):
    """Analyze an image and return its properties"""
    try:
        with Image.open(image_path) as img:
            width, height = img.size
            format = img.format
            mode = img.mode
            return {
                "width": width,
                "height": height,
                "format": format,
                "mode": mode,
                "size_kb": os.path.getsize(image_path) / 1024,
            }
    except Exception as e:
        return {"error": str(e)}


def crop_thumbnail(image_path, output_path, crop_bottom=DEFAULT_CROP_BOTTOM):
    """Crop thumbnail from bottom of image"""
    try:
        with Image.open(image_path) as img:
            width, height = img.size
            
            # Crop box: (left, top, right, bottom)
            # Remove crop_bottom pixels from bottom
            crop_box = (0, 0, width, height - crop_bottom)
            
            cropped = img.crop(crop_box)
            cropped.save(output_path, quality=95)
            
            return True, f"Cropped {crop_bottom}px from bottom"
    except Exception as e:
        return False, str(e)


def main():
    print("🖼️  Molly Portrait Image Cleaner")
    print("=" * 50)
    print()
    
    # Check if portraits directory exists
    if not PORTRAITS_DIR.exists():
        print(f"❌ Directory not found: {PORTRAITS_DIR}")
        sys.exit(1)
    
    # Get all image files
    image_files = list(PORTRAITS_DIR.glob("*.png")) + list(PORTRAITS_DIR.glob("*.jpg"))
    
    if not image_files:
        print("📁 No images found in portraits directory")
        sys.exit(0)
    
    print(f"📊 Found {len(image_files)} images")
    print()
    
    # Analyze images
    print("Analyzing images...")
    for img_path in image_files:
        info = analyze_image(img_path)
        if "error" in info:
            print(f"  ❌ {img_path.name}: {info['error']}")
        else:
            print(f"  📄 {img_path.name}")
            print(f"     Size: {info['width']}x{info['height']} | {info['size_kb']:.1f} KB | {info['format']}")
    
    print()
    print("ℹ️  Thumbnail Detection Info:")
    print("   - Mobile thumbnails typically appear in bottom-left corner")
    print("   - Default crop: Remove 200px from bottom")
    print("   - This works well for 720x1640 or 1080x1920 screenshots")
    print()
    
    # Ask user what to do
    print("Options:")
    print("  1. Create backup only")
    print("  2. Crop images and save to new directory (safe)")
    print("  3. Crop images and replace originals (destructive)")
    print("  4. Exit without changes")
    print()
    
    choice = input("Enter your choice (1-4): ").strip()
    
    if choice == "4":
        print("👋 Exiting without changes")
        return
    
    # Create backup
    if choice in ["1", "2", "3"]:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        print(f"\n💾 Creating backup to {BACKUP_DIR}...")
        
        for img_path in image_files:
            backup_path = BACKUP_DIR / img_path.name
            with Image.open(img_path) as img:
                img.save(backup_path)
        
        print(f"✅ Backed up {len(image_files)} images")
    
    if choice == "1":
        print("\n✅ Backup complete! No images were modified.")
        return
    
    # Crop images
    if choice in ["2", "3"]:
        output_dir = PORTRAITS_DIR if choice == "3" else CLEANED_DIR
        
        if choice == "2":
            output_dir.mkdir(parents=True, exist_ok=True)
            print(f"\n✂️  Cropping images to {output_dir}...")
        else:
            print("\n✂️  Cropping images (replacing originals)...")
            confirm = input("⚠️  This will REPLACE original files. Are you sure? (yes/no): ")
            if confirm.lower() != "yes":
                print("❌ Cancelled")
                return
        
        # Process each image
        success_count = 0
        for img_path in image_files:
            output_path = output_dir / img_path.name
            success, message = crop_thumbnail(img_path, output_path)
            
            if success:
                print(f"  ✅ {img_path.name}: {message}")
                success_count += 1
            else:
                print(f"  ❌ {img_path.name}: {message}")
        
        print(f"\n✅ Processed {success_count}/{len(image_files)} images")
        
        if choice == "2":
            print(f"   Cleaned images saved to: {output_dir}")
            print("   Review the cleaned images, then:")
            print("   1. Delete the originals if satisfied")
            print("   2. Move cleaned images to portraits/")
            print("   3. Or re-run with option 3 to replace directly")
    
    print("\n📚 For more information: docs/IMAGE_ASSET_GUIDELINES.md")


if __name__ == "__main__":
    main()
