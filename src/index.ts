import { reportErrorWebhook } from './helpers/discord';
import {
	filterAlertType,
	fetchTTCAlerts,
	createThreadsMediaContainer,
	publishThreadsMediaContainer,
	generateOutageTag,
} from './helpers/threads';

export default {
	async scheduled(event, env, ctx): Promise<void> {
		try {
			const alerts = await fetchTTCAlerts();
			const currentAlerts = filterAlertType([...alerts.routes, ...alerts.accessibility]);

			const cachedAlerts = await env.ttc_alerts.get(alerts.lastUpdated);
			if (cachedAlerts !== null) {
				console.log('reading from cache');
				const parsedKvAlerts: ReturnType<typeof filterAlertType> = JSON.parse(cachedAlerts);
				const currentAlertIds = currentAlerts.map((alert) => alert.id);
				const parsedAlertIds = parsedKvAlerts.map((alert) => alert.id);
				const newAlertIds = currentAlertIds.filter((alert) => !parsedAlertIds.includes(alert));
				if (newAlertIds.length === 0) {
					return;
				}

				const newAlerts = currentAlerts.filter((alert, index) => alert.id.includes(newAlertIds[index]));

				for (const alert of newAlerts) {
					const { id, error: mediaContainerError } = await createThreadsMediaContainer({
						userId: env.THREADS_USER_ID,
						accessToken: env.THREADS_ACCESS_TOKEN,
						postContent: encodeURIComponent(`
							${generateOutageTag(alert.routeType)}
							
							${alert.headerText}\n
		
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

				return;
			}

			const lastAlert = currentAlerts[0];

			const { id, error: mediaContainerError } = await createThreadsMediaContainer({
				userId: env.THREADS_USER_ID,
				accessToken: env.THREADS_ACCESS_TOKEN,
				postContent: encodeURIComponent(`
					${generateOutageTag(lastAlert.routeType)}
					
					${lastAlert.headerText}\n

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

			await env.ttc_alerts.put(alerts.lastUpdated, JSON.stringify(currentAlerts));
			console.log(`new threads post created on: ${new Date().toISOString()}`);
		} catch (error) {
			console.error('unhandled error', error);
			reportErrorWebhook({ webhookId: env.DISCORD_WEBHOOK_ID, webhookToken: env.DISCORD_WEBHOOK_TOKEN });
		}
	},
} satisfies ExportedHandler<Env>;
