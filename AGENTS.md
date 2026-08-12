# makan-siang

A Telegram bot that turns the office "makan siang apa hari ini?" group-chat debate
into a **live status board**: one pinned, self-editing message showing who's going
where, with how many, and when they leave.

## Stack

- **Runtime:** Cloudflare Workers (single worker exports `fetch` + `scheduled`).
- **Web:** Hono — serves the Telegram webhook (`POST /api/telegram`) and a health route (`GET /`).
- **Bot:** grammY (handlers, inline keyboards, conversations). Calls go only to the fixed host `api.telegram.org`.
- **Storage:** Cloudflare D1 (SQLite). The bot needs server state; this is the deliberate divergence from samarata, which is stateless.
- **Scheduling:** Cron Triggers (`* * * * *`) drive the passive fallback nudge, soft-deadline pings, and auto-roll.
- **Tooling:** Bun (mandated), TypeScript, Biome (lint/format/check), Vitest.

## Conventions

- **Package manager is Bun.** Use `bun install`, `bun run <script>`.
- **Biome** owns formatting and linting: `bun run check`.
- **Config:** non-secret values live under `vars` in `wrangler.jsonc`. Secrets
  (`BOT_TOKEN`, `WEBHOOK_SECRET`) are set with `wrangler secret put` and must
  also be documented in `.dev.vars.example`.
- **Lean by default.** Do not add libraries, integrations, or feature scaffolding
  until a product requirement calls for them.
- **Pure core.** Everything that doesn't touch the network or D1 lives in
  `src/domain/*` as pure functions and is unit-tested in `tests/`. Keep Telegram
  and D1 wiring thin so the logic stays testable.

## Security rules

- Every `/api/telegram` request must carry `X-Telegram-Bot-Api-Secret-Token`
  equal to `WEBHOOK_SECRET`, else reject with 401.
- The only outbound host is `api.telegram.org` (hard-coded). The samarata link
  is emitted into a message for the user to click — never fetched server-side.
- Any future server-side URL fetch MUST: allow `http`/`https` only, validate the
  host, and reject localhost, loopback, private, and reserved addresses.

## Commands

```bash
bun install              # install deps
bun run db:apply:local   # apply D1 schema to local miniflare DB
bun run dev              # wrangler dev (local worker + local D1)
bun run check            # biome lint + format check
bun run test             # vitest
bun run deploy           # wrangler deploy
```

Webhook registration is a one-time `curl` documented in `README.md` (the user
runs it with their own token; no outbound call lives in this codebase).

See `README.md` for the full setup walkthrough.
