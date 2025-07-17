import { ofetch } from "ofetch";
import { env } from "./config";

type DiscordErrorReport = {
	title: string;
	description: string;
};

export function reportErrorToDiscord({ title, description }: DiscordErrorReport) {
	return ofetch(`https://discord.com/api/webhooks/1395222153477099610/${env.DISCORD_WEBHOOK_TOKEN}`, {
		method: 'POST',
		body: JSON.stringify({
			"embeds": [
				{
					"title": `ERROR: ${title}`,
					"description": description,
					"timestamp": new Date().toISOString()
				}
			]
		})
	})
}
