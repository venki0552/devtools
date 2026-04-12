import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { ChevronRight, ChevronDown, Search } from "lucide-react";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { useHistory } from "@/lib/use-history";
import { cn, formatBytes } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { StatsBar } from "@/components/shared/StatsBar";
import { HistoryPanel } from "@/components/shared/HistoryPanel";
import { smartParse, formatJson, minifyJson } from "./parser";
import { STRATEGY_LABELS } from "./types";
import type { JsonPrefs } from "./types";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import { copyToClipboard } from "@/lib/clipboard";

const tool = TOOLS.find((t) => t.id === "json")!;

const ONE_MB = 1024 * 1024;
const LARGE_ARRAY_THRESHOLD = 1000;
const LARGE_ARRAY_CAP = 200;
const DEEP_NESTING_THRESHOLD = 50;
const isMac =
	typeof navigator !== "undefined" &&
	/Mac|iPhone|iPad/.test(navigator.userAgent);
const SHORTCUTS = {
	format: isMac ? "⌘⇧F" : "Ctrl+Shift+F",
	minify: isMac ? "⌘⇧M" : "Ctrl+Shift+M",
	copy: isMac ? "⌘⇧C" : "Ctrl+Shift+C",
	clear: isMac ? "⌘K" : "Ctrl+K",
};

function getMaxDepth(data: unknown, depth = 0): number {
	if (Array.isArray(data)) {
		let max = depth;
		for (const item of data) {
			const d = getMaxDepth(item, depth + 1);
			if (d > max) max = d;
		}
		return max;
	}
	if (data !== null && typeof data === "object") {
		let max = depth;
		for (const v of Object.values(data as Record<string, unknown>)) {
			const d = getMaxDepth(v, depth + 1);
			if (d > max) max = d;
		}
		return max;
	}
	return depth;
}

function countKeys(data: unknown): number {
	if (Array.isArray(data)) {
		let count = 0;
		for (const item of data) count += countKeys(item);
		return count;
	}
	if (data !== null && typeof data === "object") {
		let count = 0;
		for (const v of Object.values(data as Record<string, unknown>)) {
			count += 1 + countKeys(v);
		}
		return count;
	}
	return 0;
}

function getTypeBadge(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return `array[${value.length}]`;
	switch (typeof value) {
		case "string":
			return "string";
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "object":
			return `object{${Object.keys(value as Record<string, unknown>).length}}`;
		default:
			return typeof value;
	}
}

function typeBadgeColor(value: unknown): string {
	if (value === null) return "text-zinc-400 bg-zinc-400/10";
	if (Array.isArray(value)) return "text-purple-400 bg-purple-400/10";
	switch (typeof value) {
		case "string":
			return "text-green-400 bg-green-400/10";
		case "number":
			return "text-blue-400 bg-blue-400/10";
		case "boolean":
			return "text-yellow-400 bg-yellow-400/10";
		case "object":
			return "text-orange-400 bg-orange-400/10";
		default:
			return "text-zinc-400 bg-zinc-400/10";
	}
}

function isLeaf(value: unknown): boolean {
	return value === null || typeof value !== "object";
}

function textMatches(text: string, search: string): boolean {
	if (!search) return false;
	return text.toLowerCase().includes(search.toLowerCase());
}

function TreeNode({
	name,
	value,
	depth,
	searchTerm,
	expanded,
	onToggle,
	path,
}: {
	name: string | number;
	value: unknown;
	depth: number;
	searchTerm: string;
	expanded: Set<string>;
	onToggle: (path: string) => void;
	path: string;
}) {
	const [copied, setCopied] = useState(false);
	const isExpanded = expanded.has(path);
	const leaf = isLeaf(value);
	const nameStr = String(name);
	const keyMatch = textMatches(nameStr, searchTerm);
	const valueStr = leaf ? JSON.stringify(value) : "";
	const valMatch = leaf && textMatches(valueStr, searchTerm);

	const handleCopyLeaf = useCallback(async () => {
		if (!leaf) return;
		const text = typeof value === "string" ? value : JSON.stringify(value);
		const ok = await copyToClipboard(text);
		if (ok) {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}
	}, [value, leaf]);

	return (
		<div>
			<div
				className='group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-800/50'
				style={{ paddingLeft: depth * 16 }}
			>
				{!leaf ? (
					<button
						onClick={() => onToggle(path)}
						className='flex h-4 w-4 shrink-0 items-center justify-center text-zinc-400 hover:text-zinc-200'
						aria-label={isExpanded ? "Collapse" : "Expand"}
					>
						{isExpanded ? (
							<ChevronDown className='h-3 w-3' />
						) : (
							<ChevronRight className='h-3 w-3' />
						)}
					</button>
				) : (
					<span className='w-4 shrink-0' />
				)}
				<span
					className={cn(
						"font-mono text-xs text-zinc-300",
						keyMatch && "rounded bg-orange-500/30 px-0.5 text-orange-200",
					)}
				>
					{nameStr}
				</span>
				<span className='text-xs text-zinc-500'>:</span>
				{leaf && (
					<span
						className={cn(
							"cursor-pointer font-mono text-xs hover:underline",
							valMatch && "rounded bg-orange-500/30 px-0.5 text-orange-200",
							copied ? "text-green-400" : "text-zinc-400",
						)}
						onClick={handleCopyLeaf}
						title='Click to copy value'
					>
						{copied ? "Copied!" : valueStr}
					</span>
				)}
				<span
					className={cn(
						"ml-auto rounded px-1 text-[9px]",
						typeBadgeColor(value),
					)}
				>
					{getTypeBadge(value)}
				</span>
			</div>
			{!leaf && isExpanded && Array.isArray(value) && (
				<TreeArrayChildren
					items={value}
					depth={depth + 1}
					searchTerm={searchTerm}
					expanded={expanded}
					onToggle={onToggle}
					parentPath={path}
				/>
			)}
			{!leaf &&
				isExpanded &&
				!Array.isArray(value) &&
				value !== null &&
				typeof value === "object" &&
				Object.entries(value as Record<string, unknown>).map(([k, v]) => (
					<TreeNode
						key={k}
						name={k}
						value={v}
						depth={depth + 1}
						searchTerm={searchTerm}
						expanded={expanded}
						onToggle={onToggle}
						path={`${path}.${k}`}
					/>
				))}
		</div>
	);
}

function TreeArrayChildren({
	items,
	depth,
	searchTerm,
	expanded,
	onToggle,
	parentPath,
}: {
	items: unknown[];
	depth: number;
	searchTerm: string;
	expanded: Set<string>;
	onToggle: (path: string) => void;
	parentPath: string;
}) {
	const [showAll, setShowAll] = useState(false);
	const isLarge = items.length >= LARGE_ARRAY_THRESHOLD;
	const display = isLarge && !showAll ? items.slice(0, LARGE_ARRAY_CAP) : items;

	return (
		<>
			{display.map((item, i) => (
				<TreeNode
					key={i}
					name={i}
					value={item}
					depth={depth}
					searchTerm={searchTerm}
					expanded={expanded}
					onToggle={onToggle}
					path={`${parentPath}[${i}]`}
				/>
			))}
			{isLarge && !showAll && (
				<div style={{ paddingLeft: depth * 16 }} className='py-1'>
					<button
						onClick={() => setShowAll(true)}
						className='px-1 text-[10px] text-accent hover:underline'
					>
						… {items.length - LARGE_ARRAY_CAP} more items — Show all
					</button>
				</div>
			)}
			{isLarge && (
				<div style={{ paddingLeft: depth * 16 }} className='py-0.5'>
					<span className='text-[9px] text-muted-foreground'>
						Array has {items.length.toLocaleString()} items
					</span>
				</div>
			)}
		</>
	);
}

function KBD({ children }: { children: React.ReactNode }) {
	return (
		<kbd className='ml-1.5 hidden rounded bg-zinc-800 px-1 py-0.5 text-[9px] text-zinc-500 sm:inline'>
			{children}
		</kbd>
	);
}

export function JsonTool() {
	const [input, setInput] = useLocalStorage("devtools-json-input", "");
	const [prefs, setPrefs] = useLocalStorage<JsonPrefs>("devtools-json-prefs", {
		indent: 2,
		sortKeys: false,
	});
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [strategy, setStrategy] = useState<string | null>(null);
	const [processingTime, setProcessingTime] = useState<number | undefined>();
	const [showHistory, setShowHistory] = useState(false);
	const { entries, addEntry, removeEntry, clearHistory } = useHistory(
		"devtools-json-history",
	);
	const parsedRef = useRef<unknown>(undefined);
	const debouncedInput = useDebounce(input, 300);

	const [outputTab, setOutputTab] = useState<"output" | "tree">("output");
	const [treeSearch, setTreeSearch] = useState("");
	const [treeExpanded, setTreeExpanded] = useState<Set<string>>(
		() => new Set(["$"]),
	);
	const [showRestored, setShowRestored] = useState(false);
	const [depthWarning, setDepthWarning] = useState(false);

	const inputBytes = new TextEncoder().encode(input).length;
	const outputBytes = new TextEncoder().encode(output).length;
	const isLargeInput = inputBytes > ONE_MB;

	const didMount = useRef(false);
	useEffect(() => {
		if (!didMount.current) {
			didMount.current = true;
			if (input.trim()) {
				setShowRestored(true);
				const timer = setTimeout(() => setShowRestored(false), 2000);
				return () => clearTimeout(timer);
			}
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const treeStats = useMemo(() => {
		if (parsedRef.current === undefined || isLargeInput) return null;
		return {
			keyCount: countKeys(parsedRef.current),
			maxDepth: getMaxDepth(parsedRef.current),
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [output, isLargeInput]);

	const processInput = useCallback(
		(text: string) => {
			if (!text.trim()) {
				setOutput("");
				setError(null);
				setStrategy(null);
				setProcessingTime(undefined);
				parsedRef.current = undefined;
				setDepthWarning(false);
				return;
			}
			const start = performance.now();
			const result = smartParse(text);
			const elapsed = performance.now() - start;
			setProcessingTime(elapsed);

			if (result.success) {
				parsedRef.current = result.data;
				const formatted = formatJson(result.data, prefs.indent, prefs.sortKeys);
				setOutput(formatted);
				setError(null);
				setStrategy(result.strategy ? STRATEGY_LABELS[result.strategy] : null);
				setDepthWarning(getMaxDepth(result.data) > DEEP_NESTING_THRESHOLD);
			} else {
				parsedRef.current = undefined;
				setOutput("");
				setError(result.error?.message ?? "Invalid JSON");
				setStrategy(null);
				setDepthWarning(false);
			}
		},
		[prefs.indent, prefs.sortKeys],
	);

	useEffect(() => {
		processInput(debouncedInput);
	}, [debouncedInput, processInput]);

	const handleFormat = useCallback(() => {
		if (parsedRef.current !== undefined) {
			const formatted = formatJson(
				parsedRef.current,
				prefs.indent,
				prefs.sortKeys,
			);
			setOutput(formatted);
			if (input.trim()) addEntry(input);
		}
	}, [prefs, input, addEntry]);

	const handleMinify = useCallback(() => {
		if (parsedRef.current !== undefined) {
			setOutput(minifyJson(parsedRef.current));
			if (input.trim()) addEntry(input);
		}
	}, [input, addEntry]);

	const handleClear = useCallback(() => {
		setInput("");
		setOutput("");
		setError(null);
		setStrategy(null);
		parsedRef.current = undefined;
		setDepthWarning(false);
	}, [setInput]);

	const toggleSortKeys = useCallback(() => {
		setPrefs((p) => ({ ...p, sortKeys: !p.sortKeys }));
	}, [setPrefs]);

	const toggleTreeNode = useCallback((path: string) => {
		setTreeExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const mod = isMac ? e.metaKey : e.ctrlKey;
			if (!mod) return;
			if (e.shiftKey && e.key.toLowerCase() === "f") {
				e.preventDefault();
				handleFormat();
			} else if (e.shiftKey && e.key.toLowerCase() === "m") {
				e.preventDefault();
				handleMinify();
			} else if (e.shiftKey && e.key.toLowerCase() === "c") {
				e.preventDefault();
				if (output) copyToClipboard(output);
			} else if (!e.shiftKey && e.key.toLowerCase() === "k") {
				e.preventDefault();
				handleClear();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [handleFormat, handleMinify, handleClear, output]);

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<button
						onClick={handleFormat}
						className='h-8 rounded-md bg-accent px-3 text-xs font-medium text-zinc-950 hover:bg-accent/80'
					>
						Format
						<KBD>{SHORTCUTS.format}</KBD>
					</button>
					<button
						onClick={handleMinify}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Minify
						<KBD>{SHORTCUTS.minify}</KBD>
					</button>
					<button
						onClick={toggleSortKeys}
						className={cn(
							"h-8 rounded-md px-3 text-xs font-medium",
							prefs.sortKeys
								? "bg-accent/20 text-accent"
								: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
						)}
					>
						Sort Keys
					</button>
					<select
						value={prefs.indent === "tab" ? "tab" : String(prefs.indent)}
						onChange={(e) =>
							setPrefs((p) => ({
								...p,
								indent:
									e.target.value === "tab"
										? "tab"
										: (Number(e.target.value) as 2 | 4),
							}))
						}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='Indent size'
					>
						<option value='2'>2 spaces</option>
						<option value='4'>4 spaces</option>
						<option value='tab'>Tab</option>
					</select>
					<span className='flex items-center'>
						<CopyButton text={output} label='Copy' />
						<KBD>{SHORTCUTS.copy}</KBD>
					</span>
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
						<KBD>{SHORTCUTS.clear}</KBD>
					</button>
					<button
						onClick={() => setShowHistory(true)}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						History
					</button>
				</ToolPageHeader>

				<div className='flex flex-1 overflow-hidden'>
					<div className='flex flex-1 flex-col border-r border-border'>
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<div className='flex items-center gap-2'>
								<span className='text-[10px] text-muted-foreground'>Input</span>
								{showRestored && (
									<span className='rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent'>
										Restored
									</span>
								)}
							</div>
							<span className='text-[10px] text-muted-foreground'>
								{input.length.toLocaleString()} chars
							</span>
						</div>
						<div className='flex-1'>
							<MonacoWrapper
								value={input}
								onChange={(v) => setInput(v ?? "")}
								language={output ? "json" : "plaintext"}
								height='100%'
							/>
						</div>
						{error && (
							<div className='p-2'>
								<ErrorBox error={error} />
							</div>
						)}
						{strategy && !error && (
							<div className='px-3 py-1'>
								<span className='inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent'>
									{strategy}
								</span>
							</div>
						)}
					</div>

					<div className='flex flex-1 flex-col'>
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<div className='flex items-center gap-2'>
								<button
									onClick={() => setOutputTab("output")}
									className={cn(
										"text-[10px]",
										outputTab === "output"
											? "font-medium text-accent"
											: "text-muted-foreground hover:text-zinc-300",
									)}
								>
									Output
								</button>
								<button
									onClick={() => setOutputTab("tree")}
									className={cn(
										"text-[10px]",
										outputTab === "tree"
											? "font-medium text-accent"
											: "text-muted-foreground hover:text-zinc-300",
									)}
								>
									Tree View
								</button>
							</div>
							<span className='text-[10px] text-muted-foreground'>
								{formatBytes(outputBytes)}
							</span>
						</div>
						{outputTab === "output" ? (
							<div className='flex-1'>
								<MonacoWrapper
									value={output}
									language='json'
									readOnly
									height='100%'
								/>
							</div>
						) : (
							<div className='flex-1 overflow-auto'>
								{isLargeInput ? (
									<div className='flex items-center justify-center p-4'>
										<span className='rounded bg-yellow-500/10 px-2 py-1 text-xs text-yellow-400'>
											Large input — tree view disabled for performance
										</span>
									</div>
								) : parsedRef.current !== undefined ? (
									<div className='p-2'>
										<div className='mb-2 flex items-center gap-2 px-1'>
											<Search className='h-3.5 w-3.5 text-muted-foreground' />
											<input
												type='text'
												placeholder='Search keys and values…'
												value={treeSearch}
												onChange={(e) => setTreeSearch(e.target.value)}
												className='h-7 flex-1 rounded border border-border bg-zinc-800 px-2 text-xs text-zinc-200 placeholder:text-zinc-500'
											/>
										</div>
										{treeStats && (
											<div className='mb-2 flex gap-3 px-1 text-[10px] text-muted-foreground'>
												<span>Keys: {treeStats.keyCount.toLocaleString()}</span>
												<span>Max depth: {treeStats.maxDepth}</span>
											</div>
										)}
										<TreeNode
											name='root'
											value={parsedRef.current}
											depth={0}
											searchTerm={treeSearch}
											expanded={treeExpanded}
											onToggle={toggleTreeNode}
											path='$'
										/>
									</div>
								) : (
									<div className='flex h-full items-center justify-center text-xs text-muted-foreground'>
										No valid JSON to display
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				{(depthWarning || isLargeInput) && (
					<div className='flex items-center gap-2 border-t border-border px-3 py-1'>
						{isLargeInput && (
							<span className='rounded bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-400'>
								Large input ({formatBytes(inputBytes)}) — tree view disabled
							</span>
						)}
						{depthWarning && (
							<span className='rounded bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-400'>
								Deeply nested (&gt;50 levels)
							</span>
						)}
					</div>
				)}

				<StatsBar
					inputChars={input.length}
					inputBytes={inputBytes}
					outputChars={output.length}
					outputBytes={outputBytes}
					processingTime={processingTime}
				/>
			</div>

			{showHistory && (
				<HistoryPanel
					onClose={() => setShowHistory(false)}
					entries={entries}
					onRestore={(value) => {
						setInput(value);
						setShowHistory(false);
					}}
					onRemove={removeEntry}
					onClear={clearHistory}
				/>
			)}
		</>
	);
}
