import { extname } from 'node:path'
import { extractPdf } from './pdf.js'
import { extractDocx } from './docx.js'
import { extractText } from './text.js'

export type ExtractedDoc = {
  path: string
  kind: 'pdf' | 'docx' | 'text' | 'markdown' | 'unsupported'
  text: string
}

const TEXT_EXTS = new Set(['.txt', '.rtf', '.log'])
const MARKDOWN_EXTS = new Set(['.md', '.markdown'])

export async function extractFile(path: string): Promise<ExtractedDoc> {
  const ext = extname(path).toLowerCase()
  if (ext === '.pdf') {
    const text = await extractPdf(path)
    return { path, kind: 'pdf', text }
  }
  if (ext === '.docx') {
    const text = await extractDocx(path)
    return { path, kind: 'docx', text }
  }
  if (MARKDOWN_EXTS.has(ext)) {
    return { path, kind: 'markdown', text: await extractText(path) }
  }
  if (TEXT_EXTS.has(ext)) {
    return { path, kind: 'text', text: await extractText(path) }
  }
  return { path, kind: 'unsupported', text: '' }
}

export function isExtractable(path: string): boolean {
  const ext = extname(path).toLowerCase()
  return ext === '.pdf' || ext === '.docx' || TEXT_EXTS.has(ext) || MARKDOWN_EXTS.has(ext)
}
