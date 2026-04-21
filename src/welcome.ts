import { InlineKeyboard } from 'grammy'

export function buildWelcomeHtml(): string {
  return `🐺 <b>Howl PA</b> — <i>personal mission control</i>

Your Obsidian vault, Gmail / Calendar / Tasks, and a subagent pool, all behind one chat. I maintain the vault, ingest
Gmail / Calendar / Tasks, and spawn Claude or Codex subagents when you ask.

<b>Next steps</b>
1. Run setup if you haven't: <code>howl-pa setup</code> in your terminal
2. Connect Google: <code>howl-pa setup:google</code> (gives me Gmail, Calendar, Tasks)
3. Try <code>/routines</code> to see what runs automatically
4. Try <code>/help</code> for the full command list
5. Open the dashboard from the boot log URL for a live view

<i>You can also just talk to me</i> — I'll classify (idea / note / task / literature / thesis / journal) and file it in the vault.`
}

export function buildWelcomeKeyboard(): import('grammy').InlineKeyboard {
  return new InlineKeyboard()
    .text('Run /routines', 'cmd:routines')
    .text('Run /health', 'cmd:health')
    .row()
    .text('Show /help', 'cmd:help')
}
