type DiscordErrorReport = {
	title: string;
	description: string;
	timestamp: Date;
	fields: { name: string; value: string }[];
};

export function reportErrorToDiscord({ title, description, timestamp, fields }: DiscordErrorReport) {
	// todo
}
