// electron/flaresolverr.cjs: "Start" waits for FlareSolverr to answer, and says why when it cannot.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), os = require('os'), path = require('path')
const { createFlareSolverr } = require('../../electron/flaresolverr.cjs')
// The stand-in FlareSolverr is a script with a #! line: Windows cannot run it as an .exe.
const opts = { skip: process.platform === 'win32' && 'stand-in program cannot run on Windows' }

function withExe(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-fs-')), root = path.join(dir, 'flaresolverr', 'flaresolverr')
  fs.mkdirSync(root, { recursive: true })
  const exe = path.join(root, 'flaresolverr.exe')
  fs.writeFileSync(exe, '#!' + process.execPath + '\n' + script); fs.chmodSync(exe, 0o755)
  return createFlareSolverr({ app: { getPath: () => dir } })
}

test('a FlareSolverr that stops at once: the reason is shown, with its last lines', opts, async () => {
  const fsv = withExe("console.error('Error: Chrome could not be started'); process.exit(3)")
  const st = await fsv.startAndWait(8000)
  assert.strictEqual(st.running, false)
  assert.match(st.error, /stopped right after starting \(code 3\)/)
  assert.match(st.error, /Chrome could not be started/)
})

test('port already taken: said in plain words', opts, async () => {
  const fsv = withExe("console.error('OSError: [WinError 10048] Only one usage of each socket address'); process.exit(1)")
  const st = await fsv.startAndWait(8000)
  assert.match(st.error, /port 8191 is already used by another program/)
})

test('a FlareSolverr that takes a few seconds to open: Start waits for it', opts, async () => {
  const fsv = withExe("setTimeout(() => require('http').createServer((q, r) => r.end('{\"msg\":\"FlareSolverr is ready!\"}')).listen(8191, '127.0.0.1'), 2500)")
  const st = await fsv.startAndWait(15000)
  assert.strictEqual(st.running, true)
  assert.strictEqual(st.error, null)
  fsv.stop()
})
