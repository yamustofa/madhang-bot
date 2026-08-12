/**
 * Telegram inline-keyboard `callback_data` is capped at 64 bytes. We keep
 * payloads tiny and self-describing with a short prefix.
 *
 * Shapes:
 *   "j:<proposalId>"     — join/leave a proposal (toggle)
 *   "f"                  — join the flexible pool (toggle)
 *   "s"                  — surprise me (one bot suggestion)
 *   "p"                  — propose a place (open the propose flow)
 *   "x"                  — settle (link to samarata)
 *   "pick:<placeId>"     — picked a saved place → show the time picker
 *   "mk:<placeId>.<idx>" — create a proposal for a place at a quick-pick time
 *   "cn"                 — cancel (dismiss the picker)
 */

export type CallbackAction =
	| { type: "join"; proposalId: number }
	| { type: "flexible" }
	| { type: "surprise" }
	| { type: "propose" }
	| { type: "settle" }
	| { type: "pick"; placeId: number }
	| { type: "make"; placeId: number; timeIdx: number }
	| { type: "cancel" };

const PREFIX = {
	join: "j",
	flexible: "f",
	surprise: "s",
	propose: "p",
	settle: "x",
	pick: "pick",
	make: "mk",
	cancel: "cn",
} as const;

export function encodeCallback(action: CallbackAction): string {
	switch (action.type) {
		case "join":
			return `${PREFIX.join}:${action.proposalId}`;
		case "flexible":
			return PREFIX.flexible;
		case "surprise":
			return PREFIX.surprise;
		case "propose":
			return PREFIX.propose;
		case "settle":
			return PREFIX.settle;
		case "pick":
			return `${PREFIX.pick}:${action.placeId}`;
		case "make":
			return `${PREFIX.make}:${action.placeId}.${action.timeIdx}`;
		case "cancel":
			return PREFIX.cancel;
	}
}

export function decodeCallback(data: string | undefined | null): CallbackAction | null {
	if (!data) return null;
	// No-colon actions.
	if (data === PREFIX.flexible) return { type: "flexible" };
	if (data === PREFIX.surprise) return { type: "surprise" };
	if (data === PREFIX.propose) return { type: "propose" };
	if (data === PREFIX.settle) return { type: "settle" };
	if (data === PREFIX.cancel) return { type: "cancel" };

	// Parameterised "prefix:...".
	const sep = data.indexOf(":");
	if (sep < 0) return null;
	const prefix = data.slice(0, sep);
	const rest = data.slice(sep + 1);

	if (prefix === PREFIX.join) {
		const id = Number(rest);
		if (!Number.isFinite(id) || id <= 0) return null;
		return { type: "join", proposalId: id };
	}
	if (prefix === PREFIX.pick) {
		const id = Number(rest);
		if (!Number.isFinite(id) || id <= 0) return null;
		return { type: "pick", placeId: id };
	}
	if (prefix === PREFIX.make) {
		const dot = rest.indexOf(".");
		if (dot < 0) return null;
		const placeId = Number(rest.slice(0, dot));
		const timeIdx = Number(rest.slice(dot + 1));
		if (!Number.isFinite(placeId) || placeId <= 0) return null;
		if (!Number.isInteger(timeIdx) || timeIdx < 0) return null;
		return { type: "make", placeId, timeIdx };
	}
	return null;
}
