import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import { CLAUDECLAW_CONFIG } from './config.js'
import { logger } from './logger.js'
import { insertWaMessage, isWaJidAllowed } from './db.js'
import { seal } from './wa-crypto.js'

const SESSION_DIR = join(CLAUDECLAW_CONFIG, 'baileys-session')

let sock: WASocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null

function messageText(msg: WAMessage): { text: string; kind: string } {
  const m = msg.message
  if (!m) return { text: '', kind: 'empty' }
  if (m.conversation) return { text: m.conversation, kind: 'text' }
  if (m.extendedTextMessage?.text) return { text: m.extendedTextMessage.text, kind: 'text' }
  if (m.imageMessage?.caption) return { text: m.imageMessage.caption, kind: 'image' }
  if (m.videoMessage?.caption) return { text: m.videoMessage.caption, kind: 'video' }
  if (m.documentMessage?.caption) return { text: m.documentMessage.caption, kind: 'document' }
  if (m.audioMessage) return { text: '(voice note)', kind: 'audio' }
  if (m.stickerMessage) return { text: '(sticker)', kind: 'sticker' }
  return { text: '', kind: Object.keys(m)[0] ?? 'unknown' }
}

async function onIncoming(raw: WAMessage): Promise<void> {
  try {
    if (!raw.key.id) return
    const chatJid = raw.key.remoteJid ?? ''
    const isGroup = chatJid.endsWith('@g.us')
    const senderJid = isGroup ? raw.key.participant ?? chatJid : chatJid
    if (!isWaJidAllowed(senderJid)) return // silent drop — allowlist only

    const { text, kind } = messageText(raw)
    if (!text) return
    const sealed = seal(text)
    insertWaMessage({
      id: raw.key.id,
      chatJid,
      senderJid,
      senderName: raw.pushName ?? undefined,
      contentEnc: sealed.ciphertext,
      contentIv: sealed.iv,
      contentTag: sealed.tag,
      isGroup,
      isFromMe: raw.key.fromMe === true,
      mediaKind: kind,
      ts: raw.messageTimestamp ? Number(raw.messageTimestamp) * 1000 : undefined,
    })
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'wa insert failed')
  }
}

export function isWaReady(): boolean {
  return existsSync(SESSION_DIR)
}

export async function startWhatsApp(showQR = false): Promise<WASocket | null> {
  if (!existsSync(SESSION_DIR) && !showQR) {
    logger.info('wa: no session — run `npx tsx scripts/setup-whatsapp.ts` to pair')
    return null
  }
  mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 })
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: { level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({} as never) } as never) } as never,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr && showQR) {
      qrcode.generate(qr, { small: true })
      console.log('\nScan this QR with Telegram on your phone → Linked devices → Link a device.')
    }
    if (connection === 'close') {
      const reason = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      logger.warn({ reason }, 'wa connection closed')
      if (reason !== DisconnectReason.loggedOut) {
        scheduleReconnect()
      } else {
        logger.error('wa logged out — delete baileys-session/ to re-pair')
      }
    } else if (connection === 'open') {
      logger.info('wa connection open')
    }
  })

  sock.ev.on('messages.upsert', (batch) => {
    for (const m of batch.messages) {
      if (m.key.fromMe) continue
      void onIncoming(m)
    }
  })

  return sock
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void startWhatsApp().catch(err => logger.error({ err }, 'wa reconnect failed'))
  }, 15_000)
  reconnectTimer.unref()
}

export function stopWhatsApp(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  try {
    sock?.end(undefined)
  } catch {
    /* noop */
  }
  sock = null
}
