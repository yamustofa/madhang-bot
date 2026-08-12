import { describe, expect, it } from "vitest";
import {
	dateLocalString,
	formatHumanDate,
	isValidHHmm,
	minutesBetween,
	minutesSinceMidnight,
	normalizeHHmm,
	parseProposeArgs,
	shiftedNow,
	timeLocalString,
	WIB_OFFSET_MIN,
} from "#/domain/time";

describe("shiftedNow / date & time strings", () => {
	// 05:00 UTC == 12:00 WIB (UTC+7)
	const utc = new Date("2025-08-12T05:00:00.000Z");

	it("shifts by the offset so UTC fields read as WIB", () => {
		const wib = shiftedNow(utc, WIB_OFFSET_MIN);
		expect(wib.getUTCHours()).toBe(12);
		expect(wib.getUTCMinutes()).toBe(0);
	});

	it("formats dateLocal/timeLocal in WIB", () => {
		expect(dateLocalString(utc, WIB_OFFSET_MIN)).toBe("2025-08-12");
		expect(timeLocalString(utc, WIB_OFFSET_MIN)).toBe("12:00");
	});

	it("rolls the date across midnight WIB", () => {
		// 20:00 UTC == 03:00 next-day WIB
		const late = new Date("2025-08-12T20:00:00.000Z");
		expect(dateLocalString(late, WIB_OFFSET_MIN)).toBe("2025-08-13");
		expect(timeLocalString(late, WIB_OFFSET_MIN)).toBe("03:00");
	});
});

describe("minutesSinceMidnight / minutesBetween", () => {
	it("parses HH:mm into minutes", () => {
		expect(minutesSinceMidnight("00:00")).toBe(0);
		expect(minutesSinceMidnight("12:15")).toBe(735);
		expect(minutesSinceMidnight("23:59")).toBe(1439);
	});

	it("rejects invalid input with NaN", () => {
		expect(Number.isNaN(minutesSinceMidnight("25:00"))).toBe(true);
		expect(Number.isNaN(minutesSinceMidnight("12:60"))).toBe(true);
		expect(Number.isNaN(minutesSinceMidnight("noon"))).toBe(true);
	});

	it("isValidHHmm matches parseability", () => {
		expect(isValidHHmm("12:15")).toBe(true);
		expect(isValidHHmm("99:99")).toBe(false);
	});

	it("accepts the dot separator ('12.30') like a colon", () => {
		expect(minutesSinceMidnight("12.15")).toBe(735);
		expect(minutesSinceMidnight("12.30")).toBe(750);
		expect(isValidHHmm("12.30")).toBe(true);
	});

	it("computes signed difference within a day", () => {
		expect(minutesBetween("12:00", "12:15")).toBe(15);
		expect(minutesBetween("12:30", "12:00")).toBe(-30);
	});
});

describe("formatHumanDate", () => {
	it("formats an Indonesian weekday + date", () => {
		// 2025-08-12 is a Tuesday -> "Sel"
		expect(formatHumanDate("2025-08-12")).toBe("Sel, 12 Agu");
	});

	it("falls back to the raw string on garbage input", () => {
		expect(formatHumanDate("not-a-date")).toBe("not-a-date");
	});
});

describe("normalizeHHmm", () => {
	it("normalizes dot and colon to a canonical 'HH:mm'", () => {
		expect(normalizeHHmm("12.30")).toBe("12:30");
		expect(normalizeHHmm("12:30")).toBe("12:30");
		expect(normalizeHHmm("9.05")).toBe("09:05");
	});

	it("rejects invalid input", () => {
		expect(normalizeHHmm("25.00")).toBeNull();
		expect(normalizeHHmm("noon")).toBeNull();
		expect(normalizeHHmm("1230")).toBeNull(); // no separator
	});
});

describe("parseProposeArgs", () => {
	const def = "12:15";

	it("splits a name from a trailing time (colon or dot)", () => {
		expect(parseProposeArgs("Padang Bu Sari 12:30", def)).toEqual({
			name: "Padang Bu Sari",
			leave: "12:30",
		});
		// The exact regression from the field report: dot separator.
		expect(parseProposeArgs("Esdo 12.30", def)).toEqual({ name: "Esdo", leave: "12:30" });
	});

	it("falls back to the default time when there is no time token", () => {
		expect(parseProposeArgs("Warteg Pak Slamet", def)).toEqual({
			name: "Warteg Pak Slamet",
			leave: def,
		});
	});

	it("keeps a trailing bare number as part of the name", () => {
		expect(parseProposeArgs("Warteg 24", def)).toEqual({ name: "Warteg 24", leave: def });
	});

	it("returns an empty name for blank input", () => {
		expect(parseProposeArgs("   ", def)).toEqual({ name: "", leave: def });
	});
});
