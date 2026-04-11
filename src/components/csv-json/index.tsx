import { useState, useCallback, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Download, Upload } from "lucide-react";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn, formatBytes } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";

type Mode = "csv-to-json" | "json-to-csv";
type Delimiter = "auto" | "," | "\t" | ";" | "|";
type QuoteChar = '"' | "'";
type OutputFormat =
	| "array-of-objects"
	| "array-of-arrays"
	| "keyed-by-first-column";
type NestedHandling = "flatten" | "stringify" | "skip";

interface CsvJsonPrefs {
	mode: Mode;
	delimiter: Delimiter;
	firstRowHeader: boolean;
	trimWhitespace: boolean;
	skipEmptyRows: boolean;
	quoteChar: QuoteChar;
	outputFormat: OutputFormat;
	parseNumbers: boolean;
	parseBooleans: boolean;
	parseNulls: boolean;
	nestedHandling: NestedHandling;
}

interface ConversionStats {
	rows: number;
	cols: number;
	nullsReplaced: number;
	typeConversions: number;
}

const tool = TOOLS.find((t) => t.id === "csv-json")!;

const BOM = "\uFEFF";

function stripBom(text: string): string {
	return text.startsWith(BOM) ? text.slice(1) : text;
}

function detectDelimiter(firstLine: string): string {
	const candidates: [string, number][] = [
		["\t", (firstLine.match(/\t/g) ?? []).length],
		["|", (firstLine.match(/\|/g) ?? []).length],
		[";", (firstLine.match(/;/g) ?? []).length],
		[",", (firstLine.match(/,/g) ?? []).length],
	];
	candidates.sort((a, b) => b[1] - a[1]);
	return candidates[0][1] > 0 ? candidates[0][0] : ",";
}

function parseCsvLine(
	line: string,
	delimiter: string,
	quoteChar: QuoteChar,
): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === quoteChar) {
				if (i + 1 < line.length && line[i + 1] === quoteChar) {
					current += quoteChar;
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			current += ch;
			i++;
		} else {
			if (ch === quoteChar) {
				inQuotes = true;
				i++;
				continue;
			}
			if (line.substring(i, i + delimiter.length) === delimiter) {
				fields.push(current);
				current = "";
				i += delimiter.length;
				continue;
			}
			current += ch;
			i++;
		}
	}
	fields.push(current);
	return fields;
}

const NULL_VALUES = new Set(["", "null", "NULL", "N/A", "n/a", "-"]);
const TRUE_VALUES = new Set(["true", "yes", "1"]);
const FALSE_VALUES = new Set(["false", "no", "0"]);

function parseValue(
	raw: string,
	opts: { parseNumbers: boolean; parseBooleans: boolean; parseNulls: boolean },
	counters: { nullsReplaced: number; typeConversions: number },
): unknown {
	if (opts.parseNulls && NULL_VALUES.has(raw)) {
		counters.nullsReplaced++;
		return null;
	}
	if (opts.parseBooleans) {
		const lower = raw.toLowerCase();
		if (TRUE_VALUES.has(lower)) {
			counters.typeConversions++;
			return true;
		}
		if (FALSE_VALUES.has(lower)) {
			counters.typeConversions++;
			return false;
		}
	}
	if (opts.parseNumbers && raw !== "") {
		const num = Number(raw);
		if (!Number.isNaN(num) && raw.trim() !== "") {
			counters.typeConversions++;
			return num;
		}
	}
	return raw;
}

function flattenObject(
	obj: Record<string, unknown>,
	prefix: string,
	handling: NestedHandling,
	result: Record<string, unknown>,
) {
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			if (handling === "flatten") {
				flattenObject(
					value as Record<string, unknown>,
					fullKey,
					handling,
					result,
				);
			} else if (handling === "stringify") {
				result[fullKey] = JSON.stringify(value);
			}
			// skip: do nothing
		} else if (Array.isArray(value)) {
			if (handling === "stringify") {
				result[fullKey] = JSON.stringify(value);
			} else if (handling === "flatten") {
				result[fullKey] = JSON.stringify(value);
			}
			// skip: do nothing
		} else {
			result[fullKey] = value;
		}
	}
}

function csvToJson(
	input: string,
	prefs: CsvJsonPrefs,
): {
	json: string;
	stats: ConversionStats;
} {
	let text = stripBom(input);
	const allLines = text.split(/\r?\n/);
	const lines = prefs.skipEmptyRows
		? allLines.filter((l) => l.trim() !== "")
		: allLines;
	if (lines.length === 0)
		return {
			json: "[]",
			stats: { rows: 0, cols: 0, nullsReplaced: 0, typeConversions: 0 },
		};

	const delimiter =
		prefs.delimiter === "auto" ? detectDelimiter(lines[0]) : prefs.delimiter;
	const parsed = lines.map((line) => {
		const fields = parseCsvLine(line, delimiter, prefs.quoteChar);
		return prefs.trimWhitespace ? fields.map((f) => f.trim()) : fields;
	});
	const cols = Math.max(...parsed.map((r) => r.length));
	const counters = { nullsReplaced: 0, typeConversions: 0 };
	const parseOpts = {
		parseNumbers: prefs.parseNumbers,
		parseBooleans: prefs.parseBooleans,
		parseNulls: prefs.parseNulls,
	};

	if (prefs.firstRowHeader && parsed.length > 1) {
		const headers = parsed[0];
		const dataRows = parsed.slice(1);

		if (prefs.outputFormat === "array-of-objects") {
			const objects = dataRows.map((row) => {
				const obj: Record<string, unknown> = {};
				for (let i = 0; i < headers.length; i++) {
					obj[headers[i] || `col${i + 1}`] = parseValue(
						row[i] ?? "",
						parseOpts,
						counters,
					);
				}
				return obj;
			});
			return {
				json: JSON.stringify(objects, null, 2),
				stats: { rows: dataRows.length, cols, ...counters },
			};
		}

		if (prefs.outputFormat === "keyed-by-first-column") {
			const result: Record<string, Record<string, unknown>> = {};
			for (const row of dataRows) {
				const key = String(row[0] ?? "");
				const obj: Record<string, unknown> = {};
				for (let i = 1; i < headers.length; i++) {
					obj[headers[i] || `col${i + 1}`] = parseValue(
						row[i] ?? "",
						parseOpts,
						counters,
					);
				}
				result[key] = obj;
			}
			return {
				json: JSON.stringify(result, null, 2),
				stats: { rows: dataRows.length, cols, ...counters },
			};
		}

		// array-of-arrays: include header row
		const arrays = [headers, ...dataRows].map((row) =>
			row.map((v) => parseValue(v, parseOpts, counters)),
		);
		return {
			json: JSON.stringify(arrays, null, 2),
			stats: { rows: dataRows.length, cols, ...counters },
		};
	}

	// No header row → array of arrays
	const arrays = parsed.map((row) =>
		row.map((v) => parseValue(v, parseOpts, counters)),
	);
	return {
		json: JSON.stringify(arrays, null, 2),
		stats: { rows: parsed.length, cols, ...counters },
	};
}

function jsonToCsv(
	input: string,
	prefs: CsvJsonPrefs,
): { csv: string; stats: ConversionStats } {
	const data = JSON.parse(input);
	if (!Array.isArray(data)) throw new Error("JSON must be an array");
	if (data.length === 0)
		return {
			csv: "",
			stats: { rows: 0, cols: 0, nullsReplaced: 0, typeConversions: 0 },
		};

	const delimiter = prefs.delimiter === "auto" ? "," : prefs.delimiter;

	// Array of objects
	if (
		typeof data[0] === "object" &&
		data[0] !== null &&
		!Array.isArray(data[0])
	) {
		// Flatten/handle nested objects first
		const processedData = data.map((item) => {
			if (typeof item !== "object" || item === null) return item;
			const flat: Record<string, unknown> = {};
			flattenObject(
				item as Record<string, unknown>,
				"",
				prefs.nestedHandling,
				flat,
			);
			return flat;
		});

		const allKeys = new Set<string>();
		for (const item of processedData) {
			if (typeof item === "object" && item !== null) {
				for (const key of Object.keys(item as Record<string, unknown>))
					allKeys.add(key);
			}
		}
		const headers = Array.from(allKeys);
		const lines = [
			headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter),
		];
		for (const item of processedData) {
			const row = headers.map((h) => {
				const val = (item as Record<string, unknown>)[h];
				return escapeCsvField(
					val === null || val === undefined ? "" : String(val),
					delimiter,
				);
			});
			lines.push(row.join(delimiter));
		}
		return {
			csv: lines.join("\n"),
			stats: {
				rows: data.length,
				cols: headers.length,
				nullsReplaced: 0,
				typeConversions: 0,
			},
		};
	}

	// Array of arrays
	if (Array.isArray(data[0])) {
		const cols = Math.max(
			...data.map((r: unknown[]) => (Array.isArray(r) ? r.length : 0)),
		);
		const lines = data.map((row: unknown[]) => {
			if (!Array.isArray(row)) return "";
			return row
				.map((v) =>
					escapeCsvField(
						v === null || v === undefined ? "" : String(v),
						delimiter,
					),
				)
				.join(delimiter);
		});
		return {
			csv: lines.join("\n"),
			stats: { rows: data.length, cols, nullsReplaced: 0, typeConversions: 0 },
		};
	}

	// Array of primitives
	const lines = data.map((v: unknown) =>
		escapeCsvField(v === null || v === undefined ? "" : String(v), ","),
	);
	return {
		csv: lines.join("\n"),
		stats: { rows: data.length, cols: 1, nullsReplaced: 0, typeConversions: 0 },
	};
}

function escapeCsvField(value: string, delimiter: string): string {
	if (
		value.includes('"') ||
		value.includes(delimiter) ||
		value.includes("\n") ||
		value.includes("\r")
	) {
		return '"' + value.replace(/"/g, '""') + '"';
	}
	return value;
}

function triggerDownload(content: string, filename: string) {
	const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

function useFileDrop(
	onFile: (content: string, name: string) => void,
	accept: string[],
) {
	const [dragging, setDragging] = useState(false);
	const [fileName, setFileName] = useState<string | null>(null);
	const counter = useRef(0);

	const onDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		counter.current++;
		setDragging(true);
	}, []);
	const onDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		counter.current--;
		if (counter.current === 0) setDragging(false);
	}, []);
	const onDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);
	const onDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setDragging(false);
			counter.current = 0;
			const file = e.dataTransfer.files[0];
			if (!file) return;
			const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
			if (!accept.includes(`.${ext}`)) return;
			const reader = new FileReader();
			reader.onload = () => {
				const text = reader.result as string;
				setFileName(file.name);
				onFile(text, file.name);
			};
			reader.readAsText(file);
		},
		[onFile, accept],
	);
	return {
		dragging,
		fileName,
		setFileName,
		onDragEnter,
		onDragLeave,
		onDragOver,
		onDrop,
	};
}

function ToggleButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				"h-8 rounded-md px-3 text-xs font-medium whitespace-nowrap",
				active
					? "bg-accent/20 text-accent"
					: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
			)}
		>
			{children}
		</button>
	);
}

export function CsvJsonTool() {
	const [input, setInput] = useLocalStorage("devtools-csv-json-input", "");
	const [prefs, setPrefs] = useLocalStorage<CsvJsonPrefs>(
		"devtools-csv-json-prefs",
		{
			mode: "csv-to-json",
			delimiter: "auto",
			firstRowHeader: true,
			trimWhitespace: true,
			skipEmptyRows: true,
			quoteChar: '"',
			outputFormat: "array-of-objects",
			parseNumbers: false,
			parseBooleans: false,
			parseNulls: false,
			nestedHandling: "flatten",
		},
	);
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [processingTime, setProcessingTime] = useState<number | undefined>();
	const [stats, setStats] = useState<ConversionStats | null>(null);
	const debouncedInput = useDebounce(input, 300);

	const inputDrop = useFileDrop(
		useCallback((content: string) => setInput(content), [setInput]),
		prefs.mode === "csv-to-json" ? [".csv", ".tsv", ".txt"] : [".json"],
	);

	const outputDrop = useFileDrop(
		useCallback(
			(content: string) => {
				// Dropping on output panel switches mode and sets as input
				const newMode: Mode =
					prefs.mode === "csv-to-json" ? "json-to-csv" : "csv-to-json";
				setPrefs((p) => ({ ...p, mode: newMode }));
				setInput(content);
			},
			[prefs.mode, setPrefs, setInput],
		),
		prefs.mode === "csv-to-json" ? [".json"] : [".csv", ".tsv", ".txt"],
	);

	const processInput = useCallback(
		(text: string) => {
			if (!text.trim()) {
				setOutput("");
				setError(null);
				setProcessingTime(undefined);
				setStats(null);
				return;
			}
			const start = performance.now();
			try {
				if (prefs.mode === "csv-to-json") {
					const result = csvToJson(text, prefs);
					setOutput(result.json);
					setStats(result.stats);
				} else {
					const result = jsonToCsv(text, prefs);
					setOutput(result.csv);
					setStats(result.stats);
				}
				setError(null);
			} catch (e) {
				setOutput("");
				setError(e instanceof Error ? e.message : "Conversion failed");
				setStats(null);
			}
			setProcessingTime(performance.now() - start);
		},
		[prefs],
	);

	useEffect(() => {
		processInput(debouncedInput);
	}, [debouncedInput, processInput]);

	const handleClear = useCallback(() => {
		setInput("");
		setOutput("");
		setError(null);
		setProcessingTime(undefined);
		setStats(null);
		inputDrop.setFileName(null);
		outputDrop.setFileName(null);
	}, [setInput, inputDrop, outputDrop]);

	const handleDownload = useCallback(() => {
		if (!output) return;
		const ext = prefs.mode === "csv-to-json" ? "json" : "csv";
		triggerDownload(output, `converted.${ext}`);
	}, [output, prefs.mode]);

	const inputLang = prefs.mode === "csv-to-json" ? "plaintext" : "json";
	const outputLang = prefs.mode === "csv-to-json" ? "json" : "plaintext";
	const inputBytes = new TextEncoder().encode(input).length;
	const outputBytes = new TextEncoder().encode(output).length;

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<div className='flex rounded-md border border-border overflow-hidden'>
						<button
							onClick={() => setPrefs((p) => ({ ...p, mode: "csv-to-json" }))}
							className={cn(
								"h-8 px-3 text-xs font-medium transition-colors",
								prefs.mode === "csv-to-json"
									? "bg-accent text-zinc-950"
									: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
							)}
						>
							CSV → JSON
						</button>
						<button
							onClick={() => setPrefs((p) => ({ ...p, mode: "json-to-csv" }))}
							className={cn(
								"h-8 px-3 text-xs font-medium transition-colors",
								prefs.mode === "json-to-csv"
									? "bg-accent text-zinc-950"
									: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
							)}
						>
							JSON → CSV
						</button>
					</div>
					<select
						value={prefs.delimiter === "\t" ? "tab" : prefs.delimiter}
						onChange={(e) => {
							const val = e.target.value;
							setPrefs((p) => ({
								...p,
								delimiter: (val === "tab" ? "\t" : val) as Delimiter,
							}));
						}}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='Delimiter'
					>
						<option value='auto'>Auto-detect</option>
						<option value=','>Comma</option>
						<option value='tab'>Tab</option>
						<option value=';'>Semicolon</option>
						<option value='|'>Pipe</option>
					</select>
					<select
						value={prefs.quoteChar}
						onChange={(e) =>
							setPrefs((p) => ({
								...p,
								quoteChar: e.target.value as QuoteChar,
							}))
						}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='Quote Character'
					>
						<option value='"'>Double quote (&quot;)</option>
						<option value="'">Single quote (&apos;)</option>
					</select>
					{prefs.mode === "csv-to-json" && (
						<>
							<ToggleButton
								active={prefs.firstRowHeader}
								onClick={() =>
									setPrefs((p) => ({ ...p, firstRowHeader: !p.firstRowHeader }))
								}
							>
								Header Row
							</ToggleButton>
							<select
								value={prefs.outputFormat}
								onChange={(e) =>
									setPrefs((p) => ({
										...p,
										outputFormat: e.target.value as OutputFormat,
									}))
								}
								className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
								aria-label='Output Format'
							>
								<option value='array-of-objects'>Array of Objects</option>
								<option value='array-of-arrays'>Array of Arrays</option>
								<option value='keyed-by-first-column'>
									Keyed by 1st Column
								</option>
							</select>
						</>
					)}
					{prefs.mode === "json-to-csv" && (
						<select
							value={prefs.nestedHandling}
							onChange={(e) =>
								setPrefs((p) => ({
									...p,
									nestedHandling: e.target.value as NestedHandling,
								}))
							}
							className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
							aria-label='Nested Objects'
						>
							<option value='flatten'>Flatten (dot notation)</option>
							<option value='stringify'>JSON-stringify</option>
							<option value='skip'>Skip nested</option>
						</select>
					)}
					<CopyButton text={output} label='Copy' />
					<button
						onClick={handleDownload}
						disabled={!output}
						className='inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-40'
						aria-label='Download'
					>
						<Download className='h-3.5 w-3.5' />
						Download
					</button>
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
				</ToolPageHeader>

				{/* Options row */}
				<div className='flex items-center gap-1.5 border-b border-border px-3 py-1'>
					<ToggleButton
						active={prefs.trimWhitespace}
						onClick={() =>
							setPrefs((p) => ({ ...p, trimWhitespace: !p.trimWhitespace }))
						}
					>
						Trim Whitespace
					</ToggleButton>
					<ToggleButton
						active={prefs.skipEmptyRows}
						onClick={() =>
							setPrefs((p) => ({ ...p, skipEmptyRows: !p.skipEmptyRows }))
						}
					>
						Skip Empty Rows
					</ToggleButton>
					{prefs.mode === "csv-to-json" && (
						<>
							<ToggleButton
								active={prefs.parseNumbers}
								onClick={() =>
									setPrefs((p) => ({ ...p, parseNumbers: !p.parseNumbers }))
								}
							>
								Parse Numbers
							</ToggleButton>
							<ToggleButton
								active={prefs.parseBooleans}
								onClick={() =>
									setPrefs((p) => ({ ...p, parseBooleans: !p.parseBooleans }))
								}
							>
								Parse Booleans
							</ToggleButton>
							<ToggleButton
								active={prefs.parseNulls}
								onClick={() =>
									setPrefs((p) => ({ ...p, parseNulls: !p.parseNulls }))
								}
							>
								Parse Nulls
							</ToggleButton>
						</>
					)}
				</div>

				<div className='flex flex-1 overflow-hidden'>
					{/* Input panel */}
					<div
						className={cn(
							"flex flex-1 flex-col border-r border-border relative",
							inputDrop.dragging && "ring-2 ring-accent ring-inset",
						)}
						onDragEnter={inputDrop.onDragEnter}
						onDragLeave={inputDrop.onDragLeave}
						onDragOver={inputDrop.onDragOver}
						onDrop={inputDrop.onDrop}
					>
						{inputDrop.dragging && (
							<div className='absolute inset-0 z-10 flex items-center justify-center bg-accent/10 pointer-events-none'>
								<div className='flex items-center gap-2 rounded-md bg-zinc-800 px-4 py-2 text-xs text-accent'>
									<Upload className='h-4 w-4' />
									Drop file here
								</div>
							</div>
						)}
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<span className='text-[10px] text-muted-foreground'>
								Input ({prefs.mode === "csv-to-json" ? "CSV" : "JSON"})
								{inputDrop.fileName && (
									<span className='ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-accent'>
										{inputDrop.fileName}
									</span>
								)}
							</span>
							<span className='text-[10px] text-muted-foreground'>
								{input.length.toLocaleString()} chars
							</span>
						</div>
						<div className='flex-1'>
							<MonacoWrapper
								value={input}
								onChange={(v) => setInput(v ?? "")}
								language={inputLang}
								height='100%'
							/>
						</div>
						{error && (
							<div className='p-2'>
								<ErrorBox error={error} />
							</div>
						)}
					</div>

					{/* Stats bar between panels */}
					{stats && (
						<div className='flex flex-col items-center justify-center gap-1 border-r border-border px-2 py-2 text-[10px] text-muted-foreground min-w-25'>
							<span data-testid='stat-rows'>{stats.rows} rows</span>
							<span data-testid='stat-cols'>{stats.cols} columns</span>
							<span data-testid='stat-nulls'>{stats.nullsReplaced} nulls</span>
							<span data-testid='stat-conversions'>
								{stats.typeConversions} conversions
							</span>
						</div>
					)}

					{/* Output panel */}
					<div
						className={cn(
							"flex flex-1 flex-col relative",
							outputDrop.dragging && "ring-2 ring-accent ring-inset",
						)}
						onDragEnter={outputDrop.onDragEnter}
						onDragLeave={outputDrop.onDragLeave}
						onDragOver={outputDrop.onDragOver}
						onDrop={outputDrop.onDrop}
					>
						{outputDrop.dragging && (
							<div className='absolute inset-0 z-10 flex items-center justify-center bg-accent/10 pointer-events-none'>
								<div className='flex items-center gap-2 rounded-md bg-zinc-800 px-4 py-2 text-xs text-accent'>
									<Upload className='h-4 w-4' />
									Drop file here
								</div>
							</div>
						)}
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<span className='text-[10px] text-muted-foreground'>
								Output ({prefs.mode === "csv-to-json" ? "JSON" : "CSV"})
							</span>
							<span className='text-[10px] text-muted-foreground'>
								{formatBytes(outputBytes)}
							</span>
						</div>
						<div className='flex-1'>
							<MonacoWrapper
								value={output}
								language={outputLang}
								readOnly
								height='100%'
							/>
						</div>
					</div>
				</div>

				<div className='flex items-center gap-4 border-t border-border px-3 py-1 text-[10px] text-muted-foreground'>
					<span>Input: {input.length.toLocaleString()} chars</span>
					<span>{formatBytes(inputBytes)}</span>
					<span>Output: {output.length.toLocaleString()} chars</span>
					<span>{formatBytes(outputBytes)}</span>
					{processingTime !== undefined && (
						<span className='ml-auto'>
							Processed in{" "}
							{processingTime < 1 ? "<1ms" : `${processingTime.toFixed(1)}ms`}
						</span>
					)}
				</div>
			</div>
		</>
	);
}
