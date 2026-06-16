import { Store } from '@tauri-apps/plugin-store'

let store

const FIELDS = [
  { id: 'select-model',           type: 'select' },
  { id: 'select-llm',             type: 'select' },
  { id: 'select-vae',             type: 'select' },
  { id: 'select-lora',            type: 'select' },
  { id: 'select-clip-l',          type: 'select' },
  { id: 'select-clip-g',          type: 'select' },
  { id: 'select-t5xxl',           type: 'select' },
  { id: 'input-width',            type: 'text'   },
  { id: 'input-height',           type: 'text'   },
  { id: 'input-steps',            type: 'text'   },
  { id: 'input-cfg',              type: 'text'   },
  { id: 'input-guidance',         type: 'text'   },
  { id: 'input-seed',             type: 'text'   },
  { id: 'input-batch-count',      type: 'text'   },
  { id: 'input-max-vram',         type: 'text'   },
  { id: 'input-lora-weight',      type: 'text'   },
  { id: 'select-sampler',         type: 'select' },
  { id: 'select-scheduler',       type: 'select' },
  { id: 'toggle-vae-cpu',         type: 'toggle' },
  { id: 'toggle-clip-cpu',        type: 'toggle' },
  { id: 'toggle-offload-cpu',     type: 'toggle' },
  { id: 'toggle-diffusion-fa',    type: 'toggle' },
  { id: 'toggle-vae-tiling',      type: 'toggle' },
  { id: 'toggle-verbose',         type: 'toggle' },
  { id: 'input-custom-flags',     type: 'text'   },
]

function captureForm() {
  const values = {}
  for (const field of FIELDS) {
    const el = document.getElementById(field.id)
    if (!el) continue
    values[field.id] = field.type === 'toggle' ? el.checked : el.value
  }
  return values
}

function applyForm(values) {
  for (const field of FIELDS) {
    const el = document.getElementById(field.id)
    if (!el || values[field.id] === undefined) continue
    if (field.type === 'toggle') {
      el.checked = values[field.id]
    } else {
      el.value = values[field.id]
    }
  }
  document.getElementById('select-model')?.dispatchEvent(new Event('change'))
  document.getElementById('select-lora')?.dispatchEvent(new Event('change'))
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
