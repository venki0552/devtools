import { useState, useMemo, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import { create, type DiffPatcher } from "jsondiffpatch";
import {
	ArrowLeftRight,
	List,
	TreePine,
	Eye,
	EyeOff,
	ChevronRight,
	ChevronDown,
	Key,
} from "lucide-react";

const tool = TOOLS.find((t) => t.id === "json-diff")!;

type ViewMode = "flat" | "tree";

function createDiffPatcher(arrayKeys: Record<string, string>): DiffPatcher {
	const objectHash =
		Object.keys(arrayKeys).length > 0
			? (item: object, index?: number) => {
					if (typeof item === "object" && item !== null) {
						const obj = item as Record<string, unknown>;
						for (const key of Object.values(arrayKeys)) {
							if (key in obj) return String(obj[key]);
						}
					}
					return `$$index:${index ?? 0}`;
				}
			: undefined;

	return create({
		arrays: { detectMove: true, includeValueOnMove: true },
		objectHash,
	});
}

interface DiffEntry {
	path: string;
	type: "added" | "removed" | "changed";
	oldValue?: string;
	newValue?: string;
}

interface TreeNode {
	key: string;
	path: string;
	type: "added" | "removed" | "changed" | "unchanged" | "container";
	oldValue?: string;
	newValue?: string;
	children: TreeNode[];
}

function flattenDelta(delta: unknown, path = ""): DiffEntry[] {
	const entries: DiffEntry[] = [];
	if (!delta || typeof delta !== "object") return entries;

	const obj = delta as Record<string, unknown>;

	for (const key of Object.keys(obj)) {
		if (key === "_t") continue;

		const currentPath = path ? `${path}.${key}` : key;
		const val = obj[key];

		if (!Array.isArray(val)) {
			entries.push(...flattenDelta(val, currentPath));
			continue;
		}

		if (val.length === 1) {
			entries.push({
				path: currentPath,
				type: "added",
				newValue: JSON.stringify(val[0], null, 2),
			});
		} else if (val.length === 3 && val[2] === 0) {
			entries.push({
				path: currentPath,
				type: "removed",
				oldValue: JSON.stringify(val[0], null, 2),
			});
		} else if (val.length === 2) {
			entries.push({
				path: currentPath,
				type: "changed",
				oldValue: JSON.stringify(val[0], null, 2),
				newValue: JSON.stringify(val[1], null, 2),
			});
		} else if (val.length === 3 && val[1] === 0 && val[2] === 2) {
			entries.push({
				path: currentPath,
				type: "changed",
				oldValue: "(text diff)",
				newValue: "(text diff)",
			});
		}
	}

	return entries;
}

function collectAllPaths(
	obj: unknown,
	prefix = "",
): { path: string; value: unknown }[] {
	const results: { path: string; value: unknown }[] = [];
	if (obj === null || obj === undefined) return results;

	if (typeof obj !== "object") {
		results.push({ path: prefix, value: obj });
		return results;
	}

	const record = obj as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		const p = prefix ? `${prefix}.${key}` : key;
		if (
			typeof record[key] === "object" &&
			record[key] !== null &&
			!Array.isArray(record[key])
		) {
			results.push(...collectAllPaths(record[key], p));
		} else {
			results.push({ path: p, value: record[key] });
		}
	}
	return results;
}

function countUnchanged(left: unknown, right: unknown): number {
	if (left === right) return 1;
	if (
		typeof left !== "object" ||
		typeof right !== "object" ||
		left === null ||
		right === null
	)
		return 0;

	let count = 0;
	const lObj = left as Record<string, unknown>;
	const rObj = right as Record<string, unknown>;

	for (const key of Object.keys(lObj)) {
		if (
			key in rObj &&
			JSON.stringify(lObj[key]) === JSON.stringify(rObj[key])
		) {
			count++;
		}
	}
	return count;
}

function getUnchangedEntries(
	leftObj: unknown,
	rightObj: unknown,
): { path: string; value: string }[] {
	const results: { path: string; value: string }[] = [];
	if (
		typeof leftObj !== "object" ||
		typeof rightObj !== "object" ||
		leftObj === null ||
		rightObj === null
	)
		return results;

	const lPaths = collectAllPaths(leftObj);
	const rPathMap = new Map<string, unknown>();
	for (const { path, value } of collectAllPaths(rightObj)) {
		rPathMap.set(path, value);
	}

	for (const { path, value } of lPaths) {
		if (
			rPathMap.has(path) &&
			JSON.stringify(value) === JSON.stringify(rPathMap.get(path))
		) {
			results.push({ path, value: JSON.stringify(value, null, 2) });
		}
	}
	return results;
}

function buildTreeFromEntries(
	entries: DiffEntry[],
	unchangedEntries: { path: string; value: string }[],
	showUnchanged: boolean,
): TreeNode[] {
	const root: TreeNode = {
		key: "",
		path: "",
		type: "container",
		children: [],
	};

	function ensureNode(segments: string[]): TreeNode {
		let current = root;
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			let child = current.children.find((c) => c.key === seg);
			if (!child) {
				child = {
					key: seg,
					path: segments.slice(0, i + 1).join("."),
					type: "container",
					children: [],
				};
				current.children.push(child);
			}
			current = child;
		}
		return current;
	}

	for (const entry of entries) {
		const segments = entry.path.split(".");
		const node = ensureNode(segments);
		node.type = entry.type;
		node.oldValue = entry.oldValue;
		node.newValue = entry.newValue;
	}

	if (showUnchanged) {
		for (const u of unchangedEntries) {
			const segments = u.path.split(".");
			const existing = entries.find((e) => e.path === u.path);
			if (!existing) {
				const node = ensureNode(segments);
				if (node.type === "container") {
					node.type = "unchanged";
					node.oldValue = u.value;
					node.newValue = u.value;
				}
			}
		}
	}

	return root.children;
}

function TreeNodeRow({
	node,
	depth,
	defaultExpanded,
}: {
	node: TreeNode;
	depth: number;
	defaultExpanded: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const hasChildren = node.children.length > 0;
	const isLeaf = !hasChildren && node.type !== "container";

	const bgClass = cn(
		node.type === "added" && "bg-green-500/10",
		node.type === "removed" && "bg-red-500/10",
		node.type === "changed" && "bg-amber-500/10",
		node.type === "unchanged" && "bg-zinc-500/5",
	);

	const textClass = cn(
		node.type === "added" && "text-green-400",
		node.type === "removed" && "text-red-400",
		node.type === "changed" && "text-amber-400",
		node.type === "unchanged" && "text-zinc-400",
		node.type === "container" && "text-foreground",
	);

	const prefix =
		node.type === "added"
			? "+"
			: node.type === "removed"
				? "−"
				: node.type === "changed"
					? "~"
					: "";

	return (
		<>
			<div
				className={cn(
					"flex items-center gap-1 px-2 py-0.5 text-xs font-mono border-b border-border/30 hover:bg-muted/20 cursor-default",
					bgClass,
				)}
				style={{ paddingLeft: `${depth * 16 + 8}px` }}
				data-testid='tree-node'
				data-node-type={node.type}
			>
				{hasChildren ? (
					<button
						onClick={() => setExpanded(!expanded)}
						className='p-0.5 hover:bg-muted/40 rounded shrink-0'
						aria-label={expanded ? "Collapse" : "Expand"}
					>
						{expanded ? (
							<ChevronDown className='h-3 w-3 text-muted-foreground' />
						) : (
							<ChevronRight className='h-3 w-3 text-muted-foreground' />
						)}
					</button>
				) : (
					<span className='w-4 shrink-0' />
				)}

				{prefix && (
					<span className={cn("font-bold w-3 shrink-0", textClass)}>
						{prefix}
					</span>
				)}

				<span className={cn("font-medium", textClass)}>{node.key}</span>

				{isLeaf && node.type === "changed" && (
					<span className='ml-2 text-muted-foreground'>
						<span className='line-through text-red-400/70'>
							{truncateValue(node.oldValue)}
						</span>
						<span className='mx-1'>→</span>
						<span className='text-green-400/70'>
							{truncateValue(node.newValue)}
						</span>
					</span>
				)}

				{isLeaf && node.type === "added" && (
					<span className='ml-2 text-green-400/70'>
						= {truncateValue(node.newValue)}
					</span>
				)}

				{isLeaf && node.type === "removed" && (
					<span className='ml-2 text-red-400/70'>
						= {truncateValue(node.oldValue)}
					</span>
				)}

				{isLeaf && node.type === "unchanged" && (
					<span className='ml-2 text-zinc-500'>
						= {truncateValue(node.oldValue)}
					</span>
				)}
			</div>

			{expanded &&
				hasChildren &&
				node.children.map((child) => (
					<TreeNodeRow
						key={child.path}
						node={child}
						depth={depth + 1}
						defaultExpanded={
							child.type !== "unchanged" && child.type !== "container"
								? true
								: false
						}
					/>
				))}
		</>
	);
}

function truncateValue(val?: string): string {
	if (!val) return "—";
	const oneLine = val.replace(/\n/g, " ");
	return oneLine.length > 60 ? oneLine.slice(0, 57) + "..." : oneLine;
}

function toJsonPointer(dotPath: string): string {
	return (
		"/" +
		dotPath
			.split(".")
			.map((s) => s.replace(/~/g, "~0").replace(/\//g, "~1"))
			.join("/")
	);
}

function generateJsonPatch(entries: DiffEntry[]): object[] {
	const ops: object[] = [];
	for (const entry of entries) {
		const path = toJsonPointer(entry.path);
		if (entry.type === "added") {
			ops.push({
				op: "add",
				path,
				value: entry.newValue ? JSON.parse(entry.newValue) : null,
			});
		} else if (entry.type === "removed") {
			ops.push({ op: "remove", path });
		} else if (entry.type === "changed") {
			ops.push({
				op: "replace",
				path,
				value:
					entry.newValue && entry.newValue !== "(text diff)"
						? JSON.parse(entry.newValue)
						: null,
			});
		}
	}
	return ops;
}

function generateTextSummary(entries: DiffEntry[]): string {
	const lines: string[] = [];
	for (const entry of entries) {
		if (entry.type === "added") {
			lines.push(`Added: ${entry.path} = ${entry.newValue ?? ""}`);
		} else if (entry.type === "removed") {
			lines.push(
				`Removed: ${entry.path}${entry.oldValue ? ` (was ${entry.oldValue})` : ""}`,
			);
		} else if (entry.type === "changed") {
			lines.push(
				`Changed: ${entry.path}: ${entry.oldValue ?? ""} → ${entry.newValue ?? ""}`,
			);
		}
	}
	return lines.join("\n");
}

function detectArrayPaths(obj: unknown, prefix = ""): string[] {
	const results: string[] = [];
	if (obj === null || obj === undefined || typeof obj !== "object")
		return results;

	if (Array.isArray(obj)) {
		results.push(prefix);
		for (let i = 0; i < obj.length; i++) {
			results.push(...detectArrayPaths(obj[i], `${prefix}[${i}]`));
		}
		return results;
	}

	const record = obj as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		const p = prefix ? `${prefix}.${key}` : key;
		results.push(...detectArrayPaths(record[key], p));
	}
	return results;
}

function detectArrayKeyOptions(obj: unknown, arrayPath: string): string[] {
	const segments = arrayPath.split(".");
	let current: unknown = obj;
	for (const seg of segments) {
		if (
			current === null ||
			current === undefined ||
			typeof current !== "object"
		)
			return [];
		current = (current as Record<string, unknown>)[seg];
	}
	if (!Array.isArray(current) || current.length === 0) return [];
	const first = current[0];
	if (typeof first !== "object" || first === null) return [];
	return Object.keys(first).filter((k) => {
		return current.every(
			(item: unknown) =>
				typeof item === "object" &&
				item !== null &&
				k in (item as Record<string, unknown>),
		);
	});
}

export function JsonDiffTool() {
	const [left, setLeft] = useLocalStorage("devtools-json-diff-left", "");
	const [right, setRight] = useLocalStorage("devtools-json-diff-right", "");
	const [error, setError] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>("flat");
	const [showUnchanged, setShowUnchanged] = useState(false);
	const [arrayKeys, setArrayKeys] = useState<Record<string, string>>({});

	const debouncedLeft = useDebounce(left, 300);
	const debouncedRight = useDebounce(right, 300);

	const diffpatcher = useMemo(() => createDiffPatcher(arrayKeys), [arrayKeys]);

	const { entries, stats, leftObj, rightObj } = useMemo(() => {
		setError(null);

		const empty = {
			entries: [] as DiffEntry[],
			stats: { added: 0, removed: 0, changed: 0, unchanged: 0 },
			leftObj: undefined as unknown,
			rightObj: undefined as unknown,
		};

		if (!debouncedLeft.trim() && !debouncedRight.trim()) return empty;
		if (!debouncedLeft.trim() || !debouncedRight.trim()) return empty;

		let parsedLeft: unknown;
		let parsedRight: unknown;

		try {
			parsedLeft = JSON.parse(debouncedLeft);
		} catch (e) {
			setError(`Left panel: ${(e as Error).message}`);
			return empty;
		}

		try {
			parsedRight = JSON.parse(debouncedRight);
		} catch (e) {
			setError(`Right panel: ${(e as Error).message}`);
			return empty;
		}

		const delta = diffpatcher.diff(parsedLeft, parsedRight);

		if (!delta) {
			const total =
				typeof parsedLeft === "object" && parsedLeft !== null
					? Object.keys(parsedLeft).length
					: 1;
			return {
				entries: [] as DiffEntry[],
				stats: { added: 0, removed: 0, changed: 0, unchanged: total },
				leftObj: parsedLeft,
				rightObj: parsedRight,
			};
		}

		const flatEntries = flattenDelta(delta);
		const added = flatEntries.filter((e) => e.type === "added").length;
		const removed = flatEntries.filter((e) => e.type === "removed").length;
		const changed = flatEntries.filter((e) => e.type === "changed").length;
		const unchanged = countUnchanged(parsedLeft, parsedRight);

		return {
			entries: flatEntries,
			stats: { added, removed, changed, unchanged },
			leftObj: parsedLeft,
			rightObj: parsedRight,
		};
	}, [debouncedLeft, debouncedRight, diffpatcher]);

	const unchangedEntries = useMemo(
		() => (leftObj && rightObj ? getUnchangedEntries(leftObj, rightObj) : []),
		[leftObj, rightObj],
	);

	const treeNodes = useMemo(
		() => buildTreeFromEntries(entries, unchangedEntries, showUnchanged),
		[entries, unchangedEntries, showUnchanged],
	);

	const arrayPaths = useMemo(() => {
		const paths = new Set<string>();
		try {
			if (debouncedLeft.trim()) {
				for (const p of detectArrayPaths(JSON.parse(debouncedLeft)))
					paths.add(p);
			}
		} catch {
			/* ignore */
		}
		try {
			if (debouncedRight.trim()) {
				for (const p of detectArrayPaths(JSON.parse(debouncedRight)))
					paths.add(p);
			}
		} catch {
			/* ignore */
		}
		return [...paths];
	}, [debouncedLeft, debouncedRight]);

	const arrayKeyOptions = useMemo(() => {
		const options: Record<string, string[]> = {};
		for (const path of arrayPaths) {
			const keys = new Set<string>();
			try {
				if (debouncedLeft.trim()) {
					for (const k of detectArrayKeyOptions(
						JSON.parse(debouncedLeft),
						path,
					))
						keys.add(k);
				}
			} catch {
				/* ignore */
			}
			try {
				if (debouncedRight.trim()) {
					for (const k of detectArrayKeyOptions(
						JSON.parse(debouncedRight),
						path,
					))
						keys.add(k);
				}
			} catch {
				/* ignore */
			}
			const keyList = [...keys];
			if (keyList.length > 0) options[path] = keyList;
		}
		return options;
	}, [arrayPaths, debouncedLeft, debouncedRight]);

	const matchPercentage = useMemo(() => {
		const total = stats.added + stats.removed + stats.changed + stats.unchanged;
		if (total === 0) return 0;
		return Math.round((stats.unchanged / total) * 100);
	}, [stats]);

	const jsonPatchText = useMemo(
		() =>
			entries.length > 0
				? JSON.stringify(generateJsonPatch(entries), null, 2)
				: "",
		[entries],
	);

	const textSummary = useMemo(() => generateTextSummary(entries), [entries]);

	const handleSwap = useCallback(() => {
		const l = left;
		setLeft(right);
		setRight(l);
	}, [left, right, setLeft, setRight]);

	const handleSetArrayKey = useCallback((path: string, key: string) => {
		setArrayKeys((prev) => {
			const next = { ...prev };
			if (key === "") {
				delete next[path];
			} else {
				next[path] = key;
			}
			return next;
		});
	}, []);

	const noDiff =
		debouncedLeft.trim() &&
		debouncedRight.trim() &&
		!error &&
		entries.length === 0;

	const hasOutput = debouncedLeft.trim() && debouncedRight.trim() && !error;

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<button
						onClick={handleSwap}
						className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
					>
						<ArrowLeftRight className='h-3.5 w-3.5' /> Swap
					</button>

					<button
						onClick={() => setViewMode(viewMode === "flat" ? "tree" : "flat")}
						className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
						aria-label={`Switch to ${viewMode === "flat" ? "Tree view" : "Flat list"}`}
					>
						{viewMode === "flat" ? (
							<>
								<TreePine className='h-3.5 w-3.5' /> Tree view
							</>
						) : (
							<>
								<List className='h-3.5 w-3.5' /> Flat list
							</>
						)}
					</button>

					<button
						onClick={() => setShowUnchanged(!showUnchanged)}
						className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
						aria-label={showUnchanged ? "Hide unchanged" : "Show unchanged"}
					>
						{showUnchanged ? (
							<>
								<EyeOff className='h-3.5 w-3.5' /> Hide unchanged
							</>
						) : (
							<>
								<Eye className='h-3.5 w-3.5' /> Show unchanged
							</>
						)}
					</button>

					{entries.length > 0 && (
						<>
							<CopyButton
								text={jsonPatchText}
								label='JSON Patch'
								aria-label='Copy as JSON Patch'
							/>
							<CopyButton
								text={textSummary}
								label='Text Summary'
								aria-label='Copy as text summary'
							/>
						</>
					)}
				</ToolPageHeader>

				{/* Editors */}
				<div className='flex flex-1 min-h-0'>
					<div className='flex-1 flex flex-col border-r border-border min-w-0'>
						<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
							Left (Original)
						</div>
						<div className='flex-1 min-h-0'>
							<MonacoWrapper
								value={left}
								onChange={setLeft}
								language='json'
								aria-label='Left JSON input'
							/>
						</div>
					</div>
					<div className='flex-1 flex flex-col min-w-0'>
						<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
							Right (Modified)
						</div>
						<div className='flex-1 min-h-0'>
							<MonacoWrapper
								value={right}
								onChange={setRight}
								language='json'
								aria-label='Right JSON input'
							/>
						</div>
					</div>
				</div>

				{/* Array Identity Key Picker */}
				{Object.keys(arrayKeyOptions).length > 0 && (
					<div
						className='flex flex-wrap items-center gap-3 border-t border-border px-3 py-1.5 text-[11px]'
						data-testid='array-key-picker'
					>
						<span className='text-muted-foreground flex items-center gap-1'>
							<Key className='h-3 w-3' /> Array keys:
						</span>
						{Object.entries(arrayKeyOptions).map(([path, keys]) => (
							<label
								key={path}
								className='flex items-center gap-1 text-muted-foreground'
							>
								<span className='font-mono'>{path}</span>
								<select
									value={arrayKeys[path] ?? ""}
									onChange={(e) => handleSetArrayKey(path, e.target.value)}
									className='h-6 rounded bg-zinc-700 px-1.5 text-[11px] text-zinc-200 border border-border'
									aria-label={`Identity key for ${path}`}
								>
									<option value=''>by index</option>
									{keys.map((k) => (
										<option key={k} value={k}>
											{k}
										</option>
									))}
								</select>
							</label>
						))}
					</div>
				)}

				{/* Stats Bar */}
				{hasOutput && (
					<div className='flex items-center gap-4 border-t border-border px-3 py-1.5 text-[11px]'>
						<span className='text-green-400 font-medium'>
							Added {stats.added}
						</span>
						<span className='text-red-400 font-medium'>
							Removed {stats.removed}
						</span>
						<span className='text-amber-400 font-medium'>
							Changed {stats.changed}
						</span>
						<span className='text-muted-foreground'>
							Unchanged {stats.unchanged}
						</span>
						<span
							className='ml-auto flex items-center gap-2 text-muted-foreground'
							data-testid='match-percentage'
						>
							<span>{matchPercentage}% match</span>
							<div className='w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden'>
								<div
									className='h-full bg-green-500 rounded-full transition-all'
									style={{ width: `${matchPercentage}%` }}
								/>
							</div>
						</span>
					</div>
				)}

				{/* Error */}
				{error && (
					<div className='px-3 py-2 border-t border-border'>
						<ErrorBox error={error} />
					</div>
				)}

				{/* No Differences */}
				{noDiff && (
					<div className='border-t border-border px-4 py-6 text-center text-sm text-muted-foreground'>
						No differences found. The JSON objects are identical.
					</div>
				)}

				{/* Diff Output — Flat View */}
				{viewMode === "flat" && entries.length > 0 && (
					<div className='border-t border-border max-h-[40%] overflow-auto'>
						<table className='w-full text-xs'>
							<thead className='sticky top-0 bg-panel border-b border-border'>
								<tr>
									<th className='text-left px-3 py-2 font-medium text-muted-foreground'>
										Path
									</th>
									<th className='text-left px-3 py-2 font-medium text-muted-foreground w-24'>
										Type
									</th>
									<th className='text-left px-3 py-2 font-medium text-muted-foreground'>
										Old Value
									</th>
									<th className='text-left px-3 py-2 font-medium text-muted-foreground'>
										New Value
									</th>
								</tr>
							</thead>
							<tbody>
								{entries.map((entry, i) => (
									<tr
										key={i}
										className='border-b border-border/50 hover:bg-muted/30'
									>
										<td className='px-3 py-1.5 font-mono text-foreground'>
											{entry.path}
										</td>
										<td className='px-3 py-1.5'>
											<span
												className={cn(
													"rounded px-1.5 py-0.5 text-[10px] font-medium",
													entry.type === "added" &&
														"bg-green-500/15 text-green-400",
													entry.type === "removed" &&
														"bg-red-500/15 text-red-400",
													entry.type === "changed" &&
														"bg-amber-500/15 text-amber-400",
												)}
											>
												{entry.type}
											</span>
										</td>
										<td className='px-3 py-1.5 font-mono text-muted-foreground max-w-[200px] truncate'>
											{entry.oldValue ?? "—"}
										</td>
										<td className='px-3 py-1.5 font-mono text-muted-foreground max-w-[200px] truncate'>
											{entry.newValue ?? "—"}
										</td>
									</tr>
								))}

								{showUnchanged &&
									unchangedEntries.map((u, i) => (
										<tr
											key={`unchanged-${i}`}
											className='border-b border-border/50 hover:bg-muted/30 opacity-60'
										>
											<td className='px-3 py-1.5 font-mono text-zinc-400'>
												{u.path}
											</td>
											<td className='px-3 py-1.5'>
												<span className='rounded px-1.5 py-0.5 text-[10px] font-medium bg-zinc-500/15 text-zinc-400'>
													unchanged
												</span>
											</td>
											<td className='px-3 py-1.5 font-mono text-zinc-500 max-w-[200px] truncate'>
												{u.value}
											</td>
											<td className='px-3 py-1.5 font-mono text-zinc-500 max-w-[200px] truncate'>
												{u.value}
											</td>
										</tr>
									))}
							</tbody>
						</table>
					</div>
				)}

				{/* Diff Output — Tree View */}
				{viewMode === "tree" &&
					(entries.length > 0 ||
						(showUnchanged && unchangedEntries.length > 0)) && (
						<div
							className='border-t border-border max-h-[40%] overflow-auto'
							data-testid='tree-view'
						>
							{treeNodes.map((node) => (
								<TreeNodeRow
									key={node.path}
									node={node}
									depth={0}
									defaultExpanded={node.type !== "unchanged"}
								/>
							))}
						</div>
					)}
			</div>
		</>
	);
}
