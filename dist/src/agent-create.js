import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT, HOWL_CONFIG_DIR } from './config.js';
import { logger } from './logger.js';
const TEMPLATE_DIR = join(PROJECT_ROOT, 'agents', '_template');
const ID_RE = /^[a-z0-9_-]{2,30}$/;
export function listAgents() {
    const out = [];
    const roots = [
        { loc: 'project', base: join(PROJECT_ROOT, 'agents') },
        { loc: 'config', base: join(HOWL_CONFIG_DIR, 'agents') },
    ];
    for (const { loc, base } of roots) {
        if (!existsSync(base))
            continue;
        for (const name of readdirSync(base)) {
            if (name.startsWith('_') || name.startsWith('.'))
                continue;
            const dir = join(base, name);
            const yaml = join(dir, 'agent.yaml');
            if (!existsSync(yaml))
                continue;
            const body = readFileSync(yaml, 'utf8');
            const descMatch = /^description:\s*"?(.*?)"?\s*$/m.exec(body);
            out.push({ id: name, location: loc, dir, description: descMatch?.[1] });
        }
    }
    return out;
}
export function createAgent(args) {
    if (!ID_RE.test(args.id)) {
        throw new Error(`agent id must match ${ID_RE}: got "${args.id}"`);
    }
    const location = args.location ?? 'project';
    const base = location === 'project' ? join(PROJECT_ROOT, 'agents') : join(HOWL_CONFIG_DIR, 'agents');
    const dir = join(base, args.id);
    if (existsSync(dir))
        throw new Error(`agent already exists: ${dir}`);
    mkdirSync(dir, { recursive: true });
    const displayName = args.displayName ?? args.id;
    const description = args.description ?? 'Specialist agent.';
    const claudeTemplate = readFileSync(join(TEMPLATE_DIR, 'CLAUDE.md'), 'utf8');
    const yamlTemplate = readFileSync(join(TEMPLATE_DIR, 'agent.yaml'), 'utf8');
    writeFileSync(join(dir, 'CLAUDE.md'), claudeTemplate
        .replace(/{{id}}/g, args.id)
        .replace(/{{displayName}}/g, displayName)
        .replace(/{{description}}/g, description));
    writeFileSync(join(dir, 'agent.yaml'), yamlTemplate
        .replace(/{{id}}/g, args.id)
        .replace(/{{displayName}}/g, displayName)
        .replace(/{{description}}/g, description));
    logger.info({ id: args.id, dir }, 'agent created');
    return { dir };
}
//# sourceMappingURL=agent-create.js.map