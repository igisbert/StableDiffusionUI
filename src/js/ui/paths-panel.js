import { getPathsPanelOpen, setPathsPanelOpen } from '../config.js'

export async function initPathsPanel() {
  const btnTogglePaths = document.getElementById('btn-toggle-paths')
  const pathsCollapse = document.getElementById('paths-collapse')

  async function applyPathsPanelOpen(open) {
    btnTogglePaths.classList.toggle('open', open)
    btnTogglePaths.setAttribute('aria-expanded', String(open))
    pathsCollapse.style.height = open ? 'auto' : '0px'
  }

  applyPathsPanelOpen(await getPathsPanelOpen())

  btnTogglePaths.addEventListener('click', () => {
    const open = btnTogglePaths.classList.toggle('open')
    btnTogglePaths.setAttribute('aria-expanded', String(open))
    setPathsPanelOpen(open)
    if (open) {
      pathsCollapse.style.height = `${pathsCollapse.scrollHeight}px`
      pathsCollapse.addEventListener('transitionend', () => {
        if (btnTogglePaths.classList.contains('open')) {
          pathsCollapse.style.height = 'auto'
        }
      }, { once: true })
    } else {
      pathsCollapse.style.height = `${pathsCollapse.scrollHeight}px`
      void pathsCollapse.offsetHeight
      pathsCollapse.style.height = '0px'
    }
  })
}
