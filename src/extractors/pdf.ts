import { spawn } from 'node:child_process'

const BIN = process.env.PDFTOTEXT_BIN ?? '/usr/bin/pdftotext'
const TIMEOUT_MS = 30_000

export async function extractPdf(path: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(BIN, ['-layout', '-nopgbrk', path, '-'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`pdftotext timeout after ${TIMEOUT_MS}ms for ${path}`))
    }, TIMEOUT_MS)
    timer.unref()
    child.stdout.on('data', chunk => chunks.push(chunk))
    child.stderr.on('data', chunk => errChunks.push(chunk))
    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`pdftotext exited ${code}: ${Buffer.concat(errChunks).toString('utf8').trim()}`))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}
