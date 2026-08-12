/**
 * The "smart fallback" picker. Given a group's places, returns the one to
 * suggest next, using least-recently-used rotation with a cooldown so we never
 * re-suggest a place that was chosen in the last `cooldownDays` days.
 *
 * If every place is on cooldown, we fall back to the full list (still LRU) —
 * offering something beats offering nothing. Returns null only when there are
 * no places at all.
 */
import type { Place } from "#/types";

export interface SuggestionOptions {
	cooldownDays: number;
	/** Inject for tests. Defaults to the real clock. */
	now?: Date;
}

const EPOCH_MS = 0; // treats "never suggested/chosen" as the oldest possible.

function rankMs(p: Place): number {
	const chosen = p.lastChosenAt ? Date.parse(p.lastChosenAt) : Number.NaN;
	const suggested = p.lastSuggestedAt ? Date.parse(p.lastSuggestedAt) : Number.NaN;
	const newest = Number.isFinite(chosen) ? chosen : suggested;
	return Number.isFinite(newest) ? (newest as number) : EPOCH_MS;
}

export function pickSuggestion(places: Place[], opts: SuggestionOptions): Place | null {
	if (places.length === 0) return null;
	const nowMs = (opts.now ?? new Date()).getTime();
	const cooldownMs = opts.cooldownDays * 86_400_000;

	const eligible = places.filter((p) => {
		const chosen = p.lastChosenAt ? Date.parse(p.lastChosenAt) : EPOCH_MS;
		return chosen <= nowMs - cooldownMs;
	});
	const pool = eligible.length > 0 ? eligible : places;

	let best: Place | null = null;
	let bestRank = Number.POSITIVE_INFINITY;
	for (const p of pool) {
		const r = rankMs(p);
		if (r < bestRank) {
			bestRank = r;
			best = p;
		}
	}
	return best;
}
