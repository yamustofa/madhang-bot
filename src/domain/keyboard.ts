/**
 * Builds the inline-keyboard layout as a plain serializable structure. The
 * Telegram layer (telegram/api.ts) converts these rows into a grammY
 * InlineKeyboard. Keeping this here (and free of grammY imports) means the
 * layout is pure and unit-testable.
 */

import { encodeCallback } from "#/domain/callback";
import type { BoardSnapshot } from "#/types";

export interface BoardButton {
	text: string;
	callbackData: string;
}
export type ButtonRow = BoardButton[];

/** Truncate to keep Telegram button text readable. */
function trunc(s: string, max = 28): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function buildBoardButtons(snapshot: BoardSnapshot): ButtonRow[] {
	const rows: ButtonRow[] = [];

	for (const view of snapshot.proposals) {
		const count = view.joiners.length;
		rows.push([
			{
				text: `📍 ${trunc(view.proposal.placeName)} · ${count}`,
				callbackData: encodeCallback({ type: "join", proposalId: view.proposal.id }),
			},
		]);
	}

	const flexCount = snapshot.flexible.length;
	rows.push([
		{
			text: `🤷 Terserah${flexCount > 0 ? ` (${flexCount})` : ""}`,
			callbackData: encodeCallback({ type: "flexible" }),
		},
		{
			text: "🎲 Tempat random",
			callbackData: encodeCallback({ type: "surprise" }),
		},
	]);

	rows.push([
		{ text: "➕ Usul tempat", callbackData: encodeCallback({ type: "propose" }) },
		{ text: "💸 Hitung pembayaran", callbackData: encodeCallback({ type: "settle" }) },
	]);

	return rows;
}
