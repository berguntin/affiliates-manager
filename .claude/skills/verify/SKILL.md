---
name: verify
description: Run the same checks as CI (install, typecheck, test, build) plus a project-specific risk scan of the diff, and report a ✅/❌/⏭️ table. Use before declaring any task done. Reports only; never fixes.
allowed-tools: Bash(pnpm install --frozen-lockfile), Bash(pnpm typecheck), Bash(pnpm test), Bash(pnpm build), Bash(git fetch origin), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git merge-base:*), Bash(git ls-files:*), Read, Grep, Glob
---

# verify

Run the CI checks from `.github/workflows/ci.yml` in order, then scan the diff for this project's risks. Do not stop at the first failure. Do not edit any file, do not fix anything, do not commit. Never run `deploy`, `db:migrate:remote` or any `wrangler` command.

## 1. Scope

1. `git fetch origin`, then `git merge-base HEAD origin/main`; use that SHA as `$BASE` (write it literally in later commands; do not use shell variables). If the fetch fails, continue against the local `origin/main` and say so in the report.
2. Changed files: `git diff --name-only $BASE` plus `git status --porcelain` (include uncommitted and untracked files).
3. Note whether the branch is behind `origin/main` (`git log --oneline HEAD..origin/main`); if so, report it.

## 2. CI checks (in this order)

| # | Check | Command | When it may be skipped |
|---|---|---|---|
| 1 | Install | `pnpm install --frozen-lockfile` | Skip only if `package.json` and `pnpm-lock.yaml` are unchanged **and** `node_modules` and `.nuxt` exist. Otherwise run it (a lockfile mismatch fails CI). |
| 2 | Types | `pnpm typecheck` | Never, if any `.ts`/`.vue` file or config changed. Skip only for docs-only diffs (`*.md`, `docs/**`, `.claude/**`). |
| 3 | Tests | `pnpm test` | Same rule as Types. |
| 4 | Build | `pnpm build` | Skip for docs-only diffs, or when the diff only touches `tests/**`. Always run it if `nuxt.config.ts`, `wrangler.jsonc`, `package.json`, `server/**` or `app/**` changed. |

Run each command even if a previous one failed (except: if Install fails, the rest cannot be trusted; still try them and say so). For every failure, keep only the relevant lines: file:line, the error message, the failing test name and its assertion diff. Drop progress noise.

## 3. Diff risk scan

Read the diff (`git diff $BASE` plus untracked files) and check, reporting each item as ✅, ❌ (with `file:line`) or ⏭️ (not applicable to this diff):

- **Types:** new `any`, `as any`, `@ts-ignore`, `@ts-expect-error` without a reason, non-null `!` on external input.
- **Secrets:** tokens, API keys, JWTs, `database_id` changes, values for `AUTH_*`, `TELEGRAM_*`, `INTAKE_*`, `ANTHROPIC_API_KEY`; changes to `.env`, `.dev.vars` or `.wrangler/` being committed.
- **Personal data in logs/errors:** `console.*` or `createError` messages that include emails, `userEmail`, Telegram `userId`/`chatId`, JWTs or secret values.
- **Layering:** `server/domain/**` importing anything outside `server/domain` and `shared`, or using `fetch`, `useEnv`, `useDb`, `Date.now()`; `app/**` importing from `server/**`; `shared/**` importing outside `shared` and `zod`.
- **Migrations:** any modified or deleted file under `server/db/migrations/` that exists on `origin/main` (`git diff --name-status $BASE -- server/db/migrations`: only `A` is allowed, plus `M` on `meta/_journal.json`); `server/db/schema.ts` changed without a new migration, or a new migration without a schema change (unless it is a data migration).
- **Env vars:** a new key in `AppEnv` (`server/utils/env.ts`) missing from `.dev.vars.example` or the README env table.
- **Cron:** `triggers.crons` in `wrangler.jsonc` and `nitro.scheduledTasks` in `nuxt.config.ts` still list the same expressions.
- **Compliance:** changes under `server/domain/messages/**`, `server/domain/affiliate.ts`, `server/services/templates.ts` that could drop the disclosure line, the price timestamp or the tracking ID; any new fetch to `amazon.` hosts or new call site of `lookupFromPage`/`lookupProduct`; AI prompt changes without validator tests.
- **Auth:** changes to `server/middleware/auth.ts`, `server/utils/access.ts` or new routes outside `/api` without authentication; any widening of `AUTH_DISABLED`.
- **Tests:** new or changed logic in `server/domain/**` or `shared/**` without a matching change in `tests/**`.

## 4. Report

Reply in Spanish with:

1. One line: branch, base commit, number of changed files, behind `origin/main` or not.
2. A table:

| Comprobación | Estado | Detalle |
|---|---|---|
| Install | ✅ / ❌ / ⏭️ | reason for skip or the relevant error |
| Typecheck | … | … |
| Tests | … | `N passed, M failed` + failing names |
| Build | … | … |
| Riesgos del diff | … | one row per ❌ item from section 3 |

3. Below the table, only for ❌ rows: the relevant error lines (short code blocks).
4. A final verdict: "Listo para PR" only if every row is ✅ or a justified ⏭️; otherwise "No listo" and the list of ❌.

Do not propose fixes beyond naming the problem.
