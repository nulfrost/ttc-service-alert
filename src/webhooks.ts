import { ofetch } from "ofetch";
import { env } from "./config";

type DiscordErrorReport = {
	title: string;
	context: string;
};

export function reportErrorToDiscord({ title, context }: DiscordErrorReport) {
	return ofetch(`https://discord.com/api/webhooks/1395222153477099610/${env.DISCORD_WEBHOOK_TOKEN}`, {
		method: 'POST',
		body: JSON.stringify({
			"embeds": [
				{
					"title": `ERROR: ${title}`,
					"context": context,
					"timestamp": new Date().toISOString()
				}
			]
		})
	})
}
