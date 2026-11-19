import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MAX_REFERENCE_IMAGES,
  getSelectedImages,
  getSelectedImageState,
  setSelectedImages,
  setSelectedImageState,
  addSelectedImages,
  removeSelectedImage,
  moveSelectedImage,
  clearSelectedImages,
  onSelectedImagesChange,
  __resetImageState,
} from '../state/image-state.js'

beforeEach(() => {
  __resetImageState()
})

describe('image state', () => {
  it('starts empty', () => {
    expect(getSelectedImages()).toEqual([])
    expect(getSelectedImageState()).toBeNull()
  })

  it('first image is the one used by img2img/upscale', () => {
    setSelectedImages(['C:\\a.png', 'C:\\b.png'])
    expect(getSelectedImageState()).toBe('C:\\a.png')
  })

  it('setSelectedImageState replaces the list with a single image', () => {
    setSelectedImages(['C:\\a.png', 'C:\\b.png'])
    setSelectedImageState('C:\\c.png')
    expect(getSelectedImages()).toEqual(['C:\\c.png'])
    setSelectedImageState(null)
    expect(getSelectedImages()).toEqual([])
  })

  it('adds images ignoring duplicates and empty paths', () => {
    addSelectedImages(['C:\\a.png', '', 'C:\\b.png', 'C:\\a.png'])
    expect(getSelectedImages()).toEqual(['C:\\a.png', 'C:\\b.png'])
  })

  it('never exceeds the maximum and keeps the order', () => {
    const paths = Array.from({ length: MAX_REFERENCE_IMAGES + 3 }, (_, i) => `C:\\r${i}.png`)
    addSelectedImages(paths)
    expect(getSelectedImages()).toHaveLength(MAX_REFERENCE_IMAGES)
    expect(getSelectedImages()[0]).toBe('C:\\r0.png')
    expect(getSelectedImages()[MAX_REFERENCE_IMAGES - 1]).toBe(`C:\\r${MAX_REFERENCE_IMAGES - 1}.png`)
  })

  it('removes one image by index', () => {
    setSelectedImages(['C:\\a.png', 'C:\\b.png', 'C:\\c.png'])
    removeSelectedImage(1)
    expect(getSelectedImages()).toEqual(['C:\\a.png', 'C:\\c.png'])
    removeSelectedImage(99)
    expect(getSelectedImages()).toEqual(['C:\\a.png', 'C:\\c.png'])
  })

  it('moves an image forward to an insertion point', () => {
    setSelectedImages(['a', 'b', 'c'])
    moveSelectedImage(0, 3)
    expect(getSelectedImages()).toEqual(['b', 'c', 'a'])
  })

  it('moves an image backward to an insertion point', () => {
    setSelectedImages(['a', 'b', 'c'])
    moveSelectedImage(2, 0)
    expect(getSelectedImages()).toEqual(['c', 'a', 'b'])
  })

  it('ignores out of range moves', () => {
    setSelectedImages(['a', 'b'])
    moveSelectedImage(5, 0)
    expect(getSelectedImages()).toEqual(['a', 'b'])
  })

  it('clears everything', () => {
    setSelectedImages(['a', 'b'])
    clearSelectedImages()
    expect(getSelectedImages()).toEqual([])
  })

  it('notifies subscribers with a snapshot and can unsubscribe', () => {
    const cb = vi.fn()
    const off = onSelectedImagesChange(cb)
    addSelectedImages(['a'])
    expect(cb).toHaveBeenCalledWith(['a'])
    addSelectedImages(['b'])
    expect(cb).toHaveBeenLastCalledWith(['a', 'b'])
    off()
    addSelectedImages(['c'])
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('does not notify when nothing changes', () => {
    const cb = vi.fn()
    onSelectedImagesChange(cb)
    addSelectedImages(['a'])
    cb.mockClear()
    addSelectedImages(['a'])
    expect(cb).not.toHaveBeenCalled()
  })
})
