import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Plus, Trash2 } from "lucide-react";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn, formatBytes } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { StatsBar } from "@/components/shared/StatsBar";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";

type Mode = "encode" | "decode" | "parse" | "builder";
type EncodeScope = "component" | "full" | "form";
type EncodeFilter = "all" | "non-ascii" | "special";

interface UrlPrefs {
	mode: Mode;
	encodeScope: EncodeScope;
	encodeFilter: EncodeFilter;
	decodePlus: boolean;
	decodeTwice: boolean;
}

interface UrlComponents {
	protocol: string;
	host: string;
	pathname: string;
	search: string;
	hash: string;
	params: [string, string][];
	isIPv6: boolean;
	idnPunycode: string | null;
	idnUnicode: string | null;
}

interface BuilderParam {
	key: string;
	value: string;
}

interface BuilderState {
	protocol: string;
	customProtocol: string;
	host: string;
	port: string;
	path: string;
	params: BuilderParam[];
	fragment: string;
}

type PasteHint = "decode" | "parse" | null;

const tool = TOOLS.find((t) => t.id === "url")!;

const URL_LENGTH_WARN = 2000;

/* ── Punycode helpers ─────────────────────────────────────── */

function punycodeDecode(ascii: string): string {
	const base = 36;
	const tMin = 1;
	const tMax = 26;
	const skew = 38;
	const damp = 700;
	const initialBias = 72;
	const initialN = 128;

	function decodeDigit(cp: number): number {
		if (cp - 48 < 10) return cp - 22;
		if (cp - 65 < 26) return cp - 65;
		if (cp - 97 < 26) return cp - 97;
		return base;
	}

	function adapt(delta: number, numPoints: number, first: boolean): number {
		let d = first ? Math.floor(delta / damp) : Math.floor(delta / 2);
		d += Math.floor(d / numPoints);
		let k = 0;
		while (d > ((base - tMin) * tMax) >> 1) {
			d = Math.floor(d / (base - tMin));
			k += base;
		}
		return k + Math.floor(((base - tMin + 1) * d) / (d + skew));
	}

	const output: number[] = [];
	const basicEnd = ascii.lastIndexOf("-");
	for (let j = 0; j < (basicEnd > 0 ? basicEnd : 0); j++) {
		output.push(ascii.charCodeAt(j));
	}

	let i = 0;
	let n = initialN;
	let bias = initialBias;
	let idx = basicEnd > 0 ? basicEnd + 1 : 0;

	while (idx < ascii.length) {
		const oldi = i;
		let w = 1;
		let k = base;
		while (true) {
			if (idx >= ascii.length) break;
			const digit = decodeDigit(ascii.charCodeAt(idx++));
			if (digit >= base) break;
			i += digit * w;
			const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
			if (digit < t) break;
			w *= base - t;
			k += base;
		}
		const out = output.length + 1;
		bias = adapt(i - oldi, out, oldi === 0);
		n += Math.floor(i / out);
		i %= out;
		output.splice(i, 0, n);
		i++;
	}
	return String.fromCodePoint(...output);
}

function punycodeEncode(unicode: string): string {
	const base = 36;
	const tMin = 1;
	const tMax = 26;
	const skew = 38;
	const damp = 700;
	const initialBias = 72;
	const initialN = 128;

	function adapt(delta: number, numPoints: number, first: boolean): number {
		let d = first ? Math.floor(delta / damp) : Math.floor(delta / 2);
		d += Math.floor(d / numPoints);
		let k = 0;
		while (d > ((base - tMin) * tMax) >> 1) {
			d = Math.floor(d / (base - tMin));
			k += base;
		}
		return k + Math.floor(((base - tMin + 1) * d) / (d + skew));
	}

	function encodeDigit(d: number): number {
		return d + 22 + 75 * (d < 26 ? 1 : 0);
	}

	const codePoints = Array.from(unicode).map((c) => c.codePointAt(0)!);
	const basicChars = codePoints.filter((cp) => cp < 128);
	const output: number[] = [...basicChars];
	let handledCpCount = basicChars.length;
	if (handledCpCount > 0) output.push(45); // '-'

	let n = initialN;
	let delta = 0;
	let bias = initialBias;
	const inputLength = codePoints.length;

	while (handledCpCount < inputLength) {
		let m = 0x10ffff;
		for (const cp of codePoints) {
			if (cp >= n && cp < m) m = cp;
		}
		delta += (m - n) * (handledCpCount + 1);
		n = m;

		for (const cp of codePoints) {
			if (cp < n) delta++;
			if (cp === n) {
				let q = delta;
				let k = base;
				while (true) {
					const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
					if (q < t) break;
					output.push(encodeDigit(t + ((q - t) % (base - t))));
					q = Math.floor((q - t) / (base - t));
					k += base;
				}
				output.push(encodeDigit(q));
				bias = adapt(
					delta,
					handledCpCount + 1,
					handledCpCount === basicChars.length,
				);
				delta = 0;
				handledCpCount++;
			}
		}
		delta++;
		n++;
	}
	return String.fromCharCode(...output);
}

function idnToAscii(host: string): string {
	return host
		.split(".")
		.map((label) => {
			// eslint-disable-next-line no-control-regex
			if (/[^\x00-\x7F]/.test(label)) return "xn--" + punycodeEncode(label);
			return label;
		})
		.join(".");
}

function idnToUnicode(host: string): string {
	return host
		.split(".")
		.map((label) => {
			if (label.startsWith("xn--")) {
				try {
					return punycodeDecode(label.slice(4));
				} catch {
					return label;
				}
			}
			return label;
		})
		.join(".");
}

/* ── Encode / Decode logic ───────────────────────────────── */

function encodeUrl(
	input: string,
	scope: EncodeScope,
	filter: EncodeFilter,
): { output: string; error: string | null } {
	if (!input.trim()) return { output: "", error: null };
	try {
		let encoded: string;
		if (scope === "component") {
			encoded = encodeURIComponent(input);
		} else if (scope === "full") {
			encoded = encodeURI(input);
		} else {
			// form encoding: spaces become +, rest like component
			encoded = encodeURIComponent(input).replace(/%20/g, "+");
		}

		if (filter === "non-ascii") {
			// Only keep encoding for non-ASCII chars, restore ASCII-safe encodings
			// eslint-disable-next-line no-control-regex
			encoded = input.replace(/[^\x00-\x7F]/g, (ch) => encodeURIComponent(ch));
		} else if (filter === "special") {
			// Encode only URL-special characters
			encoded = input.replace(/[&=?#%+;:@/\\[\]{}|^`<>"' ]/g, (ch) =>
				encodeURIComponent(ch),
			);
		}

		return { output: encoded, error: null };
	} catch (e) {
		return {
			output: "",
			error: e instanceof Error ? e.message : "Encoding failed",
		};
	}
}

function decodeUrl(
	input: string,
	decodePlus: boolean,
	decodeTwice: boolean,
): { output: string; error: string | null } {
	if (!input.trim()) return { output: "", error: null };
	try {
		let result = input;
		if (decodePlus) {
			result = result.replace(/\+/g, " ");
		}
		result = decodeURIComponent(result);
		if (decodeTwice) {
			if (decodePlus) {
				result = result.replace(/\+/g, " ");
			}
			result = decodeURIComponent(result);
		}
		return { output: result, error: null };
	} catch (e) {
		return {
			output: "",
			error: e instanceof Error ? e.message : "Decoding failed",
		};
	}
}

function detectDoubleEncoded(input: string): boolean {
	return input.includes("%25");
}

/* ── Parse logic ─────────────────────────────────────────── */

function parseUrl(input: string): {
	components: UrlComponents | null;
	error: string | null;
} {
	if (!input.trim()) return { components: null, error: null };
	try {
		const url = new URL(input);
		const params: [string, string][] = [];
		url.searchParams.forEach((value, key) => params.push([key, value]));

		const hostRaw = url.hostname;
		const isIPv6 = hostRaw.startsWith("[") || url.host.startsWith("[");

		let idnPunycode: string | null = null;
		let idnUnicode: string | null = null;
		const hostForIDN = url.hostname.replace(/^\[|\]$/g, "");
		if (/xn--/.test(hostForIDN)) {
			idnPunycode = hostForIDN;
			idnUnicode = idnToUnicode(hostForIDN);
			// eslint-disable-next-line no-control-regex
		} else if (/[^\x00-\x7F]/.test(hostForIDN)) {
			idnUnicode = hostForIDN;
			idnPunycode = idnToAscii(hostForIDN);
		}

		return {
			components: {
				protocol: url.protocol,
				host: url.host,
				pathname: url.pathname,
				search: url.search,
				hash: url.hash,
				params,
				isIPv6,
				idnPunycode,
				idnUnicode,
			},
			error: null,
		};
	} catch {
		return {
			components: null,
			error: "Invalid URL — must include protocol (e.g. https://)",
		};
	}
}

/* ── Builder logic ───────────────────────────────────────── */

const DEFAULT_BUILDER: BuilderState = {
	protocol: "https",
	customProtocol: "",
	host: "",
	port: "",
	path: "",
	params: [{ key: "", value: "" }],
	fragment: "",
};

function validatePort(port: string): string | null {
	if (!port) return null;
	const n = Number(port);
	if (!Number.isInteger(n) || n < 1 || n > 65535) {
		return "Port must be 1–65535";
	}
	return null;
}

function buildUrl(state: BuilderState): { url: string; error: string | null } {
	if (!state.host.trim()) return { url: "", error: null };

	const portError = validatePort(state.port);
	if (portError) return { url: "", error: portError };

	const proto =
		state.protocol === "custom" ? state.customProtocol : state.protocol;
	if (!proto) return { url: "", error: "Protocol is required" };

	let host = state.host.trim();
	// Auto-encode IDN hostnames
	// eslint-disable-next-line no-control-regex
	if (/[^\x00-\x7F]/.test(host)) {
		host = idnToAscii(host);
	}

	let url = `${proto}://`;
	url += host;
	if (state.port) url += `:${state.port}`;

	if (state.path) {
		const path = state.path.startsWith("/") ? state.path : `/${state.path}`;
		// Encode each path segment
		url += path
			.split("/")
			.map((seg) => (seg ? encodeURIComponent(seg) : seg))
			.join("/");
	}

	const validParams = state.params.filter((p) => p.key.trim());
	if (validParams.length > 0) {
		const qs = validParams
			.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
			.join("&");
		url += `?${qs}`;
	}

	if (state.fragment.trim()) {
		url += `#${encodeURIComponent(state.fragment.trim())}`;
	}

	return { url, error: null };
}

/* ── Paste detection ─────────────────────────────────────── */

function detectPasteHint(text: string): PasteHint {
	if (/%[0-9A-Fa-f]{2}/.test(text)) return "decode";
	if (/^https?:\/\//i.test(text)) return "parse";
	return null;
}

/* ── Component ───────────────────────────────────────────── */

export function UrlTool() {
	const [input, setInput] = useLocalStorage("devtools-url-input", "");
	const [prefs, setPrefs] = useLocalStorage<UrlPrefs>("devtools-url-prefs", {
		mode: "encode",
		encodeScope: "component",
		encodeFilter: "all",
		decodePlus: false,
		decodeTwice: false,
	});
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [processingTime, setProcessingTime] = useState<number | undefined>();
	const [doubleEncoded, setDoubleEncoded] = useState(false);
	const [pasteHint, setPasteHint] = useState<PasteHint>(null);
	const [editingParam, setEditingParam] = useState<{
		index: number;
		field: "key" | "value";
	} | null>(null);
	const editRef = useRef<HTMLInputElement>(null);

	const [builder, setBuilder] = useLocalStorage<BuilderState>(
		"devtools-url-builder",
		DEFAULT_BUILDER,
	);

	const debouncedInput = useDebounce(input, 300);

	const urlComponents = useMemo(() => {
		if (prefs.mode !== "parse" || !debouncedInput.trim()) return null;
		return parseUrl(debouncedInput);
	}, [debouncedInput, prefs.mode]);

	const builtUrl = useMemo(() => {
		if (prefs.mode !== "builder") return { url: "", error: null };
		return buildUrl(builder);
	}, [builder, prefs.mode]);

	useEffect(() => {
		if (prefs.mode === "parse" || prefs.mode === "builder") {
			if (prefs.mode === "parse" && urlComponents) {
				setError(urlComponents.error);
				setOutput("");
			}
			if (prefs.mode === "builder") {
				setError(builtUrl.error);
				setOutput(builtUrl.url);
			}
			setDoubleEncoded(false);
			return;
		}

		if (!debouncedInput.trim()) {
			setOutput("");
			setError(null);
			setProcessingTime(undefined);
			setDoubleEncoded(false);
			return;
		}

		const start = performance.now();
		const result =
			prefs.mode === "encode"
				? encodeUrl(debouncedInput, prefs.encodeScope, prefs.encodeFilter)
				: decodeUrl(debouncedInput, prefs.decodePlus, prefs.decodeTwice);
		setProcessingTime(performance.now() - start);
		setOutput(result.output);
		setError(result.error);
		setDoubleEncoded(
			prefs.mode === "decode" && detectDoubleEncoded(debouncedInput),
		);
	}, [
		debouncedInput,
		prefs.mode,
		prefs.encodeScope,
		prefs.encodeFilter,
		prefs.decodePlus,
		prefs.decodeTwice,
		urlComponents,
		builtUrl,
	]);

	/* Auto-detect on paste */
	const handleInputChange = useCallback(
		(v: string) => {
			setInput(v);
			const hint = detectPasteHint(v);
			setPasteHint(hint);
		},
		[setInput],
	);

	const handleClear = useCallback(() => {
		setInput("");
		setOutput("");
		setError(null);
		setProcessingTime(undefined);
		setDoubleEncoded(false);
		setPasteHint(null);
	}, [setInput]);

	const setMode = useCallback(
		(mode: Mode) => {
			setPrefs((p) => ({ ...p, mode }));
			setPasteHint(null);
		},
		[setPrefs],
	);

	/* Editable query table helpers */
	const updateParam = useCallback(
		(index: number, field: "key" | "value", newVal: string) => {
			if (!urlComponents?.components) return;
			const newParams = [...urlComponents.components.params];
			const pair = [...newParams[index]] as [string, string];
			pair[field === "key" ? 0 : 1] = newVal;
			newParams[index] = pair;

			// Rebuild URL
			try {
				const url = new URL(input);
				const sp = new URLSearchParams();
				for (const [k, v] of newParams) {
					sp.append(k, v);
				}
				url.search = sp.toString();
				setInput(url.toString());
			} catch {
				// ignore rebuild error
			}
			setEditingParam(null);
		},
		[urlComponents, input, setInput],
	);

	/* Focus editing input on mount */
	useEffect(() => {
		if (editingParam && editRef.current) {
			editRef.current.focus();
			editRef.current.select();
		}
	}, [editingParam]);

	/* Builder helpers */
	const updateBuilder = useCallback(
		(patch: Partial<BuilderState>) => {
			setBuilder((prev) => ({ ...prev, ...patch }));
		},
		[setBuilder],
	);

	const addBuilderParam = useCallback(() => {
		setBuilder((prev) => ({
			...prev,
			params: [...prev.params, { key: "", value: "" }],
		}));
	}, [setBuilder]);

	const removeBuilderParam = useCallback(
		(index: number) => {
			setBuilder((prev) => ({
				...prev,
				params: prev.params.filter((_, i) => i !== index),
			}));
		},
		[setBuilder],
	);

	const updateBuilderParam = useCallback(
		(index: number, field: "key" | "value", val: string) => {
			setBuilder((prev) => ({
				...prev,
				params: prev.params.map((p, i) =>
					i === index ? { ...p, [field]: val } : p,
				),
			}));
		},
		[setBuilder],
	);

	const inputBytes = new TextEncoder().encode(input).length;
	const outputBytes = new TextEncoder().encode(output).length;

	const longUrlWarning =
		(prefs.mode === "builder" && builtUrl.url.length > URL_LENGTH_WARN) ||
		(prefs.mode === "encode" && output.length > URL_LENGTH_WARN) ||
		(prefs.mode === "parse" && input.length > URL_LENGTH_WARN);

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					{/* Mode tabs */}
					<div className='flex rounded-md border border-border overflow-hidden'>
						{(["encode", "decode", "parse", "builder"] as const).map((mode) => (
							<button
								key={mode}
								onClick={() => setMode(mode)}
								className={cn(
									"h-8 px-3 text-xs font-medium transition-colors capitalize",
									prefs.mode === mode
										? "bg-accent text-zinc-950"
										: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
								)}
							>
								{mode === "parse"
									? "Query Parser"
									: mode === "builder"
										? "URL Builder"
										: mode}
							</button>
						))}
					</div>
					{prefs.mode !== "parse" && prefs.mode !== "builder" && (
						<CopyButton text={output} label='Copy' />
					)}
					{prefs.mode === "builder" && (
						<CopyButton text={builtUrl.url} label='Copy URL' />
					)}
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
				</ToolPageHeader>

				{/* Encode scope options bar */}
				{prefs.mode === "encode" && (
					<div className='flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs'>
						<span className='text-muted-foreground'>Scope:</span>
						{(
							[
								["component", "Component"],
								["full", "Full URL"],
								["form", "Form (+)"],
							] as const
						).map(([val, label]) => (
							<button
								key={val}
								onClick={() => setPrefs((p) => ({ ...p, encodeScope: val }))}
								className={cn(
									"rounded px-2 py-0.5 transition-colors",
									prefs.encodeScope === val
										? "bg-accent text-zinc-950"
										: "text-zinc-300 hover:text-zinc-100",
								)}
							>
								{label}
							</button>
						))}
						<span className='ml-3 text-muted-foreground'>Encode:</span>
						{(
							[
								["all", "Everything"],
								["non-ascii", "Non-ASCII only"],
								["special", "Special chars"],
							] as const
						).map(([val, label]) => (
							<button
								key={val}
								onClick={() => setPrefs((p) => ({ ...p, encodeFilter: val }))}
								className={cn(
									"rounded px-2 py-0.5 transition-colors",
									prefs.encodeFilter === val
										? "bg-accent text-zinc-950"
										: "text-zinc-300 hover:text-zinc-100",
								)}
							>
								{label}
							</button>
						))}
					</div>
				)}

				{/* Decode options bar */}
				{prefs.mode === "decode" && (
					<div className='flex items-center gap-4 border-b border-border px-3 py-1.5 text-xs'>
						<label className='flex items-center gap-1.5 text-zinc-300 cursor-pointer'>
							<input
								type='checkbox'
								checked={prefs.decodePlus}
								onChange={(e) =>
									setPrefs((p) => ({ ...p, decodePlus: e.target.checked }))
								}
								className='accent-accent'
							/>
							Decode + as space
						</label>
						<label className='flex items-center gap-1.5 text-zinc-300 cursor-pointer'>
							<input
								type='checkbox'
								checked={prefs.decodeTwice}
								onChange={(e) =>
									setPrefs((p) => ({ ...p, decodeTwice: e.target.checked }))
								}
								className='accent-accent'
							/>
							Decode twice (double-encoded)
						</label>
					</div>
				)}

				{/* Paste hint badge */}
				{pasteHint && prefs.mode !== "builder" && (
					<div className='flex items-center gap-2 border-b border-blue-500/30 bg-blue-500/5 px-3 py-1.5 text-xs text-blue-400'>
						<span className='rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase'>
							Suggestion
						</span>
						{pasteHint === "decode" && (
							<span>
								Input contains encoded characters.{" "}
								<button
									onClick={() => setMode("decode")}
									className='underline hover:text-blue-300'
								>
									Switch to Decode mode
								</button>
							</span>
						)}
						{pasteHint === "parse" && (
							<span>
								Input looks like a URL.{" "}
								<button
									onClick={() => setMode("parse")}
									className='underline hover:text-blue-300'
								>
									Switch to Query Parser
								</button>
							</span>
						)}
					</div>
				)}

				{doubleEncoded && (
					<div className='flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400'>
						<span>
							⚠ Input appears to be double-encoded (contains %25). You may want
							to decode twice.
						</span>
					</div>
				)}

				{/* Long URL warning */}
				{longUrlWarning && (
					<div className='flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400'>
						<span>
							⚠ URL exceeds {URL_LENGTH_WARN.toLocaleString()} characters — some
							browsers may not support it.
						</span>
					</div>
				)}

				{prefs.mode === "builder" ? (
					/* URL Builder layout */
					<div className='flex flex-1 flex-col overflow-y-auto p-4 space-y-4'>
						{/* Live preview */}
						{builtUrl.url && (
							<div className='rounded-md border border-border bg-panel p-3'>
								<div className='flex items-center justify-between mb-1'>
									<span className='text-[10px] text-muted-foreground uppercase font-medium'>
										Preview
									</span>
									<CopyButton text={builtUrl.url} />
								</div>
								<p className='font-mono text-xs text-panel-foreground break-all'>
									{builtUrl.url}
								</p>
								{builtUrl.url.length > URL_LENGTH_WARN && (
									<p className='text-[10px] text-amber-400 mt-1'>
										{builtUrl.url.length.toLocaleString()} chars
									</p>
								)}
							</div>
						)}
						{builtUrl.error && <ErrorBox error={builtUrl.error} />}

						<div className='grid grid-cols-2 gap-4'>
							{/* Protocol */}
							<div className='space-y-1'>
								<label className='text-[10px] text-muted-foreground font-medium'>
									Protocol
								</label>
								<div className='flex gap-1.5'>
									<select
										value={builder.protocol}
										onChange={(e) =>
											updateBuilder({ protocol: e.target.value })
										}
										className='h-8 flex-1 rounded-md border border-border bg-zinc-800 px-2 text-xs text-zinc-200'
									>
										<option value='https'>https</option>
										<option value='http'>http</option>
										<option value='ftp'>ftp</option>
										<option value='custom'>custom…</option>
									</select>
									{builder.protocol === "custom" && (
										<input
											type='text'
											value={builder.customProtocol}
											onChange={(e) =>
												updateBuilder({ customProtocol: e.target.value })
											}
											placeholder='e.g. ws'
											className='h-8 flex-1 rounded-md border border-border bg-zinc-800 px-2 text-xs text-zinc-200 placeholder:text-zinc-500'
										/>
									)}
								</div>
							</div>

							{/* Host */}
							<div className='space-y-1'>
								<label className='text-[10px] text-muted-foreground font-medium'>
									Host
								</label>
								<input
									type='text'
									value={builder.host}
									onChange={(e) => updateBuilder({ host: e.target.value })}
									placeholder='example.com or [::1]'
									className='h-8 w-full rounded-md border border-border bg-zinc-800 px-2 text-xs text-zinc-200 placeholder:text-zinc-500'
								/>
							</div>

							{/* Port */}
							<div className='space-y-1'>
								<label className='text-[10px] text-muted-foreground font-medium'>
									Port <span className='text-zinc-500'>(optional)</span>
								</label>
								<input
									type='number'
									value={builder.port}
									onChange={(e) => updateBuilder({ port: e.target.value })}
									placeholder='443'
									min={1}
									max={65535}
									className='h-8 w-full rounded-md border border-border bg-zinc-800 px-2 text-xs text-zinc-200 placeholder:text-zinc-500'
								/>
							</div>

							{/* Path */}
							<div className='space-y-1'>
								<label className='text-[10px] text-muted-foreground font-medium'>
									Path
								</label>
								<input
									type='text'
									value={builder.path}
									onChange={(e) => updateBuilder({ path: e.target.value })}
									placeholder='/api/users'
									className='h-8 w-full rounded-md border border-border bg-zinc-800 px-2 text-xs text-zinc-200 placeholder:text-zinc-500'
								/>
							</div>
						</div>

						{/* Fragment */}
						<div className='space-y-1'>
							<label className='text-[10px] text-muted-foreground font-medium'>
								Fragment
							</label>
							<input
								type='text'
								value={builder.fragment}
								onChange={(e) => updateBuilder({ fragment: e.target.value })}
								placeholder='section1'
								className='h-8 w-full rounded-md border border-border bg-zinc-800 px-2 text-xs text-zinc-200 placeholder:text-zinc-500'
							/>
						</div>

						{/* Query Parameters */}
						<div className='space-y-2'>
							<div className='flex items-center justify-between'>
								<span className='text-[10px] text-muted-foreground font-medium uppercase'>
									Query Parameters
								</span>
								<button
									onClick={addBuilderParam}
									className='inline-flex items-center gap-1 h-7 rounded-md bg-zinc-700 px-2 text-[10px] text-zinc-200 hover:bg-zinc-600'
								>
									<Plus className='h-3 w-3' /> Add
								</button>
							</div>
							{builder.params.map((param, i) => (
								<div key={i} className='flex items-center gap-2'>
									<input
										type='text'
										value={param.key}
										onChange={(e) =>
											updateBuilderParam(i, "key", e.target.value)
										}
										placeholder='key'
										className='h-8 flex-1 rounded-md border border-border bg-zinc-800 px-2 text-xs text-zinc-200 placeholder:text-zinc-500 font-mono'
									/>
									<span className='text-xs text-zinc-500'>=</span>
									<input
										type='text'
										value={param.value}
										onChange={(e) =>
											updateBuilderParam(i, "value", e.target.value)
										}
										placeholder='value'
										className='h-8 flex-1 rounded-md border border-border bg-zinc-800 px-2 text-xs text-zinc-200 placeholder:text-zinc-500 font-mono'
									/>
									<button
										onClick={() => removeBuilderParam(i)}
										className='h-8 w-8 flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
										aria-label='Remove parameter'
									>
										<Trash2 className='h-3.5 w-3.5' />
									</button>
								</div>
							))}
						</div>
					</div>
				) : prefs.mode === "parse" ? (
					/* Query Parser layout */
					<div className='flex flex-1 flex-col overflow-y-auto'>
						<div className='border-b border-border'>
							<div className='flex items-center justify-between border-b border-border px-3 py-1'>
								<span className='text-[10px] text-muted-foreground'>URL</span>
							</div>
							<MonacoWrapper
								value={input}
								onChange={handleInputChange}
								language='plaintext'
								height='80px'
								aria-label='URL input'
							/>
						</div>
						{error && (
							<div className='p-2'>
								<ErrorBox error={error} />
							</div>
						)}
						{urlComponents?.components && (
							<div className='flex-1 overflow-y-auto p-4 space-y-4'>
								{/* URL Components */}
								<div className='rounded-md border border-border bg-panel'>
									<div className='border-b border-border px-3 py-2'>
										<span className='text-xs font-medium'>URL Components</span>
									</div>
									<div className='divide-y divide-border'>
										{(
											[
												["Protocol", urlComponents.components.protocol],
												["Host", urlComponents.components.host],
												["Path", urlComponents.components.pathname],
												["Query", urlComponents.components.search],
												["Fragment", urlComponents.components.hash],
											] as const
										)
											.filter(([, v]) => v)
											.map(([label, value]) => (
												<div
													key={label}
													className='flex items-center gap-3 px-3 py-2 text-xs'
												>
													<span className='shrink-0 w-20 font-medium text-muted-foreground'>
														{label}
													</span>
													<span className='font-mono text-panel-foreground break-all'>
														{value}
													</span>
													<CopyButton
														text={value}
														className='ml-auto shrink-0'
													/>
												</div>
											))}
									</div>
								</div>

								{/* IDN Info */}
								{urlComponents.components.idnPunycode &&
									urlComponents.components.idnUnicode && (
										<div className='rounded-md border border-border bg-panel'>
											<div className='border-b border-border px-3 py-2'>
												<span className='text-xs font-medium'>
													IDN Hostname
												</span>
											</div>
											<div className='divide-y divide-border'>
												<div className='flex items-center gap-3 px-3 py-2 text-xs'>
													<span className='shrink-0 w-20 font-medium text-muted-foreground'>
														Unicode
													</span>
													<span className='font-mono text-panel-foreground break-all'>
														{urlComponents.components.idnUnicode}
													</span>
													<CopyButton
														text={urlComponents.components.idnUnicode}
														className='ml-auto shrink-0'
													/>
												</div>
												<div className='flex items-center gap-3 px-3 py-2 text-xs'>
													<span className='shrink-0 w-20 font-medium text-muted-foreground'>
														Punycode
													</span>
													<span className='font-mono text-panel-foreground break-all'>
														{urlComponents.components.idnPunycode}
													</span>
													<CopyButton
														text={urlComponents.components.idnPunycode}
														className='ml-auto shrink-0'
													/>
												</div>
											</div>
										</div>
									)}

								{/* IPv6 badge */}
								{urlComponents.components.isIPv6 && (
									<div className='flex items-center gap-2 text-xs text-blue-400'>
										<span className='rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold'>
											IPv6
										</span>
										<span>Host uses IPv6 bracket notation</span>
									</div>
								)}

								{/* Query parameters table (editable) */}
								{urlComponents.components.params.length > 0 && (
									<div className='rounded-md border border-border bg-panel'>
										<div className='border-b border-border px-3 py-2'>
											<span className='text-xs font-medium'>
												Query Parameters (
												{urlComponents.components.params.length})
											</span>
											<span className='ml-2 text-[10px] text-muted-foreground'>
												Click a cell to edit
											</span>
										</div>
										<table className='w-full text-xs'>
											<thead>
												<tr className='border-b border-border text-muted-foreground'>
													<th className='px-3 py-1.5 text-left font-medium'>
														Key
													</th>
													<th className='px-3 py-1.5 text-left font-medium'>
														Value
													</th>
													<th className='px-3 py-1.5 text-right font-medium w-16'>
														Copy
													</th>
												</tr>
											</thead>
											<tbody>
												{urlComponents.components.params.map(
													([key, value], i) => (
														<tr
															key={`${key}-${i}`}
															className='border-b border-border last:border-0'
														>
															<td
																className='px-3 py-1.5 font-mono text-accent cursor-pointer hover:bg-zinc-700/50'
																onClick={() =>
																	setEditingParam({ index: i, field: "key" })
																}
															>
																{editingParam?.index === i &&
																editingParam.field === "key" ? (
																	<input
																		ref={editRef}
																		type='text'
																		defaultValue={key}
																		onBlur={(e) =>
																			updateParam(i, "key", e.target.value)
																		}
																		onKeyDown={(e) => {
																			if (e.key === "Enter")
																				updateParam(
																					i,
																					"key",
																					(e.target as HTMLInputElement).value,
																				);
																			if (e.key === "Escape")
																				setEditingParam(null);
																		}}
																		className='w-full bg-zinc-800 border border-accent rounded px-1 py-0.5 text-xs font-mono text-zinc-200 outline-none'
																		aria-label={`Edit key ${key}`}
																	/>
																) : (
																	key
																)}
															</td>
															<td
																className='px-3 py-1.5 font-mono text-panel-foreground break-all cursor-pointer hover:bg-zinc-700/50'
																onClick={() =>
																	setEditingParam({
																		index: i,
																		field: "value",
																	})
																}
															>
																{editingParam?.index === i &&
																editingParam.field === "value" ? (
																	<input
																		ref={editRef}
																		type='text'
																		defaultValue={value}
																		onBlur={(e) =>
																			updateParam(i, "value", e.target.value)
																		}
																		onKeyDown={(e) => {
																			if (e.key === "Enter")
																				updateParam(
																					i,
																					"value",
																					(e.target as HTMLInputElement).value,
																				);
																			if (e.key === "Escape")
																				setEditingParam(null);
																		}}
																		className='w-full bg-zinc-800 border border-accent rounded px-1 py-0.5 text-xs font-mono text-zinc-200 outline-none'
																		aria-label={`Edit value for ${key}`}
																	/>
																) : (
																	value
																)}
															</td>
															<td className='px-3 py-1.5 text-right'>
																<CopyButton text={`${key}=${value}`} />
															</td>
														</tr>
													),
												)}
											</tbody>
										</table>
									</div>
								)}
							</div>
						)}
					</div>
				) : (
					/* Encode/Decode two-panel layout */
					<>
						<div className='flex flex-1 overflow-hidden'>
							<div className='flex flex-1 flex-col border-r border-border'>
								<div className='flex items-center justify-between border-b border-border px-3 py-1'>
									<span className='text-[10px] text-muted-foreground'>
										Input
									</span>
									<span className='text-[10px] text-muted-foreground'>
										{input.length.toLocaleString()} chars
									</span>
								</div>
								<div className='flex-1'>
									<MonacoWrapper
										value={input}
										onChange={handleInputChange}
										language='plaintext'
										height='100%'
										aria-label='URL input'
									/>
								</div>
								{error && (
									<div className='p-2'>
										<ErrorBox error={error} />
									</div>
								)}
							</div>

							<div className='flex flex-1 flex-col'>
								<div className='flex items-center justify-between border-b border-border px-3 py-1'>
									<span className='text-[10px] text-muted-foreground'>
										Output
									</span>
									<span className='text-[10px] text-muted-foreground'>
										{formatBytes(outputBytes)}
									</span>
								</div>
								<div className='flex-1'>
									<MonacoWrapper
										value={output}
										language='plaintext'
										readOnly
										height='100%'
										aria-label='URL output'
									/>
								</div>
							</div>
						</div>

						<StatsBar
							inputChars={input.length}
							inputBytes={inputBytes}
							outputChars={output.length}
							outputBytes={outputBytes}
							processingTime={processingTime}
						/>
					</>
				)}
			</div>
		</>
	);
}
