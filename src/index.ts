import { filterSubwayAndBusAlerts, fetchRecentTTCAlerts } from './helpers';

export default {
	async scheduled(event, env, ctx): Promise<void> {
		const alerts = await fetchRecentTTCAlerts('https://alerts.ttc.ca/api/alerts/live-alerts');

		console.log(filterSubwayAndBusAlerts([...alerts.routes, ...alerts.accessibility]));
	},
} satisfies ExportedHandler<Env>;
