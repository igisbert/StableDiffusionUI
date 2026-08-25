import { clearConsole } from './console.js'

let busy = false
let seeds = []

export function startProcess() {
  busy = true
  seeds = []
  clearConsole()
  document.getElementById('btn-copy-seed').disabled = true
  document.getElementById('btn-copy-console').disabled = true
  document.getElementById('btn-upscale').disabled = true
}

export function captureSeed(seed) {
  seeds.push(seed)
}

export function endProcess() {
  busy = false
  document.getElementById('btn-copy-seed').disabled = seeds.length === 0
  document.getElementById('btn-copy-console').disabled = false
  document.getElementById('btn-upscale').disabled = false
}

export function getSeeds() {
  return seeds
}

export function isBusy() {
  return busy
}
