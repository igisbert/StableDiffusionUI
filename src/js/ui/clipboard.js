import { createIcons, icons } from 'lucide'

export async function flashCopy(btn, text, { okLabel, idleLabel }) {
  await navigator.clipboard.writeText(text)
  btn.innerHTML = okLabel
  createIcons({ icons })
  setTimeout(() => {
    btn.innerHTML = idleLabel
    createIcons({ icons })
  }, 1500)
}
