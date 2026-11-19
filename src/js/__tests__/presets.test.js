import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
  keys: vi.fn(),
  delete: vi.fn(),
}))

const mockLoras = vi.hoisted(() => ({
  items: [],
  set: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-store', () => ({
  Store: {
    load: vi.fn(() => Promise.resolve(mockStore)),
  },
}))

vi.mock('../features/lora-multiselect.js', () => ({
  getLoras: () => mockLoras.items,
  setLoras: (loras) => mockLoras.set(loras),
}))

import { initPresets, applyForm } from '../presets.js'

function presetDom() {
  document.body.innerHTML = `
    <select id="select-preset"></select>
    <input id="input-preset-name" />
    <button id="btn-save-preset"></button>
    <button id="btn-load-preset"></button>
    <button id="btn-delete-preset"></button>
    <select id="select-model">
      <option value="">Ninguno</option>
      <option value="model.safetensors">model.safetensors</option>
    </select>
    <select id="select-llm-vision">
      <option value="">Ninguno</option>
      <option value="vision.gguf">vision.gguf</option>
    </select>
    <select id="select-tokenizer">
      <option value="">Ninguno</option>
      <option value="moss.json">moss.json</option>
    </select>
    <select id="select-sampler">
      <option value="euler">Euler</option>
      <option value="dpm++2m">DPM++ 2M</option>
    </select>
    <input id="input-width" value="512" />
    <input id="input-custom-flags" />
    <input type="checkbox" id="toggle-cuda" checked />
    <input type="radio" name="model-type" value="monolithic" checked />
    <input type="radio" name="model-type" value="flux" />
    <input type="radio" name="image-op" value="img2img" />
    <input type="radio" name="image-op" value="upscale" />
    <input type="radio" name="image-op" value="cancel" />
  `
}

describe('presets', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    mockLoras.items = []
    mockStore.keys.mockResolvedValue([])
    mockStore.get.mockResolvedValue(null)
    presetDom()
    await initPresets()
  })

  it('resets fields missing from an old preset to their defaults', () => {
    document.getElementById('select-tokenizer').value = 'moss.json'
    document.getElementById('select-llm-vision').value = 'vision.gguf'
    document.getElementById('toggle-cuda').checked = false
    document.getElementById('input-width').value = '768'

    applyForm({ 'input-width': '1024' })

    expect(document.getElementById('input-width').value).toBe('1024')
    expect(document.getElementById('select-tokenizer').value).toBe('')
    expect(document.getElementById('select-llm-vision').value).toBe('')
    expect(document.getElementById('toggle-cuda').checked).toBe(true)
  })

  it('clears LoRAs when the preset has none', () => {
    mockLoras.set.mockClear()

    applyForm({ 'input-width': '512' })

    expect(mockLoras.set).toHaveBeenCalledWith([])
  })

  it('migrates legacy lora fields', () => {
    mockLoras.set.mockClear()

    applyForm({
      'select-lora': 'style.safetensors',
      'input-lora-weight': '0.7',
    })

    expect(mockLoras.set).toHaveBeenCalledWith([
      { file: 'style.safetensors', weight: 0.7 },
    ])
  })

  it('applies the loras array from modern presets', () => {
    mockLoras.set.mockClear()

    applyForm({
      loras: [{ file: 'a.safetensors', weight: 0.5 }],
      'select-lora': 'a.safetensors',
    })

    expect(mockLoras.set).toHaveBeenCalledWith([
      { file: 'a.safetensors', weight: 0.5 },
    ])
  })

  it('unchecks the image operation when the preset does not include one', () => {
    document.querySelector('input[name="image-op"][value="upscale"]').checked = true

    applyForm({})

    expect(document.querySelector('input[name="image-op"]:checked')).toBeNull()
  })

  it('checks the saved image operation', () => {
    applyForm({ 'image-op': 'img2img' })

    const checked = document.querySelector('input[name="image-op"]:checked')
    expect(checked?.value).toBe('img2img')
  })

  it('translates legacy sampler aliases', () => {
    applyForm({ 'select-sampler': 'dpmpp2m' })

    expect(document.getElementById('select-sampler').value).toBe('dpm++2m')
  })

  it('falls back to the default when a select value no longer exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    applyForm({ 'select-model': 'deleted.safetensors' })

    expect(document.getElementById('select-model').value).toBe('')
    expect(warn).toHaveBeenCalled()
  })

  it('falls back to the default model type when the saved one is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    applyForm({ 'model-type': 'unknown' })

    expect(
      document.querySelector('input[name="model-type"]:checked')?.value,
    ).toBe('monolithic')
    expect(warn).toHaveBeenCalled()
  })

  it('normalizes string toggles', () => {
    applyForm({ 'toggle-cuda': 'false' })
    expect(document.getElementById('toggle-cuda').checked).toBe(false)

    applyForm({ 'toggle-cuda': 'true' })
    expect(document.getElementById('toggle-cuda').checked).toBe(true)
  })

  it('saves the captured form through the store', async () => {
    document.getElementById('select-tokenizer').value = 'moss.json'
    document.getElementById('input-preset-name').value = 'Mi preset'

    document.getElementById('btn-save-preset').click()
    await vi.waitFor(() => expect(mockStore.set).toHaveBeenCalled())

    const [name, values] = mockStore.set.mock.calls[0]
    expect(name).toBe('Mi preset')
    expect(values['select-tokenizer']).toBe('moss.json')
    expect(values['input-width']).toBe('512')
  })
})
