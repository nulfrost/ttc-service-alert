import { envvars, schedules } from "@trigger.dev/sdk/v3";

export const updateSecretKey = schedules.task({
	id: "update-secret-key",
	cron: {
		pattern: "0 0 * * 0",
		timezone: "America/Toronto",
	},
	run: async () => {
		try {
			const currentAccessToken = await envvars.retrieve(
				"proj_imoofkrlqdujjamdlryj",
				"prod",
				"THREADS_ACCESS_TOKEN",
			);

			const response = await fetch(
				`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${currentAccessToken}`,
			);

			const refreshedAccessToken = await response.json();
			await envvars.update("THREADS_ACCESS_TOKEN", {
				value: refreshedAccessToken,
			});
		} catch (error) {
			console.log(
				"there was an error updating the threads access token",
				error,
			);
		}
	},
});
