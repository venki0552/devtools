import { useState, useCallback, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { format } from "sql-formatter";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn, formatBytes } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { StatsBar } from "@/components/shared/StatsBar";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";

type Dialect =
	| "sql"
	| "postgresql"
	| "mysql"
	| "sqlite"
	| "bigquery"
	| "transactsql";
type KeywordCase = "upper" | "lower" | "preserve" | "capitalize";
type IndentSize = 2 | 4 | "tab";

interface SqlFormatterPrefs {
	dialect: Dialect;
	keywordCase: KeywordCase;
	indent: IndentSize;
	linesBetweenClauses: boolean;
}

const tool = TOOLS.find((t) => t.id === "sql-formatter")!;

const SQL_CLAUSE_KEYWORDS = [
	"SELECT",
	"FROM",
	"WHERE",
	"GROUP BY",
	"HAVING",
	"ORDER BY",
	"LIMIT",
	"INSERT",
	"UPDATE",
	"DELETE",
	"SET",
	"VALUES",
	"JOIN",
	"LEFT JOIN",
	"RIGHT JOIN",
	"INNER JOIN",
	"OUTER JOIN",
	"CROSS JOIN",
	"FULL JOIN",
	"UNION",
	"UNION ALL",
	"INTERSECT",
	"EXCEPT",
];

const CAPITALIZE_KEYWORDS = [
	...SQL_CLAUSE_KEYWORDS,
	"AS",
	"ON",
	"AND",
	"OR",
	"NOT",
	"IN",
	"EXISTS",
	"BETWEEN",
	"LIKE",
	"IS",
	"NULL",
	"TRUE",
	"FALSE",
	"CASE",
	"WHEN",
	"THEN",
	"ELSE",
	"END",
	"ASC",
	"DESC",
	"DISTINCT",
	"ALL",
	"ANY",
	"INTO",
	"CREATE",
	"TABLE",
	"ALTER",
	"DROP",
	"INDEX",
	"VIEW",
	"WITH",
	"RECURSIVE",
	"RETURNING",
	"FETCH",
	"OFFSET",
	"FOR",
	"NATURAL",
	"USING",
	"PARTITION BY",
	"OVER",
	"WINDOW",
	"ROWS",
	"RANGE",
	"PRECEDING",
	"FOLLOWING",
	"CURRENT ROW",
	"UNBOUNDED",
	"NULLS FIRST",
	"NULLS LAST",
];

function capitalizeKeywords(sql: string): string {
	// Sort keywords longest-first to avoid partial replacements
	const sorted = [...CAPITALIZE_KEYWORDS].sort((a, b) => b.length - a.length);
	let result = sql;
	for (const kw of sorted) {
		const pattern = new RegExp(`\\b${kw.replace(/ /g, "\\s+")}\\b`, "gi");
		result = result.replace(pattern, (match) => {
			// Preserve original whitespace between multi-word keywords
			const words = match.split(/\s+/);
			return words
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
				.join(" ");
		});
	}
	return result;
}

function addLinesBetweenClauses(sql: string): string {
	const clausePattern = SQL_CLAUSE_KEYWORDS.sort((a, b) => b.length - a.length)
		.map((kw) => kw.replace(/ /g, "\\s+"))
		.join("|");
	const regex = new RegExp(`(?<=\\n)(${clausePattern})\\b`, "gi");
	return sql.replace(regex, (match) => `\n${match}`);
}

function formatSql(input: string, prefs: SqlFormatterPrefs): string {
	const libCase =
		prefs.keywordCase === "capitalize" ? "upper" : prefs.keywordCase;
	let result = format(input, {
		language: prefs.dialect,
		keywordCase: libCase,
		tabWidth: prefs.indent === "tab" ? 4 : prefs.indent,
		useTabs: prefs.indent === "tab",
	});
	if (prefs.keywordCase === "capitalize") {
		result = capitalizeKeywords(result);
	}
	if (prefs.linesBetweenClauses) {
		result = addLinesBetweenClauses(result);
	}
	return result;
}

function minifySql(input: string): string {
	return input
		.replace(/--[^\n]*/g, "")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function SqlFormatterTool() {
	const [input, setInput] = useLocalStorage("devtools-sql-formatter-input", "");
	const [prefs, setPrefs] = useLocalStorage<SqlFormatterPrefs>(
		"devtools-sql-formatter-prefs",
		{
			dialect: "sql",
			keywordCase: "upper",
			indent: 2,
			linesBetweenClauses: false,
		},
	);
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [processingTime, setProcessingTime] = useState<number | undefined>();
	const debouncedInput = useDebounce(input, 300);

	const processInput = useCallback(
		(text: string) => {
			if (!text.trim()) {
				setOutput("");
				setError(null);
				setProcessingTime(undefined);
				return;
			}
			const start = performance.now();
			try {
				const formatted = formatSql(text, prefs);
				setOutput(formatted);
				setError(null);
			} catch (e) {
				setOutput("");
				setError(e instanceof Error ? e.message : "Failed to format SQL");
			}
			setProcessingTime(performance.now() - start);
		},
		[prefs],
	);

	useEffect(() => {
		processInput(debouncedInput);
	}, [debouncedInput, processInput]);

	const handleFormat = useCallback(() => {
		if (!input.trim()) return;
		const start = performance.now();
		try {
			setOutput(formatSql(input, prefs));
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to format SQL");
		}
		setProcessingTime(performance.now() - start);
	}, [input, prefs]);

	const handleMinify = useCallback(() => {
		if (!input.trim()) return;
		const start = performance.now();
		setOutput(minifySql(input));
		setError(null);
		setProcessingTime(performance.now() - start);
	}, [input]);

	const handleClear = useCallback(() => {
		setInput("");
		setOutput("");
		setError(null);
		setProcessingTime(undefined);
	}, [setInput]);

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
					<button
						onClick={handleFormat}
						className='h-8 rounded-md bg-accent px-3 text-xs font-medium text-zinc-950 hover:bg-accent/80'
					>
						Format
					</button>
					<button
						onClick={handleMinify}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Minify
					</button>
					<select
						value={prefs.dialect}
						onChange={(e) =>
							setPrefs((p) => ({ ...p, dialect: e.target.value as Dialect }))
						}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='SQL dialect'
					>
						<option value='sql'>Standard SQL</option>
						<option value='postgresql'>PostgreSQL</option>
						<option value='mysql'>MySQL</option>
						<option value='sqlite'>SQLite</option>
						<option value='bigquery'>BigQuery</option>
						<option value='transactsql'>T-SQL</option>
					</select>
					<select
						value={prefs.keywordCase}
						onChange={(e) =>
							setPrefs((p) => ({
								...p,
								keywordCase: e.target.value as KeywordCase,
							}))
						}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='Keyword case'
					>
						<option value='upper'>UPPER</option>
						<option value='lower'>lower</option>
						<option value='capitalize'>Capitalize</option>
						<option value='preserve'>Preserve</option>
					</select>
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
					<button
						onClick={() =>
							setPrefs((p) => ({
								...p,
								linesBetweenClauses: !p.linesBetweenClauses,
							}))
						}
						className={cn(
							"h-8 rounded-md px-3 text-xs font-medium",
							prefs.linesBetweenClauses
								? "bg-accent text-zinc-950"
								: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
						)}
						aria-label='Line between clauses'
						aria-pressed={prefs.linesBetweenClauses}
					>
						Clause Lines
					</button>
					<CopyButton text={output} label='Copy' />
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
				</ToolPageHeader>

				<div className='flex flex-1 overflow-hidden'>
					<div className='flex flex-1 flex-col border-r border-border'>
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<span className='text-[10px] text-muted-foreground'>Input</span>
							<span className='text-[10px] text-muted-foreground'>
								{input.length.toLocaleString()} chars
							</span>
						</div>
						<div className='flex-1'>
							<MonacoWrapper
								value={input}
								onChange={(v) => setInput(v ?? "")}
								language='sql'
								height='100%'
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
							<span className='text-[10px] text-muted-foreground'>Output</span>
							<span className='text-[10px] text-muted-foreground'>
								{formatBytes(outputBytes)}
							</span>
						</div>
						<div className='flex-1'>
							<MonacoWrapper
								value={output}
								language='sql'
								readOnly
								height='100%'
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
			</div>
		</>
	);
}
