import { useState, useMemo, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import {
	diffLines,
	diffWords,
	diffChars,
	diffSentences,
	createTwoFilesPatch,
	type Change,
} from "diff";
import { ArrowLeftRight, Download, Columns, AlignJustify } from "lucide-react";

const tool = TOOLS.find((t) => t.id === "diff")!;

type DiffMode = "lines" | "words" | "characters" | "sentences";
type ViewMode = "unified" | "side-by-side";
type ContextLines = 0 | 1 | 3 | 5 | "all";

const SIZE_LIMIT = 100 * 1024; // 100KB

/* ---------- Utility functions ---------- */

function detectBinary(text: string): boolean {
	// eslint-disable-next-line no-control-regex
	return /[\x00-\x08\x0E-\x1F]/.test(text);
}

function computeDiff(
	original: string,
	modified: string,
	mode: DiffMode,
	ignoreCase: boolean,
	ignoreWhitespace: boolean,
): Change[] {
	const opts: Record<string, boolean> = {};
	if (ignoreWhitespace) opts.ignoreWhitespace = true;

	const left = ignoreCase ? original.toLowerCase() : original;
	const right = ignoreCase ? modified.toLowerCase() : modified;

	switch (mode) {
		case "lines":
			return diffLines(left, right, opts);
		case "words":
			return diffWords(left, right, opts);
		case "characters":
			return diffChars(left, right, opts);
		case "sentences":
			return diffSentences(left, right);
	}
}

function buildDiffText(changes: Change[]): string {
	return changes
		.map((c) => {
			const prefix = c.added ? "+ " : c.removed ? "- " : "  ";
			return c.value
				.split("\n")
				.filter((line, i, arr) => !(i === arr.length - 1 && line === ""))
				.map((line) => prefix + line)
				.join("\n");
		})
		.join("\n");
}

function splitLines(value: string): string[] {
	const lines = value.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines;
}

/* ---------- Unified view helpers ---------- */

interface FlatLine {
	type: "added" | "removed" | "unchanged";
	content: string;
}

interface SeparatorLine {
	type: "separator";
	hiddenCount: number;
}

function flattenChanges(changes: Change[]): FlatLine[] {
	const lines: FlatLine[] = [];
	for (const change of changes) {
		const type: FlatLine["type"] = change.added
			? "added"
			: change.removed
				? "removed"
				: "unchanged";
		const parts = splitLines(change.value);
		for (const part of parts) {
			lines.push({ type, content: part });
		}
	}
	return lines;
}

function filterByContext(
	lines: FlatLine[],
	ctx: ContextLines,
): (FlatLine | SeparatorLine)[] {
	if (ctx === "all") return lines;

	const isChanged = lines.map((l) => l.type !== "unchanged");
	const visible = new Array(lines.length).fill(false);

	for (let i = 0; i < lines.length; i++) {
		if (isChanged[i]) {
			for (
				let j = Math.max(0, i - ctx);
				j <= Math.min(lines.length - 1, i + ctx);
				j++
			) {
				visible[j] = true;
			}
		}
	}

	const result: (FlatLine | SeparatorLine)[] = [];
	let hiddenCount = 0;

	for (let i = 0; i < lines.length; i++) {
		if (visible[i]) {
			if (hiddenCount > 0) {
				result.push({ type: "separator", hiddenCount });
				hiddenCount = 0;
			}
			result.push(lines[i]);
		} else {
			hiddenCount++;
		}
	}

	if (hiddenCount > 0) {
		result.push({ type: "separator", hiddenCount });
	}

	return result;
}

/* ---------- Side-by-side view helpers ---------- */

interface SideLine {
	type: "added" | "removed" | "unchanged" | "empty";
	content: string;
	innerDiff?: Change[];
}

function buildSideBySideData(changes: Change[]): {
	left: SideLine[];
	right: SideLine[];
} {
	const left: SideLine[] = [];
	const right: SideLine[] = [];

	let i = 0;
	while (i < changes.length) {
		const change = changes[i];

		if (!change.added && !change.removed) {
			// Pad to align before adding unchanged lines
			const gap = left.length - right.length;
			if (gap > 0) {
				for (let j = 0; j < gap; j++)
					right.push({ type: "empty", content: "" });
			} else if (gap < 0) {
				for (let j = 0; j < -gap; j++)
					left.push({ type: "empty", content: "" });
			}

			const lines = splitLines(change.value);
			for (const line of lines) {
				left.push({ type: "unchanged", content: line });
				right.push({ type: "unchanged", content: line });
			}
			i++;
		} else if (change.removed) {
			const removedLines = splitLines(change.value);
			const next = i + 1 < changes.length ? changes[i + 1] : null;

			if (next && next.added) {
				// Paired modification — compute inner char diffs
				const addedLines = splitLines(next.value);
				const maxLen = Math.max(removedLines.length, addedLines.length);
				for (let j = 0; j < maxLen; j++) {
					if (j < removedLines.length && j < addedLines.length) {
						const inner = diffChars(removedLines[j], addedLines[j]);
						left.push({
							type: "removed",
							content: removedLines[j],
							innerDiff: inner,
						});
						right.push({
							type: "added",
							content: addedLines[j],
							innerDiff: inner,
						});
					} else if (j < removedLines.length) {
						left.push({ type: "removed", content: removedLines[j] });
						right.push({ type: "empty", content: "" });
					} else {
						left.push({ type: "empty", content: "" });
						right.push({ type: "added", content: addedLines[j] });
					}
				}
				i += 2;
			} else {
				for (const line of removedLines) {
					left.push({ type: "removed", content: line });
					right.push({ type: "empty", content: "" });
				}
				i++;
			}
		} else if (change.added) {
			const addedLines = splitLines(change.value);
			for (const line of addedLines) {
				left.push({ type: "empty", content: "" });
				right.push({ type: "added", content: line });
			}
			i++;
		} else {
			i++;
		}
	}

	// Final padding
	while (left.length < right.length) left.push({ type: "empty", content: "" });
	while (right.length < left.length) right.push({ type: "empty", content: "" });

	return { left, right };
}

function filterSideBySideByContext(
	left: SideLine[],
	right: SideLine[],
	ctx: ContextLines,
): { left: (SideLine | SeparatorLine)[]; right: (SideLine | SeparatorLine)[] } {
	if (ctx === "all") return { left, right };

	const isChanged = left.map(
		(l, idx) => l.type !== "unchanged" || right[idx]?.type !== "unchanged",
	);
	const visible = new Array(left.length).fill(false);

	for (let i = 0; i < left.length; i++) {
		if (isChanged[i]) {
			for (
				let j = Math.max(0, i - ctx);
				j <= Math.min(left.length - 1, i + ctx);
				j++
			) {
				visible[j] = true;
			}
		}
	}

	const filteredLeft: (SideLine | SeparatorLine)[] = [];
	const filteredRight: (SideLine | SeparatorLine)[] = [];
	let hiddenCount = 0;

	for (let i = 0; i < left.length; i++) {
		if (visible[i]) {
			if (hiddenCount > 0) {
				filteredLeft.push({ type: "separator", hiddenCount });
				filteredRight.push({ type: "separator", hiddenCount });
				hiddenCount = 0;
			}
			filteredLeft.push(left[i]);
			filteredRight.push(right[i]);
		} else {
			hiddenCount++;
		}
	}

	if (hiddenCount > 0) {
		filteredLeft.push({ type: "separator", hiddenCount });
		filteredRight.push({ type: "separator", hiddenCount });
	}

	return { left: filteredLeft, right: filteredRight };
}

/* ---------- Inner diff rendering ---------- */

function renderInnerDiff(
	innerDiff: Change[],
	side: "left" | "right",
): React.ReactNode[] {
	return innerDiff
		.filter((c) => (side === "left" ? !c.added : !c.removed))
		.map((c, i) => {
			const isHighlighted = side === "left" ? c.removed : c.added;
			return (
				<span
					key={i}
					className={cn(
						isHighlighted &&
							(side === "left"
								? "bg-red-500/30 rounded-sm"
								: "bg-green-500/30 rounded-sm"),
					)}
				>
					{c.value}
				</span>
			);
		});
}

/* ---------- Main component ---------- */

export function DiffTool() {
	const [left, setLeft] = useLocalStorage("devtools-diff-left", "");
	const [right, setRight] = useLocalStorage("devtools-diff-right", "");
	const [mode, setMode] = useState<DiffMode>("lines");
	const [viewMode, setViewMode] = useState<ViewMode>("unified");
	const [contextLines, setContextLines] = useState<ContextLines>("all");
	const [ignoreCase, setIgnoreCase] = useState(false);
	const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
	const [leftDragActive, setLeftDragActive] = useState(false);
	const [rightDragActive, setRightDragActive] = useState(false);

	const leftScrollRef = useRef<HTMLDivElement>(null);
	const rightScrollRef = useRef<HTMLDivElement>(null);
	const scrollSyncing = useRef(false);

	const debouncedLeft = useDebounce(left, 300);
	const debouncedRight = useDebounce(right, 300);

	// Binary detection
	const leftBinary = useMemo(
		() => detectBinary(debouncedLeft),
		[debouncedLeft],
	);
	const rightBinary = useMemo(
		() => detectBinary(debouncedRight),
		[debouncedRight],
	);
	const hasBinary = leftBinary || rightBinary;

	// Force line diff for large texts or binary
	const effectiveMode = useMemo(() => {
		if (hasBinary) return "lines";
		const totalSize = new Blob([debouncedLeft, debouncedRight]).size;
		if (totalSize > SIZE_LIMIT) return "lines";
		return mode;
	}, [mode, debouncedLeft, debouncedRight, hasBinary]);

	const isLargeInput = useMemo(() => {
		return new Blob([debouncedLeft, debouncedRight]).size > SIZE_LIMIT;
	}, [debouncedLeft, debouncedRight]);

	const { changes, stats } = useMemo(() => {
		if (!debouncedLeft.trim() && !debouncedRight.trim()) {
			return {
				changes: [] as Change[],
				stats: { added: 0, removed: 0, unchanged: 0 },
			};
		}

		const result = computeDiff(
			debouncedLeft,
			debouncedRight,
			effectiveMode,
			ignoreCase,
			ignoreWhitespace,
		);

		let added = 0;
		let removed = 0;
		let unchanged = 0;

		for (const c of result) {
			const count = c.count ?? (c.value.split("\n").length - 1 || 1);
			if (c.added) added += count;
			else if (c.removed) removed += count;
			else unchanged += count;
		}

		return { changes: result, stats: { added, removed, unchanged } };
	}, [
		debouncedLeft,
		debouncedRight,
		effectiveMode,
		ignoreCase,
		ignoreWhitespace,
	]);

	// Character stats
	const charStats = useMemo(() => {
		let charsAdded = 0;
		let charsRemoved = 0;
		for (const c of changes) {
			if (c.added) charsAdded += c.value.length;
			else if (c.removed) charsRemoved += c.value.length;
		}
		return { charsAdded, charsRemoved };
	}, [changes]);

	// Similarity percentage (char-level for accuracy)
	const similarity = useMemo(() => {
		if (!debouncedLeft && !debouncedRight) return 100;
		if (!debouncedLeft || !debouncedRight) return 0;

		const charChanges = diffChars(
			ignoreCase ? debouncedLeft.toLowerCase() : debouncedLeft,
			ignoreCase ? debouncedRight.toLowerCase() : debouncedRight,
		);

		let unchangedLen = 0;
		let totalLen = 0;
		for (const c of charChanges) {
			totalLen += c.value.length;
			if (!c.added && !c.removed) unchangedLen += c.value.length;
		}

		return totalLen > 0 ? Math.round((unchangedLen / totalLen) * 100) : 100;
	}, [debouncedLeft, debouncedRight, ignoreCase]);

	const diffText = useMemo(() => buildDiffText(changes), [changes]);

	// Stats summary text for "Copy Stats"
	const statsSummary = useMemo(() => {
		return [
			`+${stats.added} added`,
			`-${stats.removed} removed`,
			`${stats.unchanged} unchanged`,
			`Characters added: ${charStats.charsAdded}`,
			`Characters removed: ${charStats.charsRemoved}`,
			`Overall similarity: ${similarity}%`,
		].join(" | ");
	}, [stats, charStats, similarity]);

	// Unified view data with context filtering
	const unifiedLines = useMemo(() => {
		const flat = flattenChanges(changes);
		return filterByContext(flat, contextLines);
	}, [changes, contextLines]);

	// Side-by-side view data with context filtering
	const sideBySideData = useMemo(() => {
		const { left: l, right: r } = buildSideBySideData(changes);
		return filterSideBySideByContext(l, r, contextLines);
	}, [changes, contextLines]);

	const handleSwap = useCallback(() => {
		const l = left;
		setLeft(right);
		setRight(l);
	}, [left, right, setLeft, setRight]);

	// File drop handler
	const handleDrop = useCallback(
		(e: React.DragEvent, setter: (v: string) => void) => {
			e.preventDefault();
			e.stopPropagation();
			const file = e.dataTransfer.files[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = (ev) => {
					if (typeof ev.target?.result === "string") {
						setter(ev.target.result);
					}
				};
				reader.readAsText(file);
			}
		},
		[],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	// Download .patch
	const handleDownloadPatch = useCallback(() => {
		const patch = createTwoFilesPatch(
			"original",
			"modified",
			debouncedLeft,
			debouncedRight,
		);
		const blob = new Blob([patch], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "diff.patch";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [debouncedLeft, debouncedRight]);

	// Synchronized scroll for side-by-side
	const handleScrollLeft = useCallback(() => {
		if (scrollSyncing.current) return;
		scrollSyncing.current = true;
		if (leftScrollRef.current && rightScrollRef.current) {
			rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop;
		}
		scrollSyncing.current = false;
	}, []);

	const handleScrollRight = useCallback(() => {
		if (scrollSyncing.current) return;
		scrollSyncing.current = true;
		if (leftScrollRef.current && rightScrollRef.current) {
			leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop;
		}
		scrollSyncing.current = false;
	}, []);

	const noDiff =
		debouncedLeft.trim() &&
		debouncedRight.trim() &&
		changes.length <= 1 &&
		!changes.some((c) => c.added || c.removed);

	const hasContent = debouncedLeft.trim() || debouncedRight.trim();

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<div className='flex items-center gap-2 flex-wrap'>
						{/* Algorithm selector */}
						<div className='flex rounded-md border border-border overflow-hidden'>
							{(
								["lines", "words", "characters", "sentences"] as DiffMode[]
							).map((m) => (
								<button
									key={m}
									onClick={() => setMode(m)}
									disabled={(isLargeInput || hasBinary) && m !== "lines"}
									className={cn(
										"px-2.5 py-1 text-xs font-medium transition-colors",
										effectiveMode === m
											? "bg-accent text-accent-foreground"
											: "text-muted-foreground hover:text-foreground",
										(isLargeInput || hasBinary) &&
											m !== "lines" &&
											"opacity-50 cursor-not-allowed",
									)}
								>
									{m.charAt(0).toUpperCase() + m.slice(1)}
								</button>
							))}
						</div>

						{/* View mode toggle */}
						<div className='flex rounded-md border border-border overflow-hidden'>
							<button
								onClick={() => setViewMode("unified")}
								className={cn(
									"px-2.5 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1",
									viewMode === "unified"
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
								title='Unified view'
							>
								<AlignJustify className='h-3 w-3' /> Unified
							</button>
							<button
								onClick={() => setViewMode("side-by-side")}
								className={cn(
									"px-2.5 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1",
									viewMode === "side-by-side"
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
								title='Side-by-side view'
							>
								<Columns className='h-3 w-3' /> Side-by-side
							</button>
						</div>

						{/* Context lines dropdown */}
						<select
							value={String(contextLines)}
							onChange={(e) => {
								const v = e.target.value;
								setContextLines(
									v === "all" ? "all" : (Number(v) as 0 | 1 | 3 | 5),
								);
							}}
							className='h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground'
							aria-label='Context lines'
						>
							<option value='0'>0 context lines</option>
							<option value='1'>1 context line</option>
							<option value='3'>3 context lines</option>
							<option value='5'>5 context lines</option>
							<option value='all'>All lines</option>
						</select>

						{/* Toggles */}
						<label className='flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer'>
							<input
								type='checkbox'
								checked={ignoreCase}
								onChange={(e) => setIgnoreCase(e.target.checked)}
								className='h-3.5 w-3.5 rounded border-border'
							/>
							Ignore case
						</label>
						<label className='flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer'>
							<input
								type='checkbox'
								checked={ignoreWhitespace}
								onChange={(e) => setIgnoreWhitespace(e.target.checked)}
								className='h-3.5 w-3.5 rounded border-border'
							/>
							Ignore whitespace
						</label>

						<button
							onClick={handleSwap}
							className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
						>
							<ArrowLeftRight className='h-3.5 w-3.5' /> Swap
						</button>
						<CopyButton text={diffText} label='Copy Diff' />
						<CopyButton
							text={statsSummary}
							label='Copy Stats'
							aria-label='Copy diff summary'
						/>
						<button
							onClick={handleDownloadPatch}
							disabled={!hasContent}
							className={cn(
								"inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
								!hasContent && "opacity-50 cursor-not-allowed",
							)}
						>
							<Download className='h-3.5 w-3.5' /> Download .patch
						</button>
					</div>
				</ToolPageHeader>

				{isLargeInput && (
					<div className='px-3 py-1.5 text-[11px] text-amber-400 bg-amber-500/5 border-b border-border'>
						Large input detected (&gt;100KB). Forced to line-by-line diff for
						performance.
					</div>
				)}

				{hasBinary && (
					<div
						className='px-3 py-1.5 text-[11px] text-amber-400 bg-amber-500/5 border-b border-border'
						data-testid='binary-warning'
					>
						Input appears to be binary — showing line diff only
					</div>
				)}

				{/* Editors */}
				<div className='flex flex-1 min-h-0'>
					<div
						className={cn(
							"flex-1 flex flex-col border-r border-border min-w-0",
							leftDragActive && "ring-2 ring-inset ring-blue-500/50",
						)}
						onDrop={(e) => {
							handleDrop(e, setLeft);
							setLeftDragActive(false);
						}}
						onDragOver={handleDragOver}
						onDragEnter={() => setLeftDragActive(true)}
						onDragLeave={() => setLeftDragActive(false)}
					>
						<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
							Original
							{leftDragActive && (
								<span className='ml-2 text-blue-400'>Drop file here</span>
							)}
						</div>
						<div className='flex-1 min-h-0'>
							<MonacoWrapper
								value={left}
								onChange={setLeft}
								language='plaintext'
								aria-label='Original text'
							/>
						</div>
					</div>
					<div
						className={cn(
							"flex-1 flex flex-col min-w-0",
							rightDragActive && "ring-2 ring-inset ring-blue-500/50",
						)}
						onDrop={(e) => {
							handleDrop(e, setRight);
							setRightDragActive(false);
						}}
						onDragOver={handleDragOver}
						onDragEnter={() => setRightDragActive(true)}
						onDragLeave={() => setRightDragActive(false)}
					>
						<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
							Modified
							{rightDragActive && (
								<span className='ml-2 text-blue-400'>Drop file here</span>
							)}
						</div>
						<div className='flex-1 min-h-0'>
							<MonacoWrapper
								value={right}
								onChange={setRight}
								language='plaintext'
								aria-label='Modified text'
							/>
						</div>
					</div>
				</div>

				{/* Stats */}
				{hasContent && (
					<div className='flex items-center gap-4 border-t border-border px-3 py-1.5 text-[11px] flex-wrap'>
						<span className='text-green-400 font-medium'>
							+{stats.added} added
						</span>
						<span className='text-red-400 font-medium'>
							-{stats.removed} removed
						</span>
						<span className='text-muted-foreground'>
							{stats.unchanged} unchanged
						</span>
						<span className='text-green-400'>
							Characters added: {charStats.charsAdded}
						</span>
						<span className='text-red-400'>
							Characters removed: {charStats.charsRemoved}
						</span>
						<span className='text-blue-400 font-medium'>
							Overall similarity: {similarity}%
						</span>
					</div>
				)}

				{/* No diff */}
				{noDiff && (
					<div className='border-t border-border px-4 py-6 text-center text-sm text-muted-foreground'>
						No differences found. The texts are identical.
					</div>
				)}

				{/* Unified diff output */}
				{changes.length > 0 && !noDiff && viewMode === "unified" && (
					<div className='border-t border-border max-h-[40%] overflow-auto'>
						<div className='font-mono text-xs leading-5 p-0'>
							{unifiedLines.map((line, i) => {
								if (line.type === "separator") {
									return (
										<div
											key={`sep-${i}`}
											className='px-3 py-0.5 text-center text-muted-foreground/50 bg-muted/20 text-[10px] select-none'
										>
											··· {line.hiddenCount} hidden lines ···
										</div>
									);
								}
								return (
									<div
										key={i}
										className={cn(
											"px-3 py-0 whitespace-pre-wrap break-all",
											line.type === "added" && "bg-green-500/10 text-green-300",
											line.type === "removed" && "bg-red-500/10 text-red-300",
											line.type === "unchanged" && "text-muted-foreground",
										)}
									>
										<span className='inline-block w-4 select-none text-muted-foreground/50 mr-2'>
											{line.type === "added"
												? "+"
												: line.type === "removed"
													? "-"
													: " "}
										</span>
										{line.content || " "}
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* Side-by-side diff output */}
				{changes.length > 0 && !noDiff && viewMode === "side-by-side" && (
					<div className='border-t border-border max-h-[40%] flex min-h-0'>
						<div
							ref={leftScrollRef}
							onScroll={handleScrollLeft}
							className='flex-1 overflow-auto border-r border-border'
						>
							<div className='font-mono text-xs leading-5 p-0'>
								{sideBySideData.left.map((line, i) => {
									if (line.type === "separator") {
										return (
											<div
												key={`lsep-${i}`}
												className='px-3 py-0.5 text-center text-muted-foreground/50 bg-muted/20 text-[10px] select-none'
											>
												··· {(line as SeparatorLine).hiddenCount} hidden ···
											</div>
										);
									}
									const sl = line as SideLine;
									return (
										<div
											key={i}
											className={cn(
												"px-3 py-0 whitespace-pre-wrap break-all min-h-[20px]",
												sl.type === "removed" && "bg-red-500/10 text-red-300",
												sl.type === "unchanged" && "text-muted-foreground",
												sl.type === "empty" && "bg-muted/5",
											)}
										>
											{sl.type === "empty" ? (
												"\u00a0"
											) : sl.innerDiff ? (
												<>
													<span className='inline-block w-4 select-none text-muted-foreground/50 mr-2'>
														{sl.type === "removed" ? "-" : " "}
													</span>
													{renderInnerDiff(sl.innerDiff, "left")}
												</>
											) : (
												<>
													<span className='inline-block w-4 select-none text-muted-foreground/50 mr-2'>
														{sl.type === "removed" ? "-" : " "}
													</span>
													{sl.content || " "}
												</>
											)}
										</div>
									);
								})}
							</div>
						</div>
						<div
							ref={rightScrollRef}
							onScroll={handleScrollRight}
							className='flex-1 overflow-auto'
						>
							<div className='font-mono text-xs leading-5 p-0'>
								{sideBySideData.right.map((line, i) => {
									if (line.type === "separator") {
										return (
											<div
												key={`rsep-${i}`}
												className='px-3 py-0.5 text-center text-muted-foreground/50 bg-muted/20 text-[10px] select-none'
											>
												··· {(line as SeparatorLine).hiddenCount} hidden ···
											</div>
										);
									}
									const sl = line as SideLine;
									return (
										<div
											key={i}
											className={cn(
												"px-3 py-0 whitespace-pre-wrap break-all min-h-[20px]",
												sl.type === "added" && "bg-green-500/10 text-green-300",
												sl.type === "unchanged" && "text-muted-foreground",
												sl.type === "empty" && "bg-muted/5",
											)}
										>
											{sl.type === "empty" ? (
												"\u00a0"
											) : sl.innerDiff ? (
												<>
													<span className='inline-block w-4 select-none text-muted-foreground/50 mr-2'>
														{sl.type === "added" ? "+" : " "}
													</span>
													{renderInnerDiff(sl.innerDiff, "right")}
												</>
											) : (
												<>
													<span className='inline-block w-4 select-none text-muted-foreground/50 mr-2'>
														{sl.type === "added" ? "+" : " "}
													</span>
													{sl.content || " "}
												</>
											)}
										</div>
									);
								})}
							</div>
						</div>
					</div>
				)}
			</div>
		</>
	);
}
