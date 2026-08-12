/**
 * grammY bot: commands and callback_query handlers. The bot is constructed
 * lazily (see getBot) because the token is a secret only available inside the
 * Worker's request handler, not at module load.
 *
 * Board mutations go through `service.ts`, which both the webhook handlers and
 * the every-minute scheduler share — so the bot and the cron drive the board
 * through the exact same code path.
 */
import { Bot } from "grammy";
import type { Config } from "#/config";
import * as repo from "#/db/repository";
import { decodeCallback } from "#/domain/callback";
import { dateLocalString, parseProposeArgs, QUICK_LEAVE_TIMES } from "#/domain/time";
import { applyBotSuggestion, pickBotSuggestion, proposePlace, refreshBoard } from "#/service";
import * as tg from "#/telegram/api";
import { buildPlacePicker, buildTimePicker } from "#/telegram/flows";
import type { Env } from "#/types";

function isGroupChat(type: string | undefined): boolean {
	return type === "group" || type === "supergroup";
}

function matchText(match: unknown): string {
	if (typeof match === "string") return match;
	if (Array.isArray(match) && typeof match[0] === "string") return match[0];
	return "";
}

function createBot(env: Env, cfg: Config): Bot {
	const db = env.DB;
	const bot = new Bot(env.BOT_TOKEN);

	const refresh = (chatId: number, sessionId: number) =>
		refreshBoard(db, cfg, bot.api, chatId, sessionId);

	// --- open the day's session + post the board ---
	bot.command(["makan", "lunch", "mulai"], async (ctx) => {
		const chat = ctx.chat;
		if (!isGroupChat(chat?.type)) {
			await ctx.reply("Tambahin aku ke grup kantor, lalu ketik /makan di grup ya.");
			return;
		}
		const chatId = chat.id;
		await repo.ensureGroup(db, chatId, chat.title ?? null, cfg.defaults);
		const today = dateLocalString(new Date(), cfg.timezoneOffsetMin);
		const session = await repo.openSession(
			db,
			chatId,
			today,
			ctx.from?.id ?? null,
			ctx.from?.first_name ?? null,
		);
		await refresh(chatId, session.id);
	});

	bot.command("start", async (ctx) => {
		if (!isGroupChat(ctx.chat?.type)) {
			await ctx.reply(
				"Hai! Aku bantu putusin makan siang bareng tim. " +
					"Tambahin aku ke grup kantor, jadikan admin, lalu ketik /makan.",
			);
			return;
		}
		const chatId = ctx.chat.id;
		await repo.ensureGroup(db, chatId, ctx.chat.title ?? null, cfg.defaults);
		const today = dateLocalString(new Date(), cfg.timezoneOffsetMin);
		const session = await repo.openSession(
			db,
			chatId,
			today,
			ctx.from?.id ?? null,
			ctx.from?.first_name ?? null,
		);
		await refresh(chatId, session.id);
	});

	// --- propose a place (power-user): /usul <name> [HH:mm] ---
	bot.command(["usul", "ajuk"], async (ctx) => {
		const chatId = ctx.chat?.id;
		if (!chatId) return;
		const parsed = parseProposeArgs(matchText(ctx.match), cfg.defaults.defaultLeaveTime);
		if (!parsed.name) {
			await ctx.reply("Pakai: /usul <nama tempat> [jam]\nContoh: /usul Padang Bu Sari 12:15");
			return;
		}
		const session = await repo.getOpenSession(db, chatId);
		if (!session) {
			await ctx.reply("Belum ada sesi hari ini. Ketik /makan dulu.");
			return;
		}
		const res = await proposePlace(db, chatId, session, {
			placeId: null,
			name: parsed.name,
			leave: parsed.leave,
			proposerUserId: ctx.from?.id ?? null,
			proposerName: ctx.from?.first_name ?? null,
		});
		if (res.duplicate) {
			await ctx.reply(`⛔ "${parsed.name}" udah ada di papan.`);
			return;
		}
		if (!res.created) {
			await ctx.reply("Gagal nambah usul, coba lagi ya.");
			return;
		}
		await ctx.reply(`✅ Diusulin: ${parsed.name} · berangkat ${parsed.leave}`);
		await refresh(chatId, session.id);
	});

	// --- add a place to the roster without proposing ---
	bot.command(["tambah", "add"], async (ctx) => {
		const chatId = ctx.chat?.id;
		if (!chatId) return;
		const name = matchText(ctx.match).trim();
		if (!name) {
			await ctx.reply("Pakai: /tambah <nama tempat>");
			return;
		}
		await repo.ensureGroup(db, chatId, ctx.chat?.title ?? null, cfg.defaults);
		await repo.addPlace(db, chatId, name, ctx.from?.id ?? null, ctx.from?.first_name ?? null);
		await ctx.reply(`📝 "${name}" ditambahin ke daftar tempat.`);
	});

	// --- start a fresh round on the same day (clears the current session) ---
	bot.command(["ulang", "baru", "reset"], async (ctx) => {
		const chatId = ctx.chat?.id;
		if (!chatId) return;
		const session = await repo.getOpenSession(db, chatId);
		if (!session) {
			await ctx.reply("Belum ada sesi aktif. Ketik /makan dulu.");
			return;
		}
		await repo.clearSession(db, session.id);
		await refresh(chatId, session.id);
		await ctx.reply("🔄 Papan dikosongin — silakan mulai round baru.");
	});

	// --- change a proposal's leave time: /jam <nama> <jam> ---
	bot.command(["jam", "waktu"], async (ctx) => {
		const chatId = ctx.chat?.id;
		if (!chatId) return;
		const parsed = parseProposeArgs(matchText(ctx.match), "");
		if (!parsed.name || !parsed.leave) {
			await ctx.reply("Pakai: /jam <nama tempat> <jam>\nContoh: /jam Padang 12:30");
			return;
		}
		const session = await repo.getOpenSession(db, chatId);
		if (!session) {
			await ctx.reply("Belum ada sesi. Ketik /makan dulu.");
			return;
		}
		const ok = await repo.setProposalLeaveTimeByName(db, session.id, parsed.name, parsed.leave);
		if (!ok) {
			await ctx.reply(`Nggak ketemu usul "${parsed.name}" di papan hari ini.`);
			return;
		}
		await ctx.reply(`✅ ${parsed.name} berangkat ${parsed.leave}`);
		await refresh(chatId, session.id);
	});

	// --- list saved places ---
	bot.command(["tempat", "daftar", "list"], async (ctx) => {
		const chatId = ctx.chat?.id;
		if (!chatId) return;
		await repo.ensureGroup(db, chatId, ctx.chat?.title ?? null, cfg.defaults);
		const places = await repo.listPlaces(db, chatId);
		if (places.length === 0) {
			await ctx.reply("Belum ada tempat tersimpan. Tambahin: /tambah <nama>");
			return;
		}
		const list = places.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
		await ctx.reply(
			`📍 Daftar tempat (${places.length}):\n${list}\n\nHapus salah satu: /hapus <nama>`,
		);
	});

	// --- delete a saved place: /hapus <nama> ---
	bot.command(["hapus", "del", "remove"], async (ctx) => {
		const chatId = ctx.chat?.id;
		if (!chatId) return;
		const name = matchText(ctx.match).trim();
		if (!name) {
			await ctx.reply("Pakai: /hapus <nama tempat>");
			return;
		}
		const ok = await repo.deletePlaceByName(db, chatId, name);
		await ctx.reply(
			ok ? `🗑️ "${name}" dihapus dari daftar tempat.` : `"${name}" nggak ada di daftar.`,
		);
	});

	// --- cancel a proposal from today's board: /batal <nama> ---
	bot.command(["batal", "cancel"], async (ctx) => {
		const chatId = ctx.chat?.id;
		if (!chatId) return;
		const name = matchText(ctx.match).trim();
		if (!name) {
			await ctx.reply("Pakai: /batal <nama tempat di papan>");
			return;
		}
		const session = await repo.getOpenSession(db, chatId);
		if (!session) {
			await ctx.reply("Belum ada sesi. Ketik /makan dulu.");
			return;
		}
		const ok = await repo.deleteProposalByName(db, session.id, name);
		if (!ok) {
			await ctx.reply(`Nggak ketemu usul "${name}" di papan.`);
			return;
		}
		await ctx.reply(`🗑️ Usul "${name}" dibatalin dari papan.`);
		await refresh(chatId, session.id);
	});

	bot.command(["bantuan", "help"], async (ctx) => {
		await ctx.reply(
			[
				"🍽️ Makan Siang",
				"",
				"▸ Sesi",
				"  /makan — buka / segarkan papan hari ini",
				"  /ulang — kosongkan papan, mulai round baru",
				"",
				"▸ Usul di papan",
				"  /usul <nama> [jam] — usul tempat (atau ketuk ➕ di papan, lalu pilih jam)",
				"  /jam <nama> <jam> — ubah jam berangkat",
				"  /batal <nama> — hapus usul dari papan",
				"",
				"▸ Tempat favorit (tersimpan)",
				"  /tambah <nama> — simpan tempat",
				"  /tempat — lihat daftar",
				"  /hapus <nama> — hapus dari daftar",
				"",
				"Di papan: ketuk 📍 ikut • 🤷 Terserah • 🎲 Tempat random • 💸 Hitung pembayaran",
			].join("\n"),
		);
	});

	// --- inline button callbacks ---
	bot.on("callback_query:data", async (ctx) => {
		const action = decodeCallback(ctx.callbackQuery.data);
		const chatId = ctx.chat?.id;
		const user = ctx.from;
		if (!chatId || !user) {
			await ctx.answerCallbackQuery();
			return;
		}
		if (!action) {
			await ctx.answerCallbackQuery({ text: "Tombol ini sudah tidak berlaku." });
			return;
		}

		switch (action.type) {
			case "join": {
				const session = await repo.getOpenSession(db, chatId);
				if (!session) {
					await ctx.answerCallbackQuery({ text: "Belum ada sesi. Ketik /makan dulu." });
					return;
				}
				const proposal = await repo.getProposal(db, action.proposalId);
				if (!proposal || proposal.sessionId !== session.id) {
					await ctx.answerCallbackQuery({ text: "Usul ini sudah tidak berlaku." });
					return;
				}
				const res = await repo.toggleJoin(db, proposal.id, user.id, user.first_name);
				if (res.joined && res.isFirst && proposal.placeId) {
					await repo.markPlaceChosen(db, proposal.placeId, new Date().toISOString());
				}
				await ctx.answerCallbackQuery({
					text: res.joined ? `Ikut ${proposal.placeName}!` : `Batal ikut ${proposal.placeName}.`,
				});
				await refresh(chatId, session.id);
				return;
			}
			case "flexible": {
				const session = await repo.getOpenSession(db, chatId);
				if (!session) {
					await ctx.answerCallbackQuery({ text: "Belum ada sesi. Ketik /makan dulu." });
					return;
				}
				const on = await repo.toggleFlexible(db, session.id, user.id, user.first_name);
				await ctx.answerCallbackQuery({ text: on ? "Kamu fleksibel 🤷" : "Batal fleksibel." });
				await refresh(chatId, session.id);
				return;
			}
			case "surprise": {
				const session = await repo.getOpenSession(db, chatId);
				if (!session) {
					await ctx.answerCallbackQuery({ text: "Belum ada sesi. Ketik /makan dulu." });
					return;
				}
				if (session.botSuggestionCount >= 1) {
					await ctx.answerCallbackQuery({ text: "Aku udah kasih saran hari ini 😄" });
					return;
				}
				const pick = await pickBotSuggestion(db, cfg, chatId, session);
				if (!pick) {
					await ctx.answerCallbackQuery({
						text: "Belum ada tempat lain buat diusulin. /tambah <nama> atau /usul.",
					});
					return;
				}
				// Answer fast (clears the spinner), then do the heavier propose + refresh.
				await ctx.answerCallbackQuery({ text: `Saran: ${pick.name} 🤖` });
				await applyBotSuggestion(db, cfg, bot.api, chatId, session, pick);
				return;
			}
			case "propose": {
				const session = await repo.getOpenSession(db, chatId);
				if (!session) {
					await ctx.answerCallbackQuery({ text: "Belum ada sesi. Ketik /makan dulu." });
					return;
				}
				const places = await repo.listPlaces(db, chatId);
				const picker = buildPlacePicker(places);
				await ctx.answerCallbackQuery();
				await bot.api.sendMessage(chatId, picker.text, {
					reply_markup: tg.toInlineKeyboard(picker.buttons),
					link_preview_options: { is_disabled: true },
				});
				return;
			}
			case "pick": {
				// A saved place was chosen → swap this message into the time picker.
				const place = await repo.getPlaceById(db, action.placeId);
				if (!place || place.chatId !== chatId) {
					await ctx.answerCallbackQuery({ text: "Tempat tidak dikenal." });
					return;
				}
				const picker = buildTimePicker(place.name, place.id);
				await ctx.answerCallbackQuery();
				await ctx
					.editMessageText(picker.text, { reply_markup: tg.toInlineKeyboard(picker.buttons) })
					.catch(() => undefined);
				return;
			}
			case "make": {
				// Place + leave time chosen → create the proposal.
				const session = await repo.getOpenSession(db, chatId);
				if (!session) {
					await ctx.answerCallbackQuery({ text: "Belum ada sesi. Ketik /makan dulu." });
					return;
				}
				const place = await repo.getPlaceById(db, action.placeId);
				if (!place || place.chatId !== chatId) {
					await ctx.answerCallbackQuery({ text: "Tempat tidak dikenal." });
					return;
				}
				const leave = QUICK_LEAVE_TIMES[action.timeIdx];
				if (!leave) {
					await ctx.answerCallbackQuery({ text: "Jam tidak valid." });
					return;
				}
				const res = await proposePlace(db, chatId, session, {
					placeId: place.id,
					name: place.name,
					leave,
					proposerUserId: user.id,
					proposerName: user.first_name,
				});
				await ctx.deleteMessage().catch(() => undefined); // dismiss the picker
				if (res.duplicate) {
					await ctx.answerCallbackQuery({ text: `${place.name} udah ada di papan.` });
					return;
				}
				if (!res.created) {
					await ctx.answerCallbackQuery({ text: "Gagal nambah, coba lagi ya." });
					return;
				}
				await ctx.answerCallbackQuery({ text: `Diusulin: ${place.name} · ${leave}` });
				await refresh(chatId, session.id);
				return;
			}
			case "cancel": {
				await ctx.answerCallbackQuery();
				await ctx.deleteMessage().catch(() => undefined);
				return;
			}
			case "settle": {
				await ctx.answerCallbackQuery();
				await bot.api.sendMessage(
					chatId,
					`💸 Waktunya bagi bill. Catat pesanan + diskon/biaya di samarata, bagi rata otomatis:\n${cfg.samarataUrl}`,
					{ link_preview_options: { is_disabled: true } },
				);
				return;
			}
		}
	});

	bot.catch(({ error, ctx }) => {
		console.error("bot error", error);
		ctx.answerCallbackQuery({ text: "Ada error bentar, coba lagi ya." }).catch(() => undefined);
	});

	return bot;
}

// --- lazy singleton (token is a secret, only available at request time) ---
let botSingleton: Bot | null = null;
let botToken: string | null = null;

export async function getBot(env: Env, cfg: Config): Promise<Bot> {
	if (botSingleton && botToken === env.BOT_TOKEN) {
		return botSingleton;
	}
	const bot = createBot(env, cfg);
	await bot.init(); // one-time getMe, cached on the instance

	// Register the Indonesian command menu (shown in the Telegram "/" autocomplete).
	// Persists on Telegram's side; wrapped so a transient API error never blocks startup.
	try {
		await bot.api.setMyCommands([
			{ command: "makan", description: "Buka papan makan siang hari ini" },
			{ command: "ulang", description: "Kosongkan papan, mulai round baru" },
			{ command: "usul", description: "Usul tempat: /usul <nama> [jam]" },
			{ command: "jam", description: "Ganti jam berangkat: /jam <nama> <jam>" },
			{ command: "batal", description: "Hapus usul dari papan: /batal <nama>" },
			{ command: "tambah", description: "Simpan tempat ke daftar favorit" },
			{ command: "tempat", description: "Lihat daftar tempat tersimpan" },
			{ command: "hapus", description: "Hapus tempat dari daftar" },
			{ command: "bantuan", description: "Bantuan cara pakai" },
		]);
	} catch (err) {
		console.error("setMyCommands failed", err);
	}

	botSingleton = bot;
	botToken = env.BOT_TOKEN;
	return bot;
}
