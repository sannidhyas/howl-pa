import { query } from '@anthropic-ai/claude-agent-sdk';
import { logger } from './logger.js';
import { writeIdea } from './vault-writer.js';
const IDEA_TIMEOUT_MS = 180_000;
const USER_CONTEXT = process.env.HOWL_CONTEXT ?? '';
const SYSTEM_CONTEXT = [
    'You are assisting an independent operator who captures ideas through a Telegram-first personal assistant.',
    'They work with Claude + Codex subscription-only tooling and deliberately avoid paid external APIs',
    '(Gemini, ElevenLabs, Pika, hosted vector DBs, etc.). Ground every recommendation in that stack; prefer',
    'local or free dependencies.',
    USER_CONTEXT ? `Additional personal context from the user: ${USER_CONTEXT}` : '',
].filter(Boolean).join(' ');
const IDEA_PROMPT = `Produce a structured venture run-down in STRICT markdown. Sections MUST appear in this order and use the exact headings shown. No preamble, no closing remarks.

## 1. Problem + customer + market
- Problem statement (one paragraph)
- Target customer segment (specific, not "businesses")
- TAM / SAM / SOM order-of-magnitude estimates

## 2. Competitive landscape
- 3-5 direct or indirect competitors with one-line positioning each
- Candidate moats for the new venture

## 3. Unit economics + monetization
- Revenue model
- Cost structure (key line items)
- CAC / LTV educated guess
- Margin profile

## 4. MVP scope + 90-day plan
- Smallest useful cut of the product
- 90-day milestone list (weeks 1-2, 3-6, 7-12)
- Stack fit check grounded in Claude + Codex CLI + free/local tooling
- Kill criteria (what would make you drop it)

## Pitches
- ### 30-second
  one paragraph
- ### 2-minute
  3-4 paragraphs
- ### 10-minute
  outline only with section headers

## 10 follow-up questions
Exactly 10 numbered questions the founder must answer next. Questions only, no answers.

## Risks specific to IS / trust-in-AI adjacent ventures
- 3-5 bullets

Do not include placeholder text. If you truly cannot fill a section, write "TBD" and explain why in one line.
`;
const SEED_PROMPT = `Write a YAML-frontmatter automation seed that a Claude Code workspace can pick up if the user decides to open this idea. Output STRICT markdown, no preamble.

First a YAML block:
\`\`\`yaml
intent: <one-line goal>
first_steps:
  - <action 1>
  - <action 2>
  - <action 3>
  - <action 4 optional>
  - <action 5 optional>
automation_hook: <folder/repo name suggestion under ~/projects/>
trigger_on: []
\`\`\`

Then a short "When opened" section with 3-5 sentences describing what the user should do first.`;
async function runClaudeSummary(prompt) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), IDEA_TIMEOUT_MS);
    timer.unref();
    const options = {
        model: 'claude-sonnet-4-6',
        permissionMode: 'bypassPermissions',
        maxTurns: 6,
        settingSources: [],
        abortController: ac,
    };
    let out = '';
    try {
        for await (const message of query({ prompt, options })) {
            if (message.type === 'result' && message.subtype === 'success')
                out = message.result;
        }
    }
    finally {
        clearTimeout(timer);
    }
    return out.trim();
}
function slugFromTitle(t) {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'idea';
}
export async function runIdeaFlow(input) {
    const titleGuess = input.title ?? input.text.split(/[\n.!?]/).find(s => s.trim().length > 0)?.trim().slice(0, 60) ?? 'Untitled Idea';
    const slug = input.slug ?? slugFromTitle(titleGuess);
    const runDownPrompt = `${SYSTEM_CONTEXT}\n\n${IDEA_PROMPT}\n\nIdea:\n${input.text.trim()}`;
    const seedPromptFull = `${SYSTEM_CONTEXT}\n\n${SEED_PROMPT}\n\nIdea:\n${input.text.trim()}`;
    const [rundown, seed] = await Promise.all([runClaudeSummary(runDownPrompt), runClaudeSummary(seedPromptFull)]);
    if (!rundown || !seed) {
        throw new Error('idea flow: empty output from summarizer');
    }
    const { indexRel, seedRel } = await writeIdea({
        slug,
        title: titleGuess,
        rundown,
        seed,
        sourceText: input.text,
    });
    logger.info({ indexRel }, 'idea flow persisted');
    return { indexRel, seedRel, title: titleGuess };
}
//# sourceMappingURL=idea-flow.js.map