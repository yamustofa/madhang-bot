/**
 * Worker entry point. Exports both the HTTP handler (Hono webhook) and the
 * scheduled handler (every-minute cron). They share the same lazy bot
 * singleton and D1 binding.
 */
import { getBot } from "#/bot";
import { readConfig } from "#/config";
import { runScheduler } from "#/scheduler";
import type { Env } from "#/types";
import { app } from "#/webhook";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return app.fetch(request, env, ctx);
	},

	async scheduled(
		_controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		try {
			const cfg = readConfig(env);
			const bot = await getBot(env, cfg);
			ctx.waitUntil(runScheduler(env, cfg, bot));
		} catch (err) {
			console.error("scheduled handler failed", err);
		}
	},
} satisfies ExportedHandler<Env>;
