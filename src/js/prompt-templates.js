import { Store } from '@tauri-apps/plugin-store'

let store

async function getStore() {
  if (!store) store = await Store.load('templates.json')
  return store
}

export async function saveTemplate(name, prompt, negative) {
  const s = await getStore()
  await s.set(name, { prompt, negative })
  await s.save()
}

export async function loadTemplates() {
  const s = await getStore()
  const keys = await s.keys()
  return keys.sort()
}

export async function getTemplate(name) {
  const s = await getStore()
  return await s.get(name)
}

export async function deleteTemplate(name) {
  const s = await getStore()
  await s.delete(name)
  await s.save()
}

export async function initPromptTemplates() {
  const sel = document.getElementById('select-prompt')
  const btnLoad = document.getElementById('btn-load-prompt')
  const btnDelete = document.getElementById('btn-delete-prompt')
  const btnSave = document.getElementById('btn-save-prompt')
  const inputName = document.getElementById('input-prompt-name')

  async function refreshList(selectedName) {
    const keys = await loadTemplates()
    sel.innerHTML = '<option value="">— Seleccionar prompt —</option>'
    for (const key of keys) {
      const opt = document.createElement('option')
      opt.value = key
      opt.textContent = key
      sel.appendChild(opt)
    }
    if (selectedName) sel.value = selectedName
  }

  await refreshList()

  btnLoad.addEventListener('click', async () => {
    const name = sel.value
    if (!name) return
    const data = await getTemplate(name)
    if (!data) return
    document.getElementById('input-prompt').value = data.prompt || ''
    document.getElementById('input-negative').value = data.negative || ''
  })

  btnDelete.addEventListener('click', async () => {
    const name = sel.value
    if (!name) return
    await deleteTemplate(name)
    await refreshList()
  })

  btnSave.addEventListener('click', async () => {
    const name = inputName.value.trim()
    if (!name) return
    const prompt = document.getElementById('input-prompt').value
    const negative = document.getElementById('input-negative').value
    await saveTemplate(name, prompt, negative)
    await refreshList(name)
    inputName.value = ''
  })
}
