import {
	filterAlertsByAlertType,
	fetchTTCAlerts,
	sortAlertsByTimestamp,
	getMostRecentCachedAlert,
	parseAlertValue,
	sendThreadsPost,
	getDifference,
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
	async scheduled(event, env, ctx): Promise<void> {
		try {
			const alerts = await fetchTTCAlerts();
			const filteredAlerts = filterAlertsByAlertType([...alerts.routes, ...alerts.accessibility]);
			const alertsSortedByMostRecentTimestamp = sortAlertsByTimestamp(filteredAlerts);

			const [lastUpdatedAlerts, listOfAlerts] = await Promise.all([env.ttc_alerts.get(alerts.lastUpdated), env.ttc_alerts.list()]);

			const mostRecentAlert = await getMostRecentCachedAlert({ env, alerts: listOfAlerts });

			const parsedRecentAlert = parseAlertValue(mostRecentAlert as unknown as string);

			if (lastUpdatedAlerts !== null) {
				console.log('cache hit, checking to see if any updates based on content');

				const diff = getDifference(alertsSortedByMostRecentTimestamp, parsedRecentAlert, 'headerText');

				if (diff.length === 0) {
					// no new alerts based on content
					console.log('no new alerts based on content, exiting');
					return;
				}

				await sendThreadsPost({
					env,
					alertsToBePosted: diff,
					alertsToBeCached: filteredAlerts,
					lastUpdatedTimestamp: alerts.lastUpdated,
				});
				return;
			}

			// we are checking our cached result vs the new fetched results (should be different)

			console.log('no cache hit, checking for updates based on ids');
			const parsedRecentAlertIds = new Set(parsedRecentAlert.map((alert) => alert.id));
			const newAlertsBasedOnIds = alertsSortedByMostRecentTimestamp.filter((alert) => !parsedRecentAlertIds.has(alert.id));

			if (newAlertsBasedOnIds.length === 0) {
				// no new alerts based on ids
				console.log('no new alerts based on ids, exiting');
				await env.ttc_alerts.put(alerts.lastUpdated, JSON.stringify(filteredAlerts));
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
