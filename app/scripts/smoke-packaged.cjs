// Launch the real packaged executable and inspect its renderer over local CDP.
// Uses Node.js 24 built-ins so release runners need no browser-test dependency.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { version } = require('../package.json')

const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function until(check, label) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const result = await check()
    if (result) return result
    await pause(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function connect(url, errors) {
  const socket = new WebSocket(url)
  const pending = new Map()
  let nextId = 0
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails
      errors.push(detail.exception?.description || detail.text)
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }
  return { socket, call, evaluate }
}

async function main() {
  const executable = path.resolve(process.argv[2] || '')
  assert(process.argv[2] && fs.existsSync(executable), 'Pass the path to the packaged app executable')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'open-dot-matrix-smoke-'))
  const port = await freePort()
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const args = [...process.argv.slice(3), '--hidden', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`]
  // Hosted Linux runners cannot use Electron's setuid sandbox under Xvfb.
  if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox')
  const child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  let spawnError
  child.once('error', error => { spawnError = error })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-6000) })
  const errors = []
  let cdp
  try {
    const target = await until(async () => {
      if (spawnError) throw spawnError
      if (child.exitCode !== null) throw new Error(`App exited early (${child.exitCode}): ${output}`)
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })
        return (await response.json()).find(target => target.type === 'page' && target.url.startsWith('file:'))
      } catch { return false }
    }, 'packaged renderer')
    cdp = await connect(target.webSocketDebuggerUrl, errors)
    await cdp.call('Runtime.enable')
    await cdp.call('Log.enable')
    await cdp.call('Page.enable')
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Renderer reload timed out')), 15000)
      const listener = ({ data }) => {
        if (JSON.parse(data).method !== 'Page.loadEventFired') return
        clearTimeout(timer)
        cdp.socket.removeEventListener('message', listener)
        resolve()
      }
      cdp.socket.addEventListener('message', listener)
    })
    await cdp.call('Page.reload')
    await loaded
    await until(() => cdp.evaluate("document.querySelectorAll('[role=tab]').length === 5"), 'the studio to render')
    assert.match(await cdp.evaluate('document.title'), /Open Dot Matrix/)
    assert(await cdp.evaluate("Boolean(window.desktop && typeof window.desktop.openCreatorProfile === 'function')"), 'Desktop bridge is missing')
    assert.equal(typeof (await cdp.evaluate('window.desktop.getAppearance()')).dark, 'boolean')
    assert.equal(typeof (await cdp.evaluate('window.desktop.getBackgroundState()')).keepInTray, 'boolean')
    await until(() => cdp.evaluate("document.querySelector('.brand-glyph').complete && document.querySelector('.brand-glyph').naturalWidth === 64"), 'the logo to load')
    for (const tool of ['image', 'gif', 'text', 'weather', 'modes']) {
      await cdp.evaluate(`document.getElementById('tab-${tool}').click()`)
      await until(() => cdp.evaluate(`!document.getElementById('panel-${tool}').hidden`), `${tool} tool`)
    }
    await cdp.evaluate("document.querySelector('.titlebar-about').click()")
    await until(() => cdp.evaluate("document.querySelector('dialog.about-dialog').open"), 'About dialog')
    const about = await cdp.evaluate("document.querySelector('dialog.about-dialog').innerText")
    assert(about.includes(`Version ${version}`), 'About version does not match the package')
    assert(about.includes('Subhojit Karmakar'), 'Creator credit is missing')
    assert.deepEqual(errors, [], 'Renderer reported startup errors')
    console.log(`Packaged startup passed: ${path.basename(executable)}, v${version}; all five tools, About, logo and desktop IPC work.`)
  } catch (error) {
    console.error('Renderer errors:', errors, '\nApp output:', output)
    throw error
  } finally {
    cdp?.socket.close()
    if (child.exitCode === null) child.kill()
    await pause(700)
    const resolved = path.resolve(profile)
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('open-dot-matrix-smoke-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) } catch { /* Windows may still hold a crash-log handle. */ }
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
