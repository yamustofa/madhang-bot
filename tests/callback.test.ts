import { describe, expect, it } from "vitest";
import { decodeCallback, encodeCallback } from "#/domain/callback";

describe("callback encode/decode roundtrip", () => {
	it.each([
		{ type: "flexible" as const },
		{ type: "surprise" as const },
		{ type: "propose" as const },
		{ type: "settle" as const },
	])("roundtrips $type", (action) => {
		expect(decodeCallback(encodeCallback(action))).toEqual(action);
	});

	it("roundtrips a join with a proposal id", () => {
		const action = { type: "join" as const, proposalId: 42 };
		expect(decodeCallback(encodeCallback(action))).toEqual(action);
	});

	it("roundtrips a pick (saved place) and a make (place + time idx)", () => {
		const pick = { type: "pick" as const, placeId: 7 };
		expect(decodeCallback(encodeCallback(pick))).toEqual(pick);
		const make = { type: "make" as const, placeId: 7, timeIdx: 3 };
		expect(decodeCallback(encodeCallback(make))).toEqual(make);
	});

	it("roundtrips cancel", () => {
		expect(decodeCallback(encodeCallback({ type: "cancel" }))).toEqual({ type: "cancel" });
	});

	it("keeps payloads well under the 64-byte limit", () => {
		const big = encodeCallback({ type: "join", proposalId: 999_999 });
		expect(big.length).toBeLessThan(64);
	});
});

describe("callback make decode edge cases", () => {
	it("rejects malformed make payloads", () => {
		expect(decodeCallback("mk:abc.0")).toBeNull(); // non-numeric placeId
		expect(decodeCallback("mk:0.0")).toBeNull(); // placeId must be > 0
		expect(decodeCallback("mk:7.x")).toBeNull(); // non-integer idx
		expect(decodeCallback("mk:7.-1")).toBeNull(); // negative idx
		expect(decodeCallback("mk:7")).toBeNull(); // no dot
	});
});

describe("callback decode edge cases", () => {
	it("rejects malformed join payloads", () => {
		expect(decodeCallback("j:abc")).toBeNull();
		expect(decodeCallback("j:0")).toBeNull(); // id must be > 0
		expect(decodeCallback("j:-3")).toBeNull();
		expect(decodeCallback("j:")).toBeNull();
	});

	it("rejects unknown prefixes", () => {
		expect(decodeCallback("zzz:1")).toBeNull();
		expect(decodeCallback("unknown")).toBeNull();
		expect(decodeCallback(undefined)).toBeNull();
		expect(decodeCallback(null)).toBeNull();
		expect(decodeCallback("")).toBeNull();
	});
});
