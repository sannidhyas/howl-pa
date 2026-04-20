// `npx tsx scripts/howl.ts <subcommand>` or `node dist/scripts/howl.js <subcommand>`
// Subcommands: agent:create <id> [description], agent:list, attach <id>, status.

import { createInterface } from 'node:readline/promises'
import { initDatabase, closeDatabase, listScheduledTasks } from '../src/db.js'
import { createAgent, listAgents } from '../src/agent-create.js'
import { parseDelegation, routeDelegation, ensureHiveMindSchema } from '../src/orchestrator.js'
import { ALLOWED_CHAT_ID } from '../src/config.js'

function help(): void {
  console.log(`howl commands:
  agent:create <id> [description]   scaffold a new agent
  agent:list                        list all agents
  attach <id>                       REPL talking to agent <id>
  status                            show scheduler summary`)
}

async function cmdAgentCreate(argv: string[]): Promise<void> {
  const id = argv[0]
  if (!id) {
    console.error('usage: agent:create <id> [description]')
    process.exit(1)
  }
  const description = argv.slice(1).join(' ') || undefined
  const { dir } = createAgent({ id, description })
  console.log(`✅ ${id} scaffolded at ${dir}`)
}

function cmdAgentList(): void {
  const agents = listAgents()
  if (agents.length === 0) {
    console.log('no agents registered yet. try `howl agent:create scribe`')
    return
  }
  for (const a of agents) {
    console.log(`${a.id.padEnd(20)} ${a.location.padEnd(8)} ${a.description ?? ''}`)
  }
}

async function cmdAttach(argv: string[]): Promise<void> {
  const id = argv[0]
  if (!id) {
    console.error('usage: attach <id>')
    process.exit(1)
  }
  ensureHiveMindSchema()
  console.log(`attached to @${id}. enter prompts, Ctrl-C to exit.`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  while (true) {
    const line = (await rl.question(`@${id} > `)).trim()
    if (!line) continue
    const outcome = await routeDelegation({ agentId: id, prompt: line }, String(ALLOWED_CHAT_ID))
    if (!outcome.ok) console.error(`⚠️ ${outcome.text}`)
    else {
      console.log(`--- ${outcome.backend ?? ''} ${outcome.durationMs}ms ---`)
      console.log(outcome.text)
      console.log('------')
    }
  }
}

function cmdStatus(): void {
  const tasks = listScheduledTasks()
  if (tasks.length === 0) {
    console.log('no scheduled tasks.')
    return
  }
  for (const t of tasks) {
    const next = new Date(t.next_run).toISOString().slice(0, 19).replace('T', ' ')
    const last = t.last_run ? new Date(t.last_run).toISOString().slice(0, 19).replace('T', ' ') : '—'
    console.log(`${t.status === 'active' ? '●' : '○'} ${t.name.padEnd(18)} ${t.schedule.padEnd(16)} next ${next}  last ${last}  ${t.last_result ?? ''}`)
  }
}

async function main(): Promise<void> {
  initDatabase()
  try {
    const [sub, ...rest] = process.argv.slice(2)
    switch (sub) {
      case 'agent:create':
        await cmdAgentCreate(rest)
        break
      case 'agent:list':
        cmdAgentList()
        break
      case 'attach':
        await cmdAttach(rest)
        break
      case 'status':
        cmdStatus()
        break
      default:
        help()
        if (sub && sub !== '--help' && sub !== 'help') process.exit(1)
    }
  } finally {
    closeDatabase()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
