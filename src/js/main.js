import { listen } from '@tauri-apps/api/event'
import { initConfig } from './config.js'
import { initInference } from './inference.js'
import { initPresets } from './presets.js'
import { appendLine } from './console.js'
import { showPreview } from './preview.js'

document.addEventListener('DOMContentLoaded', async () => {
  await initConfig()
  await initPresets()
  initInference()

  await listen('console-line', (event) => {
    appendLine(event.payload)
  })

  await listen('inference-done', (event) => {
    showPreview(event.payload)
  })
})
