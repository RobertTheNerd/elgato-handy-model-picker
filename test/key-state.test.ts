import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type KeyContext,
	keyState,
	parseHandyProcesses,
	readSelectedModel,
	withSelectedModel,
	wrapTitle,
} from "../src/key-state.ts";
import type { HandyModel } from "../src/types.ts";

const model = (id: string, name: string): HandyModel => ({
	id,
	name,
	description: "",
	size_mb: 1,
	is_downloaded: true,
});
const qwen17 = model("handy-computer/Qwen3-ASR-1.7B-gguf/Qwen3-ASR-1.7B-Q5_K_M.gguf", "Qwen3-ASR 1.7B");
const parakeet = model("parakeet-tdt-0.6b-v3", "Parakeet V3");

const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({
	selected: qwen17.id,
	models: [qwen17, parakeet],
	switchingTo: undefined,
	...over,
});

describe("keyState", () => {
	it("is missing when the key has no model", () => {
		assert.equal(keyState(undefined, ctx()), "missing");
	});

	it("is active for Handy's selected model", () => {
		assert.equal(keyState(qwen17.id, ctx()), "active");
	});

	it("is inactive for another downloaded model", () => {
		assert.equal(keyState(parakeet.id, ctx()), "inactive");
	});

	it("is missing for a model that isn't downloaded", () => {
		assert.equal(keyState("whisper-small", ctx()), "missing");
	});

	it("doesn't call a model missing before the list has loaded", () => {
		assert.equal(keyState("whisper-small", ctx({ models: undefined })), "inactive");
	});

	it("shows the switch target as switching, even once settings already name it", () => {
		assert.equal(keyState(parakeet.id, ctx({ switchingTo: parakeet.id })), "switching");
		assert.equal(keyState(parakeet.id, ctx({ selected: parakeet.id, switchingTo: parakeet.id })), "switching");
	});
});

describe("wrapTitle", () => {
	it("breaks model names into short lines", () => {
		assert.equal(wrapTitle("Qwen3-ASR 1.7B"), "Qwen3-ASR\n1.7B");
		assert.equal(wrapTitle("Parakeet V3"), "Parakeet\nV3");
		assert.equal(wrapTitle("SenseVoice Small"), "SenseVoice\nSmall");
	});

	it("keeps short names on one line", () => {
		assert.equal(wrapTitle("Whisper"), "Whisper");
	});
});

describe("selected_model in settings_store.json", () => {
	// Shaped like Handy's file: pretty-printed by serde_json, with floats like 1.0 that JSON.stringify would turn into 1.
	const file = `{
  "settings": {
    "audio_feedback_volume": 1.0,
    "post_process_models": {
      "openai": ""
    },
    "selected_language": "auto",
    "selected_model": "${qwen17.id}",
    "word_correction_threshold": 0.18
  }
}`;

	it("reads the selected model", () => {
		assert.equal(readSelectedModel(file), qwen17.id);
	});

	it("replaces only the selected model", () => {
		const next = withSelectedModel(file, parakeet.id);
		assert.equal(readSelectedModel(next), parakeet.id);
		assert.equal(next, file.replace(qwen17.id, parakeet.id));
	});

	it("escapes model ids", () => {
		assert.equal(readSelectedModel(withSelectedModel(file, 'odd "id"\\x')), 'odd "id"\\x');
	});

	it("refuses a file without exactly one selected_model", () => {
		assert.throws(() => withSelectedModel(`{"settings":{}}`, parakeet.id), /found 0/);
		assert.throws(
			() => withSelectedModel(`{"settings":{"selected_model":"a"},"x":{"selected_model":"b"}}`, parakeet.id),
			/found 2/,
		);
	});

	it("refuses a selected_model that isn't under settings", () => {
		assert.throws(() => withSelectedModel(`{"other":{"selected_model":"a"}}`, parakeet.id), /isn't under settings/);
	});
});

describe("parseHandyProcesses", () => {
	const ps = [
		"  92688 /Applications/Handy.app/Contents/MacOS/handy",
		"  92700 /Applications/Handy.app/Contents/MacOS/handy --start-hidden",
		"  92701 /Applications/Handy.app/Contents/MacOS/handy --list-models --json",
		"  92702 /Users/me/Apps/Handy Beta.app/Contents/MacOS/handy -f /tmp/a.wav",
		"  92703 /Users/me/Apps/Handy Beta.app/Contents/MacOS/handy",
		"  92704 /bin/zsh -c open -a /Applications/Handy.app",
		"  92705 grep handy",
	].join("\n");

	it("finds the app, including bundles with spaces, and skips headless runs", () => {
		assert.deepEqual(parseHandyProcesses(ps), [
			{ pid: 92688, bundle: "/Applications/Handy.app" },
			{ pid: 92700, bundle: "/Applications/Handy.app" },
			{ pid: 92703, bundle: "/Users/me/Apps/Handy Beta.app" },
		]);
	});
});
