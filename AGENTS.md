## Shared Agent Memory

- Canonical shared memory file: `CLAUDE_PROJECT_MEMORY.md`.
- Treat that file as the repository memory source for Codex, Claude Code, and any other coding agent.
- Before making non-trivial changes, read `CLAUDE_PROJECT_MEMORY.md` for architecture, constraints, and recent decisions.
- After making meaningful changes, update `CLAUDE_PROJECT_MEMORY.md` instead of creating a separate agent-specific memory file.
- Preserve existing user notes and prior history. Append or edit only the sections that need freshness.

## Reusing Claude Assets

- Reuse `.claude/commands/*.md` as local workflow references when the user request matches them.
- If a Claude command file contains a reusable process, follow it as guidance instead of inventing a parallel workflow.
- Keep shared project conventions in repository files, not in model-only memory.

## Shared Skills

- Shared skill directory: `shared-skills/`.
- If the request is about project planning, staged execution, roadmap design, or report updates, use `shared-skills/project-orchestrator/SKILL.md`.
- If the request is about bug feedback, screenshots, logs, `/fankui`, or the `问题反馈/` folder, use `shared-skills/fankui/SKILL.md`.
- These skills are repository-local wrappers around the existing Claude command prompts, so both Codex and Claude can follow the same workflow.

## Formal Skills

- Formal skill directory: `skills/`.
- For `/fankui`-style feedback analysis and bug fixing, prefer `skills/fankui/SKILL.md`.
- `shared-skills/fankui/SKILL.md` remains the lightweight shared workflow wrapper; `skills/fankui/SKILL.md` is the fuller reusable skill entry.
- For cross-agent knowledge capture, skill extraction, `/skill-co-learn`, `/skill-colearn`, or requests like “记住这个”“保存成skill”“让其他Agent也学会”, prefer `skills/skill-co-learn/SKILL.md`.
- For `/function-talk` or requests to co-create, plan, or design a feature conversationally, prefer `skills/feature-co-creation-socratic-frontend/SKILL.md`.

## Memory Update Rules

- Keep entries short, factual, and dated.
- Record durable decisions: architecture, conventions, integration status, known constraints, and pending risks.
- Do not log transient noise such as every command run.
- If a change supersedes an older note, update the older note instead of duplicating contradictory guidance.
- Prefer the template in `CLAUDE_PROJECT_MEMORY.md` section `10. 通用记忆更新模板` when adding new records.
