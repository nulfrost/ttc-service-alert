import { z } from 'zod';

const RouteSchema = z.object({
	id: z.string(),
	priority: z.number(),
	alertType: z.union([z.literal('SideWide'), z.literal('Planned')]),
	lastUpdated: z.string(),
	activePeriod: z.object({
		start: z.string(),
		end: z.string(),
	}),
	activePeriodGroup: z.array(z.string()),
	routeOrder: z.number(),
	route: z.string(),
	routeBranch: z.string(),
	routeTypeSrc: z.string(),
	routeType: z.union([z.literal('Bus'), z.literal('Subway'), z.literal('Elevator')]),
	stopStart: z.string(),
	stopEnd: z.string(),
	title: z.string(),
	description: z.string(),
	url: z.string(),
	urlPlaceholder: z.string(),
	accessibilty: z.string(),
	effect: z.union([z.literal('NO_SERVICE'), z.literal('DETOUR'), z.literal('SIGNIFICANT_DELAYS')]),
	effectDesc: z.string(),
	severityOrder: z.number(),
	severity: z.string(),
	customHeaderText: z.string(),
	headerText: z.string(),
});

type Route = z.infer<typeof RouteSchema>;
export type TTCApiResponse = {
	total: number;
	lastUpdated: string;
	routes: Route[];
	accessibility: Route[];
};

export function filterSubwayAndBusAlerts(routes: Route[]) {
	return routes.filter((route) => route.alertType === 'Planned');
}

export async function fetchRecentTTCAlerts(endpoint: string): Promise<TTCApiResponse> {
	const response = await fetch(endpoint);
	return response.json();
}

export async function createThreadsMediaContainer({
	userId,
	accessToken,
}: {
	userId: string;
	accessToken: string;
}): Promise<{ id: string }> {
	const response = await fetch(`https://graph.threads.net/v1.0/${userId}/threads?text=Test%20Post&access_token=${accessToken}`, {
		method: 'POST',
	});
	return response.json();
}

export async function publishThreadsMediaContainer({
	userId,
	mediaContainerId,
	accessToken,
}: {
	userId: string;
	mediaContainerId: string;
	accessToken: string;
}) {
	await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${mediaContainerId}&access_token=${accessToken}`, {
		method: 'POST',
	});
}
