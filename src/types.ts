/** The fields this plugin uses from one entry of `handy --list-models --json`. */
export type HandyModel = {
	/** Handy's model id, as stored in `settings.selected_model`. */
	id: string;
	name: string;
	description: string;
	size_mb: number;
	is_downloaded: boolean;
};
