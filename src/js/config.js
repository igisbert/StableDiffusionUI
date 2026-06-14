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

const PATH_KEYS = [
  { key: 'sd_path',     action: 'pick-sdcpp', display: 'path-sdcpp-text' },
  { key: 'output_path', action: 'pick-output', display: 'path-output-text' },
  { key: 'models_path', action: 'pick-models', display: 'path-models-text' },
  { key: 'vae_path',    action: 'pick-vae',    display: 'path-vae-text' },
  { key: 'llm_path',    action: 'pick-llm',    display: 'path-llm-text' },
  { key: 'lora_path',   action: 'pick-lora',   display: 'path-lora-text' },
]

export async function initConfig() {
  store = await Store.load('config.json')

  populateSamplers()

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

  for (const { key, action, display } of PATH_KEYS) {
    document.querySelector(`[data-action="${action}"]`)?.addEventListener('click', async () => {
      const path = await invoke('pick_folder')
      if (!path) return
      if (key === 'output_path' || key === 'models_path' || key === 'vae_path' || key === 'llm_path' || key === 'lora_path') {
        await invoke('ensure_output_dir', { path })
      }
      await store.set(key, path)
      await store.save()
      updatePathDisplay(display, path)
      if (key === 'models_path') await scanModels(path)
      if (key === 'vae_path') await scanVae(path)
      if (key === 'llm_path') await scanEncoders(path)
      if (key === 'lora_path') await scanLoras(path)
    })
  }
}

async function scanModels(modelsPath) {
  const result = await invoke('scan_models', { basePath: modelsPath })
  populateSelect('select-model', result.models)
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

export async function getSdPath() { return store.get('sd_path') }
export async function getOutputPath() { return store.get('output_path') }
export async function getModelsPath() { return store.get('models_path') }
export async function getVaePath() { return store.get('vae_path') }
export async function getLlmPath() { return store.get('llm_path') }
export async function getLoraPath() { return store.get('lora_path') }

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
