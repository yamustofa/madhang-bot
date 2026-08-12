import type { Env, GroupSettings } from "#/types";

/** Resolved runtime configuration, derived from Worker env vars. */
export interface Config {
	samarataUrl: string;
	timezoneOffsetMin: number;
	defaults: GroupSettings;
}

function num(s: string | undefined, fallback: number): number {
	const v = Number(s);
	return Number.isFinite(v) ? v : fallback;
}

export function readConfig(env: Env): Config {
	return {
		samarataUrl: (env.SAMARATA_URL || "https://samarata.my.id").replace(/\/$/, ""),
		timezoneOffsetMin: num(env.TIMEZONE_OFFSET_MINUTES, 420),
		defaults: {
			nudgeDelayMin: num(env.DEFAULT_NUDGE_DELAY_MIN, 8),
			cooldownDays: num(env.DEFAULT_COOLDOWN_DAYS, 2),
			defaultLeaveTime: env.DEFAULT_LEAVE_TIME || "12:15",
			autoNudge: false,
		},
	};
}

/** Merge a group's stored settings over the env defaults. */
export function resolveGroupSettings(
	stored: Partial<GroupSettings> | null,
	cfg: Config,
): GroupSettings {
	return { ...cfg.defaults, ...(stored ?? {}) };
}
