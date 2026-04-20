import { simpleGit } from 'simple-git'
import { VAULT_PATH } from '../config.js'
import { composeMorningBrief } from '../brief-composer.js'
import { appendToDailySection, todayIso, vaultPath, VAULT_SUBDIRS } from '../vault.js'
import type { MissionFn } from './types.js'
import { logger } from '../logger.js'

const git = simpleGit(VAULT_PATH)

export const morningBrief: MissionFn = async (ctx) => {
  const brief = await composeMorningBrief()
  const date = todayIso()

  // Replace ## Brief section with composed markdown.
  const filePath = await appendToDailySection(date, 'Brief', brief.markdown)
  try {
    const rel = filePath.replace(`${VAULT_PATH}/`, '')
    await git.add(rel)
    await git.commit(`[mc] daily: ${rel} brief`)
    try {
      await git.push()
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'brief push failed')
    }
  } catch (err) {
    logger.warn({ err }, 'brief commit failed')
  }

  await ctx.send(brief.html)
  return { summary: 'brief sent', data: { date } }
}

// Silences TS unused warning without changing runtime shape.
void vaultPath
void VAULT_SUBDIRS
