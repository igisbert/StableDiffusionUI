import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { createIcons, icons } from 'lucide'
import { initConfig, refreshAllSelects, getOutputPath } from './config.js'
import { initInference } from './inference.js'
import { initPresets } from './presets.js'
import { initTooltips } from './tooltips.js'
import { appendLine, clearConsole } from './console.js'
import { showPreview } from './preview.js'

let capturedSeeds = []

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
    const text = capturedSeeds.length === 1
      ? capturedSeeds[0]
      : capturedSeeds.join(', ')
    if (!text) return
    await navigator.clipboard.writeText(text)
    const btn = document.getElementById('btn-copy-seed')
    btn.innerHTML = '<i data-lucide="check"></i> Copiar semilla'
    createIcons({ icons })
    setTimeout(() => {
      btn.innerHTML = '<i data-lucide="copy"></i> Copiar semilla'
      createIcons({ icons })
    }, 1500)
  })

  document.getElementById('btn-copy-console').addEventListener('click', async () => {
    const consoleOutput = document.getElementById('console-output')?.textContent ?? ''
    if (!consoleOutput) return
    await navigator.clipboard.writeText(consoleOutput)
    const btn = document.getElementById('btn-copy-console')
    btn.innerHTML = '<i data-lucide="check"></i> Copiar salida de la consola'
    createIcons({ icons })
    setTimeout(() => {
      btn.innerHTML = '<i data-lucide="copy"></i> Copiar salida de la consola'
      createIcons({ icons })
    }, 1500)
  })

  document.getElementById('btn-open-output').addEventListener('click', async () => {
    const output = await getOutputPath()
    if (output) await invoke('open_folder', { path: output })
  })

  await listen('console-line', (event) => {
    const line = event.payload
    const match = line.match(/generating image: \d+\/\d+ - seed (\d+)/)
    if (match) capturedSeeds.push(match[1])
    appendLine(line)
  })

  await listen('inference-started', () => {
    capturedSeeds = []
  })

  await listen('inference-done', (event) => {
    showPreview(event.payload)
  })
})
