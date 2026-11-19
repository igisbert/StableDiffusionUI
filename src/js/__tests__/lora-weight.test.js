import { describe, it, expect } from 'vitest'
import { normalizeLoraWeight } from '../features/lora-multiselect.js'

describe('normalizeLoraWeight', () => {
  it('keeps an explicit zero weight', () => {
    expect(normalizeLoraWeight('0')).toBe(0)
    expect(normalizeLoraWeight('0.0')).toBe(0)
  })

  it('keeps other numeric weights', () => {
    expect(normalizeLoraWeight('0.7')).toBe(0.7)
    expect(normalizeLoraWeight('2')).toBe(2)
  })

  it('falls back to 1 for empty or invalid values', () => {
    expect(normalizeLoraWeight('')).toBe(1)
    expect(normalizeLoraWeight(undefined)).toBe(1)
    expect(normalizeLoraWeight('abc')).toBe(1)
  })
})
