import { reportErrorWebhook } from './helpers/discord';
import {
	filterAlertsByAlertType,
	fetchTTCAlerts,
	createThreadsMediaContainer,
	publishThreadsMediaContainer,
	generateOutageTag,
	sortAlertsByTimestamp,
} from './helpers/threads';

export default {
	async scheduled(event, env, ctx): Promise<void> {
		try {
			const alerts = await fetchTTCAlerts();
			const filteredAlerts = filterAlertsByAlertType([...alerts.routes, ...alerts.accessibility]);
			const alertsSortedByMostRecentTimestamp = sortAlertsByTimestamp(filteredAlerts);

			const lastUpdatedAlerts = await env.ttc_alerts.get(alerts.lastUpdated);
			if (lastUpdatedAlerts !== null) {
				// there's been no change since the last update
				return;
			}

			const listOfAlerts = await env.ttc_alerts.list({ limit: 1 });
			if (listOfAlerts.keys.length === 0) {
				// cache is completely empty, fill it with most recent events
				for (const alert of alertsSortedByMostRecentTimestamp) {
					const { id, error: mediaContainerError } = await createThreadsMediaContainer({
						userId: env.THREADS_USER_ID,
						accessToken: env.THREADS_ACCESS_TOKEN,
						postContent: encodeURIComponent(`
							${generateOutageTag(alert.routeType)}

							${alert.headerText}\n

							${alert.description !== '' ? `${alert.description}\n` : ''}

						`),
					});

					if (mediaContainerError) {
						console.log('there was an error creating the media container:', mediaContainerError.message);
						return;
					}

					const { error: mediaPublishError } = await publishThreadsMediaContainer({
						userId: env.THREADS_USER_ID,
						accessToken: env.THREADS_ACCESS_TOKEN,
						mediaContainerId: id,
					});

					if (mediaPublishError) {
						console.log('there was an error publishing the media container:', mediaPublishError.message);
						return;
					}
				}
				await env.ttc_alerts.put(alerts.lastUpdated, JSON.stringify(filteredAlerts));
				console.log(`${filteredAlerts.length} new threads post created on: ${new Date().toISOString()}`);
				return;
			}

			// the case where lastUpdated is not in the cache and the cache is not completely empty
			// meaning we are checking our cached result vs the new fetched results (should be different)

			const mostRecentAlert = await env.ttc_alerts.get(listOfAlerts.keys[0].name);
			const parsedRecentAlert: ReturnType<typeof filterAlertsByAlertType> = JSON.parse(mostRecentAlert as unknown as string);
			const parsedRecentAlertIds = new Set(parsedRecentAlert.map((alert) => alert.id));
			const newAlerts = filteredAlerts.filter((alert) => !parsedRecentAlertIds.has(alert.id));
			if (newAlerts.length === 0) {
				// no new alerts
				return;
			}

			for (const alert of newAlerts) {
				const { id, error: mediaContainerError } = await createThreadsMediaContainer({
					userId: env.THREADS_USER_ID,
					accessToken: env.THREADS_ACCESS_TOKEN,
					postContent: encodeURIComponent(`
							${generateOutageTag(alert.routeType)}

							${alert.headerText}\n

							${alert.description !== '' ? `${alert.description}\n` : ''}

						`),
				});

				if (mediaContainerError) {
					console.log('there was an error creating the media container:', mediaContainerError.message);
					return;
				}

				const { error: mediaPublishError } = await publishThreadsMediaContainer({
					userId: env.THREADS_USER_ID,
					accessToken: env.THREADS_ACCESS_TOKEN,
					mediaContainerId: id,
				});

				if (mediaPublishError) {
					console.log('there was an error publishing the media container' + mediaPublishError.message);
					return;
				}
			}
			await env.ttc_alerts.put(alerts.lastUpdated, JSON.stringify(filteredAlerts));
		} catch (error) {
			console.error('unhandled error', error);
			reportErrorWebhook({ webhookId: env.DISCORD_WEBHOOK_ID, webhookToken: env.DISCORD_WEBHOOK_TOKEN });
		}
	},
} satisfies ExportedHandler<Env>;
