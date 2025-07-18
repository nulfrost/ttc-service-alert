import { wait, logger } from "@trigger.dev/sdk/v3";
import { ofetch } from "ofetch";
import {
	findTransitAlertById,
	insertIds,
	writeDataToCloudflareKV,
} from "~/cloudflare";
import { env } from "~/config";
import type { SendThreadsPostParams, ThreadsApiResponse } from "~/types";
import { reportErrorToDiscord } from "./webhooks";

const threadsFetchInstance = ofetch.create({
	baseURL: "https://graph.threads.net/v1.0/",
	async onRequest({ options }) {
		console.log("[threads api request]", options.query);
		options.query = options.query || {};
		options.query.access_token = env.THREADS_ACCESS_TOKEN;
	},
	async onResponse({ response }) {
		if (response._data?.error?.message) {
			logger.error(
				`[threads api error]: there was an error while publishing to threads -> ID: ${response._data.id} <> ${response._data?.error?.message}`,
			);
			throw new Error(`Threads API error: ${response._data?.error?.message}`);
		}
	},
	responseType: "json",
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
	try {
		logger.info("creating threads media container");
		const { id } = await threadsFetchInstance<ThreadsApiResponse>(
			`${userId}/threads?media_type=text&text=${postContent}${shouldQuotePost && typeof postQuoteId !== "undefined" ? `&quote_post_id=${postQuoteId}` : ""}`,
			{ method: "POST" },
		);
		return { id };
	} catch (error) {
		logger.error("Error creating threads media container:", { error });
		await reportErrorToDiscord({ title: 'could not created threads media container', context: JSON.stringify({ userId, postContent, shouldQuotePost, postQuoteId }) })
		throw error;
	}
}

export async function publishThreadsMediaContainer({
	userId,
	mediaContainerId,
}: { userId: string; mediaContainerId: string }) {
	try {
		logger.info("publishing threads media container");
		const { id } = await threadsFetchInstance<ThreadsApiResponse>(
			`${userId}/threads_publish?creation_id=${mediaContainerId}`,
			{
				method: "POST",
			},
		);

		return { id };
	} catch (error) {
		logger.error("Error publishing threads media container:", { error });
		await reportErrorToDiscord({ title: 'could not publish threads media container', context: JSON.stringify({ userId, mediaContainerId }) })
		throw error;
	}
}

export async function sendThreadsPost({
	alertsToBePosted,
	alertsToBeCached,
	lastUpdatedTimestamp,
}: SendThreadsPostParams) {
	try {
		// Cache the alerts in Cloudflare KV
		await writeDataToCloudflareKV({
			timestamp: lastUpdatedTimestamp,
			alerts: JSON.stringify(alertsToBeCached),
		});

		// Process each alert
		for (const alert of alertsToBePosted) {
			try {
				// Validate alert content before posting
				if (!alert || typeof alert !== "object") {
					logger.error("Invalid alert object:", { error: alert });
					continue;
				}

				if (
					!alert.headerText ||
					typeof alert.headerText !== "string" ||
					alert.headerText.trim() === ""
				) {
					logger.error(
						`Skipping alert ${alert.id}: Invalid or empty headerText`,
					);
					continue;
				}

				// Check if this alert has already been posted
				const data = await findTransitAlertById(alert.id);
				const postQuoteId = data?.result[0]?.results[0]?.threads_post_id;

				// Create the media container for the post
				const { id } = await createThreadsMediaContainer({
					userId: env.THREADS_USER_ID,
					postContent: encodeURIComponent(alert.headerText.trim()),
					shouldQuotePost: data?.result[0]?.results?.length !== 0,
					postQuoteId,
				});

				// Publish the post
				const { id: threadsMediaId } = await publishThreadsMediaContainer({
					userId: env.THREADS_USER_ID,
					mediaContainerId: id,
				});

				// If this is a new alert, store the mapping
				if (data?.result[0]?.results?.length === 0) {
					await insertIds({
						alert_id: +alert.id,
						threads_post_id: threadsMediaId,
					});
				}

				console.log(`Created threads post ${threadsMediaId}`);

				// Wait between posts to avoid rate limiting
				await wait.for({ seconds: 60 });
			} catch (error) {
				logger.error(`Error processing alert ${alert.id}:`, { error });
				// Continue with next alert even if one fails
			}
		}

		logger.info(
			`${alertsToBePosted.length} new threads posts created on: ${new Date().toISOString()}`,
		);
	} catch (error) {
		logger.error("Error in sendThreadsPost:", { error });
		await reportErrorToDiscord({ title: 'failure in sendThreadsPost', context: JSON.stringify({ lastUpdatedTimestamp, alertsToBePosted, alertsToBeCached }) })
		throw error;
	}
}
