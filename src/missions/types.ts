export type MissionSend = (html: string) => Promise<void>

export type MissionContext = {
  send: MissionSend
  chatId: string
  now: Date
  args?: Record<string, unknown>
}

export type MissionResult = {
  summary: string
  data?: Record<string, unknown>
}

export type MissionFn = (ctx: MissionContext) => Promise<MissionResult>
