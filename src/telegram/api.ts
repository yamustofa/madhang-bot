/**
 * Thin wrappers around the Telegram Bot API via grammY. The board is one
 * message we post once, pin, and then edit in place as state changes.
 *
 * Outbound calls here go only to the fixed host api.telegram.org (handled by
 * grammY). No user-controlled URLs are ever fetched server-side.
 */
import { type Api, InlineKeyboard } from "grammy";
import type { RenderedBoard } from "#/domain/board";
import type { ButtonRow } from "#/domain/keyboard";

/** Convert the plain button layout into a grammY InlineKeyboard. */
export function toInlineKeyboard(rows: ButtonRow[]): InlineKeyboard {
	const kb = new InlineKeyboard();
	rows.forEach((row, i) => {
		for (const b of row) kb.text(b.text, b.callbackData);
		if (i < rows.length - 1) kb.row();
	});
	return kb;
}

/** Post the board for the first time. Returns the new message id. */
export async function postBoard(
	api: Api,
	chatId: number,
	rendered: RenderedBoard,
): Promise<number> {
	const msg = await api.sendMessage(chatId, rendered.text, {
		reply_markup: toInlineKeyboard(rendered.buttons),
		parse_mode: "HTML",
		link_preview_options: { is_disabled: true },
	});
	return msg.message_id;
}

/** Edit the existing board message in place. Ignores "not modified" errors. */
export async function editBoard(
	api: Api,
	chatId: number,
	messageId: number,
	rendered: RenderedBoard,
): Promise<void> {
	try {
		await api.editMessageText(chatId, messageId, rendered.text, {
			reply_markup: toInlineKeyboard(rendered.buttons),
			parse_mode: "HTML",
			link_preview_options: { is_disabled: true },
		});
	} catch (err) {
		if (!isNotModified(err)) throw err;
	}
}

/** Pin the board. Fails silently if the bot lacks pin rights (non-fatal). */
export async function pinBoard(api: Api, chatId: number, messageId: number): Promise<void> {
	try {
		await api.pinChatMessage(chatId, messageId, { disable_notification: true });
	} catch {
		// Bot may not be admin; the board still works unpinned.
	}
}

function isNotModified(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return msg.includes("not modified");
}
