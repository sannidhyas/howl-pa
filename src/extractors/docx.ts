import mammoth from 'mammoth'

export async function extractDocx(path: string): Promise<string> {
  const res = await mammoth.extractRawText({ path })
  return res.value
}
