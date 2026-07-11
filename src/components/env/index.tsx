import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from "react";
import { SEOHead } from "@/components/shared/SEOHead";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import {
	Plus,
	Trash2,
	Eye,
	EyeOff,
	Download,
	Upload,
	FolderPlus,
	Search,
	AlertTriangle,
	Shield,
	Copy,
	GripVertical,
	ChevronDown,
	ChevronRight,
	GitCompare,
	X,
} from "lucide-react";

const tool = TOOLS.find((t) => t.id === "env")!;

// ─── Types ──────────────────────────────────────────────────

interface EnvVar {
	id: string;
	key: string;
	value: string;
	group: string;
}

interface Project {
	id: string;
	name: string;
	vars: EnvVar[];
}

type ConflictResolution = "overwrite" | "skip" | "rename";

interface ImportConflict {
	incomingId: string;
	existingId: string;
	key: string;
	resolution: ConflictResolution;
}

interface CompareResult {
	key: string;
	status: "left-only" | "right-only" | "same" | "differs";
}

// ─── Constants ──────────────────────────────────────────────

const LARGE_VAR_COUNT = 200;
const TRUNCATE_LEN = 60;

// ─── Helpers ────────────────────────────────────────────────

function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isUpperSnakeCase(key: string): boolean {
	if (!key) return true;
	return /^[A-Z][A-Z0-9_]*$/.test(key);
}

function parseEnvFile(content: string): EnvVar[] {
	const vars: EnvVar[] = [];
	const lines = content.split("\n");
	let i = 0;

	while (i < lines.length) {
		const line = lines[i].trim();
		if (!line || line.startsWith("#")) {
			i++;
			continue;
		}

		const eqIndex = line.indexOf("=");
		if (eqIndex < 1) {
			i++;
			continue;
		}

		const key = line.slice(0, eqIndex).trim();
		let value = line.slice(eqIndex + 1).trim();

		// Multi-line: opening quote without matching close on same line
		if (
			(value.startsWith('"') && !(value.length > 1 && value.endsWith('"'))) ||
			(value.startsWith("'") && !(value.length > 1 && value.endsWith("'")))
		) {
			const quoteChar = value[0];
			const parts = [value.slice(1)];
			i++;
			while (i < lines.length) {
				const nextLine = lines[i];
				if (nextLine.trimEnd().endsWith(quoteChar)) {
					parts.push(nextLine.trimEnd().slice(0, -1));
					break;
				}
				parts.push(nextLine);
				i++;
			}
			value = parts.join("\n");
		} else {
			// Strip surrounding quotes
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
		}

		vars.push({ id: generateId(), key, value, group: "" });
		i++;
	}

	return vars;
}

function exportAsEnv(vars: EnvVar[]): string {
	return vars
		.map((v) => {
			if (v.value.includes("\n")) {
				return `${v.key}="${v.value.replace(/"/g, '\\"')}"`;
			}
			const needsQuotes =
				v.value.includes(" ") || v.value.includes("=") || v.value.includes('"');
			const value = needsQuotes ? `"${v.value.replace(/"/g, '\\"')}"` : v.value;
			return `${v.key}=${value}`;
		})
		.join("\n");
}

function exportAsJson(vars: EnvVar[]): string {
	const obj: Record<string, string> = {};
	for (const v of vars) {
		obj[v.key] = v.value;
	}
	return JSON.stringify(obj, null, 2);
}

function exportAsShellExports(vars: EnvVar[]): string {
	return vars
		.map((v) => {
			const escaped = v.value.replace(/'/g, "'\\''");
			return `export ${v.key}='${escaped}'`;
		})
		.join("\n");
}

function exportAsDockerFlags(vars: EnvVar[]): string {
	return vars
		.map((v) => {
			const escaped = v.value.replace(/"/g, '\\"');
			return `-e ${v.key}="${escaped}"`;
		})
		.join(" \\\n");
}

function exportAsGitHubActions(vars: EnvVar[]): string {
	const lines = ["env:"];
	for (const v of vars) {
		lines.push(`  ${v.key}: \${{ secrets.${v.key} }}`);
	}
	return lines.join("\n");
}

function exportAsK8sSecret(vars: EnvVar[]): string {
	const lines = [
		"apiVersion: v1",
		"kind: Secret",
		"metadata:",
		"  name: app-secret",
		"type: Opaque",
		"data:",
	];
	for (const v of vars) {
		lines.push(`  ${v.key}: ${btoa(v.value)}`);
	}
	return lines.join("\n");
}

function findDuplicateKeys(vars: EnvVar[]): Set<string> {
	const seen = new Map<string, number>();
	const dupes = new Set<string>();
	for (const v of vars) {
		if (!v.key) continue;
		seen.set(v.key, (seen.get(v.key) ?? 0) + 1);
		if (seen.get(v.key)! > 1) dupes.add(v.key);
	}
	return dupes;
}

function compareProjects(left: Project, right: Project): CompareResult[] {
	const leftKeys = new Map<string, string>();
	for (const v of left.vars) if (v.key) leftKeys.set(v.key, v.value);
	const rightKeys = new Map<string, string>();
	for (const v of right.vars) if (v.key) rightKeys.set(v.key, v.value);

	const allKeys = new Set([...leftKeys.keys(), ...rightKeys.keys()]);
	const results: CompareResult[] = [];
	for (const key of allKeys) {
		const inLeft = leftKeys.has(key);
		const inRight = rightKeys.has(key);
		if (inLeft && !inRight) results.push({ key, status: "left-only" });
		else if (!inLeft && inRight) results.push({ key, status: "right-only" });
		else if (leftKeys.get(key) === rightKeys.get(key))
			results.push({ key, status: "same" });
		else results.push({ key, status: "differs" });
	}
	return results.sort((a, b) => a.key.localeCompare(b.key));
}

// ─── Component ──────────────────────────────────────────────

export function EnvTool() {
	// Core state
	const [projects, setProjects] = useLocalStorage<Project[]>(
		"devtools-env-projects",
		[],
	);
	const [selectedId, setSelectedId] = useLocalStorage<string | null>(
		"devtools-env-prefs",
		null,
	);
	const [search, setSearch] = useState("");
	const [searchValues, setSearchValues] = useState(false);
	const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
	const [revealAll, setRevealAll] = useState(false);

	// Import state
	const [showImport, setShowImport] = useState(false);
	const [importText, setImportText] = useState("");
	const [importPhase, setImportPhase] = useState<"input" | "preview">("input");
	const [importPreview, setImportPreview] = useState<EnvVar[]>([]);
	const [importConflicts, setImportConflicts] = useState<ImportConflict[]>([]);

	// Export state
	const [showExportMenu, setShowExportMenu] = useState(false);
	const [exportCopied, setExportCopied] = useState<string | null>(null);
	const exportMenuRef = useRef<HTMLDivElement>(null);

	// Group state
	const [selectedGroupFilter, setSelectedGroupFilter] = useState<string | null>(
		null,
	);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);

	// Drag state
	const [draggedId, setDraggedId] = useState<string | null>(null);

	// Value expand state
	const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set());

	// Compare state
	const [showCompare, setShowCompare] = useState(false);
	const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
	const [compareRightId, setCompareRightId] = useState<string | null>(null);

	// ─── Memos ────────────────────────────────────────────

	const selectedProject = useMemo(
		() => projects.find((p) => p.id === selectedId) ?? null,
		[projects, selectedId],
	);

	const uniqueGroups = useMemo(() => {
		if (!selectedProject) return [];
		const groups = new Set<string>();
		for (const v of selectedProject.vars) {
			if (v.group) groups.add(v.group);
		}
		return Array.from(groups).sort();
	}, [selectedProject]);

	const filteredVars = useMemo(() => {
		if (!selectedProject) return [];
		let vars = selectedProject.vars;

		if (selectedGroupFilter) {
			vars = vars.filter((v) => v.group === selectedGroupFilter);
		}

		if (search.trim()) {
			const q = search.toLowerCase();
			vars = vars.filter(
				(v) =>
					v.key.toLowerCase().includes(q) ||
					v.group.toLowerCase().includes(q) ||
					(searchValues && v.value.toLowerCase().includes(q)),
			);
		}

		return vars;
	}, [selectedProject, search, searchValues, selectedGroupFilter]);

	const groupedVars = useMemo(() => {
		const groups: { name: string; vars: EnvVar[] }[] = [];
		const groupMap = new Map<string, EnvVar[]>();
		for (const v of filteredVars) {
			const gName = v.group || "";
			if (!groupMap.has(gName)) groupMap.set(gName, []);
			groupMap.get(gName)!.push(v);
		}
		const names = Array.from(groupMap.keys()).sort((a, b) => {
			if (!a) return 1;
			if (!b) return -1;
			return a.localeCompare(b);
		});
		for (const name of names) {
			groups.push({ name, vars: groupMap.get(name)! });
		}
		return groups;
	}, [filteredVars]);

	const duplicateKeys = useMemo(
		() =>
			selectedProject
				? findDuplicateKeys(selectedProject.vars)
				: new Set<string>(),
		[selectedProject],
	);

	const envExport = useMemo(
		() => (selectedProject ? exportAsEnv(selectedProject.vars) : ""),
		[selectedProject],
	);

	const jsonExport = useMemo(
		() => (selectedProject ? exportAsJson(selectedProject.vars) : ""),
		[selectedProject],
	);

	const compareResults = useMemo(() => {
		if (!compareLeftId || !compareRightId) return [];
		const left = projects.find((p) => p.id === compareLeftId);
		const right = projects.find((p) => p.id === compareRightId);
		if (!left || !right) return [];
		return compareProjects(left, right);
	}, [projects, compareLeftId, compareRightId]);

	// ─── Callbacks ────────────────────────────────────────

	const updateProject = useCallback(
		(updater: (p: Project) => Project) => {
			setProjects((prev) =>
				prev.map((p) => (p.id === selectedId ? updater(p) : p)),
			);
		},
		[selectedId, setProjects],
	);

	const handleNewProject = useCallback(() => {
		const name = `Project ${projects.length + 1}`;
		const newProj: Project = { id: generateId(), name, vars: [] };
		setProjects((prev) => [...prev, newProj]);
		setSelectedId(newProj.id);
	}, [projects.length, setProjects, setSelectedId]);

	const handleDeleteProject = useCallback(
		(id: string) => {
			setProjects((prev) => prev.filter((p) => p.id !== id));
			if (selectedId === id) {
				setSelectedId(null);
			}
		},
		[selectedId, setProjects, setSelectedId],
	);

	const handleRenameProject = useCallback(
		(id: string, name: string) => {
			setProjects((prev) =>
				prev.map((p) => (p.id === id ? { ...p, name } : p)),
			);
		},
		[setProjects],
	);

	const handleAddVar = useCallback(() => {
		updateProject((p) => ({
			...p,
			vars: [...p.vars, { id: generateId(), key: "", value: "", group: "" }],
		}));
	}, [updateProject]);

	const handleUpdateVar = useCallback(
		(varId: string, field: keyof EnvVar, value: string) => {
			updateProject((p) => ({
				...p,
				vars: p.vars.map((v) =>
					v.id === varId ? { ...v, [field]: value } : v,
				),
			}));
		},
		[updateProject],
	);

	const handleDeleteVar = useCallback(
		(varId: string) => {
			updateProject((p) => ({
				...p,
				vars: p.vars.filter((v) => v.id !== varId),
			}));
		},
		[updateProject],
	);

	const handleDuplicateVar = useCallback(
		(varId: string) => {
			updateProject((p) => {
				const idx = p.vars.findIndex((v) => v.id === varId);
				if (idx === -1) return p;
				const original = p.vars[idx];
				const copy: EnvVar = {
					id: generateId(),
					key: original.key ? `${original.key}_COPY` : "",
					value: original.value,
					group: original.group,
				};
				const vars = [...p.vars];
				vars.splice(idx + 1, 0, copy);
				return { ...p, vars };
			});
		},
		[updateProject],
	);

	const handleReorder = useCallback(
		(fromId: string, toId: string) => {
			if (fromId === toId) return;
			updateProject((p) => {
				const vars = [...p.vars];
				const fromIdx = vars.findIndex((v) => v.id === fromId);
				const toIdx = vars.findIndex((v) => v.id === toId);
				if (fromIdx === -1 || toIdx === -1) return p;
				const [moved] = vars.splice(fromIdx, 1);
				vars.splice(toIdx, 0, moved);
				return { ...p, vars };
			});
		},
		[updateProject],
	);

	// Import handlers
	const handleImportPreview = useCallback(() => {
		if (!importText.trim() || !selectedProject) return;
		const parsed = parseEnvFile(importText);
		setImportPreview(parsed);

		const existingKeys = new Map<string, string>();
		for (const v of selectedProject.vars) {
			if (v.key) existingKeys.set(v.key, v.id);
		}

		const conflicts: ImportConflict[] = [];
		for (const incoming of parsed) {
			if (incoming.key && existingKeys.has(incoming.key)) {
				conflicts.push({
					incomingId: incoming.id,
					existingId: existingKeys.get(incoming.key)!,
					key: incoming.key,
					resolution: "overwrite",
				});
			}
		}

		setImportConflicts(conflicts);
		setImportPhase("preview");
	}, [importText, selectedProject]);

	const handleImportConfirm = useCallback(() => {
		if (!importPreview.length) return;

		const conflictMap = new Map<string, ImportConflict>();
		for (const c of importConflicts) {
			conflictMap.set(c.incomingId, c);
		}

		updateProject((p) => {
			let vars = [...p.vars];
			for (const incoming of importPreview) {
				const conflict = conflictMap.get(incoming.id);
				if (conflict) {
					switch (conflict.resolution) {
						case "overwrite":
							vars = vars.map((v) =>
								v.id === conflict.existingId
									? { ...v, value: incoming.value }
									: v,
							);
							break;
						case "skip":
							break;
						case "rename":
							vars.push({
								...incoming,
								id: generateId(),
								key: `${incoming.key}_IMPORTED`,
							});
							break;
					}
				} else {
					vars.push({ ...incoming, id: generateId() });
				}
			}
			return { ...p, vars };
		});

		setImportText("");
		setImportPreview([]);
		setImportConflicts([]);
		setImportPhase("input");
		setShowImport(false);
	}, [importPreview, importConflicts, updateProject]);

	const handleImportCancel = useCallback(() => {
		setShowImport(false);
		setImportText("");
		setImportPreview([]);
		setImportConflicts([]);
		setImportPhase("input");
	}, []);

	const handleConflictResolution = useCallback(
		(incomingId: string, resolution: ConflictResolution) => {
			setImportConflicts((prev) =>
				prev.map((c) =>
					c.incomingId === incomingId ? { ...c, resolution } : c,
				),
			);
		},
		[],
	);

	// Reveal all toggle
	const handleRevealAllToggle = useCallback(() => {
		if (!revealAll) {
			const confirmed = window.confirm(
				"This will reveal all secret values. Are you sure?",
			);
			if (!confirmed) return;
			if (selectedProject) {
				setRevealedIds(new Set(selectedProject.vars.map((v) => v.id)));
			}
			setRevealAll(true);
		} else {
			setRevealedIds(new Set());
			setRevealAll(false);
		}
	}, [revealAll, selectedProject]);

	const toggleReveal = useCallback((id: string) => {
		setRevealedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const toggleGroupCollapse = useCallback((group: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(group)) next.delete(group);
			else next.add(group);
			return next;
		});
	}, []);

	const toggleExpandValue = useCallback((id: string) => {
		setExpandedValues((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	// Export clipboard helper
	const handleExportCopy = useCallback(
		(format: string) => {
			if (!selectedProject) return;
			let text = "";
			switch (format) {
				case "shell":
					text = exportAsShellExports(selectedProject.vars);
					break;
				case "docker":
					text = exportAsDockerFlags(selectedProject.vars);
					break;
				case "github":
					text = exportAsGitHubActions(selectedProject.vars);
					break;
				case "k8s":
					text = exportAsK8sSecret(selectedProject.vars);
					break;
			}
			navigator.clipboard.writeText(text).then(() => {
				setExportCopied(format);
				setTimeout(() => setExportCopied(null), 1500);
			});
			setShowExportMenu(false);
		},
		[selectedProject],
	);

	// Close export menu on outside click
	useEffect(() => {
		if (!showExportMenu) return;
		const handler = (e: MouseEvent) => {
			if (
				exportMenuRef.current &&
				!exportMenuRef.current.contains(e.target as Node)
			) {
				setShowExportMenu(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [showExportMenu]);

	// ─── Render ───────────────────────────────────────────

	return (
		<>
			<SEOHead tool={tool} />
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					{selectedProject && (
						<div className='flex items-center gap-1.5'>
							<button
								onClick={() => {
									setShowImport(!showImport);
									if (!showImport) {
										setImportPhase("input");
										setImportPreview([]);
										setImportConflicts([]);
									}
								}}
								className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
							>
								<Upload className='h-3.5 w-3.5' /> Import
							</button>
							<button
								onClick={() => setShowCompare(!showCompare)}
								className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
							>
								<GitCompare className='h-3.5 w-3.5' /> Compare
							</button>
							<CopyButton text={envExport} label='.env' />
							<CopyButton text={jsonExport} label='JSON' />
							{/* Export formats dropdown */}
							<div className='relative' ref={exportMenuRef}>
								<button
									onClick={() => setShowExportMenu(!showExportMenu)}
									className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
								>
									<Download className='h-3.5 w-3.5' /> Export ▾
								</button>
								{showExportMenu && (
									<div className='absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-popover py-1 shadow-md'>
										{[
											{ key: "shell", label: "Shell exports" },
											{ key: "docker", label: "Docker run flags" },
											{ key: "github", label: "GitHub Actions" },
											{ key: "k8s", label: "Kubernetes Secret" },
										].map((fmt) => (
											<button
												key={fmt.key}
												onClick={() => handleExportCopy(fmt.key)}
												className='flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/50 text-left'
											>
												{exportCopied === fmt.key
													? "✓ Copied!"
													: fmt.label}
											</button>
										))}
									</div>
								)}
							</div>
						</div>
					)}
				</ToolPageHeader>

				{/* Security banner */}
				<div className='flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-400'>
					<Shield className='h-3.5 w-3.5 shrink-0' />
					All data stored in browser localStorage. Do not store production
					secrets here.
				</div>

				<div className='flex flex-1 min-h-0'>
					{/* Sidebar */}
					<div className='w-56 shrink-0 border-r border-border flex flex-col bg-panel'>
						<div className='px-3 py-2 border-b border-border'>
							<button
								onClick={handleNewProject}
								className='inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90'
							>
								<FolderPlus className='h-3.5 w-3.5' /> New Project
							</button>
						</div>
						<div className='flex-1 overflow-auto'>
							{projects.length === 0 && (
								<div className='px-3 py-6 text-xs text-muted-foreground text-center'>
									No projects yet. Create one to get started.
								</div>
							)}
							{projects.map((p) => (
								<div
									key={p.id}
									className={cn(
										"group flex items-center gap-2 px-3 py-2 text-xs cursor-pointer border-b border-border/50",
										p.id === selectedId
											? "bg-accent/10 text-foreground"
											: "text-muted-foreground hover:text-foreground hover:bg-muted/30",
									)}
									onClick={() => setSelectedId(p.id)}
								>
									<input
										type='text'
										value={p.name}
										onChange={(e) => handleRenameProject(p.id, e.target.value)}
										onClick={(e) => e.stopPropagation()}
										className='flex-1 bg-transparent outline-none text-xs truncate'
									/>
									<span className='text-[10px] text-muted-foreground shrink-0'>
										{p.vars.length}
									</span>
									<button
										onClick={(e) => {
											e.stopPropagation();
											handleDeleteProject(p.id);
										}}
										className='opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400'
										aria-label={`Delete ${p.name}`}
									>
										<Trash2 className='h-3 w-3' />
									</button>
								</div>
							))}
						</div>
					</div>

					{/* Main content */}
					<div className='flex-1 flex flex-col min-w-0'>
						{!selectedProject ? (
							<div className='flex h-full items-center justify-center text-sm text-muted-foreground'>
								Select or create a project to manage variables.
							</div>
						) : (
							<>
								{/* Import panel */}
								{showImport && (
									<div className='border-b border-border p-3 space-y-2'>
										{importPhase === "input" ? (
											<>
												<div className='text-xs font-medium text-muted-foreground'>
													Paste .env content to import
												</div>
												<textarea
													value={importText}
													onChange={(e) => setImportText(e.target.value)}
													placeholder={
														'# Comments are ignored\nKEY=value\nDB_HOST="localhost"'
													}
													className='w-full h-24 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono outline-none resize-none focus:border-accent'
												/>
												<div className='flex gap-2'>
													<button
														onClick={handleImportPreview}
														disabled={!importText.trim()}
														className='h-7 rounded-md px-3 text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50'
													>
														Preview
													</button>
													<button
														onClick={handleImportCancel}
														className='h-7 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground'
													>
														Cancel
													</button>
												</div>
											</>
										) : (
											<>
												<div className='text-xs font-medium text-muted-foreground'>
													Import Preview — {importPreview.length} variable
													{importPreview.length !== 1 ? "s" : ""} found
												</div>

												{/* Large import warning */}
												{importPreview.length > LARGE_VAR_COUNT && (
													<div className='flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-[11px] text-amber-400'>
														<AlertTriangle className='h-3.5 w-3.5 shrink-0' />
														Importing {importPreview.length} variables may
														affect localStorage size limits.
													</div>
												)}

												{/* Preview table */}
												<div className='max-h-48 overflow-auto rounded-md border border-border'>
													<table className='w-full text-xs'>
														<thead className='bg-muted/30'>
															<tr>
																<th className='text-left px-2 py-1 font-medium text-muted-foreground'>
																	Key
																</th>
																<th className='text-left px-2 py-1 font-medium text-muted-foreground'>
																	Value
																</th>
																<th className='text-left px-2 py-1 font-medium text-muted-foreground w-32'>
																	Status
																</th>
															</tr>
														</thead>
														<tbody>
															{importPreview.map((v) => {
																const conflict = importConflicts.find(
																	(c) => c.incomingId === v.id,
																);
																return (
																	<tr
																		key={v.id}
																		className={cn(
																			"border-t border-border/50",
																			conflict && "bg-amber-500/5",
																		)}
																	>
																		<td className='px-2 py-1 font-mono'>
																			{v.key}
																		</td>
																		<td className='px-2 py-1 font-mono text-muted-foreground'>
																			{v.value.length > 40
																				? v.value.slice(0, 40) + "…"
																				: v.value}
																		</td>
																		<td className='px-2 py-1'>
																			{conflict ? (
																				<select
																					value={conflict.resolution}
																					onChange={(e) =>
																						handleConflictResolution(
																							v.id,
																							e.target
																								.value as ConflictResolution,
																						)
																					}
																					className='h-6 rounded border border-border bg-background px-1 text-[11px] outline-none'
																				>
																					<option value='overwrite'>
																						Overwrite
																					</option>
																					<option value='skip'>Skip</option>
																					<option value='rename'>
																						Rename
																					</option>
																				</select>
																			) : (
																				<span className='text-green-400'>
																					New
																				</span>
																			)}
																		</td>
																	</tr>
																);
															})}
														</tbody>
													</table>
												</div>

												<div className='flex gap-2'>
													<button
														onClick={handleImportConfirm}
														className='h-7 rounded-md px-3 text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90'
													>
														Confirm Import
													</button>
													<button
														onClick={() => {
															setImportPhase("input");
															setImportPreview([]);
															setImportConflicts([]);
														}}
														className='h-7 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground'
													>
														Back
													</button>
													<button
														onClick={handleImportCancel}
														className='h-7 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground'
													>
														Cancel
													</button>
												</div>
											</>
										)}
									</div>
								)}

								{/* Compare panel */}
								{showCompare && (
									<div className='border-b border-border p-3 space-y-2'>
										<div className='flex items-center justify-between'>
											<div className='text-xs font-medium text-muted-foreground'>
												Compare Projects
											</div>
											<button
												onClick={() => setShowCompare(false)}
												className='p-0.5 text-muted-foreground hover:text-foreground'
											>
												<X className='h-3.5 w-3.5' />
											</button>
										</div>
										<div className='flex items-center gap-2'>
											<select
												value={compareLeftId ?? ""}
												onChange={(e) =>
													setCompareLeftId(e.target.value || null)
												}
												className='h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none'
											>
												<option value=''>Select left project</option>
												{projects.map((p) => (
													<option key={p.id} value={p.id}>
														{p.name}
													</option>
												))}
											</select>
											<span className='text-xs text-muted-foreground'>vs</span>
											<select
												value={compareRightId ?? ""}
												onChange={(e) =>
													setCompareRightId(e.target.value || null)
												}
												className='h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none'
											>
												<option value=''>Select right project</option>
												{projects.map((p) => (
													<option key={p.id} value={p.id}>
														{p.name}
													</option>
												))}
											</select>
										</div>
										{compareLeftId && compareRightId && (
											<div className='max-h-48 overflow-auto rounded-md border border-border'>
												<table className='w-full text-xs'>
													<thead className='bg-muted/30 sticky top-0'>
														<tr>
															<th className='text-left px-2 py-1 font-medium text-muted-foreground'>
																Key
															</th>
															<th className='text-left px-2 py-1 font-medium text-muted-foreground w-32'>
																Status
															</th>
														</tr>
													</thead>
													<tbody>
														{compareResults.length === 0 ? (
															<tr>
																<td
																	colSpan={2}
																	className='px-2 py-3 text-center text-muted-foreground'
																>
																	No keys to compare.
																</td>
															</tr>
														) : (
															compareResults.map((r) => (
																<tr
																	key={r.key}
																	className='border-t border-border/50'
																>
																	<td className='px-2 py-1 font-mono'>
																		{r.key}
																	</td>
																	<td className='px-2 py-1'>
																		{r.status === "left-only" && (
																			<span className='text-blue-400'>
																				Only in left
																			</span>
																		)}
																		{r.status === "right-only" && (
																			<span className='text-purple-400'>
																				Only in right
																			</span>
																		)}
																		{r.status === "same" && (
																			<span className='text-green-400'>
																				Same value
																			</span>
																		)}
																		{r.status === "differs" && (
																			<span className='text-amber-400'>
																				Value differs
																			</span>
																		)}
																	</td>
																</tr>
															))
														)}
													</tbody>
												</table>
											</div>
										)}
									</div>
								)}

								{/* Search bar + reveal all toggle */}
								<div className='px-3 py-2 border-b border-border flex items-center gap-2'>
									<div className='relative flex-1'>
										<Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
										<input
											type='text'
											value={search}
											onChange={(e) => setSearch(e.target.value)}
											placeholder='Filter keys...'
											className='h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-accent'
										/>
									</div>
									<label className='flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none whitespace-nowrap'>
										<input
											type='checkbox'
											checked={searchValues}
											onChange={(e) => setSearchValues(e.target.checked)}
											className='h-3 w-3 rounded border-border'
										/>
										Search values
									</label>
									<button
										onClick={handleRevealAllToggle}
										className='inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted/30 whitespace-nowrap'
									>
										{revealAll ? (
											<EyeOff className='h-3.5 w-3.5' />
										) : (
											<Eye className='h-3.5 w-3.5' />
										)}
										{revealAll ? "Hide all" : "Reveal all"}
									</button>
								</div>

								{/* Group filter chips */}
								{uniqueGroups.length > 0 && (
									<div className='flex items-center gap-1.5 px-3 py-1.5 border-b border-border flex-wrap'>
										<span className='text-[10px] text-muted-foreground uppercase tracking-wider mr-1'>
											Groups:
										</span>
										{uniqueGroups.map((g) => (
											<button
												key={g}
												onClick={() =>
													setSelectedGroupFilter(
														selectedGroupFilter === g ? null : g,
													)
												}
												className={cn(
													"inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium border transition-colors",
													selectedGroupFilter === g
														? "bg-accent text-accent-foreground border-accent"
														: "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50",
												)}
											>
												{g}
											</button>
										))}
										{selectedGroupFilter && (
											<button
												onClick={() => setSelectedGroupFilter(null)}
												className='inline-flex h-6 items-center text-[11px] text-muted-foreground hover:text-foreground ml-1'
											>
												<X className='h-3 w-3 mr-0.5' /> Clear
											</button>
										)}
									</div>
								)}

								{/* Duplicate warning */}
								{duplicateKeys.size > 0 && (
									<div className='flex items-center gap-2 px-3 py-1.5 text-[11px] text-amber-400 bg-amber-500/5 border-b border-border'>
										<AlertTriangle className='h-3.5 w-3.5 shrink-0' />
										Duplicate keys detected:{" "}
										{Array.from(duplicateKeys).join(", ")}
									</div>
								)}

								{/* >200 vars warning */}
								{selectedProject.vars.length > LARGE_VAR_COUNT && (
									<div className='flex items-center gap-2 px-3 py-1.5 text-[11px] text-amber-400 bg-amber-500/5 border-b border-border'>
										<AlertTriangle className='h-3.5 w-3.5 shrink-0' />
										{selectedProject.vars.length} variables — large datasets
										may approach localStorage size limits.
									</div>
								)}

								{/* Table */}
								<div className='flex-1 overflow-auto'>
									<table className='w-full text-xs'>
										<thead className='sticky top-0 bg-panel border-b border-border'>
											<tr>
												<th className='w-8 px-1 py-2' />
												<th className='text-left px-3 py-2 font-medium text-muted-foreground'>
													Key
												</th>
												<th className='text-left px-3 py-2 font-medium text-muted-foreground'>
													Value
												</th>
												<th className='text-left px-3 py-2 font-medium text-muted-foreground w-28'>
													Group
												</th>
												<th className='text-right px-3 py-2 font-medium text-muted-foreground w-28'>
													Actions
												</th>
											</tr>
										</thead>
										<tbody>
											{groupedVars.map((group) => {
												const collapseKey = group.name || "__ungrouped";
												const isCollapsed = collapsedGroups.has(collapseKey);
												return (
													<Fragment key={`group-${group.name}`}>
														{group.name && (
															<tr
																className='bg-muted/20 cursor-pointer hover:bg-muted/30'
																onClick={() =>
																	toggleGroupCollapse(collapseKey)
																}
															>
																<td colSpan={5} className='px-3 py-1.5'>
																	<div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
																		{isCollapsed ? (
																			<ChevronRight className='h-3.5 w-3.5' />
																		) : (
																			<ChevronDown className='h-3.5 w-3.5' />
																		)}
																		{group.name}
																		<span className='text-[10px] ml-1'>
																			({group.vars.length})
																		</span>
																	</div>
																</td>
															</tr>
														)}
														{!isCollapsed &&
															group.vars.map((v) => {
																const isRevealed =
																	revealAll || revealedIds.has(v.id);
																const isDupe =
																	v.key && duplicateKeys.has(v.key);
																const isSnakeCaseWarn =
																	v.key && !isUpperSnakeCase(v.key);
																const isMultiline =
																	v.value.includes("\n");
																const isLong =
																	v.value.length > TRUNCATE_LEN;
																const isExpanded =
																	expandedValues.has(v.id);
																return (
																	<tr
																		key={v.id}
																		draggable
																		onDragStart={(e) => {
																			e.dataTransfer.setData(
																				"text/plain",
																				v.id,
																			);
																			e.dataTransfer.effectAllowed =
																				"move";
																			setDraggedId(v.id);
																		}}
																		onDragOver={(e) => {
																			e.preventDefault();
																			e.dataTransfer.dropEffect = "move";
																		}}
																		onDrop={(e) => {
																			e.preventDefault();
																			const fromId =
																				e.dataTransfer.getData(
																					"text/plain",
																				);
																			handleReorder(fromId, v.id);
																			setDraggedId(null);
																		}}
																		onDragEnd={() => setDraggedId(null)}
																		className={cn(
																			"border-b border-border/50 hover:bg-muted/20",
																			isDupe && "bg-amber-500/5",
																			draggedId === v.id && "opacity-40",
																		)}
																	>
																		<td className='px-1 py-1 text-center cursor-grab active:cursor-grabbing'>
																			<GripVertical className='h-3.5 w-3.5 text-muted-foreground/50 inline-block' />
																		</td>
																		<td className='px-3 py-1'>
																			<input
																				type='text'
																				value={v.key}
																				onChange={(e) =>
																					handleUpdateVar(
																						v.id,
																						"key",
																						e.target.value,
																					)
																				}
																				placeholder='KEY_NAME'
																				className={cn(
																					"w-full bg-transparent outline-none font-mono text-foreground",
																					isSnakeCaseWarn &&
																						"text-amber-300",
																				)}
																			/>
																			{isSnakeCaseWarn && (
																				<div className='text-[10px] text-amber-400/70 mt-0.5'>
																					Not UPPER_SNAKE_CASE
																				</div>
																			)}
																		</td>
																		<td className='px-3 py-1'>
																			<div className='flex items-center gap-1.5'>
																				{isMultiline && isRevealed ? (
																					<textarea
																						value={v.value}
																						onChange={(e) =>
																							handleUpdateVar(
																								v.id,
																								"value",
																								e.target.value,
																							)
																						}
																						rows={3}
																						className='flex-1 bg-transparent outline-none font-mono text-foreground resize-y rounded border border-border/50 px-1 py-0.5 text-xs'
																					/>
																				) : isLong &&
																				  isRevealed &&
																				  !isExpanded ? (
																					<span
																						onClick={() =>
																							toggleExpandValue(v.id)
																						}
																						className='flex-1 font-mono text-foreground cursor-pointer'
																					>
																						{v.value.slice(
																							0,
																							TRUNCATE_LEN,
																						)}
																						…
																						<span className='text-[10px] text-accent ml-1 hover:underline'>
																							+
																							{v.value.length -
																								TRUNCATE_LEN}{" "}
																							more
																						</span>
																					</span>
																				) : (
																					<div className='flex-1 min-w-0'>
																						<input
																							type={
																								isRevealed
																									? "text"
																									: "password"
																							}
																							value={v.value}
																							onChange={(e) =>
																								handleUpdateVar(
																									v.id,
																									"value",
																									e.target.value,
																								)
																							}
																							placeholder='value'
																							className='w-full bg-transparent outline-none font-mono text-foreground'
																						/>
																						{isLong &&
																							isRevealed &&
																							isExpanded && (
																								<button
																									onClick={() =>
																										toggleExpandValue(
																											v.id,
																										)
																									}
																									className='text-[10px] text-accent hover:underline'
																								>
																									Show less
																								</button>
																							)}
																					</div>
																				)}
																				<button
																					onClick={() =>
																						toggleReveal(v.id)
																					}
																					className='p-1 text-muted-foreground hover:text-foreground shrink-0'
																					aria-label={
																						isRevealed
																							? "Hide value"
																							: "Show value"
																					}
																				>
																					{isRevealed ? (
																						<EyeOff className='h-3.5 w-3.5' />
																					) : (
																						<Eye className='h-3.5 w-3.5' />
																					)}
																				</button>
																			</div>
																		</td>
																		<td className='px-3 py-1'>
																			<input
																				type='text'
																				value={v.group}
																				onChange={(e) =>
																					handleUpdateVar(
																						v.id,
																						"group",
																						e.target.value,
																					)
																				}
																				placeholder='group'
																				className='w-full bg-transparent outline-none text-muted-foreground'
																			/>
																		</td>
																		<td className='px-3 py-1 text-right'>
																			<div className='flex items-center justify-end gap-1'>
																				<CopyButton
																					text={`${v.key}=${v.value}`}
																				/>
																				<button
																					onClick={() =>
																						handleDuplicateVar(v.id)
																					}
																					className='p-1 text-muted-foreground hover:text-foreground'
																					aria-label='Duplicate variable'
																				>
																					<Copy className='h-3.5 w-3.5' />
																				</button>
																				<button
																					onClick={() =>
																						handleDeleteVar(v.id)
																					}
																					className='p-1 text-muted-foreground hover:text-red-400'
																					aria-label='Delete variable'
																				>
																					<Trash2 className='h-3.5 w-3.5' />
																				</button>
																			</div>
																		</td>
																	</tr>
																);
															})}
													</Fragment>
												);
											})}

											{/* Add row */}
											<tr>
												<td colSpan={5} className='px-3 py-2'>
													<button
														onClick={handleAddVar}
														className='inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground'
													>
														<Plus className='h-3.5 w-3.5' /> Add variable
													</button>
												</td>
											</tr>
										</tbody>
									</table>

									{selectedProject.vars.length === 0 && (
										<div className='flex h-40 items-center justify-center text-xs text-muted-foreground'>
											No variables yet. Click &quot;Add variable&quot; or import
											a .env file.
										</div>
									)}
								</div>
							</>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
