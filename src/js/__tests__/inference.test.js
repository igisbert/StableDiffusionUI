import { describe, it, expect, vi, beforeEach } from 'vitest'
import { paramsToCliString, escapeArg } from '../inference.js'

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
  getSelectedImageState: vi.fn(() => null),
  setSelectedImageState: vi.fn(),
  onSelectedImageChange: vi.fn(() => () => {}),
  __resetImageState: vi.fn(),
}))

import { collectParams } from '../inference.js'
import * as inpaint from '../inpaint.js'
import { getSelectedImageState } from '../state/image-state.js'

function baseParams(overrides = {}) {
  return {
    sd_path: 'C:\\sd',
    output_path: 'C:\\out',
    models_path: 'C:\\models',
    vae_path: 'C:\\vae',
    llm_path: 'C:\\llm',
    lora_path: 'C:\\lora',
    llm_vision_path: 'C:\\vision',
    clip_l_path: 'C:\\clip_l',
    clip_g_path: 'C:\\clip_g',
    t5xxl_path: 'C:\\t5xxl',
    model: 'flux.safetensors',
    model_type: 'monolithic',
    llm: '',
    vae: '',
    lora: '',
    llm_vision: '',
    clip_l: '',
    clip_g: '',
    t5xxl: '',
    prompt: 'a cat',
    lora_weight: 1,
    negative_prompt: '',
    width: 512,
    height: 512,
    steps: 20,
    cfg_scale: 7,
    guidance: 3.5,
    seed: 42,
    batch_count: 1,
    max_vram: -1,
    threads: -1,
    sampler: 'euler',
    scheduler: 'karras',
    vae_on_cpu: false,
    clip_on_cpu: false,
    offload_to_cpu: false,
    fa: false,
    diffusion_fa: true,
    vae_tiling: false,
    mmap: false,
    verbose: false,
    force_cuda: false,
    custom_flags: '',
    edit_image: null,
    input_image: null,
    strength: null,
    mask_image: null,
    ...overrides,
  }
}

describe('escapeArg', () => {
  it('escapes double quotes', () => {
    expect(escapeArg('a "cat"')).toBe('a \\"cat\\"')
  })
  it('handles empty string', () => {
    expect(escapeArg('')).toBe('')
  })
  it('handles multiple quotes', () => {
    expect(escapeArg('"a" "b"')).toBe('\\"a\\" \\"b\\"')
  })
  it('leaves backslashes untouched', () => {
    expect(escapeArg('C:\\path\\file')).toBe('C:\\path\\file')
  })
})

describe('paramsToCliString', () => {
  it('t2i without image has no -i/-r/--strength/--mask', () => {
    const cmd = paramsToCliString(baseParams())
    expect(cmd).not.toMatch(/\s-i\s/)
    expect(cmd).not.toMatch(/\s-r\s/)
    expect(cmd).not.toMatch(/--strength/)
    expect(cmd).not.toMatch(/--mask/)
  })

  it('img2img with input_image includes -i and --strength', () => {
    const cmd = paramsToCliString(baseParams({ input_image: 'C:\\foto.png', strength: 0.75 }))
    expect(cmd).toMatch(/\s-i\s+"C:\\foto\.png"/)
    expect(cmd).toMatch(/--strength\s+0\.75/)
    expect(cmd).not.toMatch(/\s-r\s/)
  })

  it('img2img strength null no flag', () => {
    const cmd = paramsToCliString(baseParams({ input_image: 'C:\\foto.png', strength: null }))
    expect(cmd).toMatch(/\s-i\s/)
    expect(cmd).not.toMatch(/--strength/)
  })

  it('edit with edit_image includes -r and not -i', () => {
    const cmd = paramsToCliString(baseParams({ edit_image: 'C:\\edit.png' }))
    expect(cmd).toMatch(/\s-r\s+"C:\\edit\.png"/)
    expect(cmd).not.toMatch(/\s-i\s/)
    expect(cmd).not.toMatch(/--strength/)
    expect(cmd).not.toMatch(/--mask/)
  })

  it('inpaint with mask includes --mask placeholder', () => {
    const cmd = paramsToCliString(baseParams({ input_image: 'C:\\in.png', strength: 0.6, mask_image: 'data:image/png;base64,xxx' }))
    expect(cmd).toMatch(/\s-i\s+"C:\\in\.png"/)
    expect(cmd).toMatch(/--mask\s+"mask\.png"/)
  })

  it('mask without input not emitted', () => {
    const cmd = paramsToCliString(baseParams({ mask_image: 'data:image/png;base64,xxx' }))
    expect(cmd).not.toMatch(/--mask/)
  })

  it('edit and input are exclusive - edit wins', () => {
    const cmd = paramsToCliString(baseParams({ edit_image: 'C:\\edit.png', input_image: 'C:\\in.png', strength: 0.5 }))
    expect(cmd).toMatch(/\s-r\s+"C:\\edit\.png"/)
    expect(cmd).not.toMatch(/\s-i\s/)
  })

  it('includes --llm_vision when set', () => {
    const cmd = paramsToCliString(baseParams({ llm_vision: 'vision.gguf', llm_vision_path: 'C:\\vision' }))
    expect(cmd).toMatch(/--llm_vision\s+"C:\\vision\\vision\.gguf"/)
  })

  it('no --llm_vision when empty', () => {
    const cmd = paramsToCliString(baseParams({ llm_vision: '' }))
    expect(cmd).not.toMatch(/--llm_vision/)
  })

  it('escapes quotes in prompt and negative', () => {
    const cmd = paramsToCliString(baseParams({ prompt: 'a "cat" on roof', negative_prompt: 'bad "dog"' }))
    expect(cmd).toMatch(/-p\s+"a \\"cat\\" on roof"/)
    expect(cmd).toMatch(/-n\s+"bad \\"dog\\""/)
  })

  it('model_type diffusion vs monolithic', () => {
    const diff = paramsToCliString(baseParams({ model: 'm.gguf', model_type: 'diffusion', models_path: 'C:\\m' }))
    expect(diff).toContain('--diffusion-model "C:\\m\\m.gguf"')
    const mono = paramsToCliString(baseParams({ model: 'm.gguf', model_type: 'monolithic', models_path: 'C:\\m' }))
    expect(mono).toContain(' -m "C:\\m\\m.gguf"')
  })

  it('steps/cfg/guidance/scheduler null not emitted', () => {
    const cmd = paramsToCliString(baseParams({ steps: null, cfg_scale: null, guidance: null, scheduler: '' }))
    expect(cmd).not.toMatch(/--steps/)
    expect(cmd).not.toMatch(/--cfg-scale/)
    expect(cmd).not.toMatch(/--guidance/)
    expect(cmd).not.toMatch(/--scheduler/)
  })

  it('max_vram 0 not emitted, -1 emitted', () => {
    expect(paramsToCliString(baseParams({ max_vram: 0 }))).not.toMatch(/--max-vram/)
    expect(paramsToCliString(baseParams({ max_vram: -1 }))).toMatch(/--max-vram\s+-1/)
  })

  it('fa overrides diffusion_fa', () => {
    const cmdFa = paramsToCliString(baseParams({ fa: true, diffusion_fa: true }))
    expect(cmdFa).toMatch(/\s--fa\b/)
    expect(cmdFa).not.toMatch(/--diffusion-fa/)

    const cmdDiff = paramsToCliString(baseParams({ fa: false, diffusion_fa: true }))
    expect(cmdDiff).toMatch(/--diffusion-fa/)
    expect(cmdDiff).not.toMatch(/\s--fa\b/)

    const cmdNone = paramsToCliString(baseParams({ fa: false, diffusion_fa: false }))
    expect(cmdNone).not.toMatch(/--fa/)
    expect(cmdNone).not.toMatch(/--diffusion-fa/)
  })

  it('mmap and threads flags', () => {
    const cmd = paramsToCliString(baseParams({ mmap: true, threads: 6 }))
    expect(cmd).toMatch(/--mmap/)
    expect(cmd).toMatch(/-t\s+6/)
  })

  it('threads -1 not emitted, 0 emitted', () => {
    expect(paramsToCliString(baseParams({ threads: -1 }))).not.toMatch(/\s-t\s/)
    expect(paramsToCliString(baseParams({ threads: 0 }))).toMatch(/-t\s+0/)
  })

  it('lora appended to prompt and flag', () => {
    const cmd = paramsToCliString(baseParams({ lora: 'style.safetensors', lora_weight: 0.8, prompt: 'a cat', lora_path: 'C:\\lora' }))
    expect(cmd).toContain('--lora-model-dir "C:\\lora"')
    expect(cmd).toContain('<lora:style:0.8>')
  })

  it('lora stripping with dots', () => {
    const cmd = paramsToCliString(baseParams({ lora: 'my.style.v2.safetensors', lora_weight: 1, prompt: 'x' }))
    expect(cmd).toContain('<lora:my.style.v2:1>')
  })

  it('custom_flags split and trimmed', () => {
    const cmd = paramsToCliString(baseParams({ custom_flags: '  --foo\n  --bar baz  \n' }))
    expect(cmd).toMatch(/--foo/)
    expect(cmd).toMatch(/--bar baz/)
  })
})

describe('collectParams', () => {
  beforeEach(() => {
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
      <input id="input-max-vram" value="-1" />
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
    vi.mocked(getSelectedImageState).mockReturnValue(null)
    vi.mocked(inpaint.getPreparedImagePath).mockReturnValue(null)
    vi.mocked(inpaint.isMaskPainted).mockReturnValue(false)
    vi.mocked(inpaint.exportMask).mockReturnValue(null)
  })

  it('t2i without image', async () => {
    const p = await collectParams()
    expect(p.edit_image).toBeNull()
    expect(p.input_image).toBeNull()
    expect(p.mask_image).toBeNull()
    expect(p.strength).toBeNull()
  })

  it('img2img uses selected image and strength', async () => {
    document.querySelector('input[value="img2img"]').checked = true
    vi.mocked(getSelectedImageState).mockReturnValue('C:\\foto.png')
    const p = await collectParams()
    expect(p.input_image).toBe('C:\\foto.png')
    expect(p.strength).toBe(0.75)
    expect(p.edit_image).toBeNull()
  })

  it('inpainting uses prepared path and mask', async () => {
    document.querySelector('input[value="inpainting"]').checked = true
    vi.mocked(getSelectedImageState).mockReturnValue('C:\\orig.png')
    vi.mocked(inpaint.getPreparedImagePath).mockReturnValue('C:\\prepared.png')
    vi.mocked(inpaint.isMaskPainted).mockReturnValue(true)
    vi.mocked(inpaint.exportMask).mockReturnValue('data:image/png;base64,xxx')
    const p = await collectParams()
    expect(p.input_image).toBe('C:\\prepared.png')
    expect(p.mask_image).toBe('data:image/png;base64,xxx')
    expect(p.strength).toBe(0.6)
  })

  it('image-edit uses edit_image and no input', async () => {
    document.querySelector('input[value="image-edit"]').checked = true
    vi.mocked(getSelectedImageState).mockReturnValue('C:\\edit.png')
    const p = await collectParams()
    expect(p.edit_image).toBe('C:\\edit.png')
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
})
