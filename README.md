# madhang

> Makan siang bareng tim, tanpa ribet — satu papan ke-pin, tinggal ketuk. 🍽️

A Telegram bot that turns the daily *"makan siang apa hari ini?"* office group-chat
debate into a **live status board**: one pinned message that edits itself as people
propose places and tap to join. No more scrolling chat to figure out who's going
where, with whom, and when.

👉 **Try it:** [@madhang_bot](https://t.me/madhang_bot) — add it to your office
Telegram group, make it admin, type `/makan`.

> Built for a 15-person office circle (~7–10 join each day). Each workday someone
> opens a session, the board goes up, and the group converges without the usual
> "terserah" chaos.

## Why

The real problem isn't *picking a restaurant* — it's **group coordination**:
decision paralysis ("terserah"), leaders vs joiners, splintering into sub-groups,
and remembering the usual spots. madhang makes **proposing low-stakes and joining
one tap**, because most people just want to be joiners.

## What it does

- **`/makan`** opens today's board and pins it. (`/lunch` juga jalan.)
- **`/ulang`** clears the board for a fresh round, same day.
- **➕ Usul tempat** → pick a saved place → pick a leave time. (Or `/usul <nama> [jam]`.)
- **[ Join ]** — one tap to join/leave; headcount updates live. Duplicate places are blocked.
- **🤷 Terserah** — mark yourself flexible; pinged when a group is about to leave.
- **🎲 Tempat random** — the bot suggests one place (least-recently-used + cooldown);
  also fires automatically if nobody has proposed within ~8 minutes.
- **💸 Hitung pembayaran** — hands off to [samarata](https://samarata.my.id) to split the bill fairly.

Decision push is **soft**: each proposal carries its own "leaves at" time; no hard lock.

### Commands

| Group | Commands |
|---|---|
| **Sesi** | `/makan` open/refresh · `/ulang` reset round |
| **Usul di papan** | `/usul <nama> [jam]` · `/jam <nama> <jam>` change time · `/batal <nama>` remove |
| **Tempat favorit** | `/tambah <nama>` add · `/tempat` list · `/hapus <nama>` delete |

Type `/bantuan` in the group for the full list.

## Stack

Cloudflare Workers + Hono + grammY + D1 (SQLite), with Bun · TypeScript · Biome · Vitest.
One worker exports both the webhook (`fetch`) and the every-minute cron (`scheduled`).

## Setup

### 1. Create the bot

Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → name it **Madhang**,
username `madhang_bot`. Copy the **bot token**.

### 2. Create the group & add the bot

Make a Telegram group for your office circle, add the bot, and **promote it to
admin** (it needs send/edit/pin permissions).

### 3. Install & configure

```bash
bun install
cp .dev.vars.example .dev.vars   # then fill BOT_TOKEN + WEBHOOK_SECRET
```

Generate a secret: `openssl rand -hex 32` → put it in `WEBHOOK_SECRET`.

### 4. Create the D1 database

```bash
bunx wrangler login
bunx wrangler d1 create madhang
```

Paste the returned `database_id` into `wrangler.jsonc` (replace
`REPLACE_WITH_D1_DATABASE_ID`), then apply the schema:

```bash
bun run db:apply:local   # local miniflare DB (for wrangler dev)
bun run db:apply         # remote DB (for production)
```

### 5. Run locally

```bash
bun run dev
```

To test against real Telegram without deploying, expose the worker with a tunnel
(`cloudflared tunnel --url http://localhost:8787`) and point step 6's `curl` at the
tunnel URL.

### 6. Deploy & go live

```bash
bun run deploy
```

Set the production secrets (these never touch the repo):

```bash
bunx wrangler secret put BOT_TOKEN
bunx wrangler secret put WEBHOOK_SECRET
```

Then register the webhook (one-time) — your token stays on your machine:

```bash
export BOT_TOKEN=...          # from @BotFather
export WEBHOOK_SECRET=...     # the value in your wrangler secret / .dev.vars
export WEBHOOK_URL=https://madhang.<your-subdomain>.workers.dev

curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"$WEBHOOK_URL/api/telegram\",\"secret_token\":\"$WEBHOOK_SECRET\",\"allowed_updates\":[\"message\",\"callback_query\"]}"
```

In the group, type `/makan`. 🍽️

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | `wrangler dev` (local worker + local D1) |
| `bun run db:apply:local` / `db:apply` | apply `schema.sql` to local / remote D1 |
| `bun run check` | Biome lint + format check |
| `bun run test` | Vitest unit tests |
| `bun run deploy` | `wrangler deploy` |

## Project layout

```
src/
├─ index.ts          # worker entry: fetch (Hono) + scheduled (cron)
├─ webhook.ts        # Hono app: POST /api/telegram (secret check) + GET /
├─ bot.ts            # grammY bot: commands + inline-button handlers
├─ scheduler.ts      # cron: passive fallback, deadline pings, auto-roll
├─ service.ts        # shared ops: refreshBoard, proposePlace, createBotSuggestion
├─ config.ts         # env bindings + defaults
├─ types.ts          # shared types
├─ telegram/         # api.ts (edit/pin/send), flows.ts (place + time pickers)
├─ db/               # schema.sql + repository.ts (typed D1 queries)
└─ domain/           # pure + unit-tested: board, suggestion, keyboard, callback, time
tests/               # unit tests for the pure domain layer
```

## Security

- The Telegram webhook rejects any request without `X-Telegram-Bot-Api-Secret-Token`
  matching `WEBHOOK_SECRET`.
- Secrets (`BOT_TOKEN`, `WEBHOOK_SECRET`) live only in `.dev.vars` (local, gitignored)
  and Cloudflare Worker secrets — never in the repo.
- Data is isolated per Telegram group (keyed by `chat_id`); one group cannot see
  another's places or sessions.
- The only outbound host is `api.telegram.org`.

## Out of scope (for now)

samarata deep-link prefill, cuisine/craving tags, popularity-weighted suggestions,
hard-lock mode, per-group admin UI. Payments, menus, and delivery/titip stay manual.
