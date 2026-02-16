#!/bin/bash

# Script to apply cleaned portrait images
# This replaces the original screenshots with the cleaned versions

set -e

PORTRAITS_DIR="public/molly-gallery/portraits"
CLEANED_DIR="public/molly-gallery/portraits-clean"
BACKUP_DIR="public/molly-gallery/portraits-backup"

echo "🖼️  Apply Cleaned Portrait Images"
echo "=================================="
echo ""

# Verify cleaned directory exists
if [ ! -d "$CLEANED_DIR" ]; then
    echo "❌ Error: Cleaned images directory not found: $CLEANED_DIR"
    echo "   Run the cleaning script first: python3 scripts/clean-portrait-thumbnails.py"
    exit 1
fi

# Count files
cleaned_count=$(ls -1 "$CLEANED_DIR"/*.png 2>/dev/null | wc -l)
if [ "$cleaned_count" -eq 0 ]; then
    echo "❌ Error: No cleaned images found in $CLEANED_DIR"
    exit 1
fi

echo "📊 Found $cleaned_count cleaned images"
echo ""

# Show what will be replaced
echo "The following images will be REPLACED:"
for img in "$CLEANED_DIR"/*.png; do
    filename=$(basename "$img")
    echo "  - $filename"
done
echo ""

# Verify backup exists
if [ ! -d "$BACKUP_DIR" ]; then
    echo "⚠️  Warning: No backup directory found!"
    echo "   Original images should be backed up first."
    echo ""
    read -p "Continue anyway? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "❌ Cancelled"
        exit 1
    fi
else
    echo "✅ Backup exists at: $BACKUP_DIR"
fi

echo ""
echo "⚠️  WARNING: This will REPLACE the original portrait images!"
echo "   Original images are backed up in: $BACKUP_DIR"
echo ""

read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Operation cancelled"
    exit 0
fi

echo ""
echo "🔄 Replacing original images with cleaned versions..."

# Replace each image
for img in "$CLEANED_DIR"/*.png; do
    filename=$(basename "$img")
    cp -v "$img" "$PORTRAITS_DIR/$filename"
done

echo ""
echo "✅ Successfully replaced $cleaned_count images!"
echo ""
echo "Next steps:"
echo "  1. Verify the images look correct"
echo "  2. Test the application to ensure images display properly"
echo "  3. If everything looks good, you can delete:"
echo "     - $CLEANED_DIR/ (no longer needed)"
echo "     - $BACKUP_DIR/ (once you're confident)"
echo ""
echo "To undo this change, restore from backup:"
echo "  cp $BACKUP_DIR/*.png $PORTRAITS_DIR/"
echo ""
