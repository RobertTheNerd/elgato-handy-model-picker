// Writes the plugin's static images and the key images used in the README from src/icons.ts, so they always match.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { KEY_SVGS, glyph, pluginIcon } from "../src/icons.ts";

const write = (url: URL, svg: string) => {
	mkdirSync(new URL(".", url), { recursive: true });
	writeFileSync(url, `${svg.trim()}\n`);
	console.log(url.pathname);
};

const docs = new URL("../docs/images/", import.meta.url);
for (const [state, svg] of Object.entries(KEY_SVGS)) write(new URL(`key-${state}.svg`, docs), svg);

const imgs = new URL("../com.robert.handy-model-picker.sdPlugin/imgs/", import.meta.url);
write(new URL("key.svg", imgs), KEY_SVGS.inactive);
write(new URL("action.svg", imgs), glyph(20));
write(new URL("category.svg", imgs), glyph(28));

// The plugin icon must be a PNG; render it with librsvg (`brew install librsvg`).
const icon = new URL("plugin.svg", docs);
write(icon, pluginIcon());
for (const [file, size] of [
	["plugin.png", 256],
	["plugin@2x.png", 512],
] as const) {
	execFileSync("rsvg-convert", ["-w", `${size}`, "-h", `${size}`, "-o", new URL(file, imgs).pathname, icon.pathname]);
	console.log(new URL(file, imgs).pathname);
}
