import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'
import { createIcons, icons } from 'lucide'
import { getSdPath, getOutputPath, getModelsPath, getVaePath, getLlmPath, getLoraPath, getClipLPath, getClipGPath, getT5xxlPath } from './config.js'
import { clearConsole, appendLine } from './console.js'

let isRunning = false

function setRunning(running) {
  isRunning = running
  const btnRun = document.getElementById('btn-run')
  const btnAbort = document.getElementById('btn-abort')
  const btnCopySeed = document.getElementById('btn-copy-seed')
  const btnCopyConsole = document.getElementById('btn-copy-console')

  if (running) {
    btnRun.disabled = true
    btnAbort.hidden = false
    btnCopySeed.disabled = true
    btnCopyConsole.disabled = true
  } else {
    btnRun.disabled = false
    btnAbort.hidden = true
    btnCopySeed.disabled = false
    btnCopyConsole.disabled = false
  }
}

async function buildCommand() {
  const sdPath = await getSdPath()
  const modelsPath = await getModelsPath()
  const vaePath = await getVaePath()
  const llmPath = await getLlmPath()
  const loraPath = await getLoraPath()
  const clipLPath = await getClipLPath()
  const clipGPath = await getClipGPath()
  const t5xxlPath = await getT5xxlPath()

  const val = (id) => document.getElementById(id)?.value ?? ''
  const checked = (id) => document.getElementById(id)?.checked ?? false
  const num = (id, fallback = 0) => { const v = parseFloat(val(id)); return isNaN(v) ? fallback : v }
  const int = (id, fallback = 0) => { const v = parseInt(val(id)); return isNaN(v) ? fallback : v }

  const modelType = document.querySelector('input[name="model-type"]:checked')?.value || 'monolithic'
  const flag = modelType === 'diffusion' ? '--diffusion-model' : '-m'

  let cmd = 'sd-cli.exe'
  if (val('select-model')) cmd += ' ' + flag + ' "' + modelsPath + '\\' + val('select-model') + '"'
  if (val('select-llm')) cmd += ' --llm "' + llmPath + '\\' + val('select-llm') + '"'
  if (val('select-vae')) cmd += ' --vae "' + vaePath + '\\' + val('select-vae') + '"'
  if (val('select-lora')) cmd += ' --lora-model-dir "' + loraPath + '"'
  if (val('select-clip-l')) cmd += ' --clip_l "' + clipLPath + '\\' + val('select-clip-l') + '"'
  if (val('select-clip-g')) cmd += ' --clip_g "' + clipGPath + '\\' + val('select-clip-g') + '"'
  if (val('select-t5xxl')) cmd += ' --t5xxl "' + t5xxlPath + '\\' + val('select-t5xxl') + '"'

  let prompt = val('input-prompt')
  if (val('select-lora')) {
    const loraName = val('select-lora').replace(/\.[^.]+$/, '')
    const weight = num('input-lora-weight', 1)
    prompt += ' <lora:' + loraName + ':' + weight + '>'
  }
  cmd += ' -p "' + prompt + '"'
  if (val('input-negative')) cmd += ' -n "' + val('input-negative') + '"'
  cmd += ' -W ' + int('input-width', 512) + ' -H ' + int('input-height', 512)
  if (val('input-steps') !== '') cmd += ' --steps ' + int('input-steps', 15)
  if (val('input-cfg') !== '') cmd += ' --cfg-scale ' + num('input-cfg', 1)
  if (val('input-guidance') !== '') cmd += ' --guidance ' + num('input-guidance', 1)
  cmd += ' -s ' + int('input-seed', -1)
  cmd += ' -b ' + int('input-batch-count', 1)
  cmd += ' --sampling-method ' + val('select-sampler')
  if (val('select-scheduler')) cmd += ' --scheduler ' + val('select-scheduler')
  const maxVram = num('input-max-vram', -1)
  if (maxVram !== 0) cmd += ' --max-vram ' + maxVram
  if (checked('toggle-vae-cpu')) cmd += ' --vae-on-cpu'
  if (checked('toggle-clip-cpu')) cmd += ' --clip-on-cpu'
  if (checked('toggle-offload-cpu')) cmd += ' --offload-to-cpu'
  if (checked('toggle-diffusion-fa')) cmd += ' --diffusion-fa'
  if (checked('toggle-vae-tiling')) cmd += ' --vae-tiling'
  if (checked('toggle-verbose')) cmd += ' -v'

  const customFlags = val('input-custom-flags')
  if (customFlags) {
    for (const line of customFlags.split('\n')) {
      const trimmed = line.trim()
      if (trimmed) cmd += ' ' + trimmed
    }
  }

  return cmd
}

export function initInference() {
  document.getElementById('select-lora').addEventListener('change', function() {
    document.getElementById('input-lora-weight').disabled = !this.value
  })

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

    const model = document.getElementById('select-model')?.value ?? ''
    if (!model) {
      appendLine('[ERROR] Selecciona un modelo antes de ejecutar.')
      return
    }

    const val = function (id) { return document.getElementById(id)?.value ?? '' }
    const checked = function (id) { return document.getElementById(id)?.checked ?? false }
    const num = function (id, fallback) { const v = parseFloat(val(id)); return isNaN(v) ? (fallback || 0) : v }
    const int = function (id, fallback) { const v = parseInt(val(id)); return isNaN(v) ? (fallback || 0) : v }

    const width = int('input-width', 512)
    const height = int('input-height', 512)
    const batchCount = int('input-batch-count', 1)

    if (width < 8) {
      appendLine('[ERROR] El ancho debe ser al menos 8 píxeles.')
      return
    }
    if (height < 8) {
      appendLine('[ERROR] El alto debe ser al menos 8 píxeles.')
      return
    }
    if (batchCount < 1 || batchCount > 8) {
      appendLine('[ERROR] El lote debe ser entre 1 y 8.')
      return
    }

    const params = {
      sd_path: sdPath,
      output_path: outputPath,
      models_path: (await getModelsPath()) || sdPath,
      vae_path: await getVaePath(),
      llm_path: await getLlmPath(),
      lora_path: await getLoraPath(),
      clip_l_path: await getClipLPath(),
      clip_g_path: await getClipGPath(),
      t5xxl_path: await getT5xxlPath(),
      model: val('select-model'),
      model_type: (document.querySelector('input[name="model-type"]:checked')?.value) || 'monolithic',
      llm: val('select-llm'),
      vae: val('select-vae'),
      lora: val('select-lora'),
      clip_l: val('select-clip-l'),
      clip_g: val('select-clip-g'),
      t5xxl: val('select-t5xxl'),
      prompt: val('input-prompt'),
      lora_weight: num('input-lora-weight', 1),
      negative_prompt: val('input-negative'),
      width: int('input-width', 512),
      height: int('input-height', 512),
      steps: val('input-steps') !== '' ? int('input-steps', 15) : null,
      cfg_scale: val('input-cfg') !== '' ? num('input-cfg', 1) : null,
      guidance: val('input-guidance') !== '' ? num('input-guidance', 1) : null,
      seed: int('input-seed', -1),
      batch_count: int('input-batch-count', 1),
      max_vram: num('input-max-vram', -1),
      sampler: val('select-sampler'),
      scheduler: val('select-scheduler'),
      vae_on_cpu: checked('toggle-vae-cpu'),
      clip_on_cpu: checked('toggle-clip-cpu'),
      offload_to_cpu: checked('toggle-offload-cpu'),
      diffusion_fa: checked('toggle-diffusion-fa'),
      vae_tiling: checked('toggle-vae-tiling'),
      verbose: checked('toggle-verbose'),
      custom_flags: val('input-custom-flags'),
    }

    clearConsole()
    setRunning(true)
    emit('inference-started')

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
