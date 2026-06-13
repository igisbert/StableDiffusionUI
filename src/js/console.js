const output = () => document.getElementById('console-output')

export function appendLine(text) {
  const pre = output()
  pre.textContent += text + '\n'
  pre.scrollTop = pre.scrollHeight
}

export function clearConsole() {
  output().textContent = ''
}
