/**
 * Typed D1 data access. Every function takes the `D1Database` binding and maps
 * snake_case rows to the camelCase domain types in `types.ts`. No business
 * logic lives here — just persistence — so the domain layer stays pure and
 * testable.
 */
import type {
	BoardSnapshot,
	FlexibleRow,
	GroupSettings,
	JoinRow,
	Place,
	Proposal,
	ProposalView,
	Session,
} from "#/types";

// ---- raw row shapes (match the SQL columns) -------------------------------

interface GroupRow {
	chat_id: number;
	title: string | null;
	settings: string;
	created_at: string;
}
interface PlaceRow {
	id: number;
	chat_id: number;
	name: string;
	added_by_user_id: number | null;
	added_by_name: string | null;
	last_suggested_at: string | null;
	last_chosen_at: string | null;
	created_at: string;
}
interface SessionRow {
	id: number;
	chat_id: number;
	date_local: string;
	status: string;
	board_message_id: number | null;
	opened_by_user_id: number | null;
	opened_by_name: string | null;
	bot_suggestion_count: number;
	created_at: string;
}
interface ProposalRow {
	id: number;
	session_id: number;
	place_id: number | null;
	place_name: string;
	proposer_user_id: number | null;
	proposer_name: string | null;
	leave_at_local: string | null;
	is_bot_suggestion: number;
	leave_ping_sent: number;
	created_at: string;
}
interface JoinRowDb {
	proposal_id: number;
	user_id: number;
	user_name: string | null;
	created_at: string;
}
interface FlexibleRowDb {
	session_id: number;
	user_id: number;
	user_name: string | null;
	created_at: string;
}

// ---- mappers ---------------------------------------------------------------

function mapPlace(r: PlaceRow): Place {
	return {
		id: r.id,
		chatId: r.chat_id,
		name: r.name,
		addedByUserId: r.added_by_user_id,
		addedByName: r.added_by_name,
		lastSuggestedAt: r.last_suggested_at,
		lastChosenAt: r.last_chosen_at,
		createdAt: r.created_at,
	};
}

function mapSession(r: SessionRow): Session {
	return {
		id: r.id,
		chatId: r.chat_id,
		dateLocal: r.date_local,
		status: r.status === "closed" ? "closed" : "open",
		boardMessageId: r.board_message_id,
		openedByUserId: r.opened_by_user_id,
		openedByName: r.opened_by_name,
		botSuggestionCount: r.bot_suggestion_count,
		createdAt: r.created_at,
	};
}

function mapProposal(r: ProposalRow): Proposal {
	return {
		id: r.id,
		sessionId: r.session_id,
		placeId: r.place_id,
		placeName: r.place_name,
		proposerUserId: r.proposer_user_id,
		proposerName: r.proposer_name,
		leaveAtLocal: r.leave_at_local,
		isBotSuggestion: r.is_bot_suggestion === 1,
		leavePingSent: r.leave_ping_sent === 1,
		createdAt: r.created_at,
	};
}

function mapJoin(r: JoinRowDb): JoinRow {
	return {
		proposalId: r.proposal_id,
		userId: r.user_id,
		userName: r.user_name ?? "seseorang",
		createdAt: r.created_at,
	};
}

function mapFlexible(r: FlexibleRowDb): FlexibleRow {
	return {
		sessionId: r.session_id,
		userId: r.user_id,
		userName: r.user_name ?? "seseorang",
		createdAt: r.created_at,
	};
}

// ---- groups & settings -----------------------------------------------------

export async function ensureGroup(
	db: D1Database,
	chatId: number,
	title: string | null,
	defaults: GroupSettings,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO groups (chat_id, title, settings) VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET title = excluded.title`,
		)
		.bind(chatId, title, JSON.stringify(defaults))
		.run();
}

export async function getGroupSettings(
	db: D1Database,
	chatId: number,
): Promise<Partial<GroupSettings> | null> {
	const row = await db
		.prepare("SELECT settings FROM groups WHERE chat_id = ?")
		.bind(chatId)
		.first<GroupRow>();
	if (!row) return null;
	try {
		return JSON.parse(row.settings) as Partial<GroupSettings>;
	} catch {
		return {};
	}
}

// ---- places ----------------------------------------------------------------

export async function listPlaces(db: D1Database, chatId: number): Promise<Place[]> {
	const res = await db
		.prepare("SELECT * FROM places WHERE chat_id = ? ORDER BY name ASC")
		.bind(chatId)
		.all<PlaceRow>();
	return (res.results ?? []).map(mapPlace);
}

export async function getPlaceById(db: D1Database, placeId: number): Promise<Place | null> {
	const row = await db.prepare("SELECT * FROM places WHERE id = ?").bind(placeId).first<PlaceRow>();
	return row ? mapPlace(row) : null;
}

/** Insert a place unless one with the same name already exists for the group. */
export async function addPlace(
	db: D1Database,
	chatId: number,
	name: string,
	userId: number | null,
	userName: string | null,
): Promise<Place> {
	await db
		.prepare(
			`INSERT INTO places (chat_id, name, added_by_user_id, added_by_name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id, name) DO NOTHING`,
		)
		.bind(chatId, name, userId, userName)
		.run();
	const row = await db
		.prepare("SELECT * FROM places WHERE chat_id = ? AND name = ?")
		.bind(chatId, name)
		.first<PlaceRow>();
	if (!row) throw new Error(`place not found after upsert: ${name}`);
	return mapPlace(row);
}

export async function markPlaceSuggested(
	db: D1Database,
	placeId: number,
	isoUtc: string,
): Promise<void> {
	await db
		.prepare("UPDATE places SET last_suggested_at = ? WHERE id = ?")
		.bind(isoUtc, placeId)
		.run();
}

export async function markPlaceChosen(
	db: D1Database,
	placeId: number,
	isoUtc: string,
): Promise<void> {
	await db.prepare("UPDATE places SET last_chosen_at = ? WHERE id = ?").bind(isoUtc, placeId).run();
}

/** Delete a place from a group's roster by name (case-insensitive, trimmed). */
export async function deletePlaceByName(
	db: D1Database,
	chatId: number,
	name: string,
): Promise<boolean> {
	const res = await db
		.prepare("DELETE FROM places WHERE chat_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))")
		.bind(chatId, name)
		.run();
	return (res.meta?.changes ?? 0) > 0;
}

// ---- sessions --------------------------------------------------------------

export async function getSession(db: D1Database, sessionId: number): Promise<Session | null> {
	const row = await db
		.prepare("SELECT * FROM sessions WHERE id = ?")
		.bind(sessionId)
		.first<SessionRow>();
	return row ? mapSession(row) : null;
}

export async function getOpenSession(db: D1Database, chatId: number): Promise<Session | null> {
	const row = await db
		.prepare(
			"SELECT * FROM sessions WHERE chat_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1",
		)
		.bind(chatId)
		.first<SessionRow>();
	return row ? mapSession(row) : null;
}

/**
 * Open today's session for a chat. Closes any other open session for that chat
 * first (one active session per group), and reopens today's row if it existed.
 */
export async function openSession(
	db: D1Database,
	chatId: number,
	dateLocal: string,
	userId: number | null,
	userName: string | null,
): Promise<Session> {
	await db
		.prepare("UPDATE sessions SET status = 'closed' WHERE chat_id = ? AND status = 'open'")
		.bind(chatId)
		.run();
	await db
		.prepare(
			`INSERT INTO sessions (chat_id, date_local, opened_by_user_id, opened_by_name, bot_suggestion_count)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(chat_id, date_local) DO UPDATE SET
         status = 'open',
         board_message_id = NULL,
         opened_by_user_id = excluded.opened_by_user_id,
         opened_by_name = excluded.opened_by_name`,
		)
		.bind(chatId, dateLocal, userId, userName)
		.run();
	const row = await db
		.prepare("SELECT * FROM sessions WHERE chat_id = ? AND date_local = ?")
		.bind(chatId, dateLocal)
		.first<SessionRow>();
	if (!row) throw new Error("session not found after open");
	return mapSession(row);
}

export async function setBoardMessage(
	db: D1Database,
	sessionId: number,
	messageId: number,
): Promise<void> {
	await db
		.prepare("UPDATE sessions SET board_message_id = ? WHERE id = ?")
		.bind(messageId, sessionId)
		.run();
}

export async function closeSession(db: D1Database, sessionId: number): Promise<void> {
	await db.prepare("UPDATE sessions SET status = 'closed' WHERE id = ?").bind(sessionId).run();
}

/** Bump the per-session bot-suggestion counter (used to cap at one suggestion/day). */
export async function incrementBotSuggestion(db: D1Database, sessionId: number): Promise<void> {
	await db
		.prepare("UPDATE sessions SET bot_suggestion_count = bot_suggestion_count + 1 WHERE id = ?")
		.bind(sessionId)
		.run();
}

/**
 * Wipe all proposals/joins/flexible for a session so it can be reused as a
 * fresh round on the same day (keeps the session row and its board message).
 */
export async function clearSession(db: D1Database, sessionId: number): Promise<void> {
	await db
		.prepare(
			"DELETE FROM joins WHERE proposal_id IN (SELECT id FROM proposals WHERE session_id = ?)",
		)
		.bind(sessionId)
		.run();
	await db.prepare("DELETE FROM proposals WHERE session_id = ?").bind(sessionId).run();
	await db.prepare("DELETE FROM flexible WHERE session_id = ?").bind(sessionId).run();
	await db
		.prepare("UPDATE sessions SET bot_suggestion_count = 0 WHERE id = ?")
		.bind(sessionId)
		.run();
}

/** All currently-open sessions (used by the every-minute scheduler). */
export async function listOpenSessions(db: D1Database): Promise<Session[]> {
	const res = await db
		.prepare("SELECT * FROM sessions WHERE status = 'open' ORDER BY id ASC")
		.all<SessionRow>();
	return (res.results ?? []).map(mapSession);
}

// ---- proposals -------------------------------------------------------------

export async function addProposal(
	db: D1Database,
	sessionId: number,
	input: {
		placeId: number | null;
		placeName: string;
		proposerUserId: number | null;
		proposerName: string | null;
		leaveAtLocal: string | null;
		isBotSuggestion: boolean;
	},
): Promise<Proposal> {
	const res = await db
		.prepare(
			`INSERT INTO proposals
        (session_id, place_id, place_name, proposer_user_id, proposer_name, leave_at_local, is_bot_suggestion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			sessionId,
			input.placeId,
			input.placeName,
			input.proposerUserId,
			input.proposerName,
			input.leaveAtLocal,
			input.isBotSuggestion ? 1 : 0,
		)
		.run();
	const id = res.meta?.last_row_id;
	if (typeof id !== "number") throw new Error("could not read last_row_id after insert");
	const row = await db
		.prepare("SELECT * FROM proposals WHERE id = ?")
		.bind(id)
		.first<ProposalRow>();
	if (!row) throw new Error("proposal not found after insert");
	return mapProposal(row);
}

export async function getProposal(db: D1Database, proposalId: number): Promise<Proposal | null> {
	const row = await db
		.prepare("SELECT * FROM proposals WHERE id = ?")
		.bind(proposalId)
		.first<ProposalRow>();
	return row ? mapProposal(row) : null;
}

export async function listProposalsForSession(
	db: D1Database,
	sessionId: number,
): Promise<Proposal[]> {
	const res = await db
		.prepare("SELECT * FROM proposals WHERE session_id = ? ORDER BY id ASC")
		.bind(sessionId)
		.all<ProposalRow>();
	return (res.results ?? []).map(mapProposal);
}

export async function setLeavePingSent(db: D1Database, proposalId: number): Promise<void> {
	await db.prepare("UPDATE proposals SET leave_ping_sent = 1 WHERE id = ?").bind(proposalId).run();
}

/**
 * Update the leave time of a proposal in a session, matched by place name
 * (case-insensitive, trimmed). Returns false if no matching proposal was found.
 */
export async function setProposalLeaveTimeByName(
	db: D1Database,
	sessionId: number,
	name: string,
	leave: string,
): Promise<boolean> {
	const row = await db
		.prepare(
			"SELECT id FROM proposals WHERE session_id = ? AND LOWER(TRIM(place_name)) = LOWER(TRIM(?)) LIMIT 1",
		)
		.bind(sessionId, name)
		.first<{ id: number }>();
	if (!row) return false;
	await db
		.prepare("UPDATE proposals SET leave_at_local = ? WHERE id = ?")
		.bind(leave, row.id)
		.run();
	return true;
}

/**
 * Remove a proposal (and its joins) from a session by place name. Used to
 * cancel a board entry. Returns false if no matching proposal was found.
 */
export async function deleteProposalByName(
	db: D1Database,
	sessionId: number,
	name: string,
): Promise<boolean> {
	const row = await db
		.prepare(
			"SELECT id FROM proposals WHERE session_id = ? AND LOWER(TRIM(place_name)) = LOWER(TRIM(?)) LIMIT 1",
		)
		.bind(sessionId, name)
		.first<{ id: number }>();
	if (!row) return false;
	await db.prepare("DELETE FROM joins WHERE proposal_id = ?").bind(row.id).run();
	await db.prepare("DELETE FROM proposals WHERE id = ?").bind(row.id).run();
	return true;
}

// ---- joins -----------------------------------------------------------------

export async function listJoiners(db: D1Database, proposalId: number): Promise<JoinRow[]> {
	const res = await db
		.prepare("SELECT * FROM joins WHERE proposal_id = ? ORDER BY created_at ASC")
		.bind(proposalId)
		.all<JoinRowDb>();
	return (res.results ?? []).map(mapJoin);
}

export async function countJoins(db: D1Database, proposalId: number): Promise<number> {
	const row = await db
		.prepare("SELECT COUNT(*) AS n FROM joins WHERE proposal_id = ?")
		.bind(proposalId)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

/** Toggle a user's membership in a proposal. Returns joined state and whether this was the first joiner. */
export async function toggleJoin(
	db: D1Database,
	proposalId: number,
	userId: number,
	userName: string | null,
): Promise<{ joined: boolean; isFirst: boolean }> {
	const del = await db
		.prepare("DELETE FROM joins WHERE proposal_id = ? AND user_id = ?")
		.bind(proposalId, userId)
		.run();
	if ((del.meta?.changes ?? 0) > 0) return { joined: false, isFirst: false };
	const isFirst = (await countJoins(db, proposalId)) === 0;
	await db
		.prepare("INSERT INTO joins (proposal_id, user_id, user_name) VALUES (?, ?, ?)")
		.bind(proposalId, userId, userName)
		.run();
	return { joined: true, isFirst };
}

// ---- flexible --------------------------------------------------------------

export async function listFlexible(db: D1Database, sessionId: number): Promise<FlexibleRow[]> {
	const res = await db
		.prepare("SELECT * FROM flexible WHERE session_id = ? ORDER BY created_at ASC")
		.bind(sessionId)
		.all<FlexibleRowDb>();
	return (res.results ?? []).map(mapFlexible);
}

export async function toggleFlexible(
	db: D1Database,
	sessionId: number,
	userId: number,
	userName: string | null,
): Promise<boolean> {
	const del = await db
		.prepare("DELETE FROM flexible WHERE session_id = ? AND user_id = ?")
		.bind(sessionId, userId)
		.run();
	if ((del.meta?.changes ?? 0) > 0) return false;
	await db
		.prepare("INSERT INTO flexible (session_id, user_id, user_name) VALUES (?, ?, ?)")
		.bind(sessionId, userId, userName)
		.run();
	return true;
}

// ---- composite board snapshot ---------------------------------------------

export async function getBoardSnapshot(
	db: D1Database,
	sessionId: number,
): Promise<BoardSnapshot | null> {
	const session = await getSession(db, sessionId);
	if (!session) return null;
	const proposals = await listProposalsForSession(db, sessionId);
	const views: ProposalView[] = [];
	for (const proposal of proposals) {
		const joiners = await listJoiners(db, proposal.id);
		const place = proposal.placeId
			? ((await getPlaceById(db, proposal.placeId)) ?? undefined)
			: undefined;
		views.push({ proposal, joiners, place });
	}
	const flexible = await listFlexible(db, sessionId);
	return { session, proposals: views, flexible };
}
