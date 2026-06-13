import { invoke } from '@tauri-apps/api/core'
import { applyArch } from './arch.js'

export async function scanModels(modelsPath) {
  const result = await invoke('scan_models', { basePath: modelsPath })

  populateSelect('select-model', result.models)
  populateSelect('select-llm', result.text_encoders, true)
  populateSelect('select-vae', result.vaes, true)
  populateSelect('select-lora', result.loras, true)

  document.getElementById('select-model').addEventListener('change', async (e) => {
    if (!e.target.value) return
    const arch = await invoke('detect_model_arch', {
      basePath: modelsPath,
      filename: e.target.value
    })
    applyArch(arch)
  })

  const currentModel = document.getElementById('select-model').value
  if (currentModel) {
    const arch = await invoke('detect_model_arch', { basePath: modelsPath, filename: currentModel })
    applyArch(arch)
  }
}

function populateSelect(id, items, withNone = false) {
  const sel = document.getElementById(id)
  if (!sel) return
  sel.innerHTML = ''
  if (withNone) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = 'None'
    sel.appendChild(opt)
  }
  for (const item of items) {
    const opt = document.createElement('option')
    opt.value = item
    opt.textContent = item
    sel.appendChild(opt)
  }
}
