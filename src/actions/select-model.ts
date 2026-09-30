import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type PropertyInspectorDidAppearEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { handy } from "../handy.ts";
import { KEY_IMAGES } from "../icons.ts";
import { keyState, wrapTitle } from "../key-state.ts";

type Settings = {
	/** Handy model id, as in `settings.selected_model`. */
	modelId?: string;
	/** Last known model name, so the key still has a label if Handy can't list its models. */
	name?: string;
	/** Don't show the model name as the key title. */
	hideName?: boolean;
};

@action({ UUID: "com.robert.handy-model-picker.select" })
export class SelectModel extends SingletonAction<Settings> {
	constructor() {
		super();
		handy.on("change", () => {
			this.#renderAll();
			void this.#sendModelList();
		});
	}

	override onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> | void {
		if (ev.action.isKey()) return this.#render(ev.action, ev.payload.settings);
	}

	/** Fires when the user changes something in the property inspector. */
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> | void {
		if (ev.action.isKey()) return this.#render(ev.action, ev.payload.settings);
	}

	/** Picks up models downloaded or deleted in Handy since the list was last read. */
	override onPropertyInspectorDidAppear(_ev: PropertyInspectorDidAppearEvent<Settings>): void {
		handy.refreshModels().catch((err) => streamDeck.logger.error("Failed to list Handy models", err));
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const { modelId } = ev.payload.settings;
		streamDeck.logger.info(`Key pressed: ${modelId ?? "(unconfigured)"}`);
		if (!modelId || handy.switchingTo) return ev.action.showAlert();
		try {
			if (modelId === handy.selected) {
				await handy.ensureRunning();
			} else {
				const models = handy.models?.some((m) => m.id === modelId) ? handy.models : await handy.refreshModels();
				if (!models.some((m) => m.id === modelId)) {
					streamDeck.logger.warn(`${modelId} isn't downloaded in Handy`);
					return ev.action.showAlert();
				}
				await handy.selectModel(modelId);
			}
			await ev.action.showOk();
		} catch (err) {
			streamDeck.logger.error(`Failed to switch Handy to ${modelId}`, err);
			await ev.action.showAlert();
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event !== "getModels") return;
		await handy.refreshModels().catch((err) => streamDeck.logger.error("Failed to list Handy models", err));
		await this.#sendModelList();
	}

	/** Responds to the property inspector's `<sdpi-select datasource="getModels">`. */
	#sendModelList(): Promise<void> {
		return streamDeck.ui.sendToPropertyInspector({
			event: "getModels",
			items: (handy.models ?? []).map((m) => ({ label: m.name, value: m.id })),
		});
	}

	#renderAll(): void {
		for (const a of this.actions) if (a.isKey()) void this.#render(a);
	}

	async #render(a: KeyAction<Settings>, settings?: Settings): Promise<void> {
		settings ??= await a.getSettings();
		const { modelId } = settings;
		const name = handy.models?.find((m) => m.id === modelId)?.name;
		if (name && name !== settings.name) {
			settings = { ...settings, name };
			await a.setSettings(settings);
		}
		await a.setImage(KEY_IMAGES[keyState(settings.modelId, handy)]);
		await a.setTitle(settings.hideName ? "" : wrapTitle(settings.name ?? (settings.modelId ? "?" : "Pick model")));
	}
}
