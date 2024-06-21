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
	routeType: z.union([z.literal('Bus'), z.literal('Subway'), z.literal('Elevator'), z.literal('Streetcar')]),
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

type ThreadsErrorResponse = {
	error: {
		message: string;
		type: string;
		code: number;
		fbtrace_id: string;
	};
};

export function filterAlertsByAlertType(routes: Route[]) {
	return routes.filter((route) => route.alertType === 'Planned');
}

export function sortAlertsByTimestamp(routes: Route[]) {
	return routes.sort((a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());
}

export function generateOutageTag(routeType: Route['routeType']) {
	switch (routeType) {
		case 'Bus':
			return '🚌 [BUS ALERT]\n';
		case 'Streetcar':
			return '🚋 [STREETCAR ALERT]\n';
		case 'Subway':
			return '🚊 [SUBWAY ALERT]\n';
		case 'Elevator':
			return '♿️ [ACCESSIBILITY ALERT]\n';
	}
}

export async function fetchTTCAlerts(): Promise<TTCApiResponse> {
	const response = await fetch('https://alerts.ttc.ca/api/alerts/live-alerts');
	return response.json();
}

export async function createThreadsMediaContainer({
	userId,
	accessToken,
	postContent,
}: {
	userId: string;
	accessToken: string;
	postContent: string;
}) {
	const response = await fetch(
		`https://graph.threads.net/v1.0/${userId}/threads?media_type=text&text=${postContent}&access_token=${accessToken}`,
		{
			method: 'POST',
		}
	);

	const { id, error }: { id: string; error: { message: string; type: string; code: number; fbtrace_id: string } } = await response.json();

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
}) {
	const response = await fetch(
		`https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${mediaContainerId}&access_token=${accessToken}`,
		{
			method: 'POST',
		}
	);

	const { error }: ThreadsErrorResponse = await response.json();
	return {
		error,
	};
}
