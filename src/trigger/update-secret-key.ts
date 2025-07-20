import { envvars, logger, schedules } from "@trigger.dev/sdk/v3";
import { reportErrorToDiscord } from "~/webhooks";

export const updateSecretKey = schedules.task({
	id: "update-secret-key",
	cron: {
		pattern: "0 0 * * 0",
		timezone: "America/Toronto",
	},
	run: async () => {
		try {
			const env = await envvars.retrieve(
				"THREADS_ACCESS_TOKEN",
			);


			const response = await fetch(
				`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${env.value}`,
			);

			const data = await response.json();
			await envvars.update("THREADS_ACCESS_TOKEN", {
				value: data.access_token,
			});
			logger.info(`access token updated at ${new Date().toISOString()}`)
		} catch (error) {
			console.log(
				"there was an error updating the threads access token",
				error,
			);

			await reportErrorToDiscord({ title: 'could not refresh access token', context: JSON.stringify(error) })

			throw error
		}
	},
});
