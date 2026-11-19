import { Store } from '@tauri-apps/plugin-store'
import { getLoras, setLoras } from './features/lora-multiselect.js'

let store
let defaults = {}

const FIELDS = [
  { id: 'select-model',           type: 'select' },
  { id: 'select-llm',             type: 'select' },
  { id: 'select-vae',             type: 'select' },
  { id: 'select-llm-vision',      type: 'select' },
  { id: 'select-clip-l',          type: 'select' },
  { id: 'select-clip-g',          type: 'select' },
  { id: 'select-t5xxl',           type: 'select' },
  { id: 'select-tokenizer',       type: 'select' },
  { id: 'input-width',            type: 'text'   },
  { id: 'input-height',           type: 'text'   },
  { id: 'input-steps',            type: 'text'   },
  { id: 'input-cfg',              type: 'text'   },
  { id: 'input-guidance',         type: 'text'   },
  { id: 'input-seed',             type: 'text'   },
  { id: 'input-batch-count',      type: 'text'   },
  { id: 'input-max-vram',         type: 'text'   },
  { id: 'input-threads',          type: 'text'   },
  { id: 'select-sampler',         type: 'select' },
  { id: 'select-scheduler',       type: 'select' },
  { id: 'toggle-cuda',            type: 'toggle' },
  { id: 'toggle-vae-cpu',         type: 'toggle' },
  { id: 'toggle-clip-cpu',        type: 'toggle' },
  { id: 'toggle-offload-cpu',     type: 'toggle' },
  { id: 'toggle-fa',              type: 'toggle' },
  { id: 'toggle-diffusion-fa',    type: 'toggle' },
  { id: 'toggle-vae-tiling',      type: 'toggle' },
  { id: 'toggle-mmap',            type: 'toggle' },
  { id: 'toggle-verbose',         type: 'toggle' },
  { id: 'input-custom-flags',     type: 'text'   },
  { id: 'input-strength',         type: 'text'   },
  { id: 'input-inpaint-strength', type: 'text'   },
]

const SAMPLER_ALIASES = {
  dpmpp2s_a: 'dpm++2s_a',
  dpmpp2m: 'dpm++2m',
  dpmpp2mv2: 'dpm++2mv2',
}

function toBool(value) {
  return value === true || value === 'true'
}

export function captureForm() {
  const values = {}
  for (const field of FIELDS) {
    const el = document.getElementById(field.id)
    if (!el) continue
    values[field.id] = field.type === 'toggle' ? el.checked : el.value
  }
  values['loras'] = getLoras()
  // legacy compat
  const first = values['loras'][0]
  if (first) {
    values['select-lora'] = first.file
    values['input-lora-weight'] = String(first.weight)
  }
  values['model-type'] = document.querySelector('input[name="model-type"]:checked')?.value || 'monolithic'
  values['image-op'] = document.querySelector('input[name="image-op"]:checked')?.value || ''
  return values
}

function resolveSelectValue(id, value, base) {
  const raw = value == null ? '' : String(value)
  const resolved = id === 'select-sampler' ? (SAMPLER_ALIASES[raw] || raw) : raw
  const el = document.getElementById(id)
  if (!el) return resolved

  const exists = Array.from(el.options).some(option => option.value === resolved)
  if (exists) return resolved

  const fallback = base?.[id] ?? ''
  if (resolved !== '') {
    console.warn(`[presets] ${id}: "${resolved}" ya no está disponible; se usa "${fallback}".`)
  }
  return fallback
}

function resolveLoras(values) {
  if (Array.isArray(values['loras'])) return values['loras']
  if (values['select-lora']) {
    return [{
      file: values['select-lora'],
      weight: parseFloat(values['input-lora-weight']) || 1,
    }]
  }
  return []
}

function applyModelType(value, base) {
  const radios = document.querySelectorAll('input[name="model-type"]')
  const find = (val) => Array.from(radios).find(radio => radio.value === val)

  let target = find(value)
  if (!target) {
    if (value) console.warn(`[presets] model-type: "${value}" no es válido; se usa el valor por defecto.`)
    target = find(base?.['model-type'] || 'monolithic')
  }
  if (target) target.checked = true
}

function openImageInput() {
  const btnToggle = document.getElementById('btn-toggle-image-input')
  const content = document.getElementById('image-input-content')
  if (btnToggle && content) {
    btnToggle.classList.add('open')
    content.classList.add('open')
  }
}

function applyImageOp(value) {
  const op = typeof value === 'string' ? value : ''
  const radios = Array.from(document.querySelectorAll('input[name="image-op"]'))
  const target = radios.find(radio => radio.value === op)

  if (target) {
    target.checked = true
    target.dispatchEvent(new Event('change'))
    openImageInput()
    return
  }

  // No operation saved: reuse the "cancel" branch to uncheck and hide panels.
  const cancel = radios.find(radio => radio.value === 'cancel')
  if (cancel) {
    cancel.checked = true
    cancel.dispatchEvent(new Event('change'))
    cancel.checked = false
  } else {
    for (const radio of radios) radio.checked = false
  }
}

export function applyForm(values, base = defaults) {
  const merged = { ...base, ...values }

  for (const field of FIELDS) {
    const el = document.getElementById(field.id)
    if (!el) continue

    const value = merged[field.id]
    if (field.type === 'toggle') {
      el.checked = toBool(value)
    } else if (field.type === 'select') {
      el.value = resolveSelectValue(field.id, value, base)
    } else {
      el.value = value == null ? (base?.[field.id] ?? '') : value
    }
  }

  setLoras(resolveLoras(values))
  applyModelType(merged['model-type'], base)
  applyImageOp(merged['image-op'])

  document.getElementById('select-model')?.dispatchEvent(new Event('change'))

  const faEl = document.getElementById('toggle-fa')
  const diffFaEl = document.getElementById('toggle-diffusion-fa')
  if (faEl && diffFaEl) diffFaEl.disabled = faEl.checked
}

async function loadPresetList() {
  const keys = await store.keys()
  const sel = document.getElementById('select-preset')
  sel.innerHTML = '<option value="">— Seleccionar preajuste —</option>'
  for (const key of keys.sort()) {
    const opt = document.createElement('option')
    opt.value = key
    opt.textContent = key
    sel.appendChild(opt)
  }
}

export async function initPresets() {
  store = await Store.load('presets.json')
  defaults = captureForm()
  await loadPresetList()

  document.getElementById('btn-save-preset').addEventListener('click', async () => {
    const name = document.getElementById('input-preset-name').value.trim()
    if (!name) return
    await store.set(name, captureForm())
    await store.save()
    await loadPresetList()
    document.getElementById('select-preset').value = name
    document.getElementById('input-preset-name').value = ''
  })

  document.getElementById('btn-load-preset').addEventListener('click', async () => {
    const name = document.getElementById('select-preset').value
    if (!name) return
    const values = await store.get(name)
    if (values) applyForm(values)
  })

  document.getElementById('btn-delete-preset').addEventListener('click', async () => {
    const name = document.getElementById('select-preset').value
    if (!name) return
    await store.delete(name)
    await store.save()
    await loadPresetList()
  })
}
