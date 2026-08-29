import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { createIcons, icons } from 'lucide'
import { getSdPath, getOutputPath, getModelsPath, getVaePath, getLlmPath, getLoraPath, getLlmVisionPath, getClipLPath, getClipGPath, getT5xxlPath } from './config.js'
import { appendLine } from './console.js'
import { exportMask, isMaskPainted, getPreparedImagePath } from './inpaint.js'
import { startProcess, endProcess, isBusy } from './busy.js'

let isRunning = false

function setRunning(running) {
  isRunning = running
  if (running) {
    startProcess()
  } else {
    endProcess()
  }
  document.querySelector('.controls-col')?.classList.toggle('busy', running)
  const btnRun = document.getElementById('btn-run')
  const btnAbort = document.getElementById('btn-abort')
  const btnRunUpscale = document.getElementById('btn-run-upscale')
  const btnAbortUpscale = document.getElementById('btn-abort-upscale')

  if (running) {
    btnRun.disabled = true
    btnAbort.hidden = false
    if (btnRunUpscale) btnRunUpscale.disabled = true
    if (btnAbortUpscale) btnAbortUpscale.hidden = true
  } else {
    btnRun.disabled = false
    btnAbort.hidden = true
    if (btnRunUpscale) btnRunUpscale.disabled = false
  }
}

export function escapeArg(str) {
  return String(str).replace(/"/g, '\\"')
}

export async function collectParams() {
  const sdPath = await getSdPath()
  const outputPath = await getOutputPath()
  const modelsPath = await getModelsPath()
  const vaePath = await getVaePath()
  const llmPath = await getLlmPath()
  const loraPath = await getLoraPath()
  const llmVisionPath = await getLlmVisionPath()
  const clipLPath = await getClipLPath()
  const clipGPath = await getClipGPath()
  const t5xxlPath = await getT5xxlPath()

  const val = (id) => document.getElementById(id)?.value ?? ''
  const checked = (id) => document.getElementById(id)?.checked ?? false
  const num = (id, fallback = 0) => { const v = parseFloat(val(id)); return isNaN(v) ? fallback : v }
  const int = (id, fallback = 0) => { const v = parseInt(val(id)); return isNaN(v) ? fallback : v }

  const modelType = document.querySelector('input[name="model-type"]:checked')?.value || 'monolithic'
  const currentImageOp = document.querySelector('input[name="image-op"]:checked')?.value
  const isInpainting = currentImageOp === 'inpainting'
  const isEdit = currentImageOp === 'image-edit'
  const strengthId = isInpainting ? 'input-inpaint-strength' : 'input-strength'

  const editImage = isEdit ? (getPreparedImagePath() || window.__selectedImageForOp || null) : null
  const inputImage = isEdit ? null : isInpainting
    ? (getPreparedImagePath() || window.__selectedImageForOp || null)
    : (window.__selectedImageForOp || null)
  const maskImage = isInpainting && isMaskPainted() ? exportMask() : null

  return {
    sd_path: sdPath,
    output_path: outputPath,
    models_path: modelsPath || sdPath,
    vae_path: vaePath,
    llm_path: llmPath,
    lora_path: loraPath,
    llm_vision_path: llmVisionPath,
    clip_l_path: clipLPath,
    clip_g_path: clipGPath,
    t5xxl_path: t5xxlPath,
    model: val('select-model'),
    model_type: modelType,
    llm: val('select-llm'),
    vae: val('select-vae'),
    lora: val('select-lora'),
    llm_vision: val('select-llm-vision'),
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
    threads: int('input-threads', -1),
    sampler: val('select-sampler'),
    scheduler: val('select-scheduler'),
    vae_on_cpu: checked('toggle-vae-cpu'),
    clip_on_cpu: checked('toggle-clip-cpu'),
    offload_to_cpu: checked('toggle-offload-cpu'),
    fa: checked('toggle-fa'),
    diffusion_fa: checked('toggle-fa') ? false : checked('toggle-diffusion-fa'),
    vae_tiling: checked('toggle-vae-tiling'),
    mmap: checked('toggle-mmap'),
    verbose: checked('toggle-verbose'),
    force_cuda: checked('toggle-cuda'),
    custom_flags: val('input-custom-flags'),
    edit_image: editImage,
    input_image: inputImage,
    strength: inputImage ? num(strengthId, 0.5) : null,
    mask_image: maskImage,
  }
}

export function paramsToCliString(params) {
  const flag = params.model_type === 'diffusion' ? '--diffusion-model' : '-m'

  let cmd = 'sd-cli.exe'
  if (params.force_cuda) cmd += ' --backend cuda0 --params-backend cpu'
  if (params.model) cmd += ' ' + flag + ' "' + escapeArg(params.models_path + '\\' + params.model) + '"'
  if (params.llm) cmd += ' --llm "' + escapeArg(params.llm_path + '\\' + params.llm) + '"'
  if (params.vae) cmd += ' --vae "' + escapeArg(params.vae_path + '\\' + params.vae) + '"'
  if (params.lora) cmd += ' --lora-model-dir "' + escapeArg(params.lora_path) + '"'
  if (params.llm_vision) cmd += ' --llm_vision "' + escapeArg(params.llm_vision_path + '\\' + params.llm_vision) + '"'
  if (params.clip_l) cmd += ' --clip_l "' + escapeArg(params.clip_l_path + '\\' + params.clip_l) + '"'
  if (params.clip_g) cmd += ' --clip_g "' + escapeArg(params.clip_g_path + '\\' + params.clip_g) + '"'
  if (params.t5xxl) cmd += ' --t5xxl "' + escapeArg(params.t5xxl_path + '\\' + params.t5xxl) + '"'

  let prompt = params.prompt
  if (params.lora) {
    const loraName = params.lora.replace(/\.[^.]+$/, '')
    prompt += ' <lora:' + loraName + ':' + params.lora_weight + '>'
  }
  cmd += ' -p "' + escapeArg(prompt) + '"'
  if (params.negative_prompt) cmd += ' -n "' + escapeArg(params.negative_prompt) + '"'
  cmd += ' -W ' + params.width + ' -H ' + params.height
  if (params.steps != null) cmd += ' --steps ' + params.steps
  if (params.cfg_scale != null) cmd += ' --cfg-scale ' + params.cfg_scale
  if (params.guidance != null) cmd += ' --guidance ' + params.guidance
  cmd += ' -s ' + params.seed
  cmd += ' -b ' + params.batch_count
  cmd += ' --sampling-method ' + params.sampler
  if (params.scheduler) cmd += ' --scheduler ' + params.scheduler
  if (params.max_vram !== 0) cmd += ' --max-vram ' + params.max_vram
  if (params.threads !== -1) cmd += ' -t ' + params.threads
  if (params.vae_on_cpu) cmd += ' --vae-on-cpu'
  if (params.clip_on_cpu) cmd += ' --clip-on-cpu'
  if (params.offload_to_cpu) cmd += ' --offload-to-cpu'
  if (params.fa) cmd += ' --fa'
  else if (params.diffusion_fa) cmd += ' --diffusion-fa'
  if (params.vae_tiling) cmd += ' --vae-tiling'
  if (params.mmap) cmd += ' --mmap'
  if (params.verbose) cmd += ' -v'
  if (params.output_path) cmd += ' -o "' + escapeArg(params.output_path) + '"'

  if (params.edit_image) {
    cmd += ' -r "' + escapeArg(params.edit_image) + '"'
  } else if (params.input_image) {
    cmd += ' -i "' + escapeArg(params.input_image) + '"'
    if (params.strength != null) cmd += ' --strength ' + params.strength
  }
  if (params.mask_image && params.input_image) {
    cmd += ' --mask "mask.png"'
  }

  if (params.custom_flags) {
    for (const line of params.custom_flags.split('\n')) {
      const trimmed = line.trim()
      if (trimmed) cmd += ' ' + trimmed
    }
  }

  return cmd
}

async function buildCommand() {
  const params = await collectParams()
  return paramsToCliString(params)
}

export async function initInference() {
  document.getElementById('select-lora').addEventListener('change', function() {
    document.getElementById('input-lora-weight').disabled = !this.value
  })

  const toggleFa = document.getElementById('toggle-fa')
  const toggleDiffFa = document.getElementById('toggle-diffusion-fa')
  function syncFa() {
    if (toggleFa.checked) {
      toggleDiffFa.disabled = true
    } else {
      toggleDiffFa.disabled = false
    }
  }
  toggleFa.addEventListener('change', syncFa)
  syncFa()

  document.getElementById('btn-copy').addEventListener('click', async function () {
    try {
      const cmd = await buildCommand()
      await navigator.clipboard.writeText(cmd)
      const btn = document.getElementById('btn-copy')
      btn.innerHTML = '<i data-lucide="check"></i>'
      createIcons({ icons })
      setTimeout(function () {
        btn.innerHTML = '<i data-lucide="copy"></i>'
        createIcons({ icons })
      }, 1500)
    } catch (e) {
      appendLine('[ERROR] No se pudo copiar al portapapeles: ' + e)
    }
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

    if (isBusy()) {
      appendLine('[ERROR] Ya hay un proceso en marcha (upscale o inferencia).')
      return
    }

    const params = await collectParams()

    if (!params.sd_path || !params.output_path) {
      appendLine('[ERROR] Configura las rutas de SD-cpp y Output antes de ejecutar.')
      return
    }

    if (!params.prompt.trim()) {
      appendLine('[ERROR] El prompt es obligatorio.')
      return
    }

    if (!params.model) {
      appendLine('[ERROR] Selecciona un modelo antes de ejecutar.')
      return
    }

    if (params.width < 8) {
      appendLine('[ERROR] El ancho debe ser al menos 8 píxeles.')
      return
    }
    if (params.height < 8) {
      appendLine('[ERROR] El alto debe ser al menos 8 píxeles.')
      return
    }
    if (params.batch_count < 1 || params.batch_count > 8) {
      appendLine('[ERROR] El lote debe ser entre 1 y 8.')
      return
    }

    const currentImageOp = document.querySelector('input[name="image-op"]:checked')?.value
    if (currentImageOp === 'img2img' && !params.input_image) {
      appendLine('[ERROR] Selecciona una imagen de entrada para img2img.')
      return
    }
    if (currentImageOp === 'inpainting') {
      if (!params.input_image) {
        appendLine('[ERROR] Selecciona una imagen de entrada para inpainting.')
        return
      }
      if (!params.mask_image) {
        appendLine('[ERROR] Pinta una máscara en el editor de inpainting.')
        return
      }
    }
    if (currentImageOp === 'image-edit' && !params.edit_image) {
      appendLine('[ERROR] Selecciona una imagen de entrada para Image Edit.')
      return
    }

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

  await listen('inference-aborted', () => {
    setRunning(false)
  })
}
