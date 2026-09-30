import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, watch } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import streamDeck from "@elgato/streamdeck";

import { parseHandyProcesses, readSelectedModel, withSelectedModel } from "./key-state.ts";
import type { HandyModel } from "./types.ts";

const run = promisify(execFile);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BUNDLE_ID = "com.pais.handy";
const SETTINGS_DIR = path.join(os.homedir(), "Library", "Application Support", BUNDLE_ID);
const SETTINGS_FILE = "settings_store.json";

/**
 * Tracks Handy's selected model and downloaded models, and switches models.
 *
 * Handy has no command for switching the model of a running instance, so a switch quits Handy, sets
 * `selected_model` in its settings file, and opens it again. The selected model is read from the same file,
 * which is watched, so a switch made inside Handy shows up on the keys too.
 */
class Handy extends EventEmitter<{ change: [] }> {
	/** Handy's `selected_model`; undefined when the settings file can't be read. */
	selected: string | undefined;
	/** Downloaded models; undefined until Handy has listed them. */
	models: HandyModel[] | undefined;
	/** The model a switch is in progress to. */
	switchingTo: string | undefined;
	#bundle: string | undefined;
	/** Serializes model listing and switching, so `--list-models` never runs while settings are being rewritten. */
	#queue: Promise<unknown> = Promise.resolve();

	async start(): Promise<void> {
		await this.#readSelected();
		this.#watchSettings();
		await this.refreshModels().catch((err) => streamDeck.logger.error("Failed to list Handy models", err));
	}

	/** Asks Handy for its models (`handy --list-models --json`) and keeps the downloaded ones. */
	refreshModels(): Promise<HandyModel[]> {
		return this.#serialize(async () => {
			const binary = path.join(await this.#locate(), "Contents", "MacOS", "handy");
			const { stdout } = await run(binary, ["--list-models", "--json"], { maxBuffer: 16 * 1024 * 1024 });
			const models = (JSON.parse(stdout) as HandyModel[]).filter((m) => m.is_downloaded);
			if (JSON.stringify(models) !== JSON.stringify(this.models)) {
				this.models = models;
				streamDeck.logger.info(`Downloaded models: ${models.map((m) => m.id).join(", ")}`);
				this.emit("change");
			}
			return models;
		});
	}

	/** Makes `modelId` Handy's selected model by restarting Handy with it. */
	selectModel(modelId: string): Promise<void> {
		return this.#serialize(async () => {
			this.switchingTo = modelId;
			this.emit("change");
			try {
				const running = await findRunning();
				const bundle = running[0]?.bundle ?? (await this.#locate());
				streamDeck.logger.info(
					`Switching Handy to ${modelId} (running: ${running.map((p) => p.pid).join(", ") || "no"})`,
				);
				for (const { pid } of running) await stop(pid);
				try {
					await writeSelected(modelId);
				} finally {
					await launch(bundle); // even if the write failed, so Handy isn't left closed
				}
			} finally {
				this.switchingTo = undefined;
				await this.#readSelected();
				this.emit("change");
			}
		});
	}

	/** Opens Handy if it isn't running. */
	ensureRunning(): Promise<void> {
		return this.#serialize(async () => {
			if ((await findRunning()).length === 0) await launch(await this.#locate());
		});
	}

	#serialize<T>(task: () => Promise<T>): Promise<T> {
		const result = this.#queue.then(task);
		this.#queue = result.catch(() => {});
		return result;
	}

	/** Finds Handy.app: the running copy, the usual install locations, then Spotlight. */
	async #locate(): Promise<string> {
		if (this.#bundle && existsSync(this.#bundle)) return this.#bundle;
		const running = (await findRunning())[0]?.bundle;
		const candidates = [running, "/Applications/Handy.app", path.join(os.homedir(), "Applications", "Handy.app")];
		let bundle = candidates.find((c) => c && existsSync(c));
		if (!bundle) {
			const { stdout } = await run("mdfind", [`kMDItemCFBundleIdentifier == '${BUNDLE_ID}'`]).catch(() => ({
				stdout: "",
			}));
			bundle = stdout.split("\n").find((line) => line.endsWith(".app"));
		}
		if (!bundle) throw new Error("Handy.app not found");
		this.#bundle = bundle;
		return bundle;
	}

	async #readSelected(): Promise<void> {
		let selected: string | undefined;
		try {
			selected = readSelectedModel(await readFile(path.join(SETTINGS_DIR, SETTINGS_FILE), "utf8"));
		} catch (err) {
			// Handy may be halfway through writing the file; the watcher fires again once it's done.
			streamDeck.logger.warn("Couldn't read Handy's settings", err);
			return;
		}
		if (selected === this.selected) return;
		streamDeck.logger.info(`Handy's selected model: ${selected}`);
		this.selected = selected;
		this.emit("change");
		// A model picked in Handy right after downloading it isn't in the list yet.
		if (selected && this.models && !this.models.some((m) => m.id === selected)) {
			this.refreshModels().catch((err) => streamDeck.logger.error("Failed to list Handy models", err));
		}
	}

	#watchSettings(): void {
		let timer: NodeJS.Timeout | undefined;
		try {
			watch(SETTINGS_DIR, (_event, filename) => {
				if (filename && filename !== SETTINGS_FILE) return;
				clearTimeout(timer);
				timer = setTimeout(() => void this.#readSelected(), 150);
			});
		} catch (err) {
			streamDeck.logger.error(`Can't watch ${SETTINGS_DIR}; has Handy been run yet?`, err);
		}
	}
}

async function findRunning() {
	const { stdout } = await run("ps", ["-axww", "-o", "pid=,args="], { maxBuffer: 16 * 1024 * 1024 });
	return parseHandyProcesses(stdout);
}

const isAlive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
	for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await sleep(100)) {
		if (await condition()) return true;
	}
	return condition();
}

/**
 * Quits Handy with SIGTERM, then SIGKILL if it's still around after 5 s.
 *
 * A signal needs no macOS permission, unlike asking the app to quit through Apple Events. Handy saves settings as
 * they change, so there's nothing left to save.
 */
async function stop(pid: number): Promise<void> {
	process.kill(pid, "SIGTERM");
	if (await waitFor(() => !isAlive(pid), 5000)) return;
	streamDeck.logger.warn(`Handy (${pid}) ignored SIGTERM; sending SIGKILL`);
	process.kill(pid, "SIGKILL");
	if (!(await waitFor(() => !isAlive(pid), 2000))) throw new Error(`Handy (${pid}) didn't quit`);
}

/** Sets `selected_model` in Handy's settings file, replacing the file atomically. */
async function writeSelected(modelId: string): Promise<void> {
	const file = path.join(SETTINGS_DIR, SETTINGS_FILE);
	const next = withSelectedModel(await readFile(file, "utf8"), modelId);
	const temp = `${file}.${process.pid}.tmp`;
	await writeFile(temp, next);
	await rename(temp, file);
}

/**
 * Opens Handy in the background and waits for it to start.
 *
 * It goes through `open` (Launch Services) rather than running the binary, so macOS treats Handy as its own app
 * for microphone and accessibility permissions, not as part of Stream Deck.
 */
async function launch(bundle: string): Promise<void> {
	await run("open", ["-g", "-a", bundle, "--args", "--start-hidden"]);
	if (!(await waitFor(async () => (await findRunning()).length > 0, 15000))) throw new Error("Handy didn't start");
}

export const handy = new Handy();
