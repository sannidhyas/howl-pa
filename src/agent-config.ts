import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { PROJECT_ROOT, CLAUDECLAW_CONFIG } from './config.js'

export type AgentConfig = {
  id: string
  displayName: string
  description?: string
  model?: string
  telegramTokenEnvVar?: string
  systemPromptPath?: string
  tools?: string[]
  maxTurns?: number
  metadata?: Record<string, unknown>
}

const DEFAULT_MAIN: AgentConfig = {
  id: 'main',
  displayName: 'Howl PA',
  description: 'Primary personal assistant — triage, capture, brief.',
  model: 'claude-sonnet-4-6',
  telegramTokenEnvVar: 'TELEGRAM_BOT_TOKEN',
  maxTurns: 30,
}

export function resolveAgentDir(agentId: string): string | null {
  const projectPath = join(PROJECT_ROOT, 'agents', agentId)
  if (existsSync(projectPath)) return projectPath
  const configPath = join(CLAUDECLAW_CONFIG, 'agents', agentId)
  if (existsSync(configPath)) return configPath
  return null
}

export function resolveAgentClaudeMd(agentId: string): string | null {
  const dir = resolveAgentDir(agentId)
  if (!dir) return null
  const path = join(dir, 'CLAUDE.md')
  return existsSync(path) ? path : null
}

export function loadAgentConfig(agentId: string): AgentConfig {
  if (agentId === 'main') {
    const dir = resolveAgentDir('main')
    if (!dir) return DEFAULT_MAIN
    return readAgentYaml(dir, agentId) ?? DEFAULT_MAIN
  }
  const dir = resolveAgentDir(agentId)
  if (!dir) throw new Error(`agent not found: ${agentId}`)
  const cfg = readAgentYaml(dir, agentId)
  if (!cfg) throw new Error(`agent.yaml missing in ${dir}`)
  return cfg
}

function readAgentYaml(dir: string, agentId: string): AgentConfig | null {
  const path = join(dir, 'agent.yaml')
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf8')
  const parsed = yaml.load(raw) as Partial<AgentConfig> | undefined
  if (!parsed) return null
  return {
    id: parsed.id ?? agentId,
    displayName: parsed.displayName ?? agentId,
    description: parsed.description,
    model: parsed.model ?? 'claude-sonnet-4-6',
    telegramTokenEnvVar: parsed.telegramTokenEnvVar,
    systemPromptPath: parsed.systemPromptPath,
    tools: parsed.tools,
    maxTurns: parsed.maxTurns ?? 30,
    metadata: parsed.metadata,
  }
}
