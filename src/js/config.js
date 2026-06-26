import { Store } from '@tauri-apps/plugin-store'
import { invoke } from '@tauri-apps/api/core'

let store

const SAMPLERS = [
  { value: 'euler',           label: 'Euler' },
  { value: 'euler_cfg_pp',    label: 'Euler CFG++' },
  { value: 'euler_a',         label: 'Euler Ancestral' },
  { value: 'euler_a_cfg_pp',  label: 'Euler Ancestral CFG++' },
  { value: 'heun',            label: 'Heun' },
  { value: 'dpm2',            label: 'DPM Solver 2' },
  { value: 'dpmpp2s_a',       label: 'DPM++ 2S Ancestral' },
  { value: 'dpmpp2m',         label: 'DPM++ 2M' },
  { value: 'dpmpp2mv2',       label: 'DPM++ 2M v2' },
  { value: 'er_sde',          label: 'Extended Reverse SDE' },
  { value: 'ipndm',           label: 'Improved PNDM' },
  { value: 'ipndm_v',         label: 'Improved PNDM var' },
  { value: 'lcm',             label: 'Latent Consistency' },
  { value: 'ddim_trailing',   label: 'DDIM Trailing' },
  { value: 'tcd',             label: 'Trajectory Consistency' },
  { value: 'res_2s',          label: 'RES 2S' },
  { value: 'res_multistep',   label: 'RES Multipaso' },
]

const SCHEDULERS = [
  { value: '',              label: 'Ninguno (default)' },
  { value: 'discrete',      label: 'Discrete' },
  { value: 'simple',        label: 'Simple' },
  { value: 'karras',        label: 'Karras' },
  { value: 'ays',           label: 'AYS' },
  { value: 'bong_tangent',  label: 'Bong Tangent' },
  { value: 'exponential',   label: 'Exponential' },
  { value: 'gits',          label: 'GITS' },
  { value: 'kl_optimal',    label: 'KL Optimal' },
  { value: 'lcm',           label: 'LCM' },
  { value: 'sgm_uniform',   label: 'SGM Uniform' },
  { value: 'smoothstep',    label: 'Smoothstep' },
]

const PATH_KEYS = [
  { key: 'sd_path',     action: 'pick-sdcpp',  display: 'path-sdcpp-text' },
  { key: 'output_path', action: 'pick-output', display: 'path-output-text' },
  { key: 'models_path', action: 'pick-models', display: 'path-models-text' },
  { key: 'vae_path',    action: 'pick-vae',    display: 'path-vae-text' },
  { key: 'llm_path',    action: 'pick-llm',    display: 'path-llm-text' },
  { key: 'lora_path',   action: 'pick-lora',   display: 'path-lora-text' },
  { key: 'clip_l_path', action: 'pick-clip-l', display: 'path-clip-l-text' },
  { key: 'clip_g_path', action: 'pick-clip-g', display: 'path-clip-g-text' },
  { key: 't5xxl_path',  action: 'pick-t5xxl',  display: 'path-t5xxl-text' },
  { key: 'upscalers_path', action: 'pick-upscalers', display: 'path-upscalers-text' },
]

export async function initConfig() {
  store = await Store.load('config.json')

  populateSamplers()
  populateSchedulers()

  for (const { key, display } of PATH_KEYS) {
    const path = await store.get(key)
    if (path) updatePathDisplay(display, path)
  }

  const modelsPath = await store.get('models_path')
  if (modelsPath) await scanModels(modelsPath)

  const vaePath = await store.get('vae_path')
  if (vaePath) await scanVae(vaePath)

  const llmPath = await store.get('llm_path')
  if (llmPath) await scanEncoders(llmPath)

  const loraPath = await store.get('lora_path')
  if (loraPath) await scanLoras(loraPath)

  const clipLPath = await store.get('clip_l_path')
  if (clipLPath) await scanClipL(clipLPath)

  const clipGPath = await store.get('clip_g_path')
  if (clipGPath) await scanClipG(clipGPath)

  const t5xxlPath = await store.get('t5xxl_path')
  if (t5xxlPath) await scanT5xxl(t5xxlPath)

  const upscalersPath = await store.get('upscalers_path')
  if (upscalersPath) await scanUpscanners(upscalersPath)

  for (const { key, action, display } of PATH_KEYS) {
    document.querySelector(`[data-action="${action}"]`)?.addEventListener('click', async () => {
      const path = await invoke('pick_folder')
      if (!path) return
      if (key === 'output_path' || key === 'models_path' || key === 'vae_path' || key === 'llm_path' || key === 'lora_path' || key === 'clip_l_path' || key === 'clip_g_path' || key === 't5xxl_path' || key === 'upscalers_path') {
        await invoke('ensure_output_dir', { path })
      }
      await store.set(key, path)
      await store.save()
      updatePathDisplay(display, path)
      if (key === 'models_path') await scanModels(path)
      if (key === 'vae_path') await scanVae(path)
      if (key === 'llm_path') await scanEncoders(path)
      if (key === 'lora_path') await scanLoras(path)
      if (key === 'clip_l_path') await scanClipL(path)
      if (key === 'clip_g_path') await scanClipG(path)
      if (key === 't5xxl_path') await scanT5xxl(path)
      if (key === 'upscalers_path') await scanUpscanners(path)
    })
  }
}

async function scanModels(modelsPath) {
  const result = await invoke('scan_models', { basePath: modelsPath })
  populateSelect('select-model', result.models, true)
}

async function scanVae(vaePath) {
  const result = await invoke('scan_models', { basePath: vaePath })
  populateSelect('select-vae', result.models, true)
}

async function scanEncoders(llmPath) {
  const result = await invoke('scan_models', { basePath: llmPath })
  populateSelect('select-llm', result.models, true)
}

async function scanLoras(loraPath) {
  const result = await invoke('scan_models', { basePath: loraPath })
  populateSelect('select-lora', result.models, true)
}

async function scanClipL(clipLPath) {
  const result = await invoke('scan_models', { basePath: clipLPath })
  populateSelect('select-clip-l', result.models, true)
}

async function scanClipG(clipGPath) {
  const result = await invoke('scan_models', { basePath: clipGPath })
  populateSelect('select-clip-g', result.models, true)
}

async function scanT5xxl(t5xxlPath) {
  const result = await invoke('scan_models', { basePath: t5xxlPath })
  populateSelect('select-t5xxl', result.models, true)
}

async function scanUpscanners(upscalersPath) {
  const result = await invoke('scan_models', { basePath: upscalersPath })
  populateRadios('radio-upscale-models', result.models)
}

function populateRadios(containerId, items) {
  const container = document.getElementById(containerId)
  if (!container) return
  container.innerHTML = ''
  for (const item of items) {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'radio'
    input.name = 'upscale-model'
    input.value = item
    label.appendChild(input)
    label.appendChild(document.createTextNode(item))
    container.appendChild(label)
  }
}

export async function refreshAllSelects() {
  const modelsPath = await store.get('models_path')
  const vaePath = await store.get('vae_path')
  const llmPath = await store.get('llm_path')
  const loraPath = await store.get('lora_path')
  const clipLPath = await store.get('clip_l_path')
  const clipGPath = await store.get('clip_g_path')
  const t5xxlPath = await store.get('t5xxl_path')
  const upscalersPath = await store.get('upscalers_path')
  if (modelsPath) await scanModels(modelsPath)
  if (vaePath) await scanVae(vaePath)
  if (llmPath) await scanEncoders(llmPath)
  if (loraPath) await scanLoras(loraPath)
  if (clipLPath) await scanClipL(clipLPath)
  if (clipGPath) await scanClipG(clipGPath)
  if (t5xxlPath) await scanT5xxl(t5xxlPath)
  if (upscalersPath) await scanUpscanners(upscalersPath)
}

function populateSelect(id, items, withNone = false) {
  const sel = document.getElementById(id)
  if (!sel) return
  sel.innerHTML = ''
  if (withNone) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = 'Ninguno'
    sel.appendChild(opt)
  }
  for (const item of items) {
    const opt = document.createElement('option')
    opt.value = item
    opt.textContent = item
    sel.appendChild(opt)
  }
}

export async function getSdPath() { return (await store.get('sd_path')) || '' }
export async function getOutputPath() { return (await store.get('output_path')) || '' }
export async function getModelsPath() { return (await store.get('models_path')) || '' }
export async function getVaePath() { return (await store.get('vae_path')) || '' }
export async function getLlmPath() { return (await store.get('llm_path')) || '' }
export async function getLoraPath() { return (await store.get('lora_path')) || '' }
export async function getClipLPath() { return (await store.get('clip_l_path')) || '' }
export async function getClipGPath() { return (await store.get('clip_g_path')) || '' }
export async function getT5xxlPath() { return (await store.get('t5xxl_path')) || '' }
export async function getUpscannersPath() { return (await store.get('upscalers_path')) || '' }

function updatePathDisplay(id, path) {
  const el = document.getElementById(id)
  if (el) el.textContent = path
}

function populateSamplers() {
  const sel = document.getElementById('select-sampler')
  if (!sel) return
  sel.innerHTML = ''
  for (const { value, label } of SAMPLERS) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    sel.appendChild(opt)
  }
}

function populateSchedulers() {
  const sel = document.getElementById('select-scheduler')
  if (!sel) return
  sel.innerHTML = ''
  for (const { value, label } of SCHEDULERS) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    sel.appendChild(opt)
  }
}
