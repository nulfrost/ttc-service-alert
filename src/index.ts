import {
	filterAlertsByAlertType,
	fetchTTCAlerts,
	sortAlertsByTimestamp,
	getMostRecentCachedAlert,
	parseAlertValue,
	sendThreadsPost,
} from './helpers/threads';

// TTC Alert updates can happen under these circumstances:
// 1. There are new ids from the API
// 2. There are no new ids but instead one or more of the alerts content has changed

/**
 * 1. Fetch the alerts from the TTC API
 * 2. Check the cache against the fetched data, sometimes the lastUpdated is the same from the API but the content as changed in one of the alerts
 * 3. If there are new alerts based on content changes, create a new threads post
 * 4. If not, check if there are new alerts based on new ids being returned from the API
 * 5. If there are new alerts based on new ids, create a new threads post
 */

export default {
	async scheduled(_, env, __): Promise<void> {
		try {
			const alerts = await fetchTTCAlerts();

			const filteredAlerts = filterAlertsByAlertType([...alerts.routes, ...alerts.accessibility]);
			const alertsSortedByMostRecentTimestamp = sortAlertsByTimestamp(filteredAlerts);

			const listOfAlerts = await env['ttc-service-alerts'].list();

			if (listOfAlerts.keys.length === 0) {
				console.info('no cached alerts, creating a new threads post');
				await sendThreadsPost({
					env,
					alertsToBePosted: alertsSortedByMostRecentTimestamp,
					alertsToBeCached: filteredAlerts,
					lastUpdatedTimestamp: alerts.lastUpdated,
				});
				return;
			}

			const { lastCachedAlertData } = await getMostRecentCachedAlert({ env, alerts: listOfAlerts });

			const parsedRecentAlert = parseAlertValue(lastCachedAlertData as unknown as string);

			// we are checking our cached result vs the new fetched results (should be different)

			console.info('checking for updates based on ids');
			// sometimes ids have a -1 appended to them for some reason. take those out
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
					env,
					alertsToBePosted: newAlertsBasedOnTitles,
					alertsToBeCached: filteredAlerts,
					lastUpdatedTimestamp: alerts.lastUpdated,
				});
				return;
			}

			await sendThreadsPost({
				env,
				alertsToBePosted: newAlertsBasedOnIds,
				alertsToBeCached: filteredAlerts,
				lastUpdatedTimestamp: alerts.lastUpdated,
			});
		} catch (error) {
			console.error('unhandled error', error);
		}
	},
} satisfies ExportedHandler<Env>;
