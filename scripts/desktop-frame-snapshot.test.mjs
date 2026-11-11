import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'

test('public WebKit captures preserve alpha, white shapes and antialiased ink', async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'zenuml-frame-snapshot-'))
  try {
    const helper = path.join(temporary, 'FrameSnapshot')
    execFileSync('xcrun', [
      'swiftc',
      '-O',
      '-parse-as-library',
      '-target',
      `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx13.5`,
      'desktop/scripts/FrameSnapshot.swift',
      '-o',
      helper,
    ])
    const html = (paper) =>
      `<html><body style="margin:0;background:${paper}"><div class="sequence-diagram" style="width:80px;height:60px;background:transparent"><div style="position:absolute;left:4px;top:4px;width:4px;height:4px;background:white"></div><div style="position:absolute;left:10px;top:10px;width:20px;height:20px;background:red"></div><div style="position:absolute;left:40px;top:10px;width:20px;height:20px;background:blue;opacity:.5"></div><div style="position:absolute;left:50px;top:35px;width:15px;height:15px;border-radius:50%;background:green"></div><span style="position:absolute;top:35px;left:10px;font:16px Arial;color:black">Ink</span></div></body></html>`
    const capture = (paper, transparent) =>
      execFileSync(helper, {
        input: JSON.stringify({
          html: html(paper),
          transparent,
          origin: 'http://127.0.0.1:4400/',
          width: 80,
          height: 60,
          captureHeight: 60,
          outputWidth: 80,
          diagram: false,
        }),
        timeout: 20_000,
      })
    const png = capture('white', true)
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.width, 80)
    assert.equal(info.height, 60)
    const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)]
    assert.equal(pixel(0, 0)[3], 0)
    assert.deepEqual(pixel(6, 6), [255, 255, 255, 255])
    assert.deepEqual(pixel(20, 20), [255, 0, 0, 255])
    assert.ok(pixel(45, 15)[3] >= 126 && pixel(45, 15)[3] <= 129)
    assert.ok(data.some((value, index) => index % 4 === 3 && value > 0 && value < 255))
    for (const paper of ['black', 'white']) {
      const reference = await sharp(capture(paper, false)).removeAlpha().raw().toBuffer()
      const recomposed = await sharp(png).flatten({ background: paper }).removeAlpha().raw().toBuffer()
      let maximumError = 0
      for (let index = 0; index < reference.length; index++)
        maximumError = Math.max(maximumError, Math.abs(reference[index] - recomposed[index]))
      assert.ok(maximumError <= 2, `${paper} recomposition error ${maximumError}`)
    }
    const compatible = await sharp(capture('white', undefined)).ensureAlpha().raw().toBuffer()
    assert.equal(compatible[3], 255, 'omitted option retains opaque export')
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
