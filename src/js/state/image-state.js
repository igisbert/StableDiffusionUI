let selectedImage = null

const listeners = new Set()

export function getSelectedImageState() {
  return selectedImage ?? window.__selectedImageForOp ?? null
}

export function setSelectedImageState(path) {
  selectedImage = path
  // Keep legacy global for inference.js until fully migrated
  window.__selectedImageForOp = path
  for (const cb of listeners) cb(path)
}

export function onSelectedImageChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// For tests
export function __resetImageState() {
  selectedImage = null
  window.__selectedImageForOp = null
}
