import * as v from "valibot";

export const RouteSchema = v.object({
	id: v.string(),
	priority: v.number(),
	alertType: v.union([v.literal("SideWide"), v.literal("Planned")]),
	lastUpdated: v.string(),
	activePeriod: v.object({
		start: v.string(),
		end: v.string(),
	}),
	activePeriodGroup: v.array(v.string()),
	routeOrder: v.number(),
	route: v.string(),
	routeBranch: v.string(),
	routeTypeSrc: v.string(),
	routeType: v.union([
		v.literal("Bus"),
		v.literal("Subway"),
		v.literal("Elevator"),
		v.literal("Streetcar"),
	]),
	stopStart: v.union([v.string(), v.null()]),
	stopEnd: v.union([v.string(), v.null()]),
	title: v.string(),
	description: v.string(),
	url: v.string(),
	urlPlaceholder: v.string(),
	accessibility: v.string(),
	effect: v.union([
		v.literal("NO_SERVICE"),
		v.literal("DETOUR"),
		v.literal("SIGNIFICANT_DELAYS"),
	]),
	effectDesc: v.string(),
	severityOrder: v.number(),
	severity: v.string(),
	customHeaderText: v.string(),
	headerText: v.string(),
});

export type Route = v.InferInput<typeof RouteSchema>;

export interface CloudflareKVResponse {
	errors: {
		code: number;
		message: string;
	}[];
	messages: {
		code: number;
		message: string;
	}[];
	success: boolean;
	result: {
		expiration: number;
		metadata: Record<string, string>;
		name: string;
	}[];
	result_info: {
		count: number;
		cursor: string;
	};
}

export interface SendThreadsPostParams {
	alertsToBePosted: Route[];
	alertsToBeCached: Route[];
	lastUpdatedTimestamp: string;
}

export interface TTCApiResponse {
	total: number;
	lastUpdated: string;
	routes: Route[];
	accessibility: Route[];
}

export interface ThreadsApiResponse {
	id: string;
	error: {
		message: string;
		type: string;
		code: number;
		fbtrace_id: string;
	};
}
