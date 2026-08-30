import { clearConsole } from './console.js'

let busy = false
let seeds = []

export function startProcess() {
  busy = true
  seeds = []
  try { clearConsole() } catch {}
  const s = document.getElementById('btn-copy-seed'); if (s) s.disabled = true
  const c = document.getElementById('btn-copy-console'); if (c) c.disabled = true
  const u = document.getElementById('btn-upscale'); if (u) u.disabled = true
}

export function captureSeed(seed) {
  seeds.push(seed)
}

export function endProcess() {
  busy = false
  const s = document.getElementById('btn-copy-seed'); if (s) s.disabled = seeds.length === 0
  const c = document.getElementById('btn-copy-console'); if (c) c.disabled = false
  const u = document.getElementById('btn-upscale'); if (u) u.disabled = false
}

export function getSeeds() {
  return seeds
}

export function isBusy() {
  return busy
}
