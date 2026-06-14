export const tooltips = {
  'Modelo': 'Tipo de modelo GGUF. "Difusión" usa --diffusion-model para modelos separados del text encoder. "Monolítico" usa -m para modelos todo-en-uno.',
  'Prompt': 'Texto descriptivo de la imagen a generar. Describe lo que quieres ver en la imagen.',
  'Negative Prompt': 'Texto con elementos que quieres evitar en la generación. Útil para eliminar artefactos o elementos no deseados.',
  'Width': 'Ancho de la imagen en píxeles. Valores típicos: 512, 768, 1024. Modelos SD 1.5 usan 512, SDXL usan 1024.',
  'Height': 'Alto de la imagen en píxeles. Debe ser múltiplo de 8. Relación 1:1 es la más estable.',
  'Steps': 'Número de pasos de denoising. Más pasos = mejor calidad pero más lento. Típico: 20-30.',
  'CFG Scale': 'Classifier-Free Guidance. Controla cuánto se adhiere al prompt. Bajo (1-5) = más creativo, Alto (7-15) = más fiel al prompt.',
  'Guidance': 'Parámetro de guía para modelos Flux/Qwen. Controla la adherencia al prompt. Típico: 3.5.',
  'Seed': 'Semilla del generador aleatorio. -1 = aleatorio cada vez. Fijar un valor permite replicar resultados exactos.',
  'Batch Count': 'Número de imágenes a generar en secuencia. Cada imagen usa una semilla diferente si seed es -1.',
  'Max VRAM': 'Máxima memoria VRAM a usar en GB. Negativo = auto-detectar. Útil si tienes otras aplicaciones usando la GPU.',
  'Sampler': 'Algoritmo de muestreo. DPM++ 2M Karras es buena calidad/velocidad. Euler a es más rápido pero menos detallado.',
  'VAE on CPU': 'Carga el VAE en CPU en vez de GPU. Útil si el VAE es muy grande para la VRAM disponible.',
  'CLIP on CPU': 'Carga el encoder CLIP en CPU. Reduce uso de VRAM pero es más lento.',
  'Offload to CPU': 'Descarga capas a CPU cuando no se usan. Reduce VRAM pero aumenta tiempo de inferencia.',
  'Diffusion Flash Attn': 'Usa Flash Attention para el modelo de difusión. Acelera la inferencia y reduce VRAM. Requiere soporte de hardware.',
  'VAE Tiling': 'Procesa el VAE en tiles para imágenes grandes. Permite generar imágenes más grandes con menos VRAM.',
}

export function initTooltips() {
  document.addEventListener('mouseover', (e) => {
    const icon = e.target.closest('.help-icon')
    if (!icon) return

    const label = icon.closest('.input-label, .toggle-row span')
    if (!label) return

    const text = label.childNodes[0]?.textContent?.replace(':', '').trim()
    const desc = tooltips[text]
    if (!desc) return

    let tip = document.getElementById('tooltip')
    if (!tip) {
      tip = document.createElement('div')
      tip.id = 'tooltip'
      document.body.appendChild(tip)
    }

    tip.textContent = desc
    tip.style.display = 'block'

    const rect = icon.getBoundingClientRect()
    tip.style.left = rect.left + 'px'
    tip.style.top = (rect.bottom + 8) + 'px'
  })

  document.addEventListener('mouseout', (e) => {
    const icon = e.target.closest('.help-icon')
    if (!icon) return
    const tip = document.getElementById('tooltip')
    if (tip) tip.style.display = 'none'
  })
}
