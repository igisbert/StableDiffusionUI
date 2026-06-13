import { invoke } from '@tauri-apps/api/core'
import { getSdPath, getOutputPath, getModelsPath, getVaePath, getLlmPath, getLoraPath } from './config.js'
import { clearConsole, appendLine } from './console.js'

export function initInference() {
  document.getElementById('btn-run').addEventListener('click', async () => {
    const sdPath = await getSdPath()
    const outputPath = await getOutputPath()
    const modelsPath = await getModelsPath()
    const vaePath = await getVaePath()
    const llmPath = await getLlmPath()
    const loraPath = await getLoraPath()

    if (!sdPath || !outputPath) {
      appendLine('[ERROR] Configura las rutas de SD-cpp y Output antes de ejecutar.')
      return
    }

    const val = (id) => document.getElementById(id)?.value ?? ''
    const checked = (id) => document.getElementById(id)?.checked ?? false
    const num = (id, fallback = 0) => parseFloat(val(id)) || fallback
    const int = (id, fallback = 0) => parseInt(val(id)) || fallback

    const params = {
      sd_path:          sdPath,
      output_path:      outputPath,
      models_path:      modelsPath || sdPath,
      vae_path:         vaePath,
      llm_path:         llmPath,
      lora_path:        loraPath,
      model:            val('select-model'),
      llm:              val('select-llm'),
      vae:              val('select-vae'),
      lora:             val('select-lora'),
      prompt:           val('input-prompt'),
      negative_prompt:  val('input-negative'),
      width:            int('input-width', 512),
      height:           int('input-height', 512),
      steps:            int('input-steps', 20),
      cfg_scale:        num('input-cfg', 7.0),
      guidance:         num('input-guidance', 3.5),
      seed:             int('input-seed', -1),
      batch_count:      int('input-batch-count', 1),
      max_vram:         num('input-max-vram', -0.5),
      sampler:          val('select-sampler'),
      vae_on_cpu:       checked('toggle-vae-cpu'),
      clip_on_cpu:      checked('toggle-clip-cpu'),
      offload_to_cpu:   checked('toggle-offload-cpu'),
      diffusion_fa:     checked('toggle-diffusion-fa'),
      vae_tiling:       checked('toggle-vae-tiling'),
    }

    clearConsole()
    document.getElementById('btn-run').classList.add('running')

    try {
      await invoke('run_inference', { params })
    } catch (e) {
      appendLine(`[ERROR] ${e}`)
      document.getElementById('btn-run').classList.remove('running')
    }
  })
}
