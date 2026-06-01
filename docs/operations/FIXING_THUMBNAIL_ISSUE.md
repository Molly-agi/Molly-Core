# How to Fix the Thumbnail Issue

## Quick Summary

The portrait images contain unwanted thumbnails because they're screenshots from a mobile gallery app. The thumbnail is "baked into" the image files themselves, not a UI bug.

## Solution Options

### Option 1: Use the Cleaned Images (Recommended)

The cleaned images have been generated in `public/molly-gallery/portraits-clean/`:

```bash
# Review the cleaned images first
ls -lh public/molly-gallery/portraits-clean/

# If they look good, replace the originals
./scripts/apply-cleaned-portraits.sh
```

### Option 2: Manual Cropping

If you want more control or the automatic crop didn't work perfectly:

1. Open each image in an image editor (GIMP, Photoshop, Preview, etc.)
2. Crop out the bottom ~200px (where the thumbnail appears)
3. Save with a descriptive name following the convention

### Option 3: Get New Images

The best solution for the future:

1. Download/save images directly from source (don't screenshot)
2. Use full-screen mode if you must screenshot
3. Wait for all UI elements to disappear before capturing
4. Follow naming convention: `molly-[mood].png`

## Technical Details

**Original images:** 720x1640px (with thumbnail in bottom-left)  
**Cleaned images:** 720x1440px (thumbnail removed)  
**Crop amount:** 200px from bottom (1640 - 200 = 1440)

The 200px crop value was determined empirically by:

1. Examining the original screenshots showing thumbnails in the bottom-left
2. Estimating the height needed to remove both the thumbnail (~150px) and bottom navigation/UI (~50px)
3. Testing on the actual images and verifying the cleaned results

For different image sizes or thumbnail positions, adjust the `DEFAULT_CROP_BOTTOM` value in the Python script.

The Python script (`scripts/clean-portrait-thumbnails.py`) was used to:

- Create backups in `portraits-backup/`
- Crop 200px from the bottom of each image
- Save cleaned versions to `portraits-clean/`

## Files Affected

- `Screenshot_20260212-102930.png`
- `Screenshot_20260212-103005.png`
- `Screenshot_20260212-103006.png`
- `Screenshot_20260212-103009.png`
- `Screenshot_20260212-103010.png`

## Next Steps

1. Review cleaned images
2. If satisfied, run the apply script to replace originals
3. Consider renaming to follow convention (e.g., `molly-confident.png`)
4. Delete backup/clean directories once satisfied

## References

- [Image Asset Guidelines](../docs/IMAGE_ASSET_GUIDELINES.md) - Full documentation
- [Gallery README](../public/molly-gallery/README.md) - Best practices
