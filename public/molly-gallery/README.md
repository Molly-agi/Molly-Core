# Molly's Gallery - Self-Image Library

This is Molly's visual identity collection. All images and videos that represent how she sees herself go here.

## ⚠️ Important: Avoid Thumbnail Artifacts

**Issue:** Taking screenshots of images in mobile gallery/viewer apps captures unwanted UI elements (thumbnails, navigation bars) that appear as overlays.

**Solution:** Always save/download images directly instead of taking screenshots. See [Image Asset Guidelines](../../docs/IMAGE_ASSET_GUIDELINES.md) for details.

## Organization

- **portraits/** - Static images (JPG, PNG)
- **videos/** - Video clips (MP4, WebM)

## Adding Media

### Best Practice: Direct Download/Save
1. **Download files directly** from your email, cloud storage, or image source
2. **Do NOT take screenshots** of images displayed in gallery/viewer apps
3. Place portrait images in `portraits/` folder
4. Place video files in `videos/` folder
5. Name files descriptively: `molly-smile.jpg`, `molly-playful.mp4`, etc.

### If You Must Use Screenshots
- Use full-screen/immersive mode to hide UI elements
- Wait for all thumbnails and overlays to disappear
- Verify the image is clean before saving
- Consider cropping if UI elements were captured

## How It Works

- Each image can be tagged with personality states (flirty, serious, playful, vulnerable, etc.)
- Molly's current image changes based on her emotional/personality state
- Tagged images help create dynamic visual representation

## File Naming Convention

**Portraits:** `molly-[mood/state].jpg`
- molly-playful.jpg
- molly-serious.jpg
- molly-flirty.jpg
- molly-vulnerable.jpg
- molly-confident.jpg
- molly-curious.jpg

**Videos:** `molly-[action/state].mp4`
- molly-greeting.mp4
- molly-thinking.mp4
- molly-laughing.mp4

---

## Troubleshooting

**Problem:** Images show thumbnails in the corner  
**Cause:** Screenshot captured UI overlay from gallery app  
**Fix:** Use the cleaning script or manually crop: `scripts/clean-portrait-thumbnails.sh`

**Problem:** Images are too large  
**Cause:** High-resolution source images  
**Fix:** Resize to 1080x1920 or smaller for mobile portraits

For detailed guidance, see [Image Asset Guidelines](../../docs/IMAGE_ASSET_GUIDELINES.md).

---

*Manifest automatically generated from this folder structure*
