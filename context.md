# Context for future sessions

## Inpainting (pending implementation)

### Current state
- Radio button "Inpainting (WIP)" exists in the UI but does nothing
- The radio button value is `inpainting`
- No panel/options shown when selected (unlike img2img or upscale)

### What's implemented and reusable from img2img
- **EXIF rotation fix**: `normalize_orientation()` function in `src-tauri/src/commands/inference.rs` normalizes image orientation before passing to sd-cli. Uses `image` and `kamadak-exif` crates (already in Cargo.toml)
- **Temp file approach**: Creates `temp_input_{timestamp}.png` in the output subfolder, cleans up after inference (success, error, abort)
- **Image input flow**: `selectedImageForOp` variable in main.js, synced with `window.__selectedImageForOp` for inference.js access
- **Drop zone**: `image-drop-zone` class on the image input row, uses Tauri 2 events (`tauri://drag-over`, `tauri://drag-leave`, `tauri://drag-drop`)
- **Presets**: `image-op` and `input-strength` are saved/loaded in presets.js

### Key files
- `src/index.html` - UI structure, radio buttons at line ~213
- `src/js/main.js` - Image selection, drop zone, radio button logic
- `src/js/inference.js` - Builds params and calls `run_inference`
- `src/js/presets.js` - Saves/loads `image-op` and `input-strength`
- `src-tauri/src/commands/inference.rs` - Rust backend, `InferenceParams`, `normalize_orientation()`
- `src/css/main.css` - Styles for `.image-drop-zone`, `.img2img-strength-row`

### What inpainting will need
- New panel (like `#img2img-options`) for inpainting-specific options
- New Rust command or extend `run_inference` with inpainting flags
- Potentially a mask input (user paints area to inpaint)
- Save to `output/inpainting/` folder (similar to `output/img2img/`)

## Version
- Current: 1.1.1
- Files to update for version bump: `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`

## Code conventions
- No inline styles in HTML (except `display:none` for initial hidden state if JS manages the state)
- Use CSS classes for show/hide (`.visible` pattern)
- Use `classList.add/remove` instead of `style.display` in JS
- Tooltips defined in `src/js/tooltips.js`
