export const MAX_REFERENCE_IMAGES = 10

let selectedImages = []

const listeners = new Set()

function notify() {
  const snapshot = selectedImages.slice()
  for (const cb of listeners) cb(snapshot)
}

export function getSelectedImages() {
  return selectedImages.slice()
}

// First image: used by img2img, inpainting, upscale and the size buttons.
export function getSelectedImageState() {
  return selectedImages[0] ?? null
}

export function setSelectedImages(paths) {
  selectedImages = paths.filter(Boolean)
  notify()
}

// Backwards-compatible setter: replaces the list with a single image.
export function setSelectedImageState(path) {
  setSelectedImages(path ? [path] : [])
}

export function addSelectedImages(paths) {
  const next = selectedImages.slice()
  for (const path of paths) {
    if (!path || next.includes(path)) continue
    if (next.length >= MAX_REFERENCE_IMAGES) break
    next.push(path)
  }
  if (next.length === selectedImages.length) return
  selectedImages = next
  notify()
}

export function removeSelectedImage(index) {
  if (index < 0 || index >= selectedImages.length) return
  selectedImages.splice(index, 1)
  notify()
}

// Moves the image at `from` to the insertion point `insertAt` (0..length).
export function moveSelectedImage(from, insertAt) {
  if (from < 0 || from >= selectedImages.length) return
  const [item] = selectedImages.splice(from, 1)
  let target = insertAt
  if (target > from) target -= 1
  target = Math.max(0, Math.min(target, selectedImages.length))
  selectedImages.splice(target, 0, item)
  notify()
}

export function clearSelectedImages() {
  setSelectedImages([])
}

export function onSelectedImagesChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// Kept for existing callers.
export const onSelectedImageChange = onSelectedImagesChange

// For tests
export function __resetImageState() {
  selectedImages = []
}
