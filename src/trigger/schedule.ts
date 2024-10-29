import { wait, schedules, queue } from '@trigger.dev/sdk/v3';

const env = {
	CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN as string,
	THREADS_ACCESS_TOKEN: process.env.THREADS_ACCESS_TOKEN as string,
	THREADS_USER_ID: process.env.THREADS_USER_ID as string,
};

async function fetchTTCAlerts() {
	const response = await fetch('https://alerts.ttc.ca/api/alerts/live-alerts');
	return response.json();
}

function filterAlertsByAlertType(routes) {
	return routes.filter((route) => route.alertType === 'Planned');
}

function sortAlertsByTimestamp(routes) {
	return routes.sort((a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());
}

async function getMostRecentCachedAlert({ alerts }) {
	const lastCachedAlertKey = alerts.result[alerts.result.length - 1].name;
	const lastCachedAlertData = await getValueByKey(lastCachedAlertKey);
	return {
		lastCachedAlertKey,
		lastCachedAlertData,
	};
}

async function writeDataToCloudflareKV({ timestamp, alerts }) {
	const stringifiedAlertData = stringify(alerts);

	await fetch(
		`https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/storage/kv/namespaces/9dd30d2aaeb64605aa2758a7eb5f1452/values/${timestamp}`,
		{
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
			body: stringifiedAlertData,
		},
	);
}

async function listKVKeys() {
	const response = await fetch(
		'https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/storage/kv/namespaces/9dd30d2aaeb64605aa2758a7eb5f1452/keys',
		{
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
		},
	);

	return response.json();
}

async function getValueByKey(key: string) {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/storage/kv/namespaces/9dd30d2aaeb64605aa2758a7eb5f1452/values/${key}`,
		{
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
		},
	);

	return response.json();
}

function stringify(data) {
	return JSON.stringify(data);
}

function destringify(data) {
	return JSON.parse(data);
}

async function createThreadsMediaContainer({
	userId,
	accessToken,
	postContent,
	shouldQuotePost,
	quotePostId,
}: {
	userId: string;
	accessToken: string;
	postContent: string;
	shouldQuotePost: boolean;
	quotePostId: string;
}) {
	const response = await fetch(
		`https://graph.threads.net/v1.0/${userId}/threads?media_type=text&text=${postContent}&access_token=${accessToken}`,
		{
			method: 'POST',
		},
	);
	const {
		id,
		error,
	}: {
		id: string;
		error: { message: string; type: string; code: number; fbtrace_id: string };
	} = await response.json();

	return {
		id,
		error,
	};
}

async function publishThreadsMediaContainer({
	userId,
	mediaContainerId,
	accessToken,
}: {
	userId: string;
	mediaContainerId: string;
	accessToken: string;
}) {
	const response = await fetch(
		`https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${mediaContainerId}&access_token=${accessToken}`,
		{
			method: 'POST',
		},
	);

	const { error } = await response.json();
	return {
		error,
	};
}

async function insertIds({ alert_id, threads_post_id }) {
	const response = await fetch(
		'https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/d1/database/a5e57484-26e8-4b2f-a276-d870335be1f9/query',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
			body: `{"params":["${alert_id}","${threads_post_id}"],"sql":"INSERT into posts VALUES (?, ?);"}`,
		},
	);

	return response.json();
}

async function findAlertById(alert_id) {
	const response = await fetch(
		'https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/d1/database/a5e57484-26e8-4b2f-a276-d870335be1f9/query',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
			body: `{"params":["${alert_id}"],"sql":"SELECT alert_id, threads_post_id FROM posts WHERE alert_id = ?;"}`,
		},
	);

	return response.json();
}

async function sendThreadsPost({ alertsToBePosted, alertsToBeCached, lastUpdatedTimestamp }) {
	await writeDataToCloudflareKV({
		timestamp: lastUpdatedTimestamp,
		alerts: JSON.stringify(alertsToBeCached),
	});

	try {
		for (const alert of alertsToBePosted) {
			const data = await findAlertById(alert.id);

			const quotePostId = data?.result[0]?.results[0]?.threads_post_id;

			const { id, error: mediaContainerError } = await createThreadsMediaContainer({
				userId: env.THREADS_USER_ID,
				accessToken: env.THREADS_ACCESS_TOKEN,
				shouldQuotePost: data?.result[0]?.results?.length !== 0,
				quotePostId,
				postContent: encodeURIComponent(`
			   	${alert.headerText}
			   `),
			});

			if (data?.result[0]?.results?.length === 0) {
				// this isn't an id that exists in the database already, we need to add it
				await insertIds({ alert_id: +alert.id, threads_post_id: id });
			}

			if (mediaContainerError) {
				console.error(`there was an error creating the media container: ${mediaContainerError.message}`);
				return;
			}

			const { error: mediaPublishError } = await publishThreadsMediaContainer({
				userId: env.THREADS_USER_ID,
				accessToken: env.THREADS_ACCESS_TOKEN,
				mediaContainerId: id,
			});

			if (mediaPublishError) {
				console.error(`there was an error publishing the media container: ${mediaPublishError.message}`);
				return;
			}

			await wait.for({ seconds: 60 });
		}
		console.log(`${alertsToBePosted.length} new threads post created on: ${new Date().toISOString()}`);
	} catch (error) {
		console.error(error);
	}
}

const alertQueue = queue({
	name: 'ttc-alert-queue',
	concurrencyLimit: 1,
});

export const scheduledThreadsPost = schedules.task({
	id: 'scheduled-threads-post',
	cron: {
		pattern: '* * * * *',
		timezone: 'America/Toronto',
	},
	run: async (payload: any, { ctx }) => {
		try {
			const alerts = await fetchTTCAlerts();

			const filteredAlerts = filterAlertsByAlertType([...alerts.routes, ...alerts.accessibility]);
			const alertsSortedByMostRecentTimestamp = sortAlertsByTimestamp(filteredAlerts);

			const listOfAlerts = await listKVKeys();

			if (listOfAlerts.result.length === 0) {
				console.info('no cached alerts, creating a new threads post');
				await sendThreadsPost({
					alertsToBePosted: alertsSortedByMostRecentTimestamp,
					alertsToBeCached: filteredAlerts,
					lastUpdatedTimestamp: alerts.lastUpdated,
				});
				return;
			}

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
