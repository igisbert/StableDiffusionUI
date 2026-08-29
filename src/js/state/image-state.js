let selectedImage = null

const listeners = new Set()

export function getSelectedImageState() {
  return selectedImage
}

export function setSelectedImageState(path) {
  selectedImage = path
  for (const cb of listeners) cb(path)
}

export function onSelectedImageChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// For tests
export function __resetImageState() {
  selectedImage = null
}
