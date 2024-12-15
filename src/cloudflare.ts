import { stringify } from '~/utils';
import { env } from '~/config';
import type { CloudflareKVResponse, Route } from '~/types';

export async function writeDataToCloudflareKV({ timestamp, alerts }: { timestamp: string; alerts: string }) {
	try {
		const stringifiedAlertData = stringify(alerts);

		await fetch(
			`https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/storage/kv/namespaces/f5267b57827b4e92bfdfca2f129c0606/values/${timestamp}`,
			{
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
				},
				body: stringifiedAlertData,
			}
		);
	} catch (error) {
		throw error;
	}
}

export async function listKVKeys() {
	let cursor = await getPaginatedCursor();

	// we need to check if the result_info.count is equal to 1000, it means we've reached the limit for the current page
	// a cursor is returned at this point which we need to use for the next page(s)
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/storage/kv/namespaces/f5267b57827b4e92bfdfca2f129c0606/keys${
			typeof cursor !== 'undefined' ? `?cursor=${cursor}` : ''
		}`,
		{
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
		}
	);

	const data: CloudflareKVResponse = await response.json();

	if (data.result_info.count === 1000 && data.result_info.cursor !== '') {
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/storage/kv/namespaces/f5267b57827b4e92bfdfca2f129c0606/keys?cursor=${data?.result_info?.cursor}`,
			{
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
				},
			}
		);
		await updatePaginatedCursor(data?.result_info?.cursor);

		return response.json();
	}

	return data;
}

export async function getValueByKey(key: string): Promise<string> {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/storage/kv/namespaces/f5267b57827b4e92bfdfca2f129c0606/values/${key}`,
		{
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
		}
	);

	return response.json();
}

export async function insertIds({ alert_id, threads_post_id }: { alert_id: number; threads_post_id: string }) {
	try {
		await fetch(
			'https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/d1/database/a5e57484-26e8-4b2f-a276-d870335be1f9/query',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
				},
				body: `{"params":["${alert_id}","${threads_post_id}"],"sql":"INSERT into posts VALUES (?, ?);"}`,
			}
		);
	} catch (error) {
		throw error;
	}
}

export async function findTransitAlertById(alert_id: string) {
	const response = await fetch(
		'https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/d1/database/a5e57484-26e8-4b2f-a276-d870335be1f9/query',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
			body: `{"params":["${alert_id}"],"sql":"SELECT alert_id, threads_post_id FROM posts WHERE alert_id = ?;"}`,
		}
	);

	return response.json();
}

async function updatePaginatedCursor(cursor: string) {
	const response = await fetch(
		'https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/d1/database/dedb959d-8767-464a-8030-b9a58a4b92c4/query',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
			body: `{"params":["${cursor}"],"sql":"INSERT into cursors VALUES (?) ON CONFLICT DO UPDATE SET cursor=${cursor};"}`,
		}
	);

	return response.json();
}

async function getPaginatedCursor() {
	const response = await fetch(
		'https://api.cloudflare.com/client/v4/accounts/f9305b888ff3b829102d355476ae8793/d1/database/dedb959d-8767-464a-8030-b9a58a4b92c4/query',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			},
			body: `{"sql":"SELECT * FROM cursors ORDER BY id DESC LIMIT 1;"}`,
		}
	);

	const data = await response.json();

	return data.result[0].results[0].cursor;
}
