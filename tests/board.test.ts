import { describe, expect, it } from "vitest";
import { renderBoard, renderBoardText } from "#/domain/board";
import { decodeCallback } from "#/domain/callback";
import type { BoardSnapshot } from "#/types";

const OPTS = { samarataUrl: "https://samarata.my.id" };

function snapshot(over: Partial<BoardSnapshot> = {}): BoardSnapshot {
	return {
		session: {
			id: 1,
			chatId: 100,
			dateLocal: "2025-08-12",
			status: "open",
			boardMessageId: null,
			openedByUserId: 1,
			openedByName: "Andi",
			botSuggestionCount: 0,
			createdAt: "2025-08-12T04:00:00.000Z",
		},
		proposals: [],
		flexible: [],
		...over,
	};
}

describe("renderBoardText", () => {
	it("shows the headline with the formatted date", () => {
		const text = renderBoardText(snapshot(), OPTS);
		expect(text).toContain("Makan Siang — Sel, 12 Agu");
	});

	it("shows the empty-state hint with the new wording", () => {
		const text = renderBoardText(snapshot(), OPTS);
		expect(text).toContain("Belum ada usul.");
		expect(text).toContain("🎲 Tempat random");
	});

	it("renders the footer with a samarata link and the help hint", () => {
		const text = renderBoardText(snapshot(), OPTS);
		expect(text).toContain("Hitung pembayaran");
		expect(text).toContain("samarata</a>");
		expect(text).toContain("Butuh bantuan? ketik /bantuan");
	});

	it("renders proposals with leave time, joiners, and count", () => {
		const text = renderBoardText(
			snapshot({
				proposals: [
					{
						proposal: {
							id: 7,
							sessionId: 1,
							placeId: 3,
							placeName: "Padang Bu Sari",
							proposerUserId: 1,
							proposerName: "Andi",
							leaveAtLocal: "12:15",
							isBotSuggestion: false,
							leavePingSent: false,
							createdAt: "2025-08-12T04:05:00.000Z",
						},
						joiners: [
							{
								proposalId: 7,
								userId: 1,
								userName: "Andi",
								createdAt: "2025-08-12T04:05:30.000Z",
							},
							{
								proposalId: 7,
								userId: 2,
								userName: "Sari",
								createdAt: "2025-08-12T04:06:00.000Z",
							},
						],
					},
				],
			}),
			OPTS,
		);
		expect(text).toContain("Padang Bu Sari");
		expect(text).toContain("12:15"); // leave time, no clock icon
		expect(text).toContain("👥 2: Andi, Sari");
	});

	it("tags bot suggestions and shows an empty proposal invitingly", () => {
		const text = renderBoardText(
			snapshot({
				proposals: [
					{
						proposal: {
							id: 8,
							sessionId: 1,
							placeId: null,
							placeName: "Warteg",
							proposerUserId: null,
							proposerName: null,
							leaveAtLocal: "12:30",
							isBotSuggestion: true,
							leavePingSent: false,
							createdAt: "2025-08-12T04:07:00.000Z",
						},
						joiners: [],
					},
				],
			}),
			OPTS,
		);
		expect(text).toContain("🤖");
		expect(text).toContain("jadi yang pertama!");
	});

	it("lists the flexible pool with the new label", () => {
		const text = renderBoardText(
			snapshot({
				flexible: [
					{ sessionId: 1, userId: 9, userName: "Fajar", createdAt: "2025-08-12T04:08:00.000Z" },
				],
			}),
			OPTS,
		);
		expect(text).toContain("Terserah (1)");
		expect(text).toContain("Fajar");
	});

	it("shows a participants/places summary when there are proposals", () => {
		const text = renderBoardText(
			snapshot({
				proposals: [
					{
						proposal: {
							id: 7,
							sessionId: 1,
							placeId: 3,
							placeName: "Padang",
							proposerUserId: 1,
							proposerName: "Andi",
							leaveAtLocal: "12:15",
							isBotSuggestion: false,
							leavePingSent: false,
							createdAt: "2025-08-12T04:05:00.000Z",
						},
						joiners: [
							{ proposalId: 7, userId: 1, userName: "Andi", createdAt: "2025-08-12T04:05:30.000Z" },
						],
					},
				],
			}),
			OPTS,
		);
		expect(text).toContain("orang ikut");
		expect(text).toContain("1 tempat");
	});

	it("escapes HTML-special characters in place and joiner names", () => {
		const text = renderBoardText(
			snapshot({
				proposals: [
					{
						proposal: {
							id: 9,
							sessionId: 1,
							placeId: null,
							placeName: "Ayam & Geprek <Rumahan>",
							proposerUserId: 1,
							proposerName: "Andi",
							leaveAtLocal: "12:15",
							isBotSuggestion: false,
							leavePingSent: false,
							createdAt: "2025-08-12T04:05:00.000Z",
						},
						joiners: [
							{
								proposalId: 9,
								userId: 1,
								userName: "Budi<Cool>",
								createdAt: "2025-08-12T04:06:00.000Z",
							},
						],
					},
				],
			}),
			OPTS,
		);
		expect(text).toContain("<b>Ayam &amp; Geprek &lt;Rumahan&gt;</b>");
		expect(text).toContain("Budi&lt;Cool&gt;");
		expect(text).not.toContain("Ayam & Geprek");
		expect(text).not.toContain("Budi<Cool>");
	});
});

describe("renderBoard buttons", () => {
	it("emits a join button per proposal plus the renamed control buttons", () => {
		const { buttons } = renderBoard(
			snapshot({
				proposals: [
					{
						proposal: {
							id: 7,
							sessionId: 1,
							placeId: 3,
							placeName: "Padang Bu Sari",
							proposerUserId: 1,
							proposerName: "Andi",
							leaveAtLocal: "12:15",
							isBotSuggestion: false,
							leavePingSent: false,
							createdAt: "2025-08-12T04:05:00.000Z",
						},
						joiners: [],
					},
				],
			}),
			OPTS,
		);
		const flat = buttons.flat();
		const joinBtn = flat.find((b) => b.text.startsWith("📍 Padang"));
		expect(joinBtn).toBeTruthy();
		expect(decodeCallback(joinBtn?.callbackData)).toEqual({ type: "join", proposalId: 7 });
		expect(flat.some((b) => b.text.includes("Terserah"))).toBe(true);
		expect(flat.some((b) => b.text.includes("Tempat random"))).toBe(true);
		expect(flat.some((b) => b.text.includes("Hitung pembayaran"))).toBe(true);
	});
});
