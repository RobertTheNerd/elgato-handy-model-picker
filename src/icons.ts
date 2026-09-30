// Key images, rendered as SVG data URLs so they can be tinted per state.
import type { KeyState } from "./key-state.ts";

const PINK = "#f472b6";
const GREY = "#6b6b6b";

/** A speech waveform, drawn in the top part of a 144×144 key so the title fits underneath. */
const HEIGHTS = [22, 48, 34, 76, 52, 62, 26];
const bars = (cy = 54, width = 9) => {
	const left = (144 - (HEIGHTS.length - 1) * 15 - width) / 2;
	return HEIGHTS.map(
		(h, i) => `<rect x="${left + i * 15}" y="${cy - h / 2}" width="${width}" height="${h}" rx="${width / 2}"/>`,
	).join("");
};

const key = (color: string, background: string, extra = "", opacity = 1) => `
<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${background}"/>
  <g fill="${color}" opacity="${opacity}">${bars()}</g>
  ${extra}
</svg>`;

const slash = `<path d="M26 14L118 94" stroke="${GREY}" stroke-width="8" stroke-linecap="round"/>`;
/** A dashed pink frame: "working on it", clear of the title at the bottom. */
const dashed = `<rect x="5" y="5" width="134" height="134" rx="14" fill="none" stroke="${PINK}" stroke-width="6" stroke-dasharray="16 10"/>`;

/** Raw SVG markup per key state (also used by `scripts/render-images.ts` for the docs and manifest images). */
export const KEY_SVGS: Record<KeyState, string> = {
	active: key(PINK, "#2e0f20"),
	inactive: key(GREY, "#1b1b1b"),
	switching: key(PINK, "#1b1b1b", dashed, 0.45),
	missing: key(GREY, "#1b1b1b", slash),
};

/** Monochrome waveform for the action list and category icons. */
export const glyph = (size: number, color = "#ffffff") => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 144 144">
  <g fill="${color}">${bars(72, 11)}</g>
</svg>`;

/** Plugin icon: white waveform on a pink rounded square. */
export const pluginIcon = () => `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="32" fill="${PINK}"/>
  <g fill="#ffffff">${bars(72)}</g>
</svg>`;

const toUrl = (svg: string) => `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;

export const KEY_IMAGES = Object.fromEntries(
	Object.entries(KEY_SVGS).map(([state, svg]) => [state, toUrl(svg)]),
) as Record<KeyState, string>;
