import { describe, expect, it } from "vitest";
import { pickSuggestion } from "#/domain/suggestion";
import type { Place } from "#/types";

const NOW = new Date("2025-08-12T05:00:00.000Z"); // 12:00 WIB

function place(over: Partial<Place> & Pick<Place, "id" | "name">): Place {
	return {
		chatId: 1,
		addedByUserId: null,
		addedByName: null,
		lastSuggestedAt: null,
		lastChosenAt: null,
		createdAt: "2025-01-01T00:00:00.000Z",
		...over,
	};
}

describe("pickSuggestion", () => {
	it("returns null when there are no places", () => {
		expect(pickSuggestion([], { cooldownDays: 2, now: NOW })).toBeNull();
	});

	it("returns the only place", () => {
		const p = place({ id: 1, name: "Padang" });
		expect(pickSuggestion([p], { cooldownDays: 2, now: NOW })?.id).toBe(1);
	});

	it("prefers the least-recently-chosen place (LRU)", () => {
		const old = place({ id: 1, name: "Lama", lastChosenAt: "2025-07-01T00:00:00.000Z" });
		const recent = place({ id: 2, name: "Baru", lastChosenAt: "2025-08-10T00:00:00.000Z" });
		expect(pickSuggestion([old, recent], { cooldownDays: 2, now: NOW })?.id).toBe(1);
	});

	it("treats lastSuggestedAt as a fallback when never chosen", () => {
		const neverChosen = place({
			id: 1,
			name: "A",
			lastSuggestedAt: "2025-08-01T00:00:00.000Z",
		});
		const suggestedRecently = place({
			id: 2,
			name: "B",
			lastSuggestedAt: "2025-08-11T00:00:00.000Z",
		});
		expect(
			pickSuggestion([neverChosen, suggestedRecently], { cooldownDays: 2, now: NOW })?.id,
		).toBe(1);
	});

	it("skips places chosen within the cooldown window", () => {
		const chosenYesterday = place({
			id: 1,
			name: "Panas",
			lastChosenAt: "2025-08-11T00:00:00.000Z", // 1 day ago, within 2-day cooldown
		});
		const old = place({ id: 2, name: "Dingin", lastChosenAt: "2025-07-01T00:00:00.000Z" });
		expect(pickSuggestion([chosenYesterday, old], { cooldownDays: 2, now: NOW })?.id).toBe(2);
	});

	it("falls back to all places (LRU) when everything is on cooldown", () => {
		const a = place({ id: 1, name: "A", lastChosenAt: "2025-08-11T00:00:00.000Z" });
		const b = place({ id: 2, name: "B", lastChosenAt: "2025-08-10T00:00:00.000Z" });
		// Both within 2-day cooldown; LRU over the full set should pick B (chosen earlier).
		expect(pickSuggestion([a, b], { cooldownDays: 2, now: NOW })?.id).toBe(2);
	});
});
