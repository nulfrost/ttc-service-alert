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

			const listOfAlerts = await env.ttc_alerts.list();

			if (lastUpdatedAlerts !== null) {
				let newAlerts;
				console.log('looking for differences in the cache that might have been missed');
				const mostRecentAlert = await env.ttc_alerts.get(listOfAlerts.keys[listOfAlerts.keys.length - 1].name);
				const parsedRecentAlert: ReturnType<typeof filterAlertsByAlertType> = JSON.parse(mostRecentAlert as unknown as string);
				const parsedRecentAlertIds = new Set(parsedRecentAlert.map((alert) => alert.id));
				// we need to check the headerText as well, as the id might be the same but the content might be different
				const parsedRecentAlertTitles = new Set(parsedRecentAlert.map((alert) => alert.headerText));
				const newAlertsBasedOnIds = filteredAlerts.filter((alert) => !parsedRecentAlertIds.has(alert.id));
				const newAlertsBasedOnTitles = filteredAlerts.filter((alert) => !parsedRecentAlertTitles.has(alert.headerText));

				if (newAlertsBasedOnIds.length === 0 || newAlertsBasedOnTitles.length === 0) {
					// no new alerts
					console.log('no new alerts, exiting');
					return;
				}

				newAlerts = [...newAlertsBasedOnIds, ...newAlertsBasedOnTitles];
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
				console.log(`${newAlerts.length} new threads post created on: ${new Date().toISOString()}`);
				await env.ttc_alerts.put(alerts.lastUpdated, JSON.stringify(filteredAlerts));
				return;
			}

			if (listOfAlerts.keys.length === 0) {
				// cache is completely empty, fill it with most recent events
				console.log('cache is empty, filling it with the most recent events');
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

			console.log('no cache hit, checking for differences');
			let newAlerts;
			const mostRecentAlert = await env.ttc_alerts.get(listOfAlerts.keys[listOfAlerts.keys.length - 1].name);
			const parsedRecentAlert: ReturnType<typeof filterAlertsByAlertType> = JSON.parse(mostRecentAlert as unknown as string);
			const parsedRecentAlertIds = new Set(parsedRecentAlert.map((alert) => alert.id));
			// we need to check the headerText as well, as the id might be the same but the content might be different
			const parsedRecentAlertTitles = new Set(parsedRecentAlert.map((alert) => alert.headerText));
			const newAlertsBasedOnIds = filteredAlerts.filter((alert) => !parsedRecentAlertIds.has(alert.id));
			const newAlertsBasedOnTitles = filteredAlerts.filter((alert) => !parsedRecentAlertTitles.has(alert.headerText));

			if (newAlertsBasedOnIds.length === 0 || newAlertsBasedOnTitles.length === 0) {
				// no new alerts
				console.log('no new alerts, exiting');
				return;
			}

			newAlerts = [...newAlertsBasedOnIds, ...newAlertsBasedOnTitles];

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
			console.log(`${newAlerts.length} new threads post created on: ${new Date().toISOString()}`);
			await env.ttc_alerts.put(alerts.lastUpdated, JSON.stringify(filteredAlerts));
		} catch (error) {
			console.error('unhandled error', error);
			reportErrorWebhook({ webhookId: env.DISCORD_WEBHOOK_ID, webhookToken: env.DISCORD_WEBHOOK_TOKEN });
		}
	},
} satisfies ExportedHandler<Env>;
