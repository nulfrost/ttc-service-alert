import { schedules } from '@trigger.dev/sdk/v3';
import { sendThreadsPost } from '~/threads';
import { destringify, fetchTTCAlerts, filterAlertsByAlertType, getMostRecentCachedAlert, sortAlertsByTimestamp } from '../utils';
import { listKVKeys } from '~/cloudflare';

export const scheduledThreadsPost = schedules.task({
	id: 'scheduled-threads-post',
	cron: {
		pattern: '* * * * *',
		timezone: 'America/Toronto',
	},
	run: async () => {
		try {
			const alerts = await fetchTTCAlerts();

			const filteredAlerts = filterAlertsByAlertType([...alerts.routes, ...alerts.accessibility]);
			const alertsSortedByMostRecentTimestamp = sortAlertsByTimestamp(filteredAlerts);

			const listOfAlerts = await listKVKeys();

			const { lastCachedAlertData } = await getMostRecentCachedAlert({
				alerts: listOfAlerts,
			});

			const parsedRecentAlert = destringify(lastCachedAlertData as unknown as string);

			const parsedRecentAlertIds = new Set(parsedRecentAlert.map((alert) => alert.id));
			const newAlertsBasedOnIds = alertsSortedByMostRecentTimestamp.filter((alert) => !parsedRecentAlertIds.has(alert.id));

			if (newAlertsBasedOnIds.length === 0) {
				// no new alerts based on ids
				console.info('no new alerts based on ids, checking for updates based on content');

				const parsedRecentAlertTitles = new Set(parsedRecentAlert.map((alert) => alert.headerText));
				const newAlertsBasedOnTitles = alertsSortedByMostRecentTimestamp
					.filter((alert) => alert.headerText !== null)
					.filter((alert) => !parsedRecentAlertTitles.has(alert.headerText));

				if (newAlertsBasedOnTitles.length === 0) {
					console.info('no new alerts based on content, exiting');
					return;
				}

				await sendThreadsPost({
					alertsToBePosted: newAlertsBasedOnTitles,
					alertsToBeCached: filteredAlerts,
					lastUpdatedTimestamp: alerts.lastUpdated,
				});
				return;
			}

			await sendThreadsPost({
				alertsToBePosted: newAlertsBasedOnIds,
				alertsToBeCached: filteredAlerts,
				lastUpdatedTimestamp: alerts.lastUpdated,
			});
		} catch (error) {
			console.error('an error occurred', error);
		}

		return {
			success: true,
		};
	},
});
