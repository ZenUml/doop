import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { compileDiagramStyle } from '../server/diagramStyles'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

it('retains raw CSS and legacy browser font imports byte-for-byte', async () => {
  const source = '@import url("https://fonts.googleapis.com/css?family=Roboto");\n.message { color: red; }'
  expect(await compileDiagramStyle(source, 'css')).toBe(source)
})

it.each([
  ['less', '@ink: red; .diagram { .message {color: @ink; width: (4px * 2)} }'],
  ['scss', '$ink: red; .diagram { .message {color: $ink; width: 4px * 2} }'],
  ['sass', '$ink: red\n.diagram\n  .message\n    color: $ink\n    width: 4px * 2'],
])('compiles real %s variables, nesting and arithmetic', async (mode, source) => {
  const css = await compileDiagramStyle(source, mode)
  expect(css).toContain('.diagram .message')
  expect(css).toMatch(/color: red/)
  expect(css).toMatch(/width: 8px/)
})

it('does not confuse directive text in strings/comments with imports', async () => {
  const css = await compileDiagramStyle('/* @import "absent" */ .message { content: "@use sample"; }', 'scss')
  expect(css).toContain('content: "@use sample"')
})

it.each(['stylus', 'acss', 'unknown'])('refuses unsupported %s without replacing the original source', async (mode) => {
  const source = '.message\n color red'
  await expect(compileDiagramStyle(source, mode)).rejects.toThrow(/original stylesheet must be retained/)
  expect(source).toBe('.message\n color red')
})

it('refuses imports, data-uri/image reads, plugins and Less JavaScript against private files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'diagram-style-private-'))
  temporary.push(directory)
  const secret = path.join(directory, 'private.less')
  const plugin = path.join(directory, 'plugin.js')
  const marker = path.join(directory, 'executed')
  await writeFile(secret, '.private { content: "PRIVATE_TEST_SENTINEL"; }', { mode: 0o600 })
  await writeFile(plugin, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed');`, { mode: 0o600 })
  for (const [mode, source] of [
    ['less', `@import "${secret}";`],
    ['less', `@\\69mport "${secret}";`],
    ['less', `@plugin "${plugin}";`],
    ['less', `.x { content: data-uri("${secret}"); }`],
    ['less', `.x { width: image-width("${secret}"); }`],
    ['less', '.x { width: `process.cwd()`; }'],
    ['scss', `@use "${secret}";`],
    ['scss', `@forward "${secret}";`],
    ['sass', `@import "${secret}"`],
  ])
    await expect(compileDiagramStyle(source!, mode!)).rejects.toThrow()
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(secret, 'utf8')).toBe('.private { content: "PRIVATE_TEST_SENTINEL"; }')
})

it('never requests remote imports or data-uri files from a compiler', async () => {
  let requests = 0
  const server = createServer((_request, response) => {
    requests++
    response.end('.x{color:red}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Fixture server did not listen')
    const url = `http://127.0.0.1:${address.port}/style.less`
    for (const mode of ['less', 'scss', 'sass'])
      await expect(compileDiagramStyle(`@import "${url}"`, mode)).rejects.toThrow()
    await expect(compileDiagramStyle(`.x{content:data-uri("${url}")}`, 'less')).rejects.toThrow()
    expect(requests).toBe(0)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})

it('terminates an infinite Sass loop and permits subsequent compilation', async () => {
  await expect(compileDiagramStyle('@while true {}', 'scss')).rejects.toThrow(/time limit|stopped safely/)
  expect(await compileDiagramStyle('$color:red;.x{color:$color}', 'scss')).toContain('color: red')
}, 10_000)

it('bounds source size before starting a compiler', async () => {
  await expect(compileDiagramStyle('x'.repeat(512 * 1024 + 1), 'scss')).rejects.toThrow(/size limit/)
})

it('rejects a generated CSS import after preprocessor interpolation', async () => {
  await expect(
    compileDiagramStyle('$directive: import; @#{$directive} "https://example.invalid/private.css";', 'scss'),
  ).rejects.toThrow(/imports and plugins/)
})

it('does not inherit desktop server shutdown or loader preloads in compiler workers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'diagram-style-preload-'))
  temporary.push(directory)
  const marker = path.join(directory, 'preload-marker')
  const preload = path.join(directory, 'preload.mjs')
  await writeFile(
    preload,
    `import {appendFileSync} from 'node:fs'; import {isMainThread} from 'node:worker_threads'; appendFileSync(${JSON.stringify(marker)}, isMainThread ? 'M' : 'W')`,
  )
  const moduleUrl = pathToFileURL(path.resolve('server/diagramStyles.ts')).href
  await promisify(execFile)(
    process.execPath,
    [
      '--import',
      pathToFileURL(preload).href,
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `import {compileDiagramStyle} from ${JSON.stringify(moduleUrl)}; const css=await compileDiagramStyle('.x{color:red}', 'scss'); if(!css.includes('color: red'))process.exit(1);`,
    ],
    { timeout: 10_000 },
  )
  expect(await readFile(marker, 'utf8')).toBe('M')
})
