import { schedules, logger } from '@trigger.dev/sdk/v3';
import { listKVKeys } from '~/cloudflare';
import { sendThreadsPost } from '~/threads';
import { destringify, fetchTTCAlerts, filterPlannedAlerts, getMostRecentCachedAlert, sortAlertsByTimestamp } from '../utils';
import type { Route } from '~/types';

export const scheduledThreadsPost = schedules.task({
	id: 'scheduled-threads-post',
	cron: {
		pattern: '* * * * *', // Runs every minute
		timezone: 'America/Toronto',
	},
	run: async () => {
		try {
			// 1. Fetch and prepare current alerts
			const currentAlertsData = await fetchTTCAlerts();
			const filteredCurrentAlerts = filterPlannedAlerts([...currentAlertsData.routes, ...currentAlertsData.accessibility]);
			const sortedCurrentAlerts = sortAlertsByTimestamp(filteredCurrentAlerts);

			// 2. Fetch and prepare cached alerts
			const kvKeysList = await listKVKeys();
			const { lastCachedAlertData } = await getMostRecentCachedAlert({
				alertKeys: kvKeysList?.result,
			});

			// If no cached data, post all current alerts and exit
			if (!lastCachedAlertData) {
				console.info('No cached alerts found. Posting all current alerts.');
				if (sortedCurrentAlerts.length > 0) {
					await sendThreadsPost({
						alertsToBePosted: sortedCurrentAlerts,
						alertsToBeCached: filteredCurrentAlerts,
						lastUpdatedTimestamp: currentAlertsData.lastUpdated,
					});
				} else {
					logger.info('No current alerts to post.');
				}
				return { success: true, message: 'Initial run or cache cleared.' };
			}

			// Assuming lastCachedAlertData is a stringified JSON array from KV
			const cachedAlerts: Route[] = destringify(lastCachedAlertData as unknown as string);
			const cachedAlertIds = new Map<string, Route>(cachedAlerts.map((alert) => [alert.id, alert]));

			// 3. Identify alerts to be posted (new or updated)
			const alertsToPost: Route[] = [];
			for (const currentAlert of sortedCurrentAlerts) {
				const cachedAlert = cachedAlertIds.get(currentAlert.id);
				if (!cachedAlert) {
					// New alert (ID not found in cache)
					alertsToPost.push(currentAlert);
				} else if (currentAlert.headerText && cachedAlert.headerText !== currentAlert.headerText) {
					// Updated alert (ID found, but headerText differs)
					alertsToPost.push(currentAlert);
				}
			}

			// 4. Post if there are new or updated alerts
			if (alertsToPost.length === 0) {
				logger.info('No new or updated alerts to post.');
			} else {
				logger.info(`Found ${alertsToPost.length} new/updated alerts to post.`);
				await sendThreadsPost({
					alertsToBePosted: alertsToPost,
					alertsToBeCached: filteredCurrentAlerts, // Cache the latest full set
					lastUpdatedTimestamp: currentAlertsData.lastUpdated,
				});
			}

			return {
				success: true,
				postedCount: alertsToPost.length,
			};
		} catch (error) {
			logger.error('Error in scheduled Threads post task:', { error });
			// Re-throw the error to mark the task run as failed in Trigger.dev
			throw error;
		}
	},
});
