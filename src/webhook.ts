/**
 * Hono app: the Telegram webhook endpoint plus a health route.
 *
 * Security: every /api/telegram request must carry X-Telegram-Bot-Api-Secret-Token
 * equal to WEBHOOK_SECRET. If the secret is unset or mismatched we fail closed
 * with 401 — preventing forged updates.
 */

import type { Bot } from "grammy";
import { Hono } from "hono";
import { getBot } from "#/bot";
import { readConfig } from "#/config";
import type { Env } from "#/types";

/** grammY's Update shape, derived so we don't import a transitive type package. */
type TelegramUpdate = Parameters<Bot["handleUpdate"]>[0];

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

const app = new Hono();

app.get("/", (c) => c.text("makan-siang ok"));
app.get("/health", (c) => c.text("ok"));

app.post("/api/telegram", async (c) => {
	const env = c.env as Env;
	const provided = c.req.header(SECRET_HEADER);
	if (!env.WEBHOOK_SECRET || provided !== env.WEBHOOK_SECRET) {
		return c.text("unauthorized", 401);
	}

	let update: TelegramUpdate;
	try {
		update = (await c.req.json()) as TelegramUpdate;
	} catch {
		return c.text("bad request", 400);
	}

	const cfg = readConfig(env);
	const bot = await getBot(env, cfg);

	// Acknowledge fast; process in the background. grammY's bot.catch handles
	// middleware errors; the .catch() is a last line of defense.
	c.executionCtx.waitUntil(
		bot.handleUpdate(update).catch((err) => console.error("handleUpdate failed", err)),
	);
	return c.json({ ok: true });
});

export { app };
