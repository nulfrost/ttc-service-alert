import { logger } from '@trigger.dev/sdk/v3';
import { ofetch } from 'ofetch';
import { env } from '~/config';
import type { CloudflareKVResponse } from '~/types';
import { stringify } from '~/utils';

const cloudflareFetchInstance = ofetch.create({
	baseURL: 'https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/',
	headers: {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
	},
	async onResponse({ response }) {
		if (response?._data?.success === false) {
			logger.error('Cloudflare API error:', { error: response._data });
			throw new Error(`Cloudflare API error: ${JSON.stringify(response._data)}`);
		}
	},
	responseType: 'json',
});

export async function writeDataToCloudflareKV({ timestamp, alerts }: { timestamp: string; alerts: string }) {
	try {
		const stringifiedAlertData = stringify(alerts);

		await cloudflareFetchInstance(`storage/kv/namespaces/f5267b57827b4e92bfdfca2f129c0606/values/${timestamp}`, {
			method: 'PUT',
			body: stringifiedAlertData,
		});
	} catch (error) {
		logger.error('Error writing data to Cloudflare KV:', { error });
		throw error;
	}
}

export async function listKVKeys() {
	try {
		const cursor = await getPaginatedCursor();

		const data = await cloudflareFetchInstance<CloudflareKVResponse>(
			`storage/kv/namespaces/f5267b57827b4e92bfdfca2f129c0606/keys${typeof cursor !== 'undefined' ? `?cursor=${cursor}` : ''}`,
		);

		if (data.result_info.count === 1000 && data.result_info.cursor !== '') {
			const newPageData = await cloudflareFetchInstance<CloudflareKVResponse>(
				`storage/kv/namespaces/f5267b57827b4e92bfdfca2f129c0606/keys?cursor=${data?.result_info?.cursor}`,
			);
			await updatePaginatedCursor(data.result_info?.cursor);

			return newPageData;
		}

		return data;
	} catch (error) {
		logger.error('Error listing KV keys:', { error });
		throw error;
	}
}

export async function getValueByKey(key: string): Promise<string> {
	try {
		const response = await cloudflareFetchInstance(`storage/kv/namespaces/f5267b57827b4e92bfdfca2f129c0606/values/${key}`);

		return response;
	} catch (error) {
		logger.error(`Error getting value for key ${key}:`, { error });
		throw error;
	}
}

export async function insertIds({ alert_id, threads_post_id }: { alert_id: number; threads_post_id: string }) {
	try {
		await cloudflareFetchInstance('d1/database/a5e57484-26e8-4b2f-a276-d870335be1f9/query', {
			method: 'POST',
			body: `{"params":["${alert_id}","${threads_post_id}"],"sql":"INSERT into posts VALUES (?, ?);"}`,
		});
	} catch (error) {
		logger.error('Error inserting IDs:', { error });
		throw error;
	}
}

export async function findTransitAlertById(alert_id: string) {
	try {
		const response = await cloudflareFetchInstance('d1/database/a5e57484-26e8-4b2f-a276-d870335be1f9/query', {
			method: 'POST',
			body: `{"params":["${alert_id}"],"sql":"SELECT alert_id, threads_post_id FROM posts WHERE alert_id = ?;"}`,
		});

		return response;
	} catch (error) {
		logger.error(`Error finding transit alert for ID ${alert_id}:`, { error });
		throw error;
	}
}

async function updatePaginatedCursor(cursor: string) {
	try {
		const response = await cloudflareFetchInstance('d1/database/dedb959d-8767-464a-8030-b9a58a4b92c4/query', {
			method: 'POST',
			body: `{"params":["${cursor}"],"sql":"UPDATE cursors SET cursor = ? WHERE id = 1;"}`,
		});

		return response;
	} catch (error) {
		logger.error('Error updating paginated cursor:', { error });
		throw error;
	}
}

async function getPaginatedCursor() {
	try {
		const response = await cloudflareFetchInstance('d1/database/dedb959d-8767-464a-8030-b9a58a4b92c4/query', {
			method: 'POST',
			body: '{"sql":"SELECT * FROM cursors ORDER BY id DESC LIMIT 1;"}',
		});

		return response.result[0].results[0].cursor;
	} catch (error) {
		logger.error('Error getting paginated cursor:', { error });
		throw error;
	}
}
