/**
 * Renders the board message text from a snapshot, and composes the full
 * { text, buttons } payload that the Telegram layer sends with editMessageText.
 *
 * Pure: no network, no D1. This is the single source of truth for how the board
 * reads, so it's the most important thing to unit-test.
 *
 * The text is rendered in Telegram HTML mode so we can use <b> for hierarchy
 * and an inline link in the footer; all dynamic content (place names, joiner
 * names, the date) is HTML-escaped.
 */

import { type ButtonRow, buildBoardButtons } from "#/domain/keyboard";
import { formatHumanDate } from "#/domain/time";
import type { BoardSnapshot, ProposalView } from "#/types";

export interface RenderedBoard {
	text: string;
	buttons: ButtonRow[];
}

export interface BoardRenderOptions {
	samarataUrl: string;
}

/** Escape the few characters that are special in Telegram HTML mode. */
export function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Thin separator row used to frame the proposals block. */
const SEP = "➖".repeat(8);

function joinerNames(view: ProposalView, maxNames = 8): string {
	const names = view.joiners.map((j) => escapeHtml(j.userName || "seseorang"));
	const head = names.slice(0, maxNames).join(", ");
	if (names.length > maxNames) return `${head}, +${names.length - maxNames}`;
	return head;
}

function renderProposal(view: ProposalView): string {
	const p = view.proposal;
	const parts = [`📍 <b>${escapeHtml(p.placeName)}</b>`];
	if (p.leaveAtLocal) parts.push(p.leaveAtLocal);
	if (p.isBotSuggestion) parts.push("🤖");
	const count = view.joiners.length;
	const joiners = count > 0 ? `👥 ${count}: ${joinerNames(view)}` : "👥 0 — jadi yang pertama!";
	return `${parts.join("  ·  ")}\n${joiners}`;
}

/** Count distinct people participating (joiners ∪ flexible). */
function countPeople(snapshot: BoardSnapshot): number {
	const ids = new Set<number>();
	for (const v of snapshot.proposals) {
		for (const j of v.joiners) ids.add(j.userId);
	}
	for (const f of snapshot.flexible) ids.add(f.userId);
	return ids.size;
}

export function renderBoardText(snapshot: BoardSnapshot, opts: BoardRenderOptions): string {
	const date = formatHumanDate(snapshot.session.dateLocal);
	const places = snapshot.proposals.length;
	const people = countPeople(snapshot);

	const lines: string[] = [`🍽️ <b>Makan Siang — ${escapeHtml(date)}</b>`];
	lines.push(places > 0 ? `👥 ${people} orang ikut · ${places} tempat` : "👥 belum ada yang ikut");
	lines.push("");

	if (places === 0) {
		lines.push(
			SEP,
			"Belum ada usul.",
			"Ketuk ➕ Usul tempat, atau 🎲 Tempat random biar bot usulin.",
			SEP,
		);
	} else {
		lines.push(SEP);
		for (let i = 0; i < snapshot.proposals.length; i++) {
			lines.push(renderProposal(snapshot.proposals[i] as ProposalView));
			if (i < snapshot.proposals.length - 1) lines.push(""); // blank line between proposals
		}
		lines.push(SEP);
	}

	if (snapshot.flexible.length > 0) {
		const names = snapshot.flexible.map((f) => escapeHtml(f.userName || "seseorang")).join(", ");
		lines.push("", `🤷 <b>Terserah (${snapshot.flexible.length}):</b> ${names}`);
	}

	lines.push(
		"",
		`· Selesai makan? 💸 <b>Hitung pembayaran</b> di <a href="${opts.samarataUrl}">samarata</a>.`,
		"· Butuh bantuan? ketik /bantuan",
	);
	return lines.join("\n");
}

export function renderBoard(snapshot: BoardSnapshot, opts: BoardRenderOptions): RenderedBoard {
	return {
		text: renderBoardText(snapshot, opts),
		buttons: buildBoardButtons(snapshot),
	};
}
