import { getValueByKey } from '~/cloudflare';
import type { CloudflareKVResponse, Route, TTCApiResponse } from '~/types';

export function stringify<T>(data: T) {
	return JSON.stringify(data);
}

export function destringify(data: string) {
	return JSON.parse(data) as Route[];
}

export async function fetchTTCAlerts(): Promise<TTCApiResponse> {
	const response = await fetch('https://alerts.ttc.ca/api/alerts/live-alerts');
	return response.json();
}

export function filterAlertsByAlertType(routes: Route[]) {
	return routes.filter((route) => route.alertType === 'Planned');
}

export function sortAlertsByTimestamp(routes: Route[]) {
	return routes.sort((a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());
}

export async function getMostRecentCachedAlert({ alerts }: { alerts: CloudflareKVResponse }) {
	const lastCachedAlertKey = alerts.result[alerts.result.length - 1].name;
	const lastCachedAlertData = await getValueByKey(lastCachedAlertKey);
	return {
		lastCachedAlertKey,
		lastCachedAlertData,
	};
}
