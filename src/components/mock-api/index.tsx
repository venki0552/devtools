import { useState, useCallback, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import {
	Server,
	Loader2,
	Key,
	ShieldCheck,
	X,
	RefreshCw,
	AlertTriangle,
} from "lucide-react";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";

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

const LOCALE_DESCRIPTIONS: Record<Locale, string> = {
	US: "Use American English names, US addresses (street, city, state, ZIP), US phone formats (+1 XXX-XXX-XXXX), USD currency, MM/DD/YYYY dates.",
	UK: "Use British English names, UK addresses (street, city, county, postcode), UK phone formats (+44 XXXX XXXXXX), GBP currency, DD/MM/YYYY dates.",
	DE: "Use German names, German addresses (Straße, PLZ, Stadt), German phone formats (+49 XXXX XXXXXXX), EUR currency, DD.MM.YYYY dates.",
	FR: "Use French names, French addresses (rue, code postal, ville), French phone formats (+33 X XX XX XX XX), EUR currency, DD/MM/YYYY dates.",
	JP: "Use Japanese names (family name first), Japanese addresses (prefecture, city, ward), Japanese phone formats (+81 XX-XXXX-XXXX), JPY currency, YYYY/MM/DD dates.",
	IN: "Use Indian names, Indian addresses (street, city, state, PIN code), Indian phone formats (+91 XXXXX XXXXX), INR currency, DD/MM/YYYY dates.",
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

/** Attempt to resolve local $ref references in a JSON Schema object */
function resolveLocalRefs(schema: string): string {
	try {
		const obj = JSON.parse(schema);
		if (typeof obj !== "object" || obj === null) return schema;
		const definitions =
			obj.definitions || obj.$defs || obj.components?.schemas || {};
		if (Object.keys(definitions).length === 0) return schema;

		const resolved = JSON.parse(JSON.stringify(obj));

		function walk(node: unknown): unknown {
			if (typeof node !== "object" || node === null) return node;
			if (Array.isArray(node)) return node.map(walk);

			const record = node as Record<string, unknown>;
			if (typeof record.$ref === "string") {
				const refPath = record.$ref as string;
				// Handle #/definitions/X, #/$defs/X, #/components/schemas/X
				const match = refPath.match(
					/^#\/(?:definitions|\$defs|components\/schemas)\/(.+)$/,
				);
				if (match && definitions[match[1]]) {
					return walk(JSON.parse(JSON.stringify(definitions[match[1]])));
				}
			}

			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(record)) {
				result[k] = walk(v);
			}
			return result;
		}

		const walkedResult = walk(resolved);
		return JSON.stringify(walkedResult, null, 2);
	} catch {
		return schema;
	}
}

function buildSystemPrompt(
	mode: InputMode,
	count: number,
	outputFormat: OutputFormat,
	locale: Locale,
	seed: string,
): string {
	const formatInstruction =
		outputFormat === "csv"
			? `Return exactly ${count} records as CSV. First line is the header row with column names. Each subsequent line is one record. Use commas as delimiters. Quote fields that contain commas.`
			: outputFormat === "ndjson"
				? `Return exactly ${count} JSON objects, one per line (NDJSON format). No array wrapper. Each line must be valid JSON.`
				: `Return a JSON array containing exactly ${count} objects. Output ONLY the JSON array, no other text.`;

	const modeInstruction: Record<InputMode, string> = {
		schema: `The user will provide a JSON Schema. Generate ${count} realistic mock records conforming to this schema.`,
		example: `The user will provide an example JSON object. Generate ${count} realistic mock records with the same structure but varied, realistic data.`,
		description: `The user will describe the data they want in plain English. Generate ${count} realistic mock records matching that description as a JSON structure.`,
	};

	const localeInstruction = `Locale: ${locale}. ${LOCALE_DESCRIPTIONS[locale]}`;
	const seedInstruction = seed
		? `Use seed "${seed}" as a consistency hint — try to produce the same output if given the same seed and input.`
		: "";

	return `You are a mock data generator. ${modeInstruction[mode]}

${formatInstruction}

${localeInstruction}
${seedInstruction}

Rules:
- Generate realistic, varied data (real-looking names, emails, addresses, etc.)
- Use diverse values — avoid repeating the same data across records
- String fields should have realistic content appropriate to the field name
- Number fields should be in reasonable ranges
- Date fields should use ISO 8601 format
- IDs should be unique across records
- All generated data MUST match the specified locale for names, addresses, phone numbers, currency, and date formats
- Return ONLY the data. No markdown, no code fences, no explanations.`;
}

async function generateMockData(
	input: string,
	mode: InputMode,
	count: number,
	outputFormat: OutputFormat,
	apiKey: string,
	locale: Locale,
	seed: string,
): Promise<string> {
	// Resolve $ref for schema mode before sending to AI
	const processedInput = mode === "schema" ? resolveLocalRefs(input) : input;

	const systemPrompt = buildSystemPrompt(
		mode,
		count,
		outputFormat,
		locale,
		seed,
	);

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
			max_tokens: 4096,
			system: systemPrompt,
			messages: [{ role: "user", content: processedInput }],
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		if (response.status === 401)
			throw new Error("Invalid API key. Please check your Anthropic API key.");
		if (response.status === 429)
			throw new Error("Rate limited. Please wait a moment and try again.");
		throw new Error(`API error (${response.status}): ${body}`);
	}

	const data = await response.json();
	const text = data.content?.[0]?.text;
	if (!text) throw new Error("Empty response from API");

	// Validate the output is parseable
	if (outputFormat === "json") {
		try {
			const parsed = JSON.parse(text);
			return JSON.stringify(parsed, null, 2);
		} catch {
			// Try stripping markdown code fences if the model wrapped it
			const stripped = text
				.replace(/^```(?:json)?\n?/m, "")
				.replace(/\n?```$/m, "")
				.trim();
			try {
				const parsed = JSON.parse(stripped);
				return JSON.stringify(parsed, null, 2);
			} catch {
				return text;
			}
		}
	}

	return text;
}

async function regenerateSingleRow(
	input: string,
	mode: InputMode,
	rowIndex: number,
	existingRow: unknown,
	apiKey: string,
	locale: Locale,
): Promise<unknown> {
	const processedInput = mode === "schema" ? resolveLocalRefs(input) : input;

	const systemPrompt = `You are a mock data generator. Generate exactly 1 replacement record.

The user will provide:
1. The schema/example/description for the data structure
2. The existing record at index ${rowIndex} that needs to be regenerated

Generate ONE new record with the same structure but different, realistic data. Locale: ${locale}. ${LOCALE_DESCRIPTIONS[locale]}

Return ONLY a single JSON object. No array wrapper, no markdown, no code fences, no explanations.`;

	const userContent = `Data definition (${mode}):\n${processedInput}\n\nExisting record to replace:\n${JSON.stringify(existingRow)}`;

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
			max_tokens: 1024,
			system: systemPrompt,
			messages: [{ role: "user", content: userContent }],
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`API error (${response.status}): ${body}`);
	}

	const data = await response.json();
	const text = data.content?.[0]?.text;
	if (!text) throw new Error("Empty response from API");

	const stripped = text
		.replace(/^```(?:json)?\n?/m, "")
		.replace(/\n?```$/m, "")
		.trim();
	return JSON.parse(stripped);
}

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

// -- API Key Modal --
function ApiKeyModal({
	onSave,
	onClose,
}: {
	onSave: (key: string) => void;
	onClose?: () => void;
}) {
	const [keyInput, setKeyInput] = useState("");

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
			<div className='w-full max-w-md rounded-lg border border-border bg-zinc-900 p-6 shadow-xl'>
				<div className='mb-4 flex items-center gap-2'>
					<Key className='h-5 w-5 text-accent' />
					<h3 className='text-sm font-semibold'>Anthropic API Key Required</h3>
					{onClose && (
						<button
							onClick={onClose}
							className='ml-auto text-muted hover:text-foreground'
							aria-label='Close'
						>
							<X className='h-4 w-4' />
						</button>
					)}
				</div>
				<p className='mb-3 text-xs text-muted-foreground'>
					Enter your Anthropic API key to use AI-powered data generation. You
					can get one from{" "}
					<a
						href='https://console.anthropic.com/'
						target='_blank'
						rel='noopener noreferrer'
						className='text-accent underline'
					>
						console.anthropic.com
					</a>
				</p>
				<div className='mb-3 flex items-start gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2'>
					<ShieldCheck className='mt-0.5 h-3.5 w-3.5 shrink-0 text-info' />
					<span className='text-[11px] text-info'>
						Your API key is stored locally and sent directly to Anthropic's API.
						It never touches any other server.
					</span>
				</div>
				<input
					type='password'
					value={keyInput}
					onChange={(e) => setKeyInput(e.target.value)}
					placeholder='sk-ant-...'
					className='mb-3 h-9 w-full rounded-md border border-border bg-zinc-800 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none'
					autoFocus
				/>
				<button
					onClick={() => {
						if (keyInput.trim()) onSave(keyInput.trim());
					}}
					disabled={!keyInput.trim()}
					className='h-8 w-full rounded-md bg-accent px-3 text-xs font-medium text-zinc-950 hover:bg-accent/80 disabled:opacity-50'
				>
					Save API Key
				</button>
			</div>
		</div>
	);
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
	const [apiKey, setApiKey] = useLocalStorage("devtools-anthropic-key", "");
	const [showKeyModal, setShowKeyModal] = useState(false);
	const [loading, setLoading] = useState(false);
	const [regeneratingRow, setRegeneratingRow] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [output, setOutput] = useState("");

	const currentInput = inputs[prefs.inputMode] ?? "";

	const setCurrentInput = useCallback(
		(value: string) => {
			setInputs((prev) => ({ ...prev, [prefs.inputMode]: value }));
		},
		[setInputs, prefs.inputMode],
	);

	const handleGenerate = useCallback(async () => {
		if (!apiKey) {
			setShowKeyModal(true);
			return;
		}
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

		setLoading(true);
		setError(null);
		setOutput("");
		try {
			const data = await generateMockData(
				trimmed,
				prefs.inputMode,
				prefs.recordCount,
				prefs.outputFormat,
				apiKey,
				prefs.locale,
				prefs.seed,
			);
			setOutput(data);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Generation failed");
		} finally {
			setLoading(false);
		}
	}, [currentInput, prefs, apiKey]);

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
		async (rowIndex: number) => {
			if (!apiKey || !parsedOutputArray || !parsedOutputArray[rowIndex]) return;
			setRegeneratingRow(rowIndex);
			setError(null);
			try {
				const newRow = await regenerateSingleRow(
					currentInput.trim(),
					prefs.inputMode,
					rowIndex,
					parsedOutputArray[rowIndex],
					apiKey,
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
		[apiKey, parsedOutputArray, currentInput, prefs.inputMode, prefs.locale],
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
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>

			{(showKeyModal || !apiKey) && (
				<ApiKeyModal
					onSave={(key) => {
						setApiKey(key);
						setShowKeyModal(false);
					}}
					onClose={apiKey ? () => setShowKeyModal(false) : undefined}
				/>
			)}

			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<button
						onClick={handleGenerate}
						disabled={loading || !currentInput.trim()}
						className='h-8 rounded-md bg-accent px-3 text-xs font-medium text-zinc-950 hover:bg-accent/80 disabled:opacity-50'
					>
						{loading ? (
							<span className='flex items-center gap-1.5'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
								Generating…
							</span>
						) : (
							"Generate"
						)}
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
					{prefs.recordCount > 50 && (
						<div
							className='flex items-center gap-1 rounded-md border border-yellow-600/40 bg-yellow-600/10 px-2 py-1'
							role='alert'
							aria-label='Token usage warning'
						>
							<AlertTriangle className='h-3 w-3 text-yellow-500' />
							<span className='text-[10px] text-yellow-400'>
								High token usage
							</span>
						</div>
					)}
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
					<button
						onClick={() => setShowKeyModal(true)}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
						title='Change API key'
					>
						<Key className='h-3.5 w-3.5' />
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
							{loading ? (
								<div className='flex h-full flex-col items-center justify-center gap-3'>
									<Loader2 className='h-6 w-6 animate-spin text-accent' />
									<p className='text-xs text-muted-foreground'>
										Generating {prefs.recordCount} records…
									</p>
								</div>
							) : output ? (
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
													disabled={regeneratingRow !== null || loading}
													className={cn(
														"inline-flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] font-medium transition-colors",
														regeneratingRow === i
															? "bg-accent/20 text-accent"
															: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600",
													)}
													title={`Regenerate row ${i}`}
													aria-label={`Regenerate row ${i}`}
												>
													{regeneratingRow === i ? (
														<Loader2 className='h-2.5 w-2.5 animate-spin' />
													) : (
														<RefreshCw className='h-2.5 w-2.5' />
													)}
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
