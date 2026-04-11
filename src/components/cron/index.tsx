import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";

const tool = TOOLS.find((t) => t.id === "cron")!;

// ─── Types ──────────────────────────────────────────────────────────────────────
type CronFormat = "standard" | "quartz" | "aws";

interface FormatConfig {
	fieldCount: number;
	labels: string[];
	defaults: string;
	description: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────
const FORMAT_CONFIGS: Record<CronFormat, FormatConfig> = {
	standard: {
		fieldCount: 5,
		labels: ["Minute", "Hour", "Day of Month", "Month", "Day of Week"],
		defaults: "* * * * *",
		description: "Standard (5-field)",
	},
	quartz: {
		fieldCount: 6,
		labels: [
			"Second",
			"Minute",
			"Hour",
			"Day of Month",
			"Month",
			"Day of Week",
		],
		defaults: "0 * * * * *",
		description: "Quartz (6-field)",
	},
	aws: {
		fieldCount: 6,
		labels: ["Minute", "Hour", "Day of Month", "Month", "Day of Week", "Year"],
		defaults: "* * * * ? *",
		description: "AWS EventBridge",
	},
};

const FIELD_LABELS = ["Minute", "Hour", "Day of Month", "Month", "Day of Week"];

const PRESETS: { name: string; expression: string }[] = [
	{ name: "Every minute", expression: "* * * * *" },
	{ name: "Every 5 minutes", expression: "*/5 * * * *" },
	{ name: "Every 15 minutes", expression: "*/15 * * * *" },
	{ name: "Every hour", expression: "0 * * * *" },
	{ name: "Every 6 hours", expression: "0 */6 * * *" },
	{ name: "Daily at midnight", expression: "0 0 * * *" },
	{ name: "Daily at noon", expression: "0 12 * * *" },
	{ name: "Weekly Monday 9AM", expression: "0 9 * * 1" },
	{ name: "Monthly 1st at midnight", expression: "0 0 1 * *" },
	{ name: "Weekdays at 9AM", expression: "0 9 * * 1-5" },
];

const FIELD_QUICK_OPTIONS: { label: string; value: string }[][] = [
	// Minute
	[
		{ label: "Every min", value: "*" },
		{ label: "Every 5", value: "*/5" },
		{ label: "Every 10", value: "*/10" },
		{ label: "Every 15", value: "*/15" },
		{ label: "Every 30", value: "*/30" },
		{ label: ":00", value: "0" },
	],
	// Hour
	[
		{ label: "Every hr", value: "*" },
		{ label: "Every 2", value: "*/2" },
		{ label: "Every 6", value: "*/6" },
		{ label: "Every 12", value: "*/12" },
		{ label: "Midnight", value: "0" },
		{ label: "Noon", value: "12" },
	],
	// Day of Month
	[
		{ label: "Every day", value: "*" },
		{ label: "1st", value: "1" },
		{ label: "15th", value: "15" },
		{ label: "1st & 15th", value: "1,15" },
		{ label: "Last", value: "28" },
	],
	// Month
	[
		{ label: "Every month", value: "*" },
		{ label: "Jan", value: "1" },
		{ label: "Q1", value: "1,4,7,10" },
		{ label: "Every 3", value: "*/3" },
		{ label: "Every 6", value: "*/6" },
	],
	// Day of Week
	[
		{ label: "Every day", value: "*" },
		{ label: "Weekdays", value: "1-5" },
		{ label: "Weekend", value: "0,6" },
		{ label: "Mon", value: "1" },
		{ label: "Mon-Wed-Fri", value: "1,3,5" },
	],
];

const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// ─── Timezone helpers ───────────────────────────────────────────────────────────
function getTimezones(): string[] {
	try {
		return Intl.supportedValuesOf("timeZone");
	} catch {
		return [
			"UTC",
			"America/New_York",
			"America/Chicago",
			"America/Denver",
			"America/Los_Angeles",
			"America/Toronto",
			"America/Sao_Paulo",
			"Europe/London",
			"Europe/Paris",
			"Europe/Berlin",
			"Europe/Moscow",
			"Asia/Tokyo",
			"Asia/Shanghai",
			"Asia/Kolkata",
			"Asia/Dubai",
			"Australia/Sydney",
			"Pacific/Auckland",
		];
	}
}

const ALL_TIMEZONES = getTimezones();

// ─── Expression helpers ─────────────────────────────────────────────────────────
function normalizeForParser(expression: string, format: CronFormat): string {
	const parts = expression.trim().split(/\s+/);
	if (format === "quartz" && parts.length === 6) {
		return parts.slice(1).join(" ");
	}
	if (format === "aws" && parts.length === 6) {
		return parts
			.slice(0, 5)
			.map((p) => (p === "?" ? "*" : p))
			.join(" ");
	}
	return parts.map((p) => (p === "?" ? "*" : p)).join(" ");
}

function convertExpression(
	expr: string,
	from: CronFormat,
	to: CronFormat,
): string {
	if (from === to) return expr;
	const parts = expr.trim().split(/\s+/);
	if (from === "standard" && to === "quartz") return "0 " + parts.join(" ");
	if (from === "standard" && to === "aws") return parts.join(" ") + " *";
	if (from === "quartz" && to === "standard") return parts.slice(1).join(" ");
	if (from === "aws" && to === "standard")
		return parts
			.slice(0, 5)
			.map((p) => (p === "?" ? "*" : p))
			.join(" ");
	return FORMAT_CONFIGS[to].defaults;
}

// ─── Core functions ─────────────────────────────────────────────────────────────
function getNextRuns(
	expression: string,
	count: number,
	tz?: string,
	format: CronFormat = "standard",
): Date[] {
	try {
		const normalized = normalizeForParser(expression, format);
		const options: Record<string, unknown> = {};
		if (tz) options.tz = tz;
		const interval = CronExpressionParser.parse(normalized, options);
		const dates: Date[] = [];
		for (let i = 0; i < count; i++) {
			dates.push(interval.next().toDate());
		}
		return dates;
	} catch {
		return [];
	}
}

function getPreviousRun(
	expression: string,
	tz?: string,
	format: CronFormat = "standard",
): Date | null {
	try {
		const normalized = normalizeForParser(expression, format);
		const options: Record<string, unknown> = {};
		if (tz) options.tz = tz;
		const interval = CronExpressionParser.parse(normalized, options);
		return interval.prev().toDate();
	} catch {
		return null;
	}
}

function getHumanReadable(
	expression: string,
	format: CronFormat = "standard",
): string | null {
	try {
		if (format === "aws") {
			const parts = expression.trim().split(/\s+/);
			const normalized = parts
				.slice(0, 5)
				.map((p) => (p === "?" ? "*" : p))
				.join(" ");
			return cronstrue.toString(normalized, { use24HourTimeFormat: true });
		}
		const normalized = expression
			.trim()
			.split(/\s+/)
			.map((p) => (p === "?" ? "*" : p))
			.join(" ");
		return cronstrue.toString(normalized, { use24HourTimeFormat: true });
	} catch {
		return null;
	}
}

function validateCron(
	expression: string,
	format: CronFormat = "standard",
): string | null {
	const trimmed = expression.trim();
	if (!trimmed) return null;

	const parts = trimmed.split(/\s+/);
	const expected = FORMAT_CONFIGS[format].fieldCount;

	if (parts.length < expected)
		return `Expected ${expected} fields, got ${parts.length}`;
	if (parts.length > expected) {
		if (format === "standard") {
			return `Standard cron has 5 fields. Got ${parts.length} (6-field expressions not supported)`;
		}
		return `Expected ${expected} fields for ${FORMAT_CONFIGS[format].description}, got ${parts.length}`;
	}

	try {
		const normalized = normalizeForParser(trimmed, format);
		CronExpressionParser.parse(normalized);
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

// ─── Field value parsing ────────────────────────────────────────────────────────
function parseSelectedValues(
	fieldValue: string,
	min: number,
	max: number,
): Set<number> {
	const selected = new Set<number>();
	if (fieldValue === "*" || fieldValue === "?") return selected;

	for (const seg of fieldValue.split(",")) {
		const t = seg.trim();
		if (t === "L" || t === "?") continue;
		if (t.includes("/")) {
			const [rangePart, stepStr] = t.split("/");
			const step = parseInt(stepStr, 10);
			if (isNaN(step) || step <= 0) continue;
			let start = min;
			let end = max;
			if (rangePart !== "*") {
				if (rangePart.includes("-")) {
					const [s, e] = rangePart.split("-").map(Number);
					start = s;
					end = e;
				} else {
					start = parseInt(rangePart, 10);
				}
			}
			for (let i = start; i <= end; i += step) selected.add(i);
		} else if (t.includes("-")) {
			const [s, e] = t.split("-").map(Number);
			for (let i = s; i <= e; i++) selected.add(i);
		} else {
			const n = parseInt(t, 10);
			if (!isNaN(n)) selected.add(n);
		}
	}
	return selected;
}

function selectedToFieldValue(
	selected: Set<number>,
	hasLast: boolean = false,
): string {
	const nums = [...selected].filter((n) => n >= 0).sort((a, b) => a - b);
	const parts: string[] = [];
	if (nums.length > 0) parts.push(nums.join(","));
	if (hasLast) parts.push("L");
	return parts.join(",") || "*";
}

// ─── Statistics ─────────────────────────────────────────────────────────────────
interface RunStats {
	perHour: number;
	perDay: number;
	perWeek: number;
	perMonth: number;
	perYear: number;
	lastRun: Date | null;
	timeSinceLastRun: string | null;
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h ago`;
}

function computeRunStatistics(
	expression: string,
	tz?: string,
	format: CronFormat = "standard",
): RunStats | null {
	try {
		const normalized = normalizeForParser(expression, format);
		const options: Record<string, unknown> = {};
		if (tz) options.tz = tz;
		const interval = CronExpressionParser.parse(normalized, options);
		const runs: Date[] = [];
		for (let i = 0; i < 100; i++) {
			runs.push(interval.next().toDate());
		}
		if (runs.length < 2) return null;

		const totalMs = runs[runs.length - 1].getTime() - runs[0].getTime();
		const avgMs = totalMs / (runs.length - 1);
		const rate = (periodMs: number) =>
			avgMs > 0 ? Math.round((periodMs / avgMs) * 10) / 10 : 0;

		const lastRun = getPreviousRun(expression, tz, format);
		let timeSinceLastRun: string | null = null;
		if (lastRun) {
			timeSinceLastRun = formatDuration(Date.now() - lastRun.getTime());
		}

		return {
			perHour: rate(3_600_000),
			perDay: rate(86_400_000),
			perWeek: rate(604_800_000),
			perMonth: rate(2_592_000_000),
			perYear: rate(31_536_000_000),
			lastRun,
			timeSinceLastRun,
		};
	} catch {
		return null;
	}
}

// ─── Date warnings ──────────────────────────────────────────────────────────────
function getDateWarnings(fields: string[], format: CronFormat): string[] {
	const warnings: string[] = [];
	const labels = FORMAT_CONFIGS[format].labels;
	const domIdx = labels.indexOf("Day of Month");
	const monthIdx = labels.indexOf("Month");
	const dowIdx = labels.indexOf("Day of Week");
	if (domIdx < 0 || monthIdx < 0) return warnings;

	const dom = fields[domIdx] || "*";
	const month = fields[monthIdx] || "*";
	const dow = dowIdx >= 0 ? fields[dowIdx] || "*" : "*";
	const monthIsAny = month === "*" || month === "?";
	const monthVals = parseSelectedValues(month, 1, 12);
	const hasFeb = monthIsAny || monthVals.has(2) || month.includes("2");

	if (
		(dom.includes("31") || parseSelectedValues(dom, 1, 31).has(31)) &&
		hasFeb
	) {
		warnings.push("\u26A0 Day 31 in February will never match");
	}
	if (
		(dom.includes("30") || parseSelectedValues(dom, 1, 31).has(30)) &&
		hasFeb
	) {
		warnings.push("\u26A0 Day 30 in February will never match");
	}
	if (
		(dom.includes("29") || parseSelectedValues(dom, 1, 31).has(29)) &&
		hasFeb
	) {
		warnings.push("\u26A0 Day 29 in February only matches in leap years");
	}
	if (dom !== "*" && dom !== "?" && dow !== "*" && dow !== "?") {
		warnings.push(
			"\u2139 Both day-of-month and day-of-week are set \u2014 standard cron uses OR behavior (matches if either condition is true)",
		);
	}
	return warnings;
}

// ─── Sub-components ─────────────────────────────────────────────────────────────
function NumberGrid({
	min,
	max,
	cols,
	selected,
	onToggle,
	labels,
}: {
	min: number;
	max: number;
	cols: number;
	selected: Set<number>;
	onToggle: (n: number) => void;
	labels?: Record<number, string>;
}) {
	const cells = [];
	for (let i = min; i <= max; i++) {
		cells.push(
			<button
				key={i}
				type='button'
				onClick={() => onToggle(i)}
				className={cn(
					"flex items-center justify-center rounded text-[10px] font-mono h-7 transition-colors",
					selected.has(i)
						? "bg-accent text-accent-foreground"
						: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
				)}
			>
				{labels?.[i] ?? i}
			</button>,
		);
	}
	return (
		<div
			className='grid gap-0.5'
			style={{
				gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
			}}
		>
			{cells}
		</div>
	);
}

function FieldGridEditor({
	fieldValue,
	onChange,
	label,
}: {
	fieldValue: string;
	onChange: (value: string) => void;
	label: string;
}) {
	let min = 0;
	let max = 59;
	let cols = 10;
	let cellLabels: Record<number, string> | undefined;
	let showLastDay = false;

	if (label === "Second" || label === "Minute") {
		min = 0;
		max = 59;
		cols = 10;
	} else if (label === "Hour") {
		min = 0;
		max = 23;
		cols = 6;
	} else if (label === "Day of Month") {
		min = 1;
		max = 31;
		cols = 7;
		showLastDay = true;
	} else if (label === "Month") {
		min = 1;
		max = 12;
		cols = 6;
		cellLabels = {};
		MONTH_NAMES.forEach((name, i) => {
			cellLabels![i + 1] = name;
		});
	} else if (label === "Day of Week") {
		min = 0;
		max = 6;
		cols = 7;
		cellLabels = {};
		DAY_NAMES.forEach((name, i) => {
			cellLabels![i] = name;
		});
	} else if (label === "Year") {
		return (
			<div className='space-y-2'>
				<div className='text-[10px] font-semibold text-muted-foreground'>
					Year
				</div>
				<input
					type='text'
					value={fieldValue}
					onChange={(e) => onChange(e.target.value)}
					placeholder='* or 2024 or 2024-2030'
					className='w-full rounded border border-border bg-zinc-800 px-2 py-1 font-mono text-xs text-foreground'
					aria-label='Year field'
				/>
			</div>
		);
	}

	const isEvery = fieldValue === "*";
	const isQuestion = fieldValue === "?";
	const isInterval = fieldValue.startsWith("*/");
	const hasLast = fieldValue === "L" || fieldValue.includes(",L");

	const selected = useMemo(
		() => parseSelectedValues(fieldValue, min, max),
		[fieldValue, min, max],
	);

	const [intervalStep, setIntervalStep] = useState(5);

	const handleToggle = useCallback(
		(n: number) => {
			const next = new Set(selected);
			if (next.has(n)) next.delete(n);
			else next.add(n);
			onChange(selectedToFieldValue(next, hasLast));
		},
		[selected, hasLast, onChange],
	);

	const rangeLabel =
		label === "Month"
			? "(1\u201312)"
			: label === "Day of Week"
				? "(0\u20136)"
				: label === "Day of Month"
					? "(1\u201331)"
					: label === "Hour"
						? "(0\u201323)"
						: "(0\u201359)";

	return (
		<div className='space-y-2'>
			<div className='flex items-center justify-between'>
				<div className='text-[10px] font-semibold text-muted-foreground'>
					{label} {rangeLabel}
				</div>
				<div className='flex gap-1'>
					<button
						type='button'
						onClick={() => onChange("*")}
						className={cn(
							"rounded px-2 py-0.5 text-[10px] transition-colors",
							isEvery
								? "bg-accent text-accent-foreground"
								: "bg-zinc-700 text-zinc-400 hover:bg-zinc-600",
						)}
					>
						Every
					</button>
					{(label === "Day of Month" || label === "Day of Week") && (
						<button
							type='button'
							onClick={() => onChange("?")}
							className={cn(
								"rounded px-2 py-0.5 text-[10px] transition-colors",
								isQuestion
									? "bg-accent text-accent-foreground"
									: "bg-zinc-700 text-zinc-400 hover:bg-zinc-600",
							)}
						>
							Any (?)
						</button>
					)}
					{showLastDay && (
						<button
							type='button'
							onClick={() => onChange("L")}
							className={cn(
								"rounded px-2 py-0.5 text-[10px] transition-colors",
								hasLast
									? "bg-accent text-accent-foreground"
									: "bg-zinc-700 text-zinc-400 hover:bg-zinc-600",
							)}
						>
							Last day (L)
						</button>
					)}
				</div>
			</div>

			{/* Interval control */}
			<div className='flex items-center gap-2'>
				<span className='text-[10px] text-muted-foreground'>Every</span>
				<input
					type='number'
					min={1}
					max={max}
					value={intervalStep}
					onChange={(e) =>
						setIntervalStep(Math.max(1, parseInt(e.target.value, 10) || 1))
					}
					className='w-14 rounded border border-border bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-foreground'
					aria-label={`${label} interval step`}
				/>
				<button
					type='button'
					onClick={() => onChange(`*/${intervalStep}`)}
					className={cn(
						"rounded px-2 py-0.5 text-[10px] transition-colors",
						isInterval
							? "bg-accent text-accent-foreground"
							: "bg-zinc-700 text-zinc-400 hover:bg-zinc-600",
					)}
				>
					Apply interval
				</button>
			</div>

			{/* Click-to-toggle grid */}
			{!isEvery && !isQuestion && !hasLast && (
				<NumberGrid
					min={min}
					max={max}
					cols={cols}
					selected={selected}
					onToggle={handleToggle}
					labels={cellLabels}
				/>
			)}
		</div>
	);
}

function TimezoneSelector({
	value,
	onChange,
}: {
	value: string;
	onChange: (tz: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const ref = useRef<HTMLDivElement>(null);

	const filtered = useMemo(
		() =>
			ALL_TIMEZONES.filter((tz) =>
				tz.toLowerCase().includes(search.toLowerCase()),
			).slice(0, 100),
		[search],
	);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	return (
		<div ref={ref} className='relative'>
			<button
				type='button'
				onClick={() => setOpen(!open)}
				className='flex items-center gap-1.5 rounded border border-border bg-zinc-800 px-2.5 py-1.5 text-xs font-mono text-foreground hover:bg-zinc-700 transition-colors'
				aria-label='Select timezone'
			>
				<span className='text-[10px] text-muted-foreground'>TZ:</span>
				{value}
			</button>
			{open && (
				<div className='absolute left-0 z-50 mt-1 w-72 rounded-lg border border-border bg-panel shadow-xl'>
					<div className='p-2'>
						<input
							type='text'
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder='Search timezones...'
							className='w-full rounded border border-border bg-zinc-800 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent'
							autoFocus
							aria-label='Search timezones'
						/>
					</div>
					<div className='max-h-48 overflow-y-auto'>
						{filtered.map((tz) => (
							<button
								key={tz}
								type='button'
								onClick={() => {
									onChange(tz);
									setOpen(false);
									setSearch("");
								}}
								className={cn(
									"w-full px-3 py-1.5 text-left text-xs font-mono transition-colors",
									value === tz
										? "bg-accent text-accent-foreground"
										: "text-foreground hover:bg-zinc-700",
								)}
							>
								{tz}
							</button>
						))}
						{filtered.length === 0 && (
							<div className='px-3 py-2 text-xs text-muted-foreground'>
								No timezones found
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function RunStatisticsPanel({ stats }: { stats: RunStats }) {
	const items = [
		{ label: "Per hour", value: stats.perHour },
		{ label: "Per day", value: stats.perDay },
		{ label: "Per week", value: stats.perWeek },
		{ label: "Per month", value: stats.perMonth },
		{ label: "Per year", value: stats.perYear },
	];

	return (
		<div className='rounded-lg border border-border bg-panel p-4'>
			<div className='mb-3 text-[10px] font-semibold uppercase text-muted-foreground'>
				Run Statistics
			</div>
			<div className='grid grid-cols-5 gap-3'>
				{items.map((item) => (
					<div key={item.label} className='text-center'>
						<div className='font-mono text-sm font-semibold text-foreground'>
							{item.value.toLocaleString()}
						</div>
						<div className='text-[10px] text-muted-foreground'>
							{item.label}
						</div>
					</div>
				))}
			</div>
			{stats.timeSinceLastRun && (
				<div className='mt-3 border-t border-border pt-3 text-center text-xs text-muted-foreground'>
					Last run:{" "}
					<span className='font-mono text-foreground'>
						{stats.timeSinceLastRun}
					</span>
					{stats.lastRun && (
						<span className='ml-2 text-[10px]'>
							({stats.lastRun.toLocaleString()})
						</span>
					)}
				</div>
			)}
		</div>
	);
}

function DateWarningsPanel({ warnings }: { warnings: string[] }) {
	if (warnings.length === 0) return null;
	return (
		<div className='space-y-1.5'>
			{warnings.map((w) => (
				<div
					key={w}
					className={cn(
						"rounded-md px-3 py-2 text-xs",
						w.startsWith("\u26A0")
							? "border border-yellow-500/30 bg-yellow-500/5 text-yellow-400"
							: "border border-blue-500/30 bg-blue-500/5 text-blue-400",
					)}
					role='status'
				>
					{w}
				</div>
			))}
		</div>
	);
}

// ─── Main component ─────────────────────────────────────────────────────────────
export function CronTool() {
	const [input, setInput] = useLocalStorage(
		"devtools-cron-input",
		"*/5 * * * *",
	);
	const [format, setFormat] = useLocalStorage<CronFormat>(
		"devtools-cron-format",
		"standard",
	);
	const [timezone, setTimezone] = useLocalStorage(
		"devtools-cron-tz",
		Intl.DateTimeFormat().resolvedOptions().timeZone,
	);
	const [showGrid, setShowGrid] = useState(false);

	const debouncedInput = useDebounce(input, 200);

	const activeConfig = FORMAT_CONFIGS[format];

	const fields = useMemo(() => {
		const parts = debouncedInput.trim().split(/\s+/);
		return activeConfig.labels.map((_, i) => parts[i] || "*");
	}, [debouncedInput, activeConfig]);

	const error = useMemo(
		() => validateCron(debouncedInput, format),
		[debouncedInput, format],
	);
	const humanReadable = useMemo(
		() => (error ? null : getHumanReadable(debouncedInput.trim(), format)),
		[debouncedInput, error, format],
	);
	const nextRuns = useMemo(
		() =>
			error ? [] : getNextRuns(debouncedInput.trim(), 10, timezone, format),
		[debouncedInput, error, timezone, format],
	);
	const runStats = useMemo(
		() =>
			error
				? null
				: computeRunStatistics(debouncedInput.trim(), timezone, format),
		[debouncedInput, error, timezone, format],
	);
	const dateWarnings = useMemo(
		() => getDateWarnings(fields, format),
		[fields, format],
	);

	const setField = useCallback(
		(index: number, value: string) => {
			setInput((prev) => {
				const parts = prev.trim().split(/\s+/);
				while (parts.length < activeConfig.fieldCount) parts.push("*");
				parts[index] = value;
				return parts.join(" ");
			});
		},
		[setInput, activeConfig.fieldCount],
	);

	const getQuickBuilderIndex = useCallback(
		(builderIdx: number): number => {
			if (format === "quartz") return builderIdx + 1;
			return builderIdx;
		},
		[format],
	);

	const applyPreset = useCallback(
		(expression: string) => {
			setInput(expression);
		},
		[setInput],
	);

	const handleFormatChange = useCallback(
		(newFormat: CronFormat) => {
			const currentFormat = format;
			setInput((prev) => convertExpression(prev, currentFormat, newFormat));
			setFormat(newFormat);
		},
		[format, setInput, setFormat],
	);

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<CopyButton text={input.trim()} label='Copy' />
				</ToolPageHeader>

				<div className='flex-1 overflow-y-auto p-4 space-y-6'>
					{/* Format Selector + Timezone */}
					<div className='flex flex-wrap items-center gap-4'>
						<div className='flex items-center gap-1.5'>
							<span className='text-[10px] font-semibold uppercase text-muted-foreground'>
								Format
							</span>
							{(
								Object.entries(FORMAT_CONFIGS) as [CronFormat, FormatConfig][]
							).map(([key, cfg]) => (
								<button
									key={key}
									type='button'
									onClick={() => handleFormatChange(key)}
									className={cn(
										"rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
										format === key
											? "bg-accent text-accent-foreground"
											: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600",
									)}
									aria-label={`Format: ${cfg.description}`}
								>
									{cfg.description}
								</button>
							))}
						</div>
						<TimezoneSelector value={timezone} onChange={setTimezone} />
					</div>

					{/* Cron input */}
					<div className='rounded-lg border border-border bg-panel p-4'>
						<input
							type='text'
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder={activeConfig.defaults}
							className='w-full text-center font-mono text-2xl font-bold text-foreground bg-transparent focus:outline-none placeholder:text-muted-foreground'
							spellCheck={false}
							aria-label='Cron expression'
						/>
						{/* Field labels */}
						<div
							className={cn(
								"mt-2 grid gap-1 text-center",
								activeConfig.fieldCount === 5 ? "grid-cols-5" : "grid-cols-6",
							)}
						>
							{activeConfig.labels.map((label, i) => (
								<div key={label} className='space-y-1'>
									<div className='font-mono text-sm font-semibold text-accent'>
										{fields[i]}
									</div>
									<div className='text-[10px] text-muted-foreground'>
										{label}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Human readable */}
					{humanReadable && (
						<div className='rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-center'>
							<span className='text-sm font-medium text-foreground'>
								{humanReadable}
							</span>
						</div>
					)}

					{error && <ErrorBox error={error} />}

					{/* Date Warnings */}
					<DateWarningsPanel warnings={dateWarnings} />

					{/* Quick builder */}
					<div className='rounded-lg border border-border bg-panel p-4'>
						<div className='mb-3 text-[10px] font-semibold uppercase text-muted-foreground'>
							Quick Builder
						</div>
						<div className='space-y-3'>
							{FIELD_LABELS.map((label, i) => (
								<div key={label}>
									<div className='mb-1 text-[10px] font-medium text-muted-foreground'>
										{label}
									</div>
									<div className='flex flex-wrap gap-1'>
										{FIELD_QUICK_OPTIONS[i].map((opt) => (
											<button
												key={opt.value}
												onClick={() =>
													setField(getQuickBuilderIndex(i), opt.value)
												}
												className={cn(
													"rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
													fields[getQuickBuilderIndex(i)] === opt.value
														? "bg-accent text-accent-foreground"
														: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600",
												)}
											>
												{opt.label}
											</button>
										))}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Visual Grid Editor */}
					<div className='rounded-lg border border-border bg-panel p-4'>
						<button
							type='button'
							onClick={() => setShowGrid(!showGrid)}
							className='flex w-full items-center justify-between'
						>
							<span className='text-[10px] font-semibold uppercase text-muted-foreground'>
								Visual Grid Editor
							</span>
							<span className='text-[10px] text-muted-foreground'>
								{showGrid ? "\u25B2 Collapse" : "\u25BC Expand"}
							</span>
						</button>
						{showGrid && (
							<div className='mt-4 space-y-5'>
								{activeConfig.labels.map((label, i) => (
									<FieldGridEditor
										key={label}
										label={label}
										fieldValue={fields[i]}
										onChange={(v) => setField(i, v)}
									/>
								))}
							</div>
						)}
					</div>

					{/* Presets */}
					<div className='rounded-lg border border-border bg-panel p-4'>
						<div className='mb-3 text-[10px] font-semibold uppercase text-muted-foreground'>
							Presets
						</div>
						<div className='flex flex-wrap gap-1.5'>
							{PRESETS.map((preset) => (
								<button
									key={preset.expression}
									onClick={() => applyPreset(preset.expression)}
									className={cn(
										"rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
										input.trim() === preset.expression
											? "bg-accent text-accent-foreground"
											: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600",
									)}
								>
									{preset.name}
								</button>
							))}
						</div>
					</div>

					{/* Run Statistics */}
					{runStats && <RunStatisticsPanel stats={runStats} />}

					{/* Next 10 runs */}
					{nextRuns.length > 0 && (
						<div className='rounded-lg border border-border bg-panel overflow-hidden'>
							<div className='border-b border-border px-4 py-2'>
								<span className='text-[10px] font-semibold uppercase text-muted-foreground'>
									Next 10 Runs
								</span>
							</div>
							<div className='divide-y divide-border'>
								{nextRuns.map((date, i) => (
									<div
										key={i}
										className='flex items-center justify-between px-4 py-2'
									>
										<span className='text-[10px] text-muted-foreground'>
											#{i + 1}
										</span>
										<span className='font-mono text-xs text-foreground'>
											{date.toLocaleString(undefined, {
												timeZone: timezone,
											})}
										</span>
										<span className='text-[10px] text-muted-foreground'>
											{date.toISOString()}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	);
}
