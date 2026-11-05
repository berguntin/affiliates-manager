@AGENTS.md

## Claude Code

- Run `/verify` before reporting any task as done; report its table as is.
- Run the `reviewer` subagent on the diff before every commit.
- Also run each specialized reviewer whose area the diff touches:
  - `compliance-reviewer`: messages, templates, affiliate links, deal evaluation, AI copy, Amazon product lookup.
  - `security-reviewer`: auth middleware, Access validation, the Telegram webhook and intake bot, env/secrets, outbound fetches, logging.
  - `migrations-reviewer`: `server/db/schema.ts`, `server/db/migrations/**`, purge logic.
  - `queue-reviewer`: publication states, scheduling, cron config, scan and `queue:tick`.
- Reviewers are read-only and report; fixing is your job, after weighing each finding.
