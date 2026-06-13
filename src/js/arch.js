const ARCH_MODE = {
  'flux':    'flux',
  'flux2':   'flux',
  'sd1':     'classic',
  'sd2':     'classic',
  'sdxl':    'classic',
  'unknown': null,
}

const ARCH_LABELS = {
  'flux':    'FLUX',
  'flux2':   'FLUX 2',
  'sd1':     'SD 1.x',
  'sd2':     'SD 2.x',
  'sdxl':    'SDXL',
  'unknown': 'UNKNOWN',
}

export function applyArch(arch) {
  const mode = ARCH_MODE[arch] ?? null
  const badge = document.getElementById('arch-badge')

  if (badge) {
    badge.textContent = ARCH_LABELS[arch] ?? arch.toUpperCase()
    badge.style.display = arch ? 'inline-block' : 'none'
  }

  document.querySelectorAll('.field-group[data-arch]').forEach(group => {
    const groupArch = group.dataset.arch
    if (groupArch === 'common' || mode === null) {
      group.classList.remove('hidden')
    } else {
      group.classList.toggle('hidden', groupArch !== mode)
    }
  })
}
