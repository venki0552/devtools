import { useState, useCallback, useMemo } from "react";
import { SEOHead } from "@/components/shared/SEOHead";
import { Server, RefreshCw } from "lucide-react";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import { generateMockData, regenerateSingleRow } from "./generator";

const tool = TOOLS.find((t) => t.id === "mock-api")!;

type InputMode = "schema" | "example" | "description";
type OutputFormat = "json" | "ndjson" | "csv";
type Locale = "US" | "UK" | "DE" | "FR" | "JP" | "IN";

const LOCALE_LABELS: Record<Locale, string> = {
	US: "US (English)",
	UK: "UK (English)",
	DE: "Germany (Deutsch)",
	FR: "France (Français)",
	JP: "Japan (日本語)",
	IN: "India (Hindi/English)",
};

interface MockApiPrefs {
	inputMode: InputMode;
	recordCount: number;
	outputFormat: OutputFormat;
	locale: Locale;
	seed: string;
}

const MODE_LABELS: Record<InputMode, string> = {
	schema: "JSON Schema",
	example: "Example JSON",
	description: "Plain Description",
};

const MODE_LANGUAGES: Record<InputMode, string> = {
	schema: "json",
	example: "json",
	description: "plaintext",
};

function buildFetchMockSnippet(
	output: string,
	outputFormat: OutputFormat,
): string {
	const escaped = output.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
	return `// Mock fetch — paste into your test setup or module mock
const mockData = \`${escaped}\`;

function mockFetch(url, options) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "${outputFormat === "csv" ? "text/csv" : "application/json"}" }),
    json: () => Promise.resolve(JSON.parse(mockData)),
    text: () => Promise.resolve(mockData),
  });
}

// Usage: globalThis.fetch = mockFetch;
`;
}

function buildMswHandlerSnippet(
	output: string,
	outputFormat: OutputFormat,
): string {
	const escaped = output.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
	const contentType = outputFormat === "csv" ? "text/csv" : "application/json";
	return `// MSW handler — add to your handlers array
import { http, HttpResponse } from "msw";

const mockData = \`${escaped}\`;

export const handlers = [
  http.get("/api/resource", () => {
    return new HttpResponse(mockData, {
      headers: { "Content-Type": "${contentType}" },
    });
  }),
];
`;
}

const PLACEHOLDER: Record<InputMode, string> = {
	schema: `{
  "type": "object",
  "properties": {
    "id": { "type": "integer" },
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "age": { "type": "integer", "minimum": 18, "maximum": 99 },
    "role": { "type": "string", "enum": ["admin", "user", "editor"] }
  },
  "required": ["id", "name", "email"]
}`,
	example: `{
  "id": 1,
  "name": "Jane Doe",
  "email": "jane@example.com",
  "age": 28,
  "role": "admin",
  "created_at": "2024-03-15T10:30:00Z"
}`,
	description: `A user profile with:
- unique numeric ID
- full name
- email address
- age (18-65)
- role (admin, user, or editor)
- signup date
- boolean active status`,
};

export function MockApiTool() {
	const [inputs, setInputs] = useLocalStorage<Record<InputMode, string>>(
		"devtools-mock-api-schema",
		{
			schema: "",
			example: "",
			description: "",
		},
	);
	const [prefs, setPrefs] = useLocalStorage<MockApiPrefs>(
		"devtools-mock-api-prefs",
		{
			inputMode: "schema",
			recordCount: 10,
			outputFormat: "json",
			locale: "US",
			seed: "",
		},
	);
	const [regeneratingRow, setRegeneratingRow] = useState<number | null>(null);
	// Note: regeneration is synchronous, but we keep state for potential future async use
	const [error, setError] = useState<string | null>(null);
	const [output, setOutput] = useState("");

	const currentInput = inputs[prefs.inputMode] ?? "";

	const setCurrentInput = useCallback(
		(value: string) => {
			setInputs((prev) => ({ ...prev, [prefs.inputMode]: value }));
		},
		[setInputs, prefs.inputMode],
	);

	const handleGenerate = useCallback(() => {
		const trimmed = currentInput.trim();
		if (!trimmed) return;

		// Validate JSON input for schema/example modes
		if (prefs.inputMode === "schema" || prefs.inputMode === "example") {
			try {
				JSON.parse(trimmed);
			} catch {
				setError(
					`Invalid JSON in ${MODE_LABELS[prefs.inputMode]} input. Please fix the JSON and try again.`,
				);
				return;
			}
		}

		setError(null);
		setOutput("");
		try {
			const data = generateMockData(
				trimmed,
				prefs.inputMode,
				prefs.recordCount,
				prefs.outputFormat,
				prefs.locale,
				prefs.seed,
			);
			setOutput(data);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Generation failed");
		}
	}, [currentInput, prefs]);

	const handleClear = useCallback(() => {
		setCurrentInput("");
		setOutput("");
		setError(null);
	}, [setCurrentInput]);

	// Parse output into array for per-row regeneration (JSON format only)
	const parsedOutputArray = useMemo<unknown[] | null>(() => {
		if (!output || prefs.outputFormat !== "json") return null;
		try {
			const parsed = JSON.parse(output);
			return Array.isArray(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}, [output, prefs.outputFormat]);

	const handleRegenerateRow = useCallback(
		(rowIndex: number) => {
			if (!parsedOutputArray || !parsedOutputArray[rowIndex]) return;
			setRegeneratingRow(rowIndex);
			setError(null);
			try {
				const newRow = regenerateSingleRow(
					currentInput.trim(),
					prefs.inputMode,
					prefs.locale,
				);
				const updated = [...parsedOutputArray];
				updated[rowIndex] = newRow;
				setOutput(JSON.stringify(updated, null, 2));
			} catch (e) {
				setError(
					e instanceof Error
						? `Row ${rowIndex} regeneration failed: ${e.message}`
						: "Row regeneration failed",
				);
			} finally {
				setRegeneratingRow(null);
			}
		},
		[parsedOutputArray, currentInput, prefs.inputMode, prefs.locale],
	);

	const fetchMockSnippet = useMemo(
		() => (output ? buildFetchMockSnippet(output, prefs.outputFormat) : ""),
		[output, prefs.outputFormat],
	);

	const mswHandlerSnippet = useMemo(
		() => (output ? buildMswHandlerSnippet(output, prefs.outputFormat) : ""),
		[output, prefs.outputFormat],
	);

	return (
		<>
			<SEOHead tool={tool} />

			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<button
						onClick={handleGenerate}
						disabled={!currentInput.trim()}
						className='h-8 rounded-md bg-accent px-3 text-xs font-medium text-zinc-950 hover:bg-accent/80 disabled:opacity-50'
					>
						Generate
					</button>
					<div className='flex items-center gap-1.5'>
						<label
							htmlFor='record-count-slider'
							className='text-[10px] text-muted-foreground'
						>
							Count:
						</label>
						<input
							id='record-count-slider'
							type='range'
							min={1}
							max={100}
							value={prefs.recordCount}
							onChange={(e) => {
								const v = Number(e.target.value);
								setPrefs((p) => ({ ...p, recordCount: v }));
							}}
							className='h-2 w-20 cursor-pointer accent-accent'
							aria-label='Record count'
						/>
						<span className='min-w-[2ch] text-center text-xs text-zinc-200'>
							{prefs.recordCount}
						</span>
					</div>

					<select
						value={prefs.outputFormat}
						onChange={(e) =>
							setPrefs((p) => ({
								...p,
								outputFormat: e.target.value as OutputFormat,
							}))
						}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='Output format'
					>
						<option value='json'>JSON Array</option>
						<option value='ndjson'>NDJSON</option>
						<option value='csv'>CSV</option>
					</select>
					<select
						value={prefs.locale}
						onChange={(e) =>
							setPrefs((p) => ({ ...p, locale: e.target.value as Locale }))
						}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='Locale'
					>
						{(Object.keys(LOCALE_LABELS) as Locale[]).map((loc) => (
							<option key={loc} value={loc}>
								{LOCALE_LABELS[loc]}
							</option>
						))}
					</select>
					<input
						type='number'
						min={0}
						value={prefs.seed}
						onChange={(e) => setPrefs((p) => ({ ...p, seed: e.target.value }))}
						placeholder='Seed'
						className='h-8 w-20 rounded-md border border-border bg-zinc-700 px-2 text-center text-xs text-zinc-200 placeholder:text-muted-foreground'
						aria-label='Seed'
					/>
					<CopyButton text={output} label='Copy' />
					<CopyButton
						text={fetchMockSnippet}
						label='Fetch Mock'
						aria-label='Copy as fetch mock'
					/>
					<CopyButton
						text={mswHandlerSnippet}
						label='MSW'
						aria-label='Copy as MSW handler'
					/>
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
				</ToolPageHeader>

				<div className='flex flex-1 overflow-hidden'>
					{/* Input panel */}
					<div className='flex w-1/2 flex-col border-r border-border'>
						{/* Mode tabs */}
						<div className='flex items-center border-b border-border'>
							{(["schema", "example", "description"] as InputMode[]).map(
								(mode) => (
									<button
										key={mode}
										onClick={() => setPrefs((p) => ({ ...p, inputMode: mode }))}
										className={cn(
											"px-3 py-1.5 text-[11px] font-medium transition-colors",
											prefs.inputMode === mode
												? "border-b-2 border-accent text-accent"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										{MODE_LABELS[mode]}
									</button>
								),
							)}
							<span className='ml-auto pr-3 text-[10px] text-muted-foreground'>
								{currentInput.length.toLocaleString()} chars
							</span>
						</div>
						<div className='flex-1'>
							<MonacoWrapper
								value={currentInput}
								onChange={setCurrentInput}
								language={MODE_LANGUAGES[prefs.inputMode]}
								height='100%'
								placeholder={PLACEHOLDER[prefs.inputMode]}
								aria-label={`${MODE_LABELS[prefs.inputMode]} input`}
							/>
						</div>
						{error && (
							<div className='p-2'>
								<ErrorBox error={error} />
							</div>
						)}
					</div>

					{/* Output panel */}
					<div className='flex w-1/2 flex-col'>
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<span className='text-[10px] text-muted-foreground'>Output</span>
							<span className='text-[10px] text-muted-foreground'>
								{output
									? `${prefs.outputFormat.toUpperCase()} · ${output.length.toLocaleString()} chars`
									: ""}
							</span>
						</div>
						<div className='flex-1 overflow-hidden'>
							{output ? (
								<div className='flex h-full flex-col'>
									{/* Per-row regenerate buttons for JSON array output */}
									{parsedOutputArray && parsedOutputArray.length > 0 && (
										<div
											className='flex flex-wrap gap-1 border-b border-border px-2 py-1'
											aria-label='Regenerate individual rows'
										>
											<span className='mr-1 self-center text-[10px] text-muted-foreground'>
												Rows:
											</span>
											{parsedOutputArray.map((_, i) => (
												<button
													key={i}
													onClick={() => handleRegenerateRow(i)}
													disabled={regeneratingRow !== null}
													className='inline-flex h-6 items-center gap-0.5 rounded bg-zinc-700 px-1.5 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-zinc-600'
													title={`Regenerate row ${i}`}
													aria-label={`Regenerate row ${i}`}
												>
													<RefreshCw className='h-2.5 w-2.5' />
													{i}
												</button>
											))}
										</div>
									)}
									<div className='flex-1'>
										<MonacoWrapper
											value={output}
											language={
												prefs.outputFormat === "csv" ? "plaintext" : "json"
											}
											readOnly
											height='100%'
											aria-label='Generated output'
										/>
									</div>
								</div>
							) : (
								<div className='flex h-full flex-col items-center justify-center p-8 text-center'>
									<Server className='mb-3 h-8 w-8 text-muted' />
									<p className='text-xs text-muted-foreground'>
										Provide a schema, example, or description and click{" "}
										<strong>Generate</strong>.
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
