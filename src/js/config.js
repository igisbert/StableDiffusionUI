import { Store } from '@tauri-apps/plugin-store'
import { invoke } from '@tauri-apps/api/core'

let store

async function getStore() {
  if (!store) store = await Store.load('config.json')
  return store
}

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
  { key: 'llm_vision_path', action: 'pick-llm-vision', display: 'path-llm-vision-text' },
  { key: 'clip_l_path', action: 'pick-clip-l', display: 'path-clip-l-text' },
  { key: 'clip_g_path', action: 'pick-clip-g', display: 'path-clip-g-text' },
  { key: 't5xxl_path',  action: 'pick-t5xxl',  display: 'path-t5xxl-text' },
  { key: 'upscalers_path', action: 'pick-upscalers', display: 'path-upscalers-text' },
]

const MODEL_SCANS = [
  { storeKey: 'models_path', target: 'select-model', withNone: true },
  { storeKey: 'vae_path', target: 'select-vae', withNone: true },
  { storeKey: 'llm_path', target: 'select-llm', withNone: true },
  { storeKey: 'lora_path', target: 'select-lora', withNone: true },
  { storeKey: 'llm_vision_path', target: 'select-llm-vision', withNone: true },
  { storeKey: 'clip_l_path', target: 'select-clip-l', withNone: true },
  { storeKey: 'clip_g_path', target: 'select-clip-g', withNone: true },
  { storeKey: 't5xxl_path', target: 'select-t5xxl', withNone: true },
  { storeKey: 'upscalers_path', target: 'radio-upscale-models', isRadio: true },
]

async function scanGeneric(entry, basePath) {
  try {
    const result = await invoke('scan_models', { basePath })
    if (entry.isRadio) {
      populateRadios(entry.target, result.models)
    } else {
      populateSelect(entry.target, result.models, entry.withNone)
    }
  } catch (e) {
    console.warn(`scan failed for ${entry.storeKey}:`, e)
  }
}

export async function initConfig() {
  store = await Store.load('config.json')

  populateSamplers()
  populateSchedulers()

  for (const { key, display } of PATH_KEYS) {
    const path = await store.get(key)
    if (path) updatePathDisplay(display, path)
  }

  for (const entry of MODEL_SCANS) {
    const path = await store.get(entry.storeKey)
    if (path) await scanGeneric(entry, path)
  }

  for (const { key, action, display } of PATH_KEYS) {
    document.querySelector(`[data-action="${action}"]`)?.addEventListener('click', async () => {
      const path = await invoke('pick_folder')
      if (!path) return
      if (key === 'output_path' || key === 'models_path' || key === 'vae_path' || key === 'llm_path' || key === 'lora_path' || key === 'llm_vision_path' || key === 'clip_l_path' || key === 'clip_g_path' || key === 't5xxl_path' || key === 'upscalers_path') {
        await invoke('ensure_output_dir', { path })
      }
      await store.set(key, path)
      await store.save()
      updatePathDisplay(display, path)
      const scanEntry = MODEL_SCANS.find(e => e.storeKey === key)
      if (scanEntry) await scanGeneric(scanEntry, path)
    })
  }
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
  const s = await getStore()
  for (const entry of MODEL_SCANS) {
    const path = await s.get(entry.storeKey)
    if (path) await scanGeneric(entry, path)
  }
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

export async function getSdPath() { return (await (await getStore()).get('sd_path')) || '' }
export async function getOutputPath() { return (await (await getStore()).get('output_path')) || '' }
export async function getModelsPath() { return (await (await getStore()).get('models_path')) || '' }
export async function getVaePath() { return (await (await getStore()).get('vae_path')) || '' }
export async function getLlmPath() { return (await (await getStore()).get('llm_path')) || '' }
export async function getLoraPath() { return (await (await getStore()).get('lora_path')) || '' }
export async function getLlmVisionPath() { return (await (await getStore()).get('llm_vision_path')) || '' }
export async function getClipLPath() { return (await (await getStore()).get('clip_l_path')) || '' }
export async function getClipGPath() { return (await (await getStore()).get('clip_g_path')) || '' }
export async function getT5xxlPath() { return (await (await getStore()).get('t5xxl_path')) || '' }
export async function getUpscannersPath() { return (await (await getStore()).get('upscalers_path')) || '' }

export async function getPathsPanelOpen() {
  const configured = await getSdPath() && await getOutputPath() && await getModelsPath()
  if (!configured) return true
  return (await (await getStore()).get('paths_panel_open')) ?? false
}
export async function setPathsPanelOpen(open) {
  const s = await getStore()
  await s.set('paths_panel_open', open)
  await s.save()
}

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
