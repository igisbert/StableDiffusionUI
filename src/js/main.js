import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { createIcons, icons } from 'lucide'
import { initConfig, refreshAllSelects, getOutputPath } from './config.js'
import { initInference } from './inference.js'
import { initPresets } from './presets.js'
import { initTooltips } from './tooltips.js'
import { appendLine } from './console.js'
import { showPreview } from './preview.js'

document.addEventListener('DOMContentLoaded', async () => {
  createIcons({ icons })

  await initConfig()
  await initPresets()
  initInference()
  initTooltips()

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    await refreshAllSelects()
    createIcons({ icons })
  })

  document.getElementById('btn-copy-seed').addEventListener('click', async () => {
    const seed = document.getElementById('input-seed')?.value ?? ''
    await navigator.clipboard.writeText(seed)
    const btn = document.getElementById('btn-copy-seed')
    btn.innerHTML = '<i data-lucide="check"></i> Copiar semilla'
    createIcons({ icons })
    setTimeout(() => {
      btn.innerHTML = '<i data-lucide="copy"></i> Copiar semilla'
      createIcons({ icons })
    }, 1500)
  })

  document.getElementById('btn-open-output').addEventListener('click', async () => {
    const output = await getOutputPath()
    if (output) await invoke('open_folder', { path: output })
  })

  await listen('console-line', (event) => {
    appendLine(event.payload)
  })

  await listen('inference-done', (event) => {
    showPreview(event.payload)
  })
})
