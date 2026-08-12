/**
 * High-level operations shared by the webhook handlers (bot.ts) and the
 * scheduled job (scheduler.ts). Keeping them here means the bot and the cron
 * drive the board through the exact same code path.
 */
import type { Api } from "grammy";
import type { Config } from "#/config";
import * as repo from "#/db/repository";
import { renderBoard } from "#/domain/board";
import { pickSuggestion } from "#/domain/suggestion";
import * as tg from "#/telegram/api";
import type { Place, Session } from "#/types";

/** Normalize a place name for dedupe comparison (trim + lowercase). */
function norm(s: string): string {
	return s.trim().toLowerCase();
}

/** Re-render and edit the board in place (post + pin if it's missing). */
export async function refreshBoard(
	db: D1Database,
	cfg: Config,
	api: Api,
	chatId: number,
	sessionId: number,
): Promise<void> {
	const snap = await repo.getBoardSnapshot(db, sessionId);
	if (!snap) return;
	const rendered = renderBoard(snap, { samarataUrl: cfg.samarataUrl });
	const boardId = snap.session.boardMessageId;
	if (boardId) {
		await tg.editBoard(api, chatId, boardId, rendered);
		return;
	}
	const id = await tg.postBoard(api, chatId, rendered);
	await repo.setBoardMessage(db, sessionId, id);
	await tg.pinBoard(api, chatId, id);
}

/** Result of attempting to create a proposal. */
export interface ProposalResult {
	created: boolean;
	/** True when a proposal for the same place is already on the board. */
	duplicate?: boolean;
}

/**
 * Create a proposal for a place, auto-adding it to the roster when new.
 * Refuses (created: false, duplicate: true) if the place is already proposed
 * in this session, so the board never shows duplicate options.
 */
export async function proposePlace(
	db: D1Database,
	chatId: number,
	session: Session,
	opts: {
		placeId: number | null;
		name: string;
		leave: string;
		proposerUserId: number | null;
		proposerName: string | null;
		isBot?: boolean;
	},
): Promise<ProposalResult> {
	const place =
		opts.placeId != null
			? await repo.getPlaceById(db, opts.placeId)
			: await repo.addPlace(db, chatId, opts.name, opts.proposerUserId, opts.proposerName);
	if (!place) return { created: false };

	const existing = await repo.listProposalsForSession(db, session.id);
	const isDup = existing.some((p) => norm(p.placeName) === norm(place.name));
	if (isDup) return { created: false, duplicate: true };

	await repo.addProposal(db, session.id, {
		placeId: place.id,
		placeName: place.name,
		proposerUserId: opts.proposerUserId,
		proposerName: opts.proposerName,
		leaveAtLocal: opts.leave,
		isBotSuggestion: opts.isBot ?? false,
	});
	return { created: true };
}

/**
 * Pick the next smart-fallback place (LRU + cooldown), excluding places that
 * are already proposed in this session. Returns null when nothing's available.
 */
export async function pickBotSuggestion(
	db: D1Database,
	cfg: Config,
	chatId: number,
	session: Session,
): Promise<Place | null> {
	const [places, proposed] = await Promise.all([
		repo.listPlaces(db, chatId),
		repo.listProposalsForSession(db, session.id),
	]);
	const proposedNorm = new Set(proposed.map((p) => norm(p.placeName)));
	const available = places.filter((p) => !proposedNorm.has(norm(p.name)));
	return pickSuggestion(available, { cooldownDays: cfg.defaults.cooldownDays });
}

/**
 * Post a place as a bot suggestion: create the proposal, update rotation
 * timestamps + the suggestion counter, and refresh the board.
 */
export async function applyBotSuggestion(
	db: D1Database,
	cfg: Config,
	api: Api,
	chatId: number,
	session: Session,
	pick: Place,
): Promise<void> {
	const res = await proposePlace(db, chatId, session, {
		placeId: pick.id,
		name: pick.name,
		leave: cfg.defaults.defaultLeaveTime,
		proposerUserId: null,
		proposerName: "Makan Siang",
		isBot: true,
	});
	if (!res.created) return; // already proposed (e.g. race) — nothing to add
	await repo.markPlaceSuggested(db, pick.id, new Date().toISOString());
	await repo.incrementBotSuggestion(db, session.id);
	await refreshBoard(db, cfg, api, chatId, session.id);
}

/** Convenience: pick + apply in one call (used by the scheduler). */
export async function createBotSuggestion(
	db: D1Database,
	cfg: Config,
	api: Api,
	chatId: number,
	session: Session,
): Promise<string | null> {
	const pick = await pickBotSuggestion(db, cfg, chatId, session);
	if (!pick) return null;
	await applyBotSuggestion(db, cfg, api, chatId, session, pick);
	return pick.name;
}
