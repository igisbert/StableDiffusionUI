import { listen } from '@tauri-apps/api/event'
import { createIcons, icons } from 'lucide'
import { initConfig, refreshAllSelects } from './config.js'
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

  await listen('console-line', (event) => {
    appendLine(event.payload)
  })

  await listen('inference-done', (event) => {
    showPreview(event.payload)
  })
})
