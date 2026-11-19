import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collectParams, buildCommand } from '../inference.js'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve('sd-cli.exe')),
}))

vi.mock('../config.js', async () => {
  const actual = await vi.importActual('../config.js')
  return {
    ...actual,
    getSdPath: vi.fn(() => Promise.resolve('C:\\sd')),
    getOutputPath: vi.fn(() => Promise.resolve('C:\\out')),
    getModelsPath: vi.fn(() => Promise.resolve('C:\\models')),
    getVaePath: vi.fn(() => Promise.resolve('C:\\vae')),
    getLlmPath: vi.fn(() => Promise.resolve('C:\\llm')),
    getLoraPath: vi.fn(() => Promise.resolve('C:\\lora')),
    getLlmVisionPath: vi.fn(() => Promise.resolve('C:\\vision')),
    getClipLPath: vi.fn(() => Promise.resolve('C:\\clip_l')),
    getClipGPath: vi.fn(() => Promise.resolve('C:\\clip_g')),
    getT5xxlPath: vi.fn(() => Promise.resolve('C:\\t5xxl')),
  }
})

vi.mock('../inpaint.js', () => ({
  exportMask: vi.fn(() => 'data:image/png;base64,xxx'),
  isMaskPainted: vi.fn(() => true),
  getPreparedImagePath: vi.fn(() => null),
}))

vi.mock('../state/image-state.js', () => ({
  getSelectedImages: vi.fn(() => []),
  getSelectedImageState: vi.fn(() => null),
  setSelectedImageState: vi.fn(),
  onSelectedImageChange: vi.fn(() => () => {}),
  __resetImageState: vi.fn(),
}))

import * as inpaint from '../inpaint.js'
import { getSelectedImages } from '../state/image-state.js'

function setupDom() {
  document.body.innerHTML = `
    <select id="select-model"><option value="flux.safetensors" selected>flux</option></select>
    <select id="select-llm"><option value=""></option></select>
    <select id="select-vae"><option value=""></option></select>
    <select id="select-lora"><option value=""></option></select>
    <select id="select-llm-vision"><option value=""></option></select>
    <select id="select-clip-l"><option value=""></option></select>
    <select id="select-clip-g"><option value=""></option></select>
    <select id="select-t5xxl"><option value=""></option></select>
    <select id="select-sampler"><option value="euler" selected>euler</option></select>
    <select id="select-scheduler"><option value="karras" selected>karras</option></select>
    <input id="input-prompt" value="a cat" />
    <input id="input-negative" value="" />
    <input id="input-width" value="512" />
    <input id="input-height" value="512" />
    <input id="input-steps" value="20" />
    <input id="input-cfg" value="7" />
    <input id="input-guidance" value="3.5" />
    <input id="input-seed" value="42" />
    <input id="input-batch-count" value="1" />
    <input id="input-max-vram" value="0" />
    <input id="input-threads" value="-1" />
    <input id="input-lora-weight" value="1" />
    <input id="input-custom-flags" value="" />
    <input id="input-strength" value="0.75" />
    <input id="input-inpaint-strength" value="0.6" />
    <input type="radio" name="model-type" value="monolithic" checked />
    <input type="radio" name="image-op" value="img2img" />
    <input type="radio" name="image-op" value="inpainting" />
    <input type="radio" name="image-op" value="image-edit" />
    <input id="toggle-fa" type="checkbox" />
    <input id="toggle-diffusion-fa" type="checkbox" checked />
    <input id="toggle-vae-tiling" type="checkbox" />
    <input id="toggle-mmap" type="checkbox" />
    <input id="toggle-verbose" type="checkbox" />
    <input id="toggle-cuda" type="checkbox" />
    <input id="toggle-vae-cpu" type="checkbox" />
    <input id="toggle-clip-cpu" type="checkbox" />
    <input id="toggle-offload-cpu" type="checkbox" />
  `
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDom()
  vi.mocked(getSelectedImages).mockReturnValue([])
  vi.mocked(inpaint.getPreparedImagePath).mockReturnValue(null)
  vi.mocked(inpaint.isMaskPainted).mockReturnValue(false)
  vi.mocked(inpaint.exportMask).mockReturnValue(null)
})

describe('collectParams', () => {
  it('t2i without image', async () => {
    const p = await collectParams()
    expect(p.edit_images).toEqual([])
    expect(p.input_image).toBeNull()
    expect(p.mask_image).toBeNull()
    expect(p.strength).toBeNull()
  })

  it('img2img uses selected image and strength', async () => {
    document.querySelector('input[value="img2img"]').checked = true
    vi.mocked(getSelectedImages).mockReturnValue(['C:\\foto.png', 'C:\\extra.png'])
    const p = await collectParams()
    expect(p.input_image).toBe('C:\\foto.png')
    expect(p.strength).toBe(0.75)
    expect(p.edit_images).toEqual([])
  })

  it('inpainting uses prepared path and mask', async () => {
    document.querySelector('input[value="inpainting"]').checked = true
    vi.mocked(getSelectedImages).mockReturnValue(['C:\\orig.png'])
    vi.mocked(inpaint.getPreparedImagePath).mockReturnValue('C:\\prepared.png')
    vi.mocked(inpaint.isMaskPainted).mockReturnValue(true)
    vi.mocked(inpaint.exportMask).mockReturnValue('data:image/png;base64,xxx')
    const p = await collectParams()
    expect(p.input_image).toBe('C:\\prepared.png')
    expect(p.mask_image).toBe('data:image/png;base64,xxx')
    expect(p.strength).toBe(0.6)
  })

  it('image-edit passes every selected image and no input', async () => {
    document.querySelector('input[value="image-edit"]').checked = true
    vi.mocked(getSelectedImages).mockReturnValue(['C:\\a.png', 'C:\\b.png'])
    const p = await collectParams()
    expect(p.edit_images).toEqual(['C:\\a.png', 'C:\\b.png'])
    expect(p.input_image).toBeNull()
    expect(p.strength).toBeNull()
    expect(p.mask_image).toBeNull()
  })

  it('fa disables diffusion_fa', async () => {
    document.getElementById('toggle-fa').checked = true
    document.getElementById('toggle-diffusion-fa').checked = true
    const p = await collectParams()
    expect(p.fa).toBe(true)
    expect(p.diffusion_fa).toBe(false)
  })

  it('empty optional numbers become null', async () => {
    document.getElementById('input-steps').value = ''
    document.getElementById('input-cfg').value = ''
    document.getElementById('input-guidance').value = ''
    const p = await collectParams()
    expect(p.steps).toBeNull()
    expect(p.cfg_scale).toBeNull()
    expect(p.guidance).toBeNull()
  })
})

describe('buildCommand', () => {
  it('delegates the preview to Rust', async () => {
    const cmd = await buildCommand()
    expect(invoke).toHaveBeenCalledWith('preview_inference_command', {
      params: expect.objectContaining({ model: 'flux.safetensors' }),
    })
    expect(cmd).toBe('sd-cli.exe')
  })
})
