import type { HandyModel } from "./types.ts";

/** What a key should look like. */
export type KeyState =
	/** Not configured, or the model isn't downloaded in Handy. */
	| "missing"
	/** Downloaded, but not Handy's selected model. */
	| "inactive"
	/** Handy's selected model. */
	| "active"
	/** Handy is restarting to switch to this model. */
	| "switching";

export type KeyContext = {
	/** Handy's `selected_model`, or undefined when its settings can't be read. */
	selected: string | undefined;
	/** Downloaded models; undefined until Handy has listed them. */
	models: HandyModel[] | undefined;
	/** The model a switch is in progress to. */
	switchingTo: string | undefined;
};

export function keyState(modelId: string | undefined, ctx: KeyContext): KeyState {
	if (!modelId) return "missing";
	if (modelId === ctx.switchingTo) return "switching";
	if (modelId === ctx.selected) return "active";
	// Before the model list has loaded, assume a configured key is still valid rather than flashing "missing".
	if (ctx.models && !ctx.models.some((m) => m.id === modelId)) return "missing";
	return "inactive";
}

/** Key titles don't wrap on their own; break long model names onto up to three short lines. */
export function wrapTitle(text: string, width = 10): string {
	const lines: string[] = [];
	for (const word of text.trim().split(/\s+/)) {
		const last = lines.at(-1);
		if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`;
		else lines.push(word);
	}
	return lines.slice(0, 3).join("\n");
}

const SELECTED_MODEL = /("selected_model"\s*:\s*)"(?:[^"\\]|\\.)*"/g;

/** Reads `settings.selected_model` from the contents of Handy's `settings_store.json`. */
export function readSelectedModel(text: string): string | undefined {
	const model = (JSON.parse(text) as { settings?: { selected_model?: unknown } }).settings?.selected_model;
	return typeof model === "string" ? model : undefined;
}

/**
 * Returns `settings_store.json` contents with `settings.selected_model` set to `modelId`.
 *
 * Only that one value is replaced, so the rest of the file stays byte-for-byte as Handy wrote it. Re-serializing
 * would change things like `1.0` to `1`. Throws if the file doesn't have exactly one `selected_model`.
 */
export function withSelectedModel(text: string, modelId: string): string {
	const matches = text.match(SELECTED_MODEL) ?? [];
	if (matches.length !== 1) throw new Error(`Expected one selected_model in Handy's settings, found ${matches.length}`);
	const next = text.replace(SELECTED_MODEL, (_, key: string) => `${key}${JSON.stringify(modelId)}`);
	if (readSelectedModel(next) !== modelId) throw new Error("selected_model isn't under settings in Handy's settings");
	return next;
}

/** Headless one-shot flags: a `handy` process started with one of these isn't the running app. */
const HEADLESS_FLAGS = new Set(["--list-models", "--list-devices", "--transcribe-file", "-f"]);

export type HandyProcess = {
	pid: number;
	/** Path of the `.app` bundle the process runs from. */
	bundle: string;
};

/** Finds the running Handy app in `ps -axww -o pid=,args=` output, skipping headless one-shot runs. */
export function parseHandyProcesses(psOutput: string): HandyProcess[] {
	const found: HandyProcess[] = [];
	for (const line of psOutput.split("\n")) {
		const match = /^\s*(\d+)\s+(.+\.app)\/Contents\/MacOS\/handy(?:\s+(.*))?$/.exec(line);
		if (!match) continue;
		const args = (match[3] ?? "").split(/\s+/);
		if (args.some((a) => HEADLESS_FLAGS.has(a.split("=")[0]!))) continue;
		found.push({ pid: Number(match[1]), bundle: match[2]! });
	}
	return found;
}
