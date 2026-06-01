# Image Asset Guidelines

## Issue: Thumbnails in Screenshot Images

### Problem Description

The portrait images in `public/molly-gallery/portraits/` contain unwanted thumbnails in the bottom-left corner. This occurs because these are screenshots taken from a mobile device's image viewer/gallery app, which overlays thumbnails of previous images.

**Affected Files:**

- `Screenshot_20260212-102930.png`
- `Screenshot_20260212-103005.png`
- `Screenshot_20260212-103006.png`
- `Screenshot_20260212-103009.png`
- `Screenshot_20260212-103010.png`

### Root Cause

When taking screenshots of images displayed in mobile gallery/viewer apps, the screenshot captures:

1. The main image being viewed
2. UI elements from the viewer app (like thumbnails, navigation bars, etc.)
3. Other overlays present at the time of screenshot

### Solution

#### Option 1: Save Images Directly (Recommended)

Instead of taking screenshots, save/download images directly:

1. Long-press on the image
2. Select "Save Image" or "Download Image"
3. The image will be saved to your gallery WITHOUT any UI overlays

#### Option 2: Crop Existing Screenshots

If you already have screenshots with thumbnails:

1. Open the image in a photo editor
2. Crop out the thumbnail area (usually bottom-left corner)
3. Save the cropped version

#### Option 3: Use Screen Recording Then Extract Frames

1. Use screen recording while viewing the image
2. Ensure no UI elements are visible
3. Extract a clean frame from the video

### Best Practices for Future Images

1. **Direct Downloads**: Always download images directly from their source
2. **Clean Screenshots**: If you must screenshot, ensure no UI elements are visible:
   - Use full-screen/immersive mode
   - Hide navigation bars
   - Wait for thumbnails to disappear
3. **Verify Before Saving**: Check the image before adding it to the project
4. **Naming Convention**: Use descriptive names instead of "Screenshot\_..." (e.g., `molly-portrait-01.png`)

### File Naming Convention

Follow the convention outlined in `public/molly-gallery/README.md`:

- `molly-[mood/state].png` (e.g., `molly-confident.png`, `molly-playful.png`)
- Avoid generic names like `Screenshot_YYYYMMDD.png`

### Image Specifications

- **Format**: PNG or JPG
- **Recommended Size**: 720x1280 or 1080x1920 (mobile portrait)
- **Content**: Clean image without UI overlays, thumbnails, or artifacts
- **Quality**: High quality, well-lit, clear focus

## How to Fix Current Images

### Manual Cropping Steps

1. Open each screenshot in an image editor (Preview, GIMP, Photoshop, etc.)
2. Identify the thumbnail area (usually bottom-left, approximately 150x150px)
3. Crop the image to exclude this area
4. Save with the same filename or rename following the convention
5. Optimize file size if needed

### Automated Solution (If Needed)

If you have many images to process, consider:

1. Using ImageMagick for batch cropping:
   ```bash
   # Example: Crop bottom 200px from all images
   mogrify -gravity South -chop 0x200 *.png
   ```
2. Or use a Python script with PIL/Pillow for more precise control

## Related Files

- Image assets: `public/molly-gallery/portraits/`
- Memory anchors config: `src/lib/memory-anchors.ts`
- Gallery metadata: `public/molly-gallery/gallery.json`

## For Developers

When adding UI for image generation or display:

- Ensure generated/displayed images are clean without overlays
- If showing image previews/thumbnails, keep them separate from the main image
- When saving images from the UI, save only the image content, not screenshots of the UI displaying the image
