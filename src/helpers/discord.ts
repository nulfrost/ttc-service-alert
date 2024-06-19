export async function reportErrorWebhook({ webhookId, webhookToken }: { webhookId: string; webhookToken: string }) {
	const response = await fetch(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}`, {
		method: 'POST',
		body: JSON.stringify({
			embeds: [
				{
					title: 'ERROR: Failed to create media container',
					description: 'the error message',
					timestamp: '2024-06-19T15:40:10.94Z',
					fields: [
						{
							name: 'Container ID',
							value: '1234',
						},
					],
				},
			],
		}),
	});

	console.log(response);

	const data = await response.json();
	console.log(data);
}
