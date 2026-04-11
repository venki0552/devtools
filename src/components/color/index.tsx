import { useCallback, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { Check, X } from "lucide-react";

const tool = TOOLS.find((t) => t.id === "color")!;

interface RGB {
	r: number;
	g: number;
	b: number;
}
interface HSL {
	h: number;
	s: number;
	l: number;
}
interface HSV {
	h: number;
	s: number;
	v: number;
}
interface CMYK {
	c: number;
	m: number;
	y: number;
	k: number;
}
interface LabColor {
	L: number;
	a: number;
	b: number;
}
interface LCHColor {
	L: number;
	C: number;
	H: number;
}
interface OklchColor {
	L: number;
	C: number;
	H: number;
}

// --- Color conversion math ---

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

function rgbToHex(rgb: RGB): string {
	const r = clamp(Math.round(rgb.r), 0, 255);
	const g = clamp(Math.round(rgb.g), 0, 255);
	const b = clamp(Math.round(rgb.b), 0, 255);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function rgbToHsl(rgb: RGB): HSL {
	const r = clamp(rgb.r, 0, 255) / 255;
	const g = clamp(rgb.g, 0, 255) / 255;
	const b = clamp(rgb.b, 0, 255) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}

	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		l: Math.round(l * 100),
	};
}

function hslToRgb(hsl: HSL): RGB {
	const h = hsl.h / 360;
	const s = hsl.s / 100;
	const l = hsl.l / 100;

	if (s === 0) {
		const v = Math.round(l * 255);
		return { r: v, g: v, b: v };
	}

	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};

	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	return {
		r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
		g: Math.round(hue2rgb(p, q, h) * 255),
		b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
	};
}

// --- HSV/HSB conversions ---

function rgbToHsv(rgb: RGB): HSV {
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	const s = max === 0 ? 0 : d / max;
	if (max !== min) {
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}
	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		v: Math.round(max * 100),
	};
}

function hsvToRgb(hsv: HSV): RGB {
	const h = hsv.h / 360;
	const s = hsv.s / 100;
	const v = hsv.v / 100;
	const i = Math.floor(h * 6);
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);
	let r: number, g: number, bl: number;
	switch (i % 6) {
		case 0:
			r = v;
			g = t;
			bl = p;
			break;
		case 1:
			r = q;
			g = v;
			bl = p;
			break;
		case 2:
			r = p;
			g = v;
			bl = t;
			break;
		case 3:
			r = p;
			g = q;
			bl = v;
			break;
		case 4:
			r = t;
			g = p;
			bl = v;
			break;
		default:
			r = v;
			g = p;
			bl = q;
			break;
	}
	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(bl * 255),
	};
}

// --- CMYK conversions ---

function rgbToCmyk(rgb: RGB): CMYK {
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;
	const k = 1 - Math.max(r, g, b);
	if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
	return {
		c: Math.round(((1 - r - k) / (1 - k)) * 100),
		m: Math.round(((1 - g - k) / (1 - k)) * 100),
		y: Math.round(((1 - b - k) / (1 - k)) * 100),
		k: Math.round(k * 100),
	};
}

function cmykToRgb(cmyk: CMYK): RGB {
	const c = cmyk.c / 100;
	const m = cmyk.m / 100;
	const y = cmyk.y / 100;
	const k = cmyk.k / 100;
	return {
		r: Math.round(255 * (1 - c) * (1 - k)),
		g: Math.round(255 * (1 - m) * (1 - k)),
		b: Math.round(255 * (1 - y) * (1 - k)),
	};
}

// --- sRGB linearization ---

function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
	return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// --- XYZ (D65) conversions ---

const D65_X = 0.95047;
const D65_Y = 1.0;
const D65_Z = 1.08883;

function rgbToXyz(rgb: RGB): [number, number, number] {
	const r = srgbToLinear(rgb.r / 255);
	const g = srgbToLinear(rgb.g / 255);
	const b = srgbToLinear(rgb.b / 255);
	return [
		0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
		0.2126729 * r + 0.7151522 * g + 0.072175 * b,
		0.0193339 * r + 0.119192 * g + 0.9503041 * b,
	];
}

function xyzToRgbValues(
	X: number,
	Y: number,
	Z: number,
): [number, number, number] {
	const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
	const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
	const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
	return [linearToSrgb(r) * 255, linearToSrgb(g) * 255, linearToSrgb(b) * 255];
}

// --- Lab conversions ---

function xyzToLab(X: number, Y: number, Z: number): LabColor {
	const epsilon = 216 / 24389;
	const kappa = 24389 / 27;
	const f = (t: number) =>
		t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116;
	const fx = f(X / D65_X);
	const fy = f(Y / D65_Y);
	const fz = f(Z / D65_Z);
	return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labToXyz(lab: LabColor): [number, number, number] {
	const epsilon = 216 / 24389;
	const kappa = 24389 / 27;
	const fy = (lab.L + 16) / 116;
	const fx = lab.a / 500 + fy;
	const fz = fy - lab.b / 200;
	const xr = fx * fx * fx > epsilon ? fx * fx * fx : (116 * fx - 16) / kappa;
	const yr =
		lab.L > kappa * epsilon ? Math.pow((lab.L + 16) / 116, 3) : lab.L / kappa;
	const zr = fz * fz * fz > epsilon ? fz * fz * fz : (116 * fz - 16) / kappa;
	return [xr * D65_X, yr * D65_Y, zr * D65_Z];
}

function rgbToLab(rgb: RGB): LabColor {
	const [x, y, z] = rgbToXyz(rgb);
	return xyzToLab(x, y, z);
}

function labToRgbRaw(lab: LabColor): [number, number, number] {
	const [x, y, z] = labToXyz(lab);
	return xyzToRgbValues(x, y, z);
}

function labToRgb(lab: LabColor): RGB {
	const [r, g, b] = labToRgbRaw(lab);
	return {
		r: clamp(Math.round(r), 0, 255),
		g: clamp(Math.round(g), 0, 255),
		b: clamp(Math.round(b), 0, 255),
	};
}

// --- LCH conversions ---

function labToLch(lab: LabColor): LCHColor {
	const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
	let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
	if (H < 0) H += 360;
	return { L: lab.L, C, H };
}

function lchToLab(lch: LCHColor): LabColor {
	const hRad = (lch.H * Math.PI) / 180;
	return { L: lch.L, a: lch.C * Math.cos(hRad), b: lch.C * Math.sin(hRad) };
}

function rgbToLch(rgb: RGB): LCHColor {
	return labToLch(rgbToLab(rgb));
}

function lchToRgbRaw(lch: LCHColor): [number, number, number] {
	return labToRgbRaw(lchToLab(lch));
}

function lchToRgb(lch: LCHColor): RGB {
	return labToRgb(lchToLab(lch));
}

// --- Oklab / Oklch conversions ---

function rgbToOklab(rgb: RGB): { L: number; a: number; b: number } {
	const r = srgbToLinear(rgb.r / 255);
	const g = srgbToLinear(rgb.g / 255);
	const b = srgbToLinear(rgb.b / 255);
	const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
	const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
	const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
	const l_ = Math.cbrt(l);
	const m_ = Math.cbrt(m);
	const s_ = Math.cbrt(s);
	return {
		L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
		a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
		b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
	};
}

function oklabToRgbRaw(
	okL: number,
	oka: number,
	okb: number,
): [number, number, number] {
	const l_ = okL + 0.3963377774 * oka + 0.2158037573 * okb;
	const m_ = okL - 0.1055613458 * oka - 0.0638541728 * okb;
	const s_ = okL - 0.0894841775 * oka - 1.291485548 * okb;
	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;
	return [
		linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255,
		linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255,
		linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255,
	];
}

function rgbToOklch(rgb: RGB): OklchColor {
	const ok = rgbToOklab(rgb);
	const C = Math.sqrt(ok.a * ok.a + ok.b * ok.b);
	let H = (Math.atan2(ok.b, ok.a) * 180) / Math.PI;
	if (H < 0) H += 360;
	return { L: ok.L, C, H };
}

function oklchToRgbRaw(oklch: OklchColor): [number, number, number] {
	const hRad = (oklch.H * Math.PI) / 180;
	const a = oklch.C * Math.cos(hRad);
	const b = oklch.C * Math.sin(hRad);
	return oklabToRgbRaw(oklch.L, a, b);
}

function oklchToRgb(oklch: OklchColor): RGB {
	const [r, g, b] = oklchToRgbRaw(oklch);
	return {
		r: clamp(Math.round(r), 0, 255),
		g: clamp(Math.round(g), 0, 255),
		b: clamp(Math.round(b), 0, 255),
	};
}

// --- Gamut check ---

function isOutOfSrgbGamut(rawR: number, rawG: number, rawB: number): boolean {
	return (
		rawR < -0.5 ||
		rawR > 255.5 ||
		rawG < -0.5 ||
		rawG > 255.5 ||
		rawB < -0.5 ||
		rawB > 255.5
	);
}

function hexToRgb(hex: string): RGB | null {
	let h = hex.replace(/^#/, "");
	if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
	return {
		r: parseInt(h.slice(0, 2), 16),
		g: parseInt(h.slice(2, 4), 16),
		b: parseInt(h.slice(4, 6), 16),
	};
}

// CSS named colors (common subset)
const NAMED_COLORS: Record<string, string> = {
	aliceblue: "#f0f8ff",
	antiquewhite: "#faebd7",
	aqua: "#00ffff",
	aquamarine: "#7fffd4",
	azure: "#f0ffff",
	beige: "#f5f5dc",
	bisque: "#ffe4c4",
	black: "#000000",
	blanchedalmond: "#ffebcd",
	blue: "#0000ff",
	blueviolet: "#8a2be2",
	brown: "#a52a2a",
	burlywood: "#deb887",
	cadetblue: "#5f9ea0",
	chartreuse: "#7fff00",
	chocolate: "#d2691e",
	coral: "#ff7f50",
	cornflowerblue: "#6495ed",
	cornsilk: "#fff8dc",
	crimson: "#dc143c",
	cyan: "#00ffff",
	darkblue: "#00008b",
	darkcyan: "#008b8b",
	darkgoldenrod: "#b8860b",
	darkgray: "#a9a9a9",
	darkgreen: "#006400",
	darkkhaki: "#bdb76b",
	darkmagenta: "#8b008b",
	darkolivegreen: "#556b2f",
	darkorange: "#ff8c00",
	darkorchid: "#9932cc",
	darkred: "#8b0000",
	darksalmon: "#e9967a",
	darkseagreen: "#8fbc8f",
	darkslateblue: "#483d8b",
	darkslategray: "#2f4f4f",
	darkturquoise: "#00ced1",
	darkviolet: "#9400d3",
	deeppink: "#ff1493",
	deepskyblue: "#00bfff",
	dimgray: "#696969",
	dodgerblue: "#1e90ff",
	firebrick: "#b22222",
	floralwhite: "#fffaf0",
	forestgreen: "#228b22",
	fuchsia: "#ff00ff",
	gainsboro: "#dcdcdc",
	ghostwhite: "#f8f8ff",
	gold: "#ffd700",
	goldenrod: "#daa520",
	gray: "#808080",
	green: "#008000",
	greenyellow: "#adff2f",
	honeydew: "#f0fff0",
	hotpink: "#ff69b4",
	indianred: "#cd5c5c",
	indigo: "#4b0082",
	ivory: "#fffff0",
	khaki: "#f0e68c",
	lavender: "#e6e6fa",
	lavenderblush: "#fff0f5",
	lawngreen: "#7cfc00",
	lemonchiffon: "#fffacd",
	lightblue: "#add8e6",
	lightcoral: "#f08080",
	lightcyan: "#e0ffff",
	lightgoldenrodyellow: "#fafad2",
	lightgray: "#d3d3d3",
	lightgreen: "#90ee90",
	lightpink: "#ffb6c1",
	lightsalmon: "#ffa07a",
	lightseagreen: "#20b2aa",
	lightskyblue: "#87cefa",
	lightslategray: "#778899",
	lightsteelblue: "#b0c4de",
	lightyellow: "#ffffe0",
	lime: "#00ff00",
	limegreen: "#32cd32",
	linen: "#faf0e6",
	magenta: "#ff00ff",
	maroon: "#800000",
	mediumaquamarine: "#66cdaa",
	mediumblue: "#0000cd",
	mediumorchid: "#ba55d3",
	mediumpurple: "#9370db",
	mediumseagreen: "#3cb371",
	mediumslateblue: "#7b68ee",
	mediumspringgreen: "#00fa9a",
	mediumturquoise: "#48d1cc",
	mediumvioletred: "#c71585",
	midnightblue: "#191970",
	mintcream: "#f5fffa",
	mistyrose: "#ffe4e1",
	moccasin: "#ffe4b5",
	navajowhite: "#ffdead",
	navy: "#000080",
	oldlace: "#fdf5e6",
	olive: "#808000",
	olivedrab: "#6b8e23",
	orange: "#ffa500",
	orangered: "#ff4500",
	orchid: "#da70d6",
	palegoldenrod: "#eee8aa",
	palegreen: "#98fb98",
	paleturquoise: "#afeeee",
	palevioletred: "#db7093",
	papayawhip: "#ffefd5",
	peachpuff: "#ffdab9",
	peru: "#cd853f",
	pink: "#ffc0cb",
	plum: "#dda0dd",
	powderblue: "#b0e0e6",
	purple: "#800080",
	rebeccapurple: "#663399",
	red: "#ff0000",
	rosybrown: "#bc8f8f",
	royalblue: "#4169e1",
	saddlebrown: "#8b4513",
	salmon: "#fa8072",
	sandybrown: "#f4a460",
	seagreen: "#2e8b57",
	seashell: "#fff5ee",
	sienna: "#a0522d",
	silver: "#c0c0c0",
	skyblue: "#87ceeb",
	slateblue: "#6a5acd",
	slategray: "#708090",
	snow: "#fffafa",
	springgreen: "#00ff7f",
	steelblue: "#4682b4",
	tan: "#d2b48c",
	teal: "#008080",
	thistle: "#d8bfd8",
	tomato: "#ff6347",
	turquoise: "#40e0d0",
	violet: "#ee82ee",
	wheat: "#f5deb3",
	white: "#ffffff",
	whitesmoke: "#f5f5f5",
	yellow: "#ffff00",
	yellowgreen: "#9acd32",
};

function parseColor(input: string): RGB | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	// Hex
	if (trimmed.startsWith("#")) return hexToRgb(trimmed);

	// rgb() / rgba()
	const rgbMatch = trimmed.match(
		/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i,
	);
	if (rgbMatch) {
		return {
			r: clamp(parseInt(rgbMatch[1]), 0, 255),
			g: clamp(parseInt(rgbMatch[2]), 0, 255),
			b: clamp(parseInt(rgbMatch[3]), 0, 255),
		};
	}

	// hsl() / hsla()
	const hslMatch = trimmed.match(
		/^hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?/i,
	);
	if (hslMatch) {
		return hslToRgb({
			h: clamp(parseInt(hslMatch[1]), 0, 360),
			s: clamp(parseInt(hslMatch[2]), 0, 100),
			l: clamp(parseInt(hslMatch[3]), 0, 100),
		});
	}

	// hsv() / hsb()
	const hsvMatch = trimmed.match(
		/^hs[vb]\(\s*(\d{1,3})\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?/i,
	);
	if (hsvMatch) {
		return hsvToRgb({
			h: clamp(parseInt(hsvMatch[1]), 0, 360),
			s: clamp(parseInt(hsvMatch[2]), 0, 100),
			v: clamp(parseInt(hsvMatch[3]), 0, 100),
		});
	}

	// cmyk()
	const cmykMatch = trimmed.match(
		/^cmyk\(\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?/i,
	);
	if (cmykMatch) {
		return cmykToRgb({
			c: clamp(parseInt(cmykMatch[1]), 0, 100),
			m: clamp(parseInt(cmykMatch[2]), 0, 100),
			y: clamp(parseInt(cmykMatch[3]), 0, 100),
			k: clamp(parseInt(cmykMatch[4]), 0, 100),
		});
	}

	// lab()
	const labMatch = trimmed.match(
		/^lab\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i,
	);
	if (labMatch) {
		return labToRgb({
			L: parseFloat(labMatch[1]),
			a: parseFloat(labMatch[2]),
			b: parseFloat(labMatch[3]),
		});
	}

	// lch()
	const lchMatch = trimmed.match(
		/^lch\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i,
	);
	if (lchMatch) {
		return lchToRgb({
			L: parseFloat(lchMatch[1]),
			C: parseFloat(lchMatch[2]),
			H: parseFloat(lchMatch[3]),
		});
	}

	// oklch()
	const oklchMatch = trimmed.match(
		/^oklch\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i,
	);
	if (oklchMatch) {
		return oklchToRgb({
			L: parseFloat(oklchMatch[1]),
			C: parseFloat(oklchMatch[2]),
			H: parseFloat(oklchMatch[3]),
		});
	}

	// Named color
	const named = NAMED_COLORS[trimmed.toLowerCase()];
	if (named) return hexToRgb(named);

	// Try as bare hex (no #)
	if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmed))
		return hexToRgb(`#${trimmed}`);

	return null;
}

// Contrast ratio calculation (WCAG 2.0)
function relativeLuminance(rgb: RGB): number {
	const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((c) =>
		c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
	);
	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(c1: RGB, c2: RGB): number {
	const l1 = relativeLuminance(c1);
	const l2 = relativeLuminance(c2);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

// Tints & shades
function generateTints(rgb: RGB, count: number): RGB[] {
	return Array.from({ length: count }, (_, i) => {
		const factor = (i + 1) / (count + 1);
		return {
			r: Math.round(rgb.r + (255 - rgb.r) * factor),
			g: Math.round(rgb.g + (255 - rgb.g) * factor),
			b: Math.round(rgb.b + (255 - rgb.b) * factor),
		};
	});
}

function generateShades(rgb: RGB, count: number): RGB[] {
	return Array.from({ length: count }, (_, i) => {
		const factor = (i + 1) / (count + 1);
		return {
			r: Math.round(rgb.r * (1 - factor)),
			g: Math.round(rgb.g * (1 - factor)),
			b: Math.round(rgb.b * (1 - factor)),
		};
	});
}

function checkGamutWarning(input: string): boolean {
	const trimmed = input.trim();
	const labMatch = trimmed.match(
		/^lab\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i,
	);
	if (labMatch) {
		const [r, g, b] = labToRgbRaw({
			L: parseFloat(labMatch[1]),
			a: parseFloat(labMatch[2]),
			b: parseFloat(labMatch[3]),
		});
		return isOutOfSrgbGamut(r, g, b);
	}
	const lchMatch = trimmed.match(
		/^lch\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i,
	);
	if (lchMatch) {
		const [r, g, b] = lchToRgbRaw({
			L: parseFloat(lchMatch[1]),
			C: parseFloat(lchMatch[2]),
			H: parseFloat(lchMatch[3]),
		});
		return isOutOfSrgbGamut(r, g, b);
	}
	const oklchMatch = trimmed.match(
		/^oklch\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i,
	);
	if (oklchMatch) {
		const [r, g, b] = oklchToRgbRaw({
			L: parseFloat(oklchMatch[1]),
			C: parseFloat(oklchMatch[2]),
			H: parseFloat(oklchMatch[3]),
		});
		return isOutOfSrgbGamut(r, g, b);
	}
	return false;
}

function generateHarmonies(hsl: HSL): { name: string; colors: HSL[] }[] {
	return [
		{
			name: "Complementary",
			colors: [hsl, { ...hsl, h: (hsl.h + 180) % 360 }],
		},
		{
			name: "Triadic",
			colors: [
				hsl,
				{ ...hsl, h: (hsl.h + 120) % 360 },
				{ ...hsl, h: (hsl.h + 240) % 360 },
			],
		},
		{
			name: "Tetradic",
			colors: [
				hsl,
				{ ...hsl, h: (hsl.h + 90) % 360 },
				{ ...hsl, h: (hsl.h + 180) % 360 },
				{ ...hsl, h: (hsl.h + 270) % 360 },
			],
		},
		{
			name: "Analogous",
			colors: [
				{ ...hsl, h: (hsl.h - 30 + 360) % 360 },
				hsl,
				{ ...hsl, h: (hsl.h + 30) % 360 },
			],
		},
		{
			name: "Split-complementary",
			colors: [
				hsl,
				{ ...hsl, h: (hsl.h + 150) % 360 },
				{ ...hsl, h: (hsl.h + 210) % 360 },
			],
		},
	];
}

function generateCssVariables(rgb: RGB, tints: RGB[], shades: RGB[]): string {
	const lightest = [...tints].reverse();
	const scale = [...lightest, rgb, ...shades];
	const steps = [100, 200, 300, 400, 500, 600, 700, 800, 900];
	return steps
		.map((step, i) => {
			const idx = Math.round((i / (steps.length - 1)) * (scale.length - 1));
			return `  --color-${step}: ${rgbToHex(scale[idx])};`;
		})
		.join("\n");
}

function generateTailwindConfig(rgb: RGB, tints: RGB[], shades: RGB[]): string {
	const lightest = [...tints].reverse();
	const scale = [...lightest, rgb, ...shades];
	const steps = [100, 200, 300, 400, 500, 600, 700, 800, 900];
	const entries = steps.map((step, i) => {
		const idx = Math.round((i / (steps.length - 1)) * (scale.length - 1));
		return `  ${step}: '${rgbToHex(scale[idx])}'`;
	});
	return `{\n${entries.join(",\n")}\n}`;
}

export function ColorTool() {
	const [input, setInput] = useLocalStorage("devtools-color-input", "#3b82f6");
	const [history, setHistory] = useLocalStorage<string[]>(
		"devtools-color-history",
		[],
	);

	const debouncedInput = useDebounce(input, 200);

	const rgb = useMemo(() => parseColor(debouncedInput), [debouncedInput]);
	const hex = useMemo(() => (rgb ? rgbToHex(rgb) : null), [rgb]);
	const hsl = useMemo(() => (rgb ? rgbToHsl(rgb) : null), [rgb]);
	const hsv = useMemo(() => (rgb ? rgbToHsv(rgb) : null), [rgb]);
	const cmyk = useMemo(() => (rgb ? rgbToCmyk(rgb) : null), [rgb]);
	const lab = useMemo(() => (rgb ? rgbToLab(rgb) : null), [rgb]);
	const lch = useMemo(() => (rgb ? rgbToLch(rgb) : null), [rgb]);
	const oklch = useMemo(() => (rgb ? rgbToOklch(rgb) : null), [rgb]);

	const gamutWarning = useMemo(
		() => checkGamutWarning(debouncedInput),
		[debouncedInput],
	);

	const whiteContrast = useMemo(
		() => (rgb ? contrastRatio(rgb, { r: 255, g: 255, b: 255 }) : 0),
		[rgb],
	);
	const blackContrast = useMemo(
		() => (rgb ? contrastRatio(rgb, { r: 0, g: 0, b: 0 }) : 0),
		[rgb],
	);

	const tints = useMemo(() => (rgb ? generateTints(rgb, 10) : []), [rgb]);
	const shades = useMemo(() => (rgb ? generateShades(rgb, 10) : []), [rgb]);

	const harmonies = useMemo(() => (hsl ? generateHarmonies(hsl) : []), [hsl]);

	const cssVariables = useMemo(
		() => (rgb ? generateCssVariables(rgb, tints, shades) : ""),
		[rgb, tints, shades],
	);

	const tailwindConfig = useMemo(
		() => (rgb ? generateTailwindConfig(rgb, tints, shades) : ""),
		[rgb, tints, shades],
	);

	useEffect(() => {
		if (hex) {
			setHistory((prev) => {
				if (prev[0] === hex) return prev;
				return [hex, ...prev.filter((c) => c !== hex)].slice(0, 20);
			});
		}
	}, [hex, setHistory]);

	const handleColorPicker = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setInput(e.target.value);
		},
		[setInput],
	);

	const error = debouncedInput.trim() && !rgb ? "Invalid color format" : null;

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name} />

				<div className='flex-1 overflow-y-auto p-4 space-y-6'>
					{/* Input */}
					<div className='flex items-center gap-3'>
						<input
							type='color'
							value={hex || "#000000"}
							onChange={handleColorPicker}
							className='h-10 w-14 cursor-pointer rounded border border-border bg-transparent'
							aria-label='Color picker'
						/>
						<input
							type='text'
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder='#hex, rgb(), hsl(), hsv(), cmyk(), lab(), lch(), oklch()...'
							className='flex-1 rounded border border-border bg-zinc-800 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent'
							aria-label='Color input'
							spellCheck={false}
						/>
					</div>

					{error && <ErrorBox error={error} />}

					{gamutWarning && (
						<div
							className='rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400'
							role='status'
						>
							⚠ This color is outside the sRGB gamut. The displayed color is an
							approximation.
						</div>
					)}

					{/* Color History */}
					{history.length > 0 && (
						<div>
							<div className='mb-1 text-[10px] font-semibold uppercase text-muted-foreground'>
								History
							</div>
							<div className='flex flex-wrap gap-1'>
								{history.map((c, i) => (
									<button
										key={`${c}-${i}`}
										className='h-6 w-6 rounded border border-border cursor-pointer hover:ring-1 hover:ring-accent'
										style={{ backgroundColor: c }}
										title={c}
										onClick={() => setInput(c)}
										aria-label={`Set color ${c}`}
									/>
								))}
							</div>
						</div>
					)}

					{rgb && hex && hsl && hsv && cmyk && lab && lch && oklch && (
						<>
							{/* Color swatch */}
							<div
								className='w-full rounded-lg border border-border'
								style={{ backgroundColor: hex, height: 80 }}
								aria-label={`Color preview: ${hex}`}
							/>

							{/* Format displays */}
							<div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
								<FormatCard label='HEX' value={hex} />
								<FormatCard
									label='RGB'
									value={`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`}
								/>
								<FormatCard
									label='HSL'
									value={`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`}
								/>
								<FormatCard
									label='HSV'
									value={`hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`}
								/>
								<FormatCard
									label='CMYK'
									value={`cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`}
								/>
								<FormatCard
									label='Lab'
									value={`lab(${lab.L.toFixed(1)}, ${lab.a.toFixed(1)}, ${lab.b.toFixed(1)})`}
								/>
								<FormatCard
									label='LCH'
									value={`lch(${lch.L.toFixed(1)}, ${lch.C.toFixed(1)}, ${lch.H.toFixed(1)})`}
								/>
								<FormatCard
									label='Oklch'
									value={`oklch(${oklch.L.toFixed(3)}, ${oklch.C.toFixed(3)}, ${oklch.H.toFixed(1)})`}
								/>
							</div>

							{/* Contrast checker */}
							<div className='rounded-lg border border-border bg-panel p-4'>
								<div className='mb-3 text-[10px] font-semibold uppercase text-muted-foreground'>
									Contrast Ratio (WCAG)
								</div>
								<div className='grid gap-3 sm:grid-cols-2'>
									<ContrastCard
										label='vs White'
										ratio={whiteContrast}
										fg={hex}
										bg='#ffffff'
									/>
									<ContrastCard
										label='vs Black'
										ratio={blackContrast}
										fg={hex}
										bg='#000000'
									/>
								</div>
							</div>

							{/* Palette */}
							<div className='rounded-lg border border-border bg-panel p-4'>
								<div className='mb-3 flex items-center justify-between'>
									<span className='text-[10px] font-semibold uppercase text-muted-foreground'>
										Palette
									</span>
									<div className='flex gap-2'>
										<CopyButton
											text={cssVariables}
											label='CSS Vars'
											aria-label='Copy as CSS variables'
											className='h-6 px-2 text-[10px]'
										/>
										<CopyButton
											text={tailwindConfig}
											label='Tailwind'
											aria-label='Copy as Tailwind config'
											className='h-6 px-2 text-[10px]'
										/>
									</div>
								</div>
								<div className='space-y-2'>
									<div>
										<div className='mb-1 text-[10px] text-muted-foreground'>
											Tints (lighter)
										</div>
										<div className='flex gap-1'>
											{tints.map((t, i) => {
												const tHex = rgbToHex(t);
												return (
													<div key={i} className='group relative flex-1'>
														<div
															className='h-10 rounded border border-border cursor-pointer'
															style={{ backgroundColor: tHex }}
															title={tHex}
														/>
														<div className='mt-0.5 text-center text-[9px] font-mono text-muted-foreground'>
															{tHex}
														</div>
													</div>
												);
											})}
										</div>
									</div>
									<div>
										<div className='mb-1 text-[10px] text-muted-foreground'>
											Shades (darker)
										</div>
										<div className='flex gap-1'>
											{shades.map((s, i) => {
												const sHex = rgbToHex(s);
												return (
													<div key={i} className='group relative flex-1'>
														<div
															className='h-10 rounded border border-border cursor-pointer'
															style={{ backgroundColor: sHex }}
															title={sHex}
														/>
														<div className='mt-0.5 text-center text-[9px] font-mono text-muted-foreground'>
															{sHex}
														</div>
													</div>
												);
											})}
										</div>
									</div>
								</div>
							</div>

							{/* Color Harmonies */}
							<div className='rounded-lg border border-border bg-panel p-4'>
								<div className='mb-3 text-[10px] font-semibold uppercase text-muted-foreground'>
									Color Harmonies
								</div>
								<div className='space-y-3'>
									{harmonies.map((harmony) => (
										<div key={harmony.name}>
											<div className='mb-1 text-[10px] text-muted-foreground'>
												{harmony.name}
											</div>
											<div className='flex gap-1'>
												{harmony.colors.map((c, i) => {
													const cRgb = hslToRgb(c);
													const cHex = rgbToHex(cRgb);
													return (
														<button
															key={i}
															className='group relative flex-1 cursor-pointer'
															onClick={() => setInput(cHex)}
															title={cHex}
															aria-label={`Set color ${cHex}`}
														>
															<div
																className='h-10 rounded border border-border hover:ring-1 hover:ring-accent'
																style={{ backgroundColor: cHex }}
															/>
														</button>
													);
												})}
											</div>
										</div>
									))}
								</div>
							</div>
						</>
					)}
				</div>
			</div>
		</>
	);
}

function FormatCard({ label, value }: { label: string; value: string }) {
	return (
		<div className='flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2'>
			<span className='shrink-0 text-[10px] font-semibold text-muted-foreground'>
				{label}
			</span>
			<span className='flex-1 font-mono text-xs text-foreground break-all'>
				{value}
			</span>
			<CopyButton text={value} className='h-6 px-1.5' />
		</div>
	);
}

function ContrastCard({
	label,
	ratio,
	fg,
	bg,
}: {
	label: string;
	ratio: number;
	fg: string;
	bg: string;
}) {
	const aaLargePass = ratio >= 3;
	const aaPass = ratio >= 4.5;
	const aaaPass = ratio >= 7;

	return (
		<div className='rounded border border-border p-3'>
			<div className='flex items-center justify-between mb-2'>
				<span className='text-xs font-medium text-foreground'>{label}</span>
				<span className='font-mono text-sm font-bold text-foreground'>
					{ratio.toFixed(2)}:1
				</span>
			</div>
			<div
				className='mb-2 rounded px-3 py-1.5 text-center text-xs font-medium'
				style={{ backgroundColor: bg, color: fg }}
			>
				Sample Text
			</div>
			<div className='flex gap-2'>
				<WcagBadge label='AA Large' pass={aaLargePass} />
				<WcagBadge label='AA' pass={aaPass} />
				<WcagBadge label='AAA' pass={aaaPass} />
			</div>
		</div>
	);
}

function WcagBadge({ label, pass }: { label: string; pass: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
				pass
					? "border-green-500/30 bg-green-500/10 text-green-400"
					: "border-red-500/30 bg-red-500/10 text-red-400",
			)}
		>
			{pass ? <Check className='h-2.5 w-2.5' /> : <X className='h-2.5 w-2.5' />}
			{label}
		</span>
	);
}
