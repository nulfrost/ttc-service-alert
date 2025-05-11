import { ofetch } from 'ofetch';
import { getValueByKey } from '~/cloudflare';
import type { CloudflareKVResponse, Route, TTCApiResponse } from '~/types';

export function stringify<T>(data: T) {
	return JSON.stringify(data);
}

// Note: Assumes the input string correctly parses to Route[]
export function destringify(data: string): Route[] {
	return JSON.parse(data);
}

// Use ofetch for consistency and automatic JSON parsing
export async function fetchTTCAlerts(): Promise<TTCApiResponse> {
	return ofetch<TTCApiResponse>('https://alerts.ttc.ca/api/alerts/live-alerts');
}

// Filters only for planned alerts
export function filterPlannedAlerts(routes: Route[]) {
	return routes.filter((route) => route.alertType === 'Planned');
}

export function sortAlertsByTimestamp(routes: Route[]) {
	return routes.sort((a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());
}

/**
 * Gets the most recent cached alert data from Cloudflare KV.
 * Assumes KV keys are named using a sortable format (like ISO timestamps)
 * such that the lexicographically last key corresponds to the most recent data.
 */
export async function getMostRecentCachedAlert({ alerts }: { alerts: CloudflareKVResponse }) {
	const lastCachedAlertKey = alerts.result[alerts.result.length - 1].name;
	const lastCachedAlertData = await getValueByKey(lastCachedAlertKey);
	return {
		lastCachedAlertKey,
		lastCachedAlertData,
	};
}
