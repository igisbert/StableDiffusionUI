import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
  keys: vi.fn(),
}))
const mockInvoke = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/plugin-store', () => ({
  Store: {
    load: vi.fn(() => Promise.resolve(mockStore)),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
}))

import { getLlmVisionPath, refreshAllSelects } from '../config.js'
import { Store } from '@tauri-apps/plugin-store'

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = `
      <select id="select-model"></select>
      <select id="select-llm"></select>
      <select id="select-vae"></select>
      <select id="select-lora"></select>
      <select id="select-llm-vision"></select>
      <select id="select-clip-l"></select>
      <select id="select-clip-g"></select>
      <select id="select-t5xxl"></select>
      <div id="radio-upscale-models"></div>
      <span id="path-llm-vision-text"></span>
    `
    mockStore.get.mockImplementation((key) => {
      if (key === 'llm_vision_path') return Promise.resolve('C:\\vision')
      return Promise.resolve(null)
    })
    mockInvoke.mockResolvedValue({ models: ['a.gguf', 'b.safetensors'] })
  })

  it('getLlmVisionPath returns stored path', async () => {
    const path = await getLlmVisionPath()
    expect(Store.load).toHaveBeenCalledWith('config.json')
    expect(mockStore.get).toHaveBeenCalledWith('llm_vision_path')
    expect(path).toBe('C:\\vision')
  })

  it('getLlmVisionPath returns empty when not set', async () => {
    mockStore.get.mockResolvedValue(null)
    const path = await getLlmVisionPath()
    expect(path).toBe('')
  })

  it('scan via invoke populates select-llm-vision', async () => {
    mockStore.get.mockImplementation((key) => {
      if (key === 'llm_vision_path') return Promise.resolve('C:\\vision')
      return Promise.resolve(null)
    })
    await refreshAllSelects()
    expect(mockInvoke).toHaveBeenCalledWith('scan_models', { basePath: 'C:\\vision' })
    const sel = document.getElementById('select-llm-vision')
    expect(sel.options.length).toBe(3)
    expect(sel.options[1].value).toBe('a.gguf')
    expect(sel.options[2].value).toBe('b.safetensors')
  })

  it('refreshAllSelects calls all scans when paths exist', async () => {
    mockStore.get.mockImplementation((key) => Promise.resolve(`C:\\${key}`))
    mockInvoke.mockResolvedValue({ models: [] })
    await refreshAllSelects()
    expect(mockInvoke).toHaveBeenCalledTimes(9)
    expect(mockInvoke).toHaveBeenCalledWith('scan_models', { basePath: 'C:\\models_path' })
    expect(mockInvoke).toHaveBeenCalledWith('scan_models', { basePath: 'C:\\llm_vision_path' })
  })

  it('does not scan when path missing', async () => {
    mockStore.get.mockResolvedValue(null)
    await refreshAllSelects()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('does not abort on single scan error', async () => {
    mockStore.get.mockImplementation((key) => {
      if (key === 'llm_vision_path') return Promise.resolve('C:\\vision')
      if (key === 'models_path') return Promise.resolve('C:\\models')
      return Promise.resolve(null)
    })
    mockInvoke.mockImplementation(({ basePath }) => {
      if (basePath === 'C:\\vision') return Promise.reject(new Error('enoent'))
      return Promise.resolve({ models: ['ok.gguf'] })
    })
    await expect(refreshAllSelects()).resolves.toBeUndefined()
    expect(mockInvoke).toHaveBeenCalledWith('scan_models', { basePath: 'C:\\vision' })
    expect(mockInvoke).toHaveBeenCalledWith('scan_models', { basePath: 'C:\\models' })
  })
})
