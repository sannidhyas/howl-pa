// Multi-turn conversation state for morning ritual + evening tracker surveys.
// Keyed by chat_id. Survives inside the running process; resets on restart.
// Persisted lightweight state could be added later if we need cross-restart
// resume — for now, if the bot restarts mid-survey the user just waits for
// the next prompt.

export type PendingSurvey = {
  kind: 'morning' | 'evening' | 'weekly-review'
  chatId: string
  step: number
  started: number
  data: Record<string, string>
}

const active = new Map<string, PendingSurvey>()

export function startSurvey(survey: PendingSurvey): void {
  active.set(survey.chatId, survey)
}

export function currentSurvey(chatId: string): PendingSurvey | null {
  return active.get(chatId) ?? null
}

export function advanceSurvey(chatId: string, patch: Record<string, string>): void {
  const survey = active.get(chatId)
  if (!survey) return
  Object.assign(survey.data, patch)
  survey.step += 1
}

export function clearSurvey(chatId: string): void {
  active.delete(chatId)
}

export function isSurveyActive(chatId: string): boolean {
  return active.has(chatId)
}
