import {
	filterSubwayAndBusAlerts,
	fetchTTCAlerts,
	createThreadsMediaContainer,
	publishThreadsMediaContainer,
	checkThreadsMediaContainerStatus,
} from './helpers';

export default {
	async scheduled(event, env, ctx): Promise<void> {
		try {
			const alerts = await fetchTTCAlerts();
			const currentAlerts = filterSubwayAndBusAlerts([...alerts.routes, ...alerts.accessibility]);

			const cachedAlerts = await env.ttc_alerts.get(alerts.lastUpdated);
			if (cachedAlerts !== null) {
				const parsedKvAlerts: ReturnType<typeof filterSubwayAndBusAlerts> = JSON.parse(cachedAlerts);
				const currentAlertIds = currentAlerts.map((alert) => alert.id);
				const parsedAlertIds = parsedKvAlerts.map((alert) => alert.id);
				const newAlertIds = currentAlertIds.filter((alert) => !parsedAlertIds.includes(alert));
				if (newAlertIds.length === 0) {
					return;
				}

				const newAlerts = currentAlerts.filter((alert, index) => alert.id.includes(newAlertIds[index]));
				console.log(newAlerts);
				return;
			}

			const lastAlert = currentAlerts[0];

			const { id, error: mediaContainerError } = await createThreadsMediaContainer({
				userId: env.THREADS_USER_ID,
				accessToken: env.THREADS_ACCESS_TOKEN,
				postContent: lastAlert.title,
			});

			if (mediaContainerError) {
				console.log('There was an error creating the media container', mediaContainerError.error.message);
				return;
			}

			const { status } = await checkThreadsMediaContainerStatus({ mediaContainerId: id, accessToken: env.THREADS_ACCESS_TOKEN });

			if (status === 'ERROR') {
				console.log('There was an error checking the status of the media container');
				return;
			}

			console.log(status, id);

			const { error: mediaPublishError } = await publishThreadsMediaContainer({
				userId: env.THREADS_USER_ID,
				accessToken: env.THREADS_ACCESS_TOKEN,
				mediaContainerId: id,
			});

			if (mediaPublishError) {
				console.log('There was an error publishing the media container' + mediaPublishError.message);
				return;
			}

			await env.ttc_alerts.put(alerts.lastUpdated, JSON.stringify(currentAlerts));
			console.log(`new threads post created on: ${new Date().toISOString()}`);
		} catch (error) {
			console.error(error);
		}
	},
} satisfies ExportedHandler<Env>;
