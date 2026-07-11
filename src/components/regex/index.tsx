import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { SEOHead } from "@/components/shared/SEOHead";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import { AlertCircle, ChevronRight, Loader2, Sparkles } from "lucide-react";

const tool = TOOLS.find((t) => t.id === "regex")!;

type TabId = "matches" | "groups" | "replace" | "explain";

interface RegexFlags {
	g: boolean;
	i: boolean;
	m: boolean;
	s: boolean;
	u: boolean;
}

interface MatchResult {
	index: number;
	match: string;
	start: number;
	end: number;
	groups: Record<string, string> | null;
	captures: string[];
	captureIndices?: ([number, number] | null)[];
}

interface TokenExplanation {
	token: string;
	description: string;
	example: string;
}

const FLAG_TOOLTIPS: Record<string, string> = {
	g: "Global: find all matches, not just the first",
	i: "Case-insensitive: ignore upper/lower case",
	m: "Multiline: ^ and $ match line boundaries",
	s: "Dotall: dot (.) also matches newline characters",
	u: "Unicode: enable full Unicode matching",
};

const LARGE_INPUT_THRESHOLD = 102400; // 100KB
const HIGHLIGHT_LIMIT = 10240; // 10KB

const COMMON_PATTERNS: { name: string; pattern: string; flags: string }[] = [
	{
		name: "Email",
		pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
		flags: "gi",
	},
	{ name: "URL", pattern: "https?://[^\\s/$.?#].[^\\s]*", flags: "gi" },
	{ name: "IPv4", pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b", flags: "g" },
	{
		name: "UUID",
		pattern: "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
		flags: "gi",
	},
	{
		name: "Date (YYYY-MM-DD)",
		pattern: "\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])",
		flags: "g",
	},
	{
		name: "Phone (US)",
		pattern: "\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}",
		flags: "g",
	},
	{ name: "Hex Color", pattern: "#(?:[0-9a-fA-F]{3}){1,2}\\b", flags: "gi" },
	{
		name: "IP:Port",
		pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}:\\d{1,5}\\b",
		flags: "g",
	},
];

// -- Worker code for regex execution with backtracking protection --
const WORKER_CODE = `self.onmessage = function(e) {
	var data = e.data;
	var pattern = data.pattern;
	var flags = data.flags;
	var testString = data.testString;
	try {
		var flagsForExec = flags;
		var hasIndices = false;
		try {
			new RegExp("a", "d");
			if (flags.indexOf("d") === -1) flagsForExec = flags + "d";
			hasIndices = true;
		} catch(ignored) {}
		var regex = new RegExp(pattern, flagsForExec);
		var results = [];
		if (flags.indexOf("g") === -1) {
			var m = regex.exec(testString);
			if (m) {
				var ci = null;
				if (hasIndices && m.indices) {
					ci = [];
					for (var j = 1; j < m.indices.length; j++) {
						ci.push(m.indices[j] ? [m.indices[j][0], m.indices[j][1]] : null);
					}
				}
				results.push({
					index: 0, match: m[0], start: m.index, end: m.index + m[0].length,
					groups: m.groups ? Object.assign({}, m.groups) : null,
					captures: Array.prototype.slice.call(m, 1),
					captureIndices: ci
				});
			}
		} else {
			var idx = 0;
			var m2;
			while ((m2 = regex.exec(testString)) !== null) {
				if (idx >= 1000) break;
				var ci2 = null;
				if (hasIndices && m2.indices) {
					ci2 = [];
					for (var k = 1; k < m2.indices.length; k++) {
						ci2.push(m2.indices[k] ? [m2.indices[k][0], m2.indices[k][1]] : null);
					}
				}
				results.push({
					index: idx, match: m2[0], start: m2.index, end: m2.index + m2[0].length,
					groups: m2.groups ? Object.assign({}, m2.groups) : null,
					captures: Array.prototype.slice.call(m2, 1),
					captureIndices: ci2
				});
				idx++;
				if (m2[0].length === 0) regex.lastIndex++;
			}
		}
		self.postMessage({ matches: results, error: null });
	} catch(err) {
		self.postMessage({ matches: [], error: err.message });
	}
};`;

function createRegexWorker(): Worker {
	const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
	const url = URL.createObjectURL(blob);
	const worker = new Worker(url);
	URL.revokeObjectURL(url);
	return worker;
}

// -- Anthropic API call for regex explanation --
async function explainRegex(
	pattern: string,
	flags: string,
	apiKey: string,
): Promise<TokenExplanation[]> {
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"anthropic-dangerous-direct-browser-access": "true",
		},
		body: JSON.stringify({
			model: "claude-sonnet-4-20250514",
			max_tokens: 2048,
			messages: [
				{
					role: "user",
					content: `Break down this regular expression token by token.\nPattern: /${pattern}/${flags}\n\nReturn ONLY a JSON array where each element has:\n- "token": the exact regex token or fragment\n- "description": what it matches in plain English\n- "example": a short example string it would match\n\nCover every token in the pattern. Be precise and concise.`,
				},
			],
		}),
	});

	if (!response.ok) {
		if (response.status === 401)
			throw new Error("Invalid API key. Please check your Anthropic API key.");
		if (response.status === 429)
			throw new Error("Rate limited. Please wait a moment and try again.");
		throw new Error(`API error (${response.status})`);
	}

	const data = await response.json();
	const text = data.content?.[0]?.text;
	if (!text) throw new Error("Empty response from API");

	const jsonMatch = text.match(/\[[\s\S]*\]/);
	if (!jsonMatch) throw new Error("Failed to parse explanation from response");

	return JSON.parse(jsonMatch[0]) as TokenExplanation[];
}

// -- Inject highlight styles for Monaco decorations --
function ensureHighlightStyles() {
	const styleId = "regex-highlight-styles";
	if (typeof document !== "undefined" && !document.getElementById(styleId)) {
		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = `
			.regex-match-highlight { background-color: rgba(255, 165, 0, 0.35) !important; }
			.regex-group-1-highlight { background-color: rgba(66, 135, 245, 0.35) !important; }
			.regex-group-2-highlight { background-color: rgba(156, 39, 176, 0.35) !important; }
			.regex-group-3-highlight { background-color: rgba(0, 150, 136, 0.35) !important; }
		`;
		document.head.appendChild(style);
	}
}

// -- Synchronous fallback for test environments without Worker support --
function runMatches(
	pattern: string,
	flags: string,
	testString: string,
): { matches: MatchResult[]; error: string | null } {
	if (!pattern) return { matches: [], error: null };

	let regex: RegExp;
	try {
		regex = new RegExp(pattern, flags);
	} catch (e) {
		return { matches: [], error: (e as Error).message };
	}

	if (!testString) return { matches: [], error: null };

	// Guard against catastrophic backtracking: if not global, just do one exec
	if (!flags.includes("g")) {
		try {
			const m = regex.exec(testString);
			if (!m) return { matches: [], error: null };
			return {
				matches: [
					{
						index: 0,
						match: m[0],
						start: m.index,
						end: m.index + m[0].length,
						groups: m.groups ? { ...m.groups } : null,
						captures: m.slice(1),
					},
				],
				error: null,
			};
		} catch (e) {
			return { matches: [], error: (e as Error).message };
		}
	}

	const results: MatchResult[] = [];
	try {
		let idx = 0;
		for (const m of testString.matchAll(regex)) {
			if (idx >= 1000) break; // cap matches
			results.push({
				index: idx,
				match: m[0],
				start: m.index!,
				end: m.index! + m[0].length,
				groups: m.groups ? { ...m.groups } : null,
				captures: m.slice(1),
			});
			idx++;
		}
	} catch (e) {
		return { matches: [], error: (e as Error).message };
	}

	return { matches: results, error: null };
}

function runReplace(
	pattern: string,
	flags: string,
	testString: string,
	replacement: string,
): { result: string; error: string | null } {
	if (!pattern || !testString) return { result: "", error: null };
	try {
		const regex = new RegExp(pattern, flags);
		return { result: testString.replace(regex, replacement), error: null };
	} catch (e) {
		return { result: "", error: (e as Error).message };
	}
}

export function RegexTool() {
	const [pattern, setPattern] = useLocalStorage("devtools-regex-pattern", "");
	const [flags, setFlags] = useLocalStorage<RegexFlags>(
		"devtools-regex-flags",
		{
			g: true,
			i: false,
			m: false,
			s: false,
			u: false,
		},
	);
	const [input, setInput] = useLocalStorage("devtools-regex-input", "");
	const [replacement, setReplacement] = useState("");
	const [activeTab, setActiveTab] = useState<TabId>("matches");
	const [showPresets, setShowPresets] = useState(false);

	// Worker-based match execution state
	const [matches, setMatches] = useState<MatchResult[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [backtrackingWarning, setBacktrackingWarning] = useState(false);

	// Editor decoration refs
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const editorRef = useRef<any>(null);
	const decorationsRef = useRef<string[]>([]);
	const [editorMounted, setEditorMounted] = useState(false);

	const debouncedPattern = useDebounce(pattern, 200);
	const debouncedInput = useDebounce(input, 200);

	const flagString = useMemo(() => {
		return (Object.entries(flags) as [string, boolean][])
			.filter(([, v]) => v)
			.map(([k]) => k)
			.join("");
	}, [flags]);

	// -- Worker-based regex execution with 2s timeout --
	useEffect(() => {
		setBacktrackingWarning(false);

		if (!debouncedPattern) {
			setMatches([]);
			setError(null);
			return;
		}

		// Validate pattern syntax quickly on main thread
		try {
			new RegExp(debouncedPattern, flagString);
		} catch (e) {
			setMatches([]);
			setError((e as Error).message);
			return;
		}

		if (!debouncedInput) {
			setMatches([]);
			setError(null);
			return;
		}

		// Use Web Worker if available (browser), fall back to sync (test env)
		if (typeof Worker !== "undefined") {
			let cancelled = false;
			const worker = createRegexWorker();

			const timeout = setTimeout(() => {
				worker.terminate();
				if (!cancelled) {
					setMatches([]);
					setError(null);
					setBacktrackingWarning(true);
				}
			}, 2000);

			worker.onmessage = (e: MessageEvent) => {
				clearTimeout(timeout);
				if (!cancelled) {
					setMatches(e.data.matches);
					setError(e.data.error);
				}
				worker.terminate();
			};

			worker.onerror = () => {
				clearTimeout(timeout);
				if (!cancelled) {
					const result = runMatches(
						debouncedPattern,
						flagString,
						debouncedInput,
					);
					setMatches(result.matches);
					setError(result.error);
				}
				worker.terminate();
			};

			worker.postMessage({
				pattern: debouncedPattern,
				flags: flagString,
				testString: debouncedInput,
			});

			return () => {
				cancelled = true;
				clearTimeout(timeout);
				worker.terminate();
			};
		} else {
			// Synchronous fallback (test environment)
			const result = runMatches(debouncedPattern, flagString, debouncedInput);
			setMatches(result.matches);
			setError(result.error);
		}
	}, [debouncedPattern, flagString, debouncedInput]);

	// -- Replace result (synchronous, main thread) --
	const replaceResult = useMemo(
		() =>
			activeTab === "replace"
				? runReplace(debouncedPattern, flagString, debouncedInput, replacement)
				: null,
		[activeTab, debouncedPattern, flagString, debouncedInput, replacement],
	);

	// -- Monaco editor highlight decorations --
	useEffect(() => {
		ensureHighlightStyles();
	}, []);

	const handleEditorMount = useCallback((editor: unknown) => {
		editorRef.current = editor;
		setEditorMounted(true);
	}, []);

	const isLargeInput = input.length > LARGE_INPUT_THRESHOLD;

	useEffect(() => {
		if (!editorMounted) return;
		const editor = editorRef.current;
		if (!editor) return;
		const model = editor.getModel?.();
		if (!model) return;

		const limit = isLargeInput ? HIGHLIGHT_LIMIT : Infinity;
		const groupClasses = [
			"regex-group-1-highlight",
			"regex-group-2-highlight",
			"regex-group-3-highlight",
		];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const newDecorations: any[] = [];
		for (const m of matches) {
			if (m.start >= limit) continue;
			const end = Math.min(m.end, limit);
			const startPos = model.getPositionAt(m.start);
			const endPos = model.getPositionAt(end);

			newDecorations.push({
				range: {
					startLineNumber: startPos.lineNumber,
					startColumn: startPos.column,
					endLineNumber: endPos.lineNumber,
					endColumn: endPos.column,
				},
				options: { inlineClassName: "regex-match-highlight" },
			});

			// Group highlight decorations
			if (m.captureIndices) {
				m.captureIndices.forEach((indices, gi) => {
					if (!indices || indices[0] >= limit) return;
					const gEnd = Math.min(indices[1], limit);
					const gStartPos = model.getPositionAt(indices[0]);
					const gEndPos = model.getPositionAt(gEnd);
					newDecorations.push({
						range: {
							startLineNumber: gStartPos.lineNumber,
							startColumn: gStartPos.column,
							endLineNumber: gEndPos.lineNumber,
							endColumn: gEndPos.column,
						},
						options: {
							inlineClassName: groupClasses[gi % groupClasses.length],
						},
					});
				});
			}
		}

		decorationsRef.current = editor.deltaDecorations(
			decorationsRef.current,
			newDecorations,
		);
	}, [matches, editorMounted, isLargeInput]);

	const toggleFlag = useCallback(
		(flag: keyof RegexFlags) => {
			setFlags((prev) => ({ ...prev, [flag]: !prev[flag] }));
		},
		[setFlags],
	);

	const applyPreset = useCallback(
		(p: (typeof COMMON_PATTERNS)[0]) => {
			setPattern(p.pattern);
			const newFlags: RegexFlags = {
				g: false,
				i: false,
				m: false,
				s: false,
				u: false,
			};
			for (const ch of p.flags) {
				if (ch in newFlags)
					(newFlags as unknown as Record<string, boolean>)[ch] = true;
			}
			setFlags(newFlags);
		},
		[setPattern, setFlags],
	);

	const handleClear = useCallback(() => {
		setPattern("");
		setInput("");
	}, [setPattern, setInput]);

	const noGlobalWarning = !flags.g && pattern.trim().length > 0;

	return (
		<>
			<SEOHead tool={tool} />
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<button
						onClick={() => setShowPresets(!showPresets)}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Patterns
					</button>
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
				</ToolPageHeader>

				<div className='flex flex-1 overflow-hidden'>
					{/* Presets sidebar */}
					{showPresets && (
						<div className='w-56 shrink-0 overflow-y-auto border-r border-border bg-panel p-2'>
							<div className='mb-2 text-[10px] font-semibold uppercase text-muted-foreground'>
								Common Patterns
							</div>
							{COMMON_PATTERNS.map((p) => (
								<button
									key={p.name}
									onClick={() => {
										applyPreset(p);
										setShowPresets(false);
									}}
									className='flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent/10'
								>
									<ChevronRight className='h-3 w-3 shrink-0 text-muted-foreground' />
									{p.name}
								</button>
							))}
						</div>
					)}

					<div className='flex flex-1 flex-col overflow-hidden'>
						{/* Pattern bar */}
						<div className='flex items-center gap-2 border-b border-border bg-panel px-3 py-2'>
							<span className='text-xs text-muted-foreground font-mono'>/</span>
							<input
								type='text'
								value={pattern}
								onChange={(e) => setPattern(e.target.value)}
								placeholder='Enter regex pattern...'
								className='flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none'
								aria-label='Regex pattern'
								spellCheck={false}
							/>
							<span className='text-xs text-muted-foreground font-mono'>/</span>
							{/* Flag toggles with tooltips */}
							{(["g", "i", "m", "s", "u"] as const).map((f) => (
								<div key={f} className='relative group'>
									<button
										onClick={() => toggleFlag(f)}
										className={cn(
											"h-7 w-7 rounded text-xs font-mono font-bold transition-colors",
											flags[f]
												? "bg-accent text-accent-foreground"
												: "bg-zinc-700 text-zinc-400 hover:bg-zinc-600",
										)}
										aria-label={`Toggle flag ${f}`}
										aria-pressed={flags[f]}
									>
										{f}
									</button>
									<div
										role='tooltip'
										className='absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 shadow-lg ring-1 ring-zinc-700 z-50 pointer-events-none'
									>
										{FLAG_TOOLTIPS[f]}
									</div>
								</div>
							))}
							{matches.length > 0 && (
								<span className='rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent'>
									{matches.length} match{matches.length !== 1 ? "es" : ""}
								</span>
							)}
						</div>

						{noGlobalWarning && (
							<div className='flex items-center gap-1.5 border-b border-amber-500/30 bg-amber-500/5 px-3 py-1 text-[10px] text-amber-400'>
								<AlertCircle className='h-3 w-3' />
								Global flag (g) not set — only the first match is shown
							</div>
						)}

						{backtrackingWarning && (
							<div className='flex items-center gap-1.5 border-b border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-400'>
								<AlertCircle className='h-3.5 w-3.5' />
								Warning: this pattern may have catastrophic backtracking
								(execution timed out after 2s)
							</div>
						)}

						{isLargeInput && (
							<div className='flex items-center gap-1.5 border-b border-amber-500/30 bg-amber-500/5 px-3 py-1 text-[10px] text-amber-400'>
								<AlertCircle className='h-3 w-3' />
								Input exceeds 100KB — highlighting limited to the first 10KB for
								performance
							</div>
						)}

						{error && (
							<div className='border-b border-border px-3 py-2'>
								<ErrorBox error={error} />
							</div>
						)}

						{/* Test String */}
						<div className='flex-1 min-h-0 border-b border-border'>
							<div className='flex items-center justify-between border-b border-border px-3 py-1'>
								<span className='text-[10px] text-muted-foreground'>
									Test String
								</span>
								<span className='text-[10px] text-muted-foreground'>
									{input.length.toLocaleString()} chars
								</span>
							</div>
							<div className='h-[calc(100%-24px)]'>
								<MonacoWrapper
									value={input}
									onChange={(v) => setInput(v)}
									language='plaintext'
									aria-label='Test string'
									onEditorMount={handleEditorMount}
								/>
							</div>
						</div>

						{/* Results tabs */}
						<div className='flex h-[280px] shrink-0 flex-col'>
							<div className='flex border-b border-border'>
								{(["matches", "groups", "replace", "explain"] as const).map(
									(tab) => (
										<button
											key={tab}
											onClick={() => setActiveTab(tab)}
											className={cn(
												"px-4 py-1.5 text-xs font-medium transition-colors capitalize",
												activeTab === tab
													? "border-b-2 border-accent text-accent"
													: "text-muted-foreground hover:text-foreground",
												tab === "explain" && "flex items-center gap-1",
											)}
										>
											{tab === "explain" && <Sparkles className='h-3 w-3' />}
											{tab}
										</button>
									),
								)}
							</div>

							<div className='flex-1 overflow-y-auto p-3'>
								{activeTab === "matches" && <MatchesTab matches={matches} />}
								{activeTab === "groups" && <GroupsTab matches={matches} />}
								{activeTab === "replace" && (
									<ReplaceTab
										replacement={replacement}
										onReplacementChange={setReplacement}
										result={replaceResult}
									/>
								)}
								{activeTab === "explain" && (
									<ExplainTab pattern={debouncedPattern} flags={flagString} />
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

function MatchesTab({ matches }: { matches: MatchResult[] }) {
	if (matches.length === 0) {
		return (
			<div className='text-xs text-muted-foreground'>No matches found</div>
		);
	}
	return (
		<div className='space-y-1'>
			{matches.map((m) => (
				<div
					key={`${m.index}-${m.start}`}
					className='flex items-center gap-3 rounded border border-border bg-panel px-3 py-1.5'
				>
					<span className='shrink-0 text-[10px] font-mono text-muted-foreground'>
						#{m.index + 1}
					</span>
					<span className='flex-1 font-mono text-xs text-foreground break-all'>
						{m.match || (
							<span className='text-muted-foreground italic'>empty string</span>
						)}
					</span>
					<span className='shrink-0 text-[10px] text-muted-foreground'>
						[{m.start}–{m.end})
					</span>
					<CopyButton text={m.match} className='h-6 px-2' />
				</div>
			))}
		</div>
	);
}

function GroupsTab({ matches }: { matches: MatchResult[] }) {
	const hasGroups = matches.some((m) => m.captures.length > 0 || m.groups);
	if (!hasGroups) {
		return (
			<div className='text-xs text-muted-foreground'>
				No capture groups in pattern
			</div>
		);
	}
	return (
		<div className='space-y-3'>
			{matches.map((m) => (
				<div
					key={`${m.index}-${m.start}`}
					className='rounded border border-border bg-panel p-2'
				>
					<div className='mb-1.5 text-[10px] font-semibold text-muted-foreground'>
						Match #{m.index + 1}: "{m.match}"
					</div>
					<div className='space-y-1'>
						{m.captures.map((cap, ci) => (
							<div key={ci} className='flex items-center gap-2 text-xs'>
								<span className='shrink-0 font-mono text-muted-foreground'>
									Group {ci + 1}:
								</span>
								<span className='font-mono text-foreground'>
									{cap ?? (
										<span className='italic text-muted-foreground'>
											undefined
										</span>
									)}
								</span>
							</div>
						))}
						{m.groups &&
							Object.entries(m.groups).map(([name, val]) => (
								<div key={name} className='flex items-center gap-2 text-xs'>
									<span className='shrink-0 font-mono text-accent'>
										{name}:
									</span>
									<span className='font-mono text-foreground'>{val}</span>
								</div>
							))}
					</div>
				</div>
			))}
		</div>
	);
}

function ReplaceTab({
	replacement,
	onReplacementChange,
	result,
}: {
	replacement: string;
	onReplacementChange: (v: string) => void;
	result: { result: string; error: string | null } | null;
}) {
	return (
		<div className='space-y-3'>
			<div>
				<label className='mb-1 block text-[10px] font-semibold text-muted-foreground'>
					Replacement String
				</label>
				<input
					type='text'
					value={replacement}
					onChange={(e) => onReplacementChange(e.target.value)}
					placeholder='Use $1, $2, $& for backreferences...'
					className='w-full rounded border border-border bg-zinc-800 px-2 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent'
					spellCheck={false}
				/>
			</div>
			{result?.error && <ErrorBox error={result.error} />}
			{result && !result.error && result.result && (
				<div>
					<div className='mb-1 flex items-center justify-between'>
						<span className='text-[10px] font-semibold text-muted-foreground'>
							Result
						</span>
						<CopyButton text={result.result} className='h-6 px-2' />
					</div>
					<pre className='max-h-32 overflow-auto rounded border border-border bg-zinc-800 p-2 font-mono text-xs text-foreground whitespace-pre-wrap break-all'>
						{result.result}
					</pre>
				</div>
			)}
		</div>
	);
}

function ExplainTab({ pattern, flags }: { pattern: string; flags: string }) {
	const [apiKey] = useLocalStorage("devtools-anthropic-key", "");
	const [explanation, setExplanation] = useState<TokenExplanation[] | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const [explainError, setExplainError] = useState<string | null>(null);

	const handleExplain = useCallback(async () => {
		if (!pattern || !apiKey) return;
		setLoading(true);
		setExplainError(null);
		setExplanation(null);
		try {
			const result = await explainRegex(pattern, flags, apiKey);
			setExplanation(result);
		} catch (e) {
			setExplainError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}, [pattern, flags, apiKey]);

	if (!apiKey) {
		return (
			<div className='flex items-center gap-2 rounded border border-border bg-panel px-3 py-3 text-xs text-muted-foreground'>
				<AlertCircle className='h-4 w-4 shrink-0' />
				Set your Anthropic API key in settings to use this feature
			</div>
		);
	}

	if (!pattern) {
		return (
			<div className='text-xs text-muted-foreground'>
				Enter a regex pattern to explain
			</div>
		);
	}

	return (
		<div className='space-y-3'>
			<button
				onClick={handleExplain}
				disabled={loading}
				className='flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50'
			>
				{loading ? (
					<Loader2 className='h-3 w-3 animate-spin' />
				) : (
					<Sparkles className='h-3 w-3' />
				)}
				{loading ? "Analyzing..." : "Explain this regex"}
			</button>

			{explainError && <ErrorBox error={explainError} />}

			{explanation && (
				<div className='overflow-x-auto rounded border border-border'>
					<table className='w-full text-xs'>
						<thead>
							<tr className='border-b border-border bg-panel'>
								<th className='px-3 py-1.5 text-left font-semibold text-muted-foreground'>
									Token
								</th>
								<th className='px-3 py-1.5 text-left font-semibold text-muted-foreground'>
									What it matches
								</th>
								<th className='px-3 py-1.5 text-left font-semibold text-muted-foreground'>
									Example
								</th>
							</tr>
						</thead>
						<tbody>
							{explanation.map((row, i) => (
								<tr
									key={i}
									className='border-b border-border last:border-0 hover:bg-accent/5'
								>
									<td className='px-3 py-1.5 font-mono text-accent'>
										{row.token}
									</td>
									<td className='px-3 py-1.5 text-foreground'>
										{row.description}
									</td>
									<td className='px-3 py-1.5 font-mono text-muted-foreground'>
										{row.example}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
