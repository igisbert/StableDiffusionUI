import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getSdPath, getOutputPath, getModelsPath, getVaePath, getLlmPath, getLoraPath, getLlmVisionPath, getClipLPath, getClipGPath, getT5xxlPath, getTokenizerPath } from './config.js'
import { appendLine } from './console.js'
import { exportMask, isMaskPainted, getPreparedImagePath } from './inpaint.js'
import { startProcess, endProcess, isBusy } from './busy.js'
import { getSelectedImages } from './state/image-state.js'
import { getLoras } from './features/lora-multiselect.js'
import { flashCopy } from './ui/clipboard.js'

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
  const tokenizerPath = await getTokenizerPath()

  const val = (id) => document.getElementById(id)?.value ?? ''
  const checked = (id) => document.getElementById(id)?.checked ?? false
  const num = (id, fallback = 0) => { const v = parseFloat(val(id)); return isNaN(v) ? fallback : v }
  const int = (id, fallback = 0) => { const v = parseInt(val(id)); return isNaN(v) ? fallback : v }

  const modelType = document.querySelector('input[name="model-type"]:checked')?.value || 'monolithic'
  const currentImageOp = document.querySelector('input[name="image-op"]:checked')?.value
  const isInpainting = currentImageOp === 'inpainting'
  const isEdit = currentImageOp === 'image-edit'
  const strengthId = isInpainting ? 'input-inpaint-strength' : 'input-strength'

  const selectedImages = getSelectedImages()
  const editImages = isEdit ? selectedImages : []
  const inputImage = isEdit ? null : isInpainting
    ? (getPreparedImagePath() || selectedImages[0] || null)
    : (selectedImages[0] || null)
  const maskImage = isInpainting && isMaskPainted() ? exportMask() : null

  const loras = getLoras()

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
    tokenizer_path: tokenizerPath,
    model: val('select-model'),
    model_type: modelType,
    llm: val('select-llm'),
    vae: val('select-vae'),
    lora: loras[0]?.file || '',
    loras: loras,
    llm_vision: val('select-llm-vision'),
    clip_l: val('select-clip-l'),
    clip_g: val('select-clip-g'),
    t5xxl: val('select-t5xxl'),
    tokenizer: val('select-tokenizer'),
    prompt: val('input-prompt'),
    lora_weight: loras[0]?.weight ?? 1,
    negative_prompt: val('input-negative'),
    width: int('input-width', 512),
    height: int('input-height', 512),
    steps: val('input-steps') !== '' ? int('input-steps', 15) : null,
    cfg_scale: val('input-cfg') !== '' ? num('input-cfg', 1) : null,
    guidance: val('input-guidance') !== '' ? num('input-guidance', 1) : null,
    seed: int('input-seed', -1),
    batch_count: int('input-batch-count', 1),
    max_vram: num('input-max-vram', 0),
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
    edit_images: editImages,
    input_image: inputImage,
    strength: inputImage ? num(strengthId, 0.5) : null,
    mask_image: maskImage,
  }
}

/**
 * Single source of truth lives in Rust (`preview_inference_command`), so the
 * copied command and the executed command cannot drift apart.
 */
export async function buildCommand() {
  const params = await collectParams()
  return invoke('preview_inference_command', { params })
}

export async function initInference() {

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
      await flashCopy(document.getElementById('btn-copy'), cmd, {
        okLabel: '<i data-lucide="check"></i>',
        idleLabel: '<i data-lucide="copy"></i>',
      })
    } catch (e) {
      appendLine('[ERROR] No se pudo copiar el comando: ' + e)
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

    if (!params.sampler) {
      appendLine('[ERROR] Selecciona un método de muestreo (sampler) antes de ejecutar.')
      return
    }

    if (params.steps !== null && params.steps < 1) {
      appendLine('[ERROR] Steps debe ser al menos 1.')
      return
    }
    if (params.cfg_scale !== null && params.cfg_scale < 0) {
      appendLine('[ERROR] CFG Scale no puede ser negativo.')
      return
    }
    if (params.guidance !== null && params.guidance < 0) {
      appendLine('[ERROR] Guidance no puede ser negativo.')
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
    if (currentImageOp === 'image-edit' && !params.edit_images?.length) {
      appendLine('[ERROR] Selecciona al menos una imagen de referencia para Image Edit.')
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
