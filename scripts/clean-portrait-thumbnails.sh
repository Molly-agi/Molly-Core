#!/bin/bash

# Script to clean thumbnail artifacts from portrait screenshots
# This script helps identify and crop out unwanted thumbnails from mobile screenshots

set -e

PORTRAITS_DIR="public/molly-gallery/portraits"
BACKUP_DIR="public/molly-gallery/portraits-backup"

echo "🖼️  Molly Portrait Cleaner"
echo "========================="
echo ""

# Check if ImageMagick is installed
if ! command -v identify &> /dev/null && ! command -v file &> /dev/null; then
    echo "⚠️  Neither ImageMagick nor file command is available."
    echo "   Install ImageMagick for better image analysis: apt-get install imagemagick"
fi

# Create backup directory
if [ ! -d "$BACKUP_DIR" ]; then
    echo "📁 Creating backup directory..."
    mkdir -p "$BACKUP_DIR"
fi

echo "📊 Analyzing portrait images..."
echo ""

# List all portrait files
for img in "$PORTRAITS_DIR"/*.png "$PORTRAITS_DIR"/*.jpg; do
    [ -e "$img" ] || continue
    
    filename=$(basename "$img")
    
    # Get image dimensions
    if command -v identify &> /dev/null; then
        dimensions=$(identify -format "%wx%h" "$img")
        echo "📄 $filename: $dimensions"
    else
        echo "📄 $filename"
    fi
done

echo ""
echo "ℹ️  Thumbnail Detection Info:"
echo "   - Mobile screenshot thumbnails typically appear in bottom-left corner"
echo "   - Common thumbnail size: ~150x150px to 200x200px"
echo "   - Standard mobile screenshot size: 720x1640, 1080x1920, etc."
echo ""

echo "🔧 Recommended Actions:"
echo ""
echo "1. Manual Cropping (Recommended for Quality):"
echo "   - Open each image in an image editor"
echo "   - Crop out the thumbnail area (bottom-left corner)"
echo "   - Save with a descriptive name (e.g., molly-confident.png)"
echo ""

echo "2. Automated Cropping (Use with Caution):"
echo "   This removes the bottom 200px from all images:"
echo "   cd $PORTRAITS_DIR"
echo '   for img in *.png; do'
echo '     convert "$img" -gravity South -chop 0x200 "../portraits-clean/$img"'
echo '   done'
echo ""

echo "3. Replace with Clean Images:"
echo "   - Download/save images directly instead of taking screenshots"
echo "   - Follow the guidelines in docs/IMAGE_ASSET_GUIDELINES.md"
echo ""

echo "⚠️  Note: Always backup your images before running automated tools!"
echo "   Backups will be saved to: $BACKUP_DIR"
echo ""

# Offer to create backup
read -p "Would you like to backup existing portraits now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "💾 Creating backup..."
    cp -v "$PORTRAITS_DIR"/*.png "$BACKUP_DIR/" 2>/dev/null || true
    cp -v "$PORTRAITS_DIR"/*.jpg "$BACKUP_DIR/" 2>/dev/null || true
    echo "✅ Backup complete!"
else
    echo "⏭️  Skipping backup"
fi

echo ""
echo "✅ Analysis complete!"
echo ""
echo "For more information, see: docs/IMAGE_ASSET_GUIDELINES.md"
