import streamDeck from "@elgato/streamdeck";
import { SelectModel } from "./actions/select-model.ts";
import { handy } from "./handy.ts";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new SelectModel());
await streamDeck.connect();
await handy.start();
