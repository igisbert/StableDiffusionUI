import { sendNotification } from '@tauri-apps/plugin-notification'
import { Store } from '@tauri-apps/plugin-store'

let store
let enabled = true

export async function initNotifications() {
  store = await Store.load('config.json')
  enabled = (await store.get('notifications_enabled')) ?? true
  return enabled
}

export function isEnabled() {
  return enabled
}

export async function toggle() {
  enabled = !enabled
  await store.set('notifications_enabled', enabled)
  await store.save()
  return enabled
}

export function notify(title, body) {
  if (enabled) {
    sendNotification({ title, body })
  }
}
