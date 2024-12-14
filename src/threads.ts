import { wait } from '@trigger.dev/sdk/v3';
import { findTransitAlertById, insertIds, writeDataToCloudflareKV } from './cloudflare';
import { env } from './config';
import type { SendThreadsPostParams, ThreadsApiResponse } from './types';

export async function createThreadsMediaContainer({
	userId,
	accessToken,
	postContent,
	shouldQuotePost,
	postQuoteId,
}: {
	userId: string;
	accessToken: string;
	postContent: string;
	shouldQuotePost: boolean;
	postQuoteId: string;
}) {
	console.log({ shouldQuotePost, postQuoteId });
	const response = await fetch(
		`https://graph.threads.net/v1.0/${userId}/threads?media_type=text&text=${postContent}&access_token=${accessToken}${
			shouldQuotePost && typeof postQuoteId !== 'undefined' ? `&quote_post_id=${postQuoteId}` : ''
		}`,
		{
			method: 'POST',
		}
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

export async function publishThreadsMediaContainer({
	userId,
	mediaContainerId,
	accessToken,
}: {
	userId: string;
	mediaContainerId: string;
	accessToken: string;
}): Promise<ThreadsApiResponse> {
	const response = await fetch(
		`https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${mediaContainerId}&access_token=${accessToken}`,
		{
			method: 'POST',
		}
	);

	const { error, id } = await response.json();
	return {
		id,
		error,
	};
}

export async function sendThreadsPost({ alertsToBePosted, alertsToBeCached, lastUpdatedTimestamp }: SendThreadsPostParams) {
	await writeDataToCloudflareKV({
		timestamp: lastUpdatedTimestamp,
		alerts: alertsToBeCached,
	});

	try {
		for (const alert of alertsToBePosted) {
			const data = await findTransitAlertById(alert.id);
			const postQuoteId = data?.result[0]?.results[0]?.threads_post_id;
			console.log('quoted post id', postQuoteId, 'should quote post', data?.result[0]?.results?.length !== 0);
			const { error: mediaContainerError, id } = await createThreadsMediaContainer({
				userId: env.THREADS_USER_ID,
				accessToken: env.THREADS_ACCESS_TOKEN,
				postContent: encodeURIComponent(`
				${alert.headerText}
			   `),
				shouldQuotePost: data?.result[0]?.results?.length !== 0,
				postQuoteId,
			});
			if (mediaContainerError) {
				console.error(`there was an error creating the media container: ${mediaContainerError.message}`);
				return;
			}

			const { error: mediaPublishError, id: threadsMediaId } = await publishThreadsMediaContainer({
				userId: env.THREADS_USER_ID,
				accessToken: env.THREADS_ACCESS_TOKEN,
				mediaContainerId: id,
			});

			if (data?.result[0]?.results?.length === 0) {
				// this isn't an id that exists in the database already, we need to add it
				await insertIds({ alert_id: +alert.id, threads_post_id: threadsMediaId });
			}

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
