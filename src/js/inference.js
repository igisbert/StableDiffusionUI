import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { createIcons, icons } from 'lucide'
import { getSdPath, getOutputPath, getModelsPath, getVaePath, getLlmPath, getLoraPath } from './config.js'
import { clearConsole, appendLine } from './console.js'

let isRunning = false

function setRunning(running) {
  isRunning = running
  const btnRun = document.getElementById('btn-run')
  const btnAbort = document.getElementById('btn-abort')

  if (running) {
    btnRun.disabled = true
    btnAbort.hidden = false
  } else {
    btnRun.disabled = false
    btnAbort.hidden = true
  }
}

async function buildCommand() {
  const sdPath = await getSdPath()
  const modelsPath = await getModelsPath()
  const vaePath = await getVaePath()
  const llmPath = await getLlmPath()
  const loraPath = await getLoraPath()

  const val = (id) => document.getElementById(id)?.value ?? ''
  const checked = (id) => document.getElementById(id)?.checked ?? false
  const num = (id, fallback = 0) => parseFloat(val(id)) || fallback
  const int = (id, fallback = 0) => parseInt(val(id)) || fallback

  const modelType = document.querySelector('input[name="model-type"]:checked')?.value || 'monolithic'
  const flag = modelType === 'diffusion' ? '--diffusion-model' : '-m'

  let cmd = 'sd-cli.exe'
  if (val('select-model')) cmd += ' ' + flag + ' "' + modelsPath + '\\' + val('select-model') + '"'
  if (val('select-llm')) cmd += ' --llm "' + llmPath + '\\' + val('select-llm') + '"'
  if (val('select-vae')) cmd += ' --vae "' + vaePath + '\\' + val('select-vae') + '"'
  if (val('select-lora')) cmd += ' --lora-model-dir "' + loraPath + '\\' + val('select-lora') + '"'
  cmd += ' -p "' + val('input-prompt') + '"'
  if (val('input-negative')) cmd += ' -n "' + val('input-negative') + '"'
  cmd += ' -W ' + int('input-width', 512) + ' -H ' + int('input-height', 512)
  cmd += ' --steps ' + int('input-steps', 20)
  cmd += ' --cfg-scale ' + num('input-cfg', 7.0)
  cmd += ' --guidance ' + num('input-guidance', 3.5)
  cmd += ' -s ' + int('input-seed', -1)
  cmd += ' -b ' + int('input-batch-count', 1)
  cmd += ' --sampling-method ' + val('select-sampler')
  cmd += ' --schedule ' + val('select-scheduler')
  const maxVram = num('input-max-vram', -0.5)
  if (maxVram !== 0) cmd += ' --max-vram ' + maxVram
  if (checked('toggle-vae-cpu')) cmd += ' --vae-on-cpu'
  if (checked('toggle-clip-cpu')) cmd += ' --clip-on-cpu'
  if (checked('toggle-offload-cpu')) cmd += ' --offload-to-cpu'
  if (checked('toggle-diffusion-fa')) cmd += ' --diffusion-fa'
  if (checked('toggle-vae-tiling')) cmd += ' --vae-tiling'

  return cmd
}

export function initInference() {
  document.getElementById('btn-copy').addEventListener('click', async function () {
    const cmd = await buildCommand()
    await navigator.clipboard.writeText(cmd)
    const btn = document.getElementById('btn-copy')
    btn.innerHTML = '<i data-lucide="check"></i>'
    createIcons({ icons })
    setTimeout(function () {
      btn.innerHTML = '<i data-lucide="copy"></i>'
      createIcons({ icons })
    }, 1500)
  })

  document.getElementById('btn-run').addEventListener('click', async function () {
    if (isRunning) {
      try {
        await invoke('abort_inference')
      } catch (e) {
appendLine('[ERROR] Error al abortar: ' + e)
      }
      return
    }

    const sdPath = await getSdPath()
    const outputPath = await getOutputPath()

    if (!sdPath || !outputPath) {
      appendLine('[ERROR] Configura las rutas de SD-cpp y Output antes de ejecutar.')
      return
    }

    const prompt = document.getElementById('input-prompt')?.value?.trim() ?? ''
    if (!prompt) {
      appendLine('[ERROR] El prompt es obligatorio.')
      return
    }

    const val = function (id) { return document.getElementById(id)?.value ?? '' }
    const checked = function (id) { return document.getElementById(id)?.checked ?? false }
    const num = function (id, fallback) { return parseFloat(val(id)) || fallback || 0 }
    const int = function (id, fallback) { return parseInt(val(id)) || fallback || 0 }

    const params = {
      sd_path: sdPath,
      output_path: outputPath,
      models_path: (await getModelsPath()) || sdPath,
      vae_path: await getVaePath(),
      llm_path: await getLlmPath(),
      lora_path: await getLoraPath(),
      model: val('select-model'),
      model_type: (document.querySelector('input[name="model-type"]:checked')?.value) || 'monolithic',
      llm: val('select-llm'),
      vae: val('select-vae'),
      lora: val('select-lora'),
      prompt: val('input-prompt'),
      negative_prompt: val('input-negative'),
      width: int('input-width', 512),
      height: int('input-height', 512),
      steps: int('input-steps', 20),
      cfg_scale: num('input-cfg', 7.0),
      guidance: num('input-guidance', 3.5),
      seed: int('input-seed', -1),
      batch_count: int('input-batch-count', 1),
      max_vram: num('input-max-vram', -0.5),
      sampler: val('select-sampler'),
      scheduler: val('select-scheduler'),
      vae_on_cpu: checked('toggle-vae-cpu'),
      clip_on_cpu: checked('toggle-clip-cpu'),
      offload_to_cpu: checked('toggle-offload-cpu'),
      diffusion_fa: checked('toggle-diffusion-fa'),
      vae_tiling: checked('toggle-vae-tiling'),
    }

    clearConsole()
    setRunning(true)

    try {
      await invoke('run_inference', { params: params })
    } catch (e) {
      appendLine('[ERROR] ' + e)
    } finally {
      setRunning(false)
    }
  })

  document.getElementById('btn-abort').addEventListener('click', async function () {
    try {
      await invoke('abort_inference')
    } catch (e) {
      appendLine('[ERROR] Error al abortar: ' + e)
    }
  })

  listen('inference-aborted', () => {
    setRunning(false)
  })
}
