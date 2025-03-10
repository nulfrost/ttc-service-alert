import { wait } from "@trigger.dev/sdk/v3";
import { ofetch } from "ofetch";
import {
	findTransitAlertById,
	insertIds,
	writeDataToCloudflareKV,
} from "~/cloudflare";
import { env } from "~/config";
import type { SendThreadsPostParams, ThreadsApiResponse } from "~/types";

const threadsFetchInstance = ofetch.create({
	baseURL: "https://graph.threads.net/v1.0/",
	async onRequest({ options }) {
		console.log("[threads api request]", options.query);
		options.query = options.query || {};
		options.query.access_token = env.THREADS_ACCESS_TOKEN;
	},
	async onResponse({ response }) {
		const { id, error }: ThreadsApiResponse = await response.json();
		if (error?.message) {
			console.error(
				`[threads api error]: there was an error while publishing to threads -> ID: ${id} <> ${error.message}`,
			);
		}
	},
});

export async function createThreadsMediaContainer({
	userId,
	postContent,
	shouldQuotePost,
	postQuoteId,
}: {
	userId: string;
	postContent: string;
	shouldQuotePost: boolean;
	postQuoteId: string;
}) {
	console.log({ shouldQuotePost, postQuoteId });

	const { id } = await threadsFetchInstance<ThreadsApiResponse>(
		`${userId}/threads?media_type=text&text=${postContent}${shouldQuotePost && typeof postQuoteId !== "undefined" ? `&quote_post_id=${postQuoteId}` : ""}`,
		{ method: "POST" },
	);
	return {
		id,
	};
}

export async function publishThreadsMediaContainer({
	userId,
	mediaContainerId,
}: { userId: string; mediaContainerId: string }) {
	const { id } = await threadsFetchInstance<ThreadsApiResponse>(
		`${userId}/threads_publish?creation_id=${mediaContainerId}`,
		{
			method: "POST",
		},
	);

	return {
		id,
	};
}

export async function sendThreadsPost({
	alertsToBePosted,
	alertsToBeCached,
	lastUpdatedTimestamp,
}: SendThreadsPostParams) {
	await writeDataToCloudflareKV({
		timestamp: lastUpdatedTimestamp,
		alerts: JSON.stringify(alertsToBeCached),
	});

	try {
		for (const alert of alertsToBePosted) {
			const data = await findTransitAlertById(alert.id);
			const postQuoteId = data?.result[0]?.results[0]?.threads_post_id;
			console.log(
				"quoted post id",
				postQuoteId,
				"should quote post",
				data?.result[0]?.results?.length !== 0,
			);
			const { id } = await createThreadsMediaContainer({
				userId: env.THREADS_USER_ID,
				postContent: encodeURIComponent(`
				${alert.headerText}
			   `),
				shouldQuotePost: data?.result[0]?.results?.length !== 0,
				postQuoteId,
			});

			const { id: threadsMediaId } = await publishThreadsMediaContainer({
				userId: env.THREADS_USER_ID,
				mediaContainerId: id,
			});

			if (data?.result[0]?.results?.length === 0) {
				// this isn't an id that exists in the database already, we need to add it
				await insertIds({
					alert_id: +alert.id,
					threads_post_id: threadsMediaId,
				});
			}

			await wait.for({ seconds: 60 });
		}
		console.log(
			`${alertsToBePosted.length} new threads post created on: ${new Date().toISOString()}`,
		);
	} catch (error) {
		console.error(error);
	}
}
