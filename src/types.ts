/**
 * Shared types for makan-siang.
 *
 * Domain entities use camelCase fields (mapped from snake_case DB rows in
 * `db/repository.ts`). Times follow two conventions:
 *   - `dateLocal` / `leaveAtLocal` are WIB (UTC+7) wall-clock strings
 *     ('YYYY-MM-DD' / 'HH:mm') so the board reads naturally to users.
 *   - `createdAt` / `lastSuggestedAt` / `lastChosenAt` are ISO8601 UTC and are
 *     used only for ordering (LRU rotation).
 */

/** Cloudflare Worker bindings. Secrets come from `wrangler secret put`. */
export interface Env {
	DB: D1Database;
	/** Telegram bot token from @BotFather. Secret. */
	BOT_TOKEN: string;
	/** Random string; Telegram must echo it as X-Telegram-Bot-Api-Secret-Token. Secret. */
	WEBHOOK_SECRET: string;
	// Non-secret config (from `vars` in wrangler.jsonc):
	SAMARATA_URL: string;
	DEFAULT_NUDGE_DELAY_MIN: string;
	DEFAULT_COOLDOWN_DAYS: string;
	DEFAULT_LEAVE_TIME: string;
	/** Office timezone offset in minutes from UTC (420 = UTC+7 / WIB). */
	TIMEZONE_OFFSET_MINUTES: string;
}

/** Per-group tunables, stored as JSON in `groups.settings`. */
export interface GroupSettings {
	nudgeDelayMin: number;
	cooldownDays: number;
	defaultLeaveTime: string; // 'HH:mm'
	autoNudge: boolean;
}

export interface Place {
	id: number;
	chatId: number;
	name: string;
	addedByUserId: number | null;
	addedByName: string | null;
	lastSuggestedAt: string | null;
	lastChosenAt: string | null;
	createdAt: string;
}

export interface Session {
	id: number;
	chatId: number;
	dateLocal: string;
	status: "open" | "closed";
	boardMessageId: number | null;
	openedByUserId: number | null;
	openedByName: string | null;
	botSuggestionCount: number;
	createdAt: string;
}

export interface Proposal {
	id: number;
	sessionId: number;
	placeId: number | null;
	placeName: string;
	proposerUserId: number | null;
	proposerName: string | null;
	leaveAtLocal: string | null;
	isBotSuggestion: boolean;
	leavePingSent: boolean;
	createdAt: string;
}

export interface JoinRow {
	proposalId: number;
	userId: number;
	userName: string;
	createdAt: string;
}

export interface FlexibleRow {
	sessionId: number;
	userId: number;
	userName: string;
	createdAt: string;
}

/** A proposal plus its joined users, ready for rendering. */
export interface ProposalView {
	proposal: Proposal;
	place?: Place;
	joiners: JoinRow[];
}

/** Everything `renderBoard` needs in one snapshot. */
export interface BoardSnapshot {
	session: Session;
	proposals: ProposalView[];
	flexible: FlexibleRow[];
}
