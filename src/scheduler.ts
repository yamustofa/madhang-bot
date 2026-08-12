/**
 * The every-minute scheduled job. Three responsibilities, kept soft and
 * low-traffic-friendly:
 *   1. Auto-roll: close sessions from previous days.
 *   2. Passive fallback: if a session has had zero proposals (and zero bot
 *      suggestions) for longer than the nudge delay, post one smart suggestion.
 *   3. Soft-deadline ping: when a proposal's "leaves at" enters its 10-minute
 *      window, announce it once.
 */
import type { Bot } from "grammy";
import type { Config } from "#/config";
import * as repo from "#/db/repository";
import { dateLocalString, minutesBetween, timeLocalString } from "#/domain/time";
import { createBotSuggestion } from "#/service";
import type { Env } from "#/types";

const PING_WINDOW_MIN = 10;

export async function runScheduler(env: Env, cfg: Config, bot: Bot): Promise<void> {
	const db = env.DB;
	const now = new Date();
	const offset = cfg.timezoneOffsetMin;
	const nowWib = timeLocalString(now, offset);
	const today = dateLocalString(now, offset);

	const sessions = await repo.listOpenSessions(db);
	for (const session of sessions) {
		// 1. close stale sessions from earlier dates
		if (session.dateLocal < today) {
			await repo.closeSession(db, session.id);
			continue;
		}

		const proposals = await repo.listProposalsForSession(db, session.id);

		// 2. passive fallback — break the "terserah" silence
		if (proposals.length === 0 && session.botSuggestionCount === 0) {
			const ageMin = (now.getTime() - Date.parse(session.createdAt)) / 60_000;
			if (Number.isFinite(ageMin) && ageMin >= cfg.defaults.nudgeDelayMin) {
				await createBotSuggestion(db, cfg, bot.api, session.chatId, session);
				continue; // board refreshed inside; deadline check resumes next tick
			}
		}

		// 3. soft-deadline pings
		for (const proposal of proposals) {
			if (proposal.leavePingSent || !proposal.leaveAtLocal) continue;
			const minsLeft = minutesBetween(nowWib, proposal.leaveAtLocal);
			if (!Number.isFinite(minsLeft) || minsLeft < 0 || minsLeft > PING_WINDOW_MIN) continue;

			const count = await repo.countJoins(db, proposal.id);
			const when = minsLeft === 0 ? "berangkat sekarang" : `${minsLeft} menit lagi`;
			try {
				await bot.api.sendMessage(
					session.chatId,
					`📍 ${proposal.placeName} — ${count} orang — ${when}.`,
				);
			} catch (err) {
				// Sending can fail if the bot was kicked; don't let it block the loop.
				console.error("ping send failed", err);
			}
			await repo.setLeavePingSent(db, proposal.id);
		}
	}
}
