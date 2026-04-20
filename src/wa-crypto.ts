import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CLAUDECLAW_CONFIG } from './config.js'

const KEY_FILE = join(CLAUDECLAW_CONFIG, 'wa-key.bin')

let cachedKey: Buffer | null = null

function keyBuffer(): Buffer {
  if (cachedKey) return cachedKey
  mkdirSync(CLAUDECLAW_CONFIG, { recursive: true, mode: 0o700 })
  if (existsSync(KEY_FILE)) {
    const k = readFileSync(KEY_FILE)
    if (k.length !== 32) throw new Error(`invalid wa key length at ${KEY_FILE}: ${k.length}`)
    cachedKey = k
    return k
  }
  const k = randomBytes(32)
  writeFileSync(KEY_FILE, k)
  chmodSync(KEY_FILE, 0o600)
  cachedKey = k
  return k
}

export type SealedBlob = { ciphertext: Buffer; iv: Buffer; tag: Buffer }

export function seal(plaintext: string): SealedBlob {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext: enc, iv, tag }
}

export function open(blob: SealedBlob): string {
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer(), blob.iv)
  decipher.setAuthTag(blob.tag)
  const dec = Buffer.concat([decipher.update(blob.ciphertext), decipher.final()])
  return dec.toString('utf8')
}
