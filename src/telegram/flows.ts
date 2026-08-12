/**
 * Builders for the propose flow's transient UI. The picker is a short-lived
 * message separate from the board: it lists the group's saved places, then —
 * once a place is chosen — the leave-time quick picks.
 */

import { encodeCallback } from "#/domain/callback";
import type { ButtonRow } from "#/domain/keyboard";
import { QUICK_LEAVE_TIMES } from "#/domain/time";
import type { Place } from "#/types";

export interface PickerView {
	text: string;
	buttons: ButtonRow[];
}

function trunc(s: string, max = 24): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function buildPlacePicker(places: Place[]): PickerView {
	if (places.length === 0) {
		return {
			text: "Belum ada tempat tersimpan.\n\nTambahin dengan:\n/usul <nama tempat> [jam]\nContoh: /usul Padang Bu Sari 12:15",
			buttons: [],
		};
	}

	const buttons: ButtonRow[] = places.map((p) => [
		{
			text: trunc(p.name),
			callbackData: encodeCallback({ type: "pick", placeId: p.id }),
		},
	]);

	return {
		text: "Pilih tempat favorit, terus pilih jam berangkat.",
		buttons,
	};
}

/** Time picker shown after a place is chosen. 3 quick-pick times per row + cancel. */
export function buildTimePicker(placeName: string, placeId: number): PickerView {
	const buttons: ButtonRow[] = [];
	for (let i = 0; i < QUICK_LEAVE_TIMES.length; i += 3) {
		const row: ButtonRow = [];
		for (let j = i; j < Math.min(i + 3, QUICK_LEAVE_TIMES.length); j++) {
			const t = QUICK_LEAVE_TIMES[j];
			if (t) {
				row.push({
					text: t,
					callbackData: encodeCallback({ type: "make", placeId, timeIdx: j }),
				});
			}
		}
		buttons.push(row);
	}
	buttons.push([{ text: "Batal", callbackData: encodeCallback({ type: "cancel" }) }]);
	return {
		text: `Jam berapa berangkat ke ${trunc(placeName, 40)}?\n(lainnya: /usul ${trunc(placeName, 24)} <jam>)`,
		buttons,
	};
}
