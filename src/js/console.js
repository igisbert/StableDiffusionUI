const output = () => document.getElementById('console-output')

export function appendLine(text) {
  const pre = output()
  if (!pre) return
  pre.textContent += text + '\n'
  pre.scrollTop = pre.scrollHeight
}

export function clearConsole() {
  const el = output()
  if (el) el.textContent = ''
}
