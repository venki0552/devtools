import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";

const tool = TOOLS.find((t) => t.id === "epoch")!;

const DAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/** JS Date max safe range: ±8.64e15 ms (~±275,760 years) */
const MAX_EPOCH_MS = 8.64e15;

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

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
			"America/Anchorage",
			"Pacific/Honolulu",
			"America/Toronto",
			"America/Vancouver",
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

function getLocalTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getTimezoneOffsetMinutes(date: Date, tz: string): number {
	try {
		const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
		const tzStr = date.toLocaleString("en-US", { timeZone: tz });
		return (new Date(utcStr).getTime() - new Date(tzStr).getTime()) / 60000;
	} catch {
		return 0;
	}
}

function isDST(date: Date, tz: string): boolean {
	try {
		const jan = new Date(date.getFullYear(), 0, 1);
		const jul = new Date(date.getFullYear(), 6, 1);
		const janOff = getTimezoneOffsetMinutes(jan, tz);
		const julOff = getTimezoneOffsetMinutes(jul, tz);
		if (janOff === julOff) return false;
		const stdOff = Math.max(janOff, julOff);
		return getTimezoneOffsetMinutes(date, tz) !== stdOff;
	} catch {
		return false;
	}
}

function formatInTimezone(date: Date, tz: string): string {
	try {
		return date.toLocaleString("en-US", {
			timeZone: tz,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});
	} catch {
		return "Invalid timezone";
	}
}

function getTimezoneAbbr(date: Date, tz: string): string {
	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			timeZoneName: "short",
		}).formatToParts(date);
		return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
	} catch {
		return tz;
	}
}

function checkDSTTransition(date: Date, tz: string): string | null {
	try {
		const before = new Date(date.getTime() - 3600000);
		const after = new Date(date.getTime() + 3600000);
		const offBefore = getTimezoneOffsetMinutes(before, tz);
		const offCurrent = getTimezoneOffsetMinutes(date, tz);
		const offAfter = getTimezoneOffsetMinutes(after, tz);
		if (offBefore !== offCurrent) {
			return offCurrent < offBefore
				? "⚠️ This time is near a DST spring-forward transition. Some local times may not exist."
				: "⚠️ This time is near a DST fall-back transition. This local time may be ambiguous.";
		}
		if (offCurrent !== offAfter) {
			return "⚠️ A DST transition occurs within an hour of this time.";
		}
		return null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Date math helpers
// ---------------------------------------------------------------------------

function getWeekNumber(d: Date): number {
	const oneJan = new Date(d.getFullYear(), 0, 1);
	const days = Math.floor((d.getTime() - oneJan.getTime()) / 86400000);
	return Math.ceil((days + oneJan.getDay() + 1) / 7);
}

function getDayOfYear(d: Date): number {
	const start = new Date(d.getFullYear(), 0, 0);
	return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

function getRelativeTime(date: Date): string {
	const now = Date.now();
	const diff = now - date.getTime();
	const absDiff = Math.abs(diff);
	const prefix = diff < 0 ? "in " : "";
	const suffix = diff >= 0 ? " ago" : "";

	if (absDiff < 1000) return "just now";
	if (absDiff < 60000)
		return `${prefix}${Math.floor(absDiff / 1000)}s${suffix}`;
	if (absDiff < 3600000)
		return `${prefix}${Math.floor(absDiff / 60000)}m${suffix}`;
	if (absDiff < 86400000)
		return `${prefix}${Math.floor(absDiff / 3600000)}h${suffix}`;
	if (absDiff < 2592000000)
		return `${prefix}${Math.floor(absDiff / 86400000)}d${suffix}`;
	if (absDiff < 31536000000)
		return `${prefix}${Math.floor(absDiff / 2592000000)}mo${suffix}`;
	return `${prefix}${Math.floor(absDiff / 31536000000)}y${suffix}`;
}

// ---------------------------------------------------------------------------
// Flexible date parsing (Box B)
// ---------------------------------------------------------------------------

type ParsedDate = { date: Date; format: string; hadTimezone: boolean };

function applyRelativeOffset(d: Date, amount: number, unit: string) {
	switch (unit) {
		case "second":
			d.setSeconds(d.getSeconds() + amount);
			break;
		case "minute":
			d.setMinutes(d.getMinutes() + amount);
			break;
		case "hour":
			d.setHours(d.getHours() + amount);
			break;
		case "day":
			d.setDate(d.getDate() + amount);
			break;
		case "week":
			d.setDate(d.getDate() + amount * 7);
			break;
		case "month":
			d.setMonth(d.getMonth() + amount);
			break;
		case "year":
			d.setFullYear(d.getFullYear() + amount);
			break;
	}
}

function parseFlexibleDate(input: string): ParsedDate | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	const lower = trimmed.toLowerCase();

	// Relative keywords
	if (lower === "now")
		return { date: new Date(), format: "Relative (now)", hadTimezone: true };
	if (lower === "yesterday") {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		return { date: d, format: "Relative (yesterday)", hadTimezone: true };
	}
	if (lower === "tomorrow") {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		return { date: d, format: "Relative (tomorrow)", hadTimezone: true };
	}

	// "N units ago"
	const agoMatch = lower.match(
		/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/,
	);
	if (agoMatch) {
		const d = new Date();
		applyRelativeOffset(d, -parseInt(agoMatch[1], 10), agoMatch[2]);
		return {
			date: d,
			format: `Relative (${agoMatch[1]} ${agoMatch[2]}s ago)`,
			hadTimezone: true,
		};
	}

	// "in N units"
	const inMatch = lower.match(
		/^in\s+(\d+)\s+(second|minute|hour|day|week|month|year)s?$/,
	);
	if (inMatch) {
		const d = new Date();
		applyRelativeOffset(d, parseInt(inMatch[1], 10), inMatch[2]);
		return {
			date: d,
			format: `Relative (in ${inMatch[1]} ${inMatch[2]}s)`,
			hadTimezone: true,
		};
	}

	// "next Monday", "last Friday"
	const dayMatch = lower.match(
		/^(next|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/,
	);
	if (dayMatch) {
		const dir = dayMatch[1];
		const dayName = dayMatch[2];
		const targetDay = [
			"sunday",
			"monday",
			"tuesday",
			"wednesday",
			"thursday",
			"friday",
			"saturday",
		].indexOf(dayName);
		const d = new Date();
		const cur = d.getDay();
		const diff =
			dir === "next"
				? (targetDay - cur + 7) % 7 || 7
				: -((cur - targetDay + 7) % 7 || 7);
		d.setDate(d.getDate() + diff);
		return {
			date: d,
			format: `Relative (${dir} ${dayName})`,
			hadTimezone: true,
		};
	}

	// US format: MM/DD/YYYY [HH:MM[:SS] [AM|PM]]
	const usMatch = trimmed.match(
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
	);
	if (usMatch) {
		const [, mo, dy, yr, hh, mm, ss, ampm] = usMatch;
		let h = hh ? parseInt(hh, 10) : 0;
		if (ampm?.toUpperCase() === "PM" && h !== 12) h += 12;
		if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
		const d = new Date(
			parseInt(yr, 10),
			parseInt(mo, 10) - 1,
			parseInt(dy, 10),
			h,
			mm ? parseInt(mm, 10) : 0,
			ss ? parseInt(ss, 10) : 0,
		);
		if (!isNaN(d.getTime()))
			return { date: d, format: "US (MM/DD/YYYY)", hadTimezone: false };
	}

	// European format: DD.MM.YYYY [HH:MM[:SS]]
	const euMatch = trimmed.match(
		/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
	);
	if (euMatch) {
		const [, dy, mo, yr, hh, mm, ss] = euMatch;
		const d = new Date(
			parseInt(yr, 10),
			parseInt(mo, 10) - 1,
			parseInt(dy, 10),
			hh ? parseInt(hh, 10) : 0,
			mm ? parseInt(mm, 10) : 0,
			ss ? parseInt(ss, 10) : 0,
		);
		if (!isNaN(d.getTime()))
			return {
				date: d,
				format: "European (DD.MM.YYYY)",
				hadTimezone: false,
			};
	}

	// Fallback: standard Date.parse (ISO 8601, RFC 2822, etc.)
	const hasTimezone = /[Zz]|[+-]\d{2}:\d{2}|GMT|UTC/.test(trimmed);
	const d = new Date(trimmed);
	if (!isNaN(d.getTime()))
		return {
			date: d,
			format: "ISO 8601 / Standard",
			hadTimezone: hasTimezone,
		};

	return null;
}

// ---------------------------------------------------------------------------
// Format info builder
// ---------------------------------------------------------------------------

function formatDateInfo(date: Date, tz?: string) {
	const localStr = tz
		? date.toLocaleString(undefined, { timeZone: tz })
		: date.toLocaleString();
	return {
		local: localStr,
		utc: date.toUTCString(),
		iso: date.toISOString(),
		relative: getRelativeTime(date),
		dayOfWeek: DAYS[date.getDay()],
		month: MONTHS[date.getMonth()],
		weekNumber: getWeekNumber(date),
		dayOfYear: getDayOfYear(date),
		epochSec: Math.floor(date.getTime() / 1000),
		epochMs: date.getTime(),
	};
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EpochTool() {
	const [epochInput, setEpochInput] = useLocalStorage(
		"devtools-epoch-input",
		"",
	);
	const [dateInput, setDateInput] = useLocalStorage(
		"devtools-epoch-date-input",
		"",
	);
	const [selectedTz, setSelectedTz] = useLocalStorage(
		"devtools-epoch-tz",
		getLocalTimezone(),
	);
	const [comparatorTzs, setComparatorTzs] = useLocalStorage<string[]>(
		"devtools-epoch-comparator-tzs",
		[],
	);

	const [tzSearch, setTzSearch] = useState("");
	const [comparatorTzSearch, setComparatorTzSearch] = useState("");
	const [tzDropdownOpen, setTzDropdownOpen] = useState(false);
	const [comparatorDropdownOpen, setComparatorDropdownOpen] = useState(false);
	const [now, setNow] = useState(() => Date.now());

	const tzDropdownRef = useRef<HTMLDivElement>(null);
	const comparatorDropdownRef = useRef<HTMLDivElement>(null);

	// Live clock
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	// Close dropdowns on outside click
	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (
				tzDropdownRef.current &&
				!tzDropdownRef.current.contains(e.target as Node)
			) {
				setTzDropdownOpen(false);
			}
			if (
				comparatorDropdownRef.current &&
				!comparatorDropdownRef.current.contains(e.target as Node)
			) {
				setComparatorDropdownOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, []);

	// Filtered timezone lists
	const filteredTzs = useMemo(() => {
		if (!tzSearch) return ALL_TIMEZONES.slice(0, 50);
		const q = tzSearch.toLowerCase();
		return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q)).slice(
			0,
			50,
		);
	}, [tzSearch]);

	const filteredComparatorTzs = useMemo(() => {
		if (!comparatorTzSearch) return ALL_TIMEZONES.slice(0, 50);
		const q = comparatorTzSearch.toLowerCase();
		return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q)).slice(
			0,
			50,
		);
	}, [comparatorTzSearch]);

	// Epoch → DateTime conversion
	const epochResult = useMemo(() => {
		const trimmed = epochInput.trim();
		if (!trimmed) return null;

		const num = Number(trimmed);
		if (!Number.isFinite(num)) return { error: "Not a valid number" };

		const isMs = Math.abs(num) > 1e12;
		const ms = isMs ? num : num * 1000;

		if (Math.abs(ms) > MAX_EPOCH_MS) {
			return {
				error: `Value exceeds JS Date limit (±${MAX_EPOCH_MS / 1000} seconds / ±${MAX_EPOCH_MS} ms). Dates beyond ±275,760 years are not supported.`,
			};
		}

		const date = new Date(ms);
		if (isNaN(date.getTime())) return { error: "Invalid timestamp" };

		const isEpochZero = num === 0;
		const isPreUnix = ms < 0;
		const dstWarning = checkDSTTransition(date, selectedTz);

		return {
			date,
			info: formatDateInfo(date, selectedTz),
			isMs,
			isEpochZero,
			isPreUnix,
			dstWarning,
			error: null,
		};
	}, [epochInput, selectedTz]);

	// DateTime → Epoch conversion
	const dateResult = useMemo(() => {
		const trimmed = dateInput.trim();
		if (!trimmed) return null;

		const parsed = parseFlexibleDate(trimmed);
		if (!parsed) return { error: "Invalid date string" };

		const { date, format, hadTimezone } = parsed;
		const isPreUnix = date.getTime() < 0;
		const dstWarning = checkDSTTransition(date, selectedTz);

		return {
			date,
			info: formatDateInfo(date, selectedTz),
			format,
			hadTimezone,
			isPreUnix,
			dstWarning,
			error: null,
		};
	}, [dateInput, selectedTz]);

	// Active date for comparator
	const activeDate = useMemo(() => {
		if (epochResult && !epochResult.error && epochResult.date)
			return epochResult.date;
		if (dateResult && !dateResult.error && dateResult.date)
			return dateResult.date;
		return null;
	}, [epochResult, dateResult]);

	const handleClear = useCallback(() => {
		setEpochInput("");
		setDateInput("");
	}, [setEpochInput, setDateInput]);

	const handleUseNow = useCallback(() => {
		const nowMs = Date.now();
		const nowSec = Math.floor(nowMs / 1000);
		setEpochInput(String(nowSec));
		setDateInput(new Date(nowMs).toISOString());
	}, [setEpochInput, setDateInput]);

	const addComparatorTz = useCallback(
		(tz: string) => {
			setComparatorTzs((prev) => {
				if (prev.includes(tz) || prev.length >= 5) return prev;
				return [...prev, tz];
			});
			setComparatorTzSearch("");
			setComparatorDropdownOpen(false);
		},
		[setComparatorTzs],
	);

	const removeComparatorTz = useCallback(
		(tz: string) => {
			setComparatorTzs((prev) => prev.filter((t) => t !== tz));
		},
		[setComparatorTzs],
	);

	const nowSec = Math.floor(now / 1000);

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<button
						onClick={handleUseNow}
						className='h-8 rounded-md bg-accent/20 px-3 text-xs font-medium text-accent hover:bg-accent/30'
						aria-label='Use now'
					>
						Use now
					</button>
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
				</ToolPageHeader>

				<div className='flex-1 overflow-y-auto p-4 space-y-6'>
					{/* Live clock */}
					<div className='rounded-lg border border-border bg-panel p-4 text-center'>
						<div className='text-[10px] uppercase font-semibold text-muted-foreground mb-2'>
							Current Epoch
						</div>
						<div className='flex items-center justify-center gap-3'>
							<span className='font-mono text-3xl font-bold text-foreground tabular-nums'>
								{nowSec}
							</span>
							<CopyButton text={String(nowSec)} label='Copy' />
						</div>
						<div className='mt-1 text-xs text-muted-foreground'>
							{new Date(now).toISOString()}
						</div>
					</div>

					{/* Timezone selector */}
					<div className='flex items-center gap-3' ref={tzDropdownRef}>
						<label className='text-xs font-medium text-muted-foreground shrink-0'>
							Timezone:
						</label>
						<div className='relative flex-1 max-w-xs'>
							<input
								type='text'
								value={tzDropdownOpen ? tzSearch : selectedTz}
								onChange={(e) => {
									setTzSearch(e.target.value);
									setTzDropdownOpen(true);
								}}
								onFocus={() => {
									setTzDropdownOpen(true);
									setTzSearch("");
								}}
								placeholder='Search timezones...'
								className='w-full rounded border border-border bg-zinc-800 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent'
								aria-label='Timezone selector'
							/>
							{tzDropdownOpen && (
								<div className='absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded border border-border bg-zinc-800 shadow-lg'>
									{filteredTzs.map((tz) => (
										<button
											key={tz}
											onClick={() => {
												setSelectedTz(tz);
												setTzDropdownOpen(false);
												setTzSearch("");
											}}
											className={cn(
												"w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-700",
												tz === selectedTz && "bg-accent/20 text-accent",
											)}
										>
											{tz}
										</button>
									))}
									{filteredTzs.length === 0 && (
										<div className='px-3 py-2 text-xs text-muted-foreground'>
											No timezones found
										</div>
									)}
								</div>
							)}
						</div>
					</div>

					<div className='grid gap-6 lg:grid-cols-2'>
						{/* Box A: Epoch → DateTime */}
						<div className='rounded-lg border border-border bg-panel overflow-hidden'>
							<div className='border-b border-border bg-zinc-800/50 px-4 py-2'>
								<h3 className='text-xs font-semibold text-foreground'>
									Epoch → DateTime
								</h3>
							</div>
							<div className='p-4 space-y-3'>
								<input
									type='text'
									value={epochInput}
									onChange={(e) => setEpochInput(e.target.value)}
									placeholder='Enter epoch timestamp (sec or ms)...'
									className='w-full rounded border border-border bg-zinc-800 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent'
									aria-label='Epoch input'
								/>
								{epochResult?.error && <ErrorBox error={epochResult.error} />}
								{epochResult && !epochResult.error && epochResult.info && (
									<>
										{epochResult.isEpochZero && (
											<div className='rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-400'>
												Unix epoch — Jan 1, 1970 00:00:00 UTC
											</div>
										)}
										{epochResult.isPreUnix && (
											<div className='rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400'>
												Pre-1970 date (negative epoch). Dates before Unix epoch
												are supported but some systems may not handle them.
											</div>
										)}
										{epochResult.dstWarning && (
											<div
												className='rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-400'
												role='status'
											>
												{epochResult.dstWarning}
											</div>
										)}
										<DateInfoDisplay
											info={epochResult.info}
											isMs={epochResult.isMs}
										/>
									</>
								)}
							</div>
						</div>

						{/* Box B: DateTime → Epoch */}
						<div className='rounded-lg border border-border bg-panel overflow-hidden'>
							<div className='border-b border-border bg-zinc-800/50 px-4 py-2'>
								<h3 className='text-xs font-semibold text-foreground'>
									DateTime → Epoch
								</h3>
							</div>
							<div className='p-4 space-y-3'>
								<input
									type='text'
									value={dateInput}
									onChange={(e) => setDateInput(e.target.value)}
									placeholder='Enter date (ISO, "01/15/2024 09:30 AM", "yesterday", etc.)...'
									className='w-full rounded border border-border bg-zinc-800 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent'
									aria-label='Date input'
								/>
								{dateResult?.error && <ErrorBox error={dateResult.error} />}
								{dateResult && !dateResult.error && dateResult.info && (
									<>
										<div className='flex flex-wrap gap-2 mb-2'>
											{dateResult.format && (
												<span className='rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400'>
													Format: {dateResult.format}
												</span>
											)}
											{!dateResult.hadTimezone && (
												<span className='rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400'>
													Assumed: {getLocalTimezone()}
												</span>
											)}
										</div>
										{dateResult.isPreUnix && (
											<div className='rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400'>
												Pre-1970 date (negative epoch). Dates before Unix epoch
												are supported but some systems may not handle them.
											</div>
										)}
										{dateResult.dstWarning && (
											<div
												className='rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-400'
												role='status'
											>
												{dateResult.dstWarning}
											</div>
										)}
										<DateInfoDisplay info={dateResult.info} />
									</>
								)}
							</div>
						</div>
					</div>

					{/* Timezone Comparator */}
					<div className='rounded-lg border border-border bg-panel overflow-hidden'>
						<div className='border-b border-border bg-zinc-800/50 px-4 py-2 flex items-center justify-between'>
							<h3 className='text-xs font-semibold text-foreground'>
								Timezone Comparator
							</h3>
							<span className='text-[10px] text-muted-foreground'>
								{comparatorTzs.length}/5 timezones
							</span>
						</div>
						<div className='p-4 space-y-3'>
							{comparatorTzs.length < 5 && (
								<div ref={comparatorDropdownRef} className='relative max-w-xs'>
									<input
										type='text'
										value={comparatorTzSearch}
										onChange={(e) => {
											setComparatorTzSearch(e.target.value);
											setComparatorDropdownOpen(true);
										}}
										onFocus={() => setComparatorDropdownOpen(true)}
										placeholder='Add timezone to compare...'
										className='w-full rounded border border-border bg-zinc-800 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent'
										aria-label='Add timezone to comparator'
									/>
									{comparatorDropdownOpen && (
										<div className='absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded border border-border bg-zinc-800 shadow-lg'>
											{filteredComparatorTzs
												.filter((tz) => !comparatorTzs.includes(tz))
												.map((tz) => (
													<button
														key={tz}
														onClick={() => addComparatorTz(tz)}
														className='w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-700'
													>
														{tz}
													</button>
												))}
										</div>
									)}
								</div>
							)}

							{comparatorTzs.length === 0 && !activeDate && (
								<div className='text-xs text-muted-foreground py-2'>
									Enter a time above and add timezones to compare.
								</div>
							)}

							{comparatorTzs.length > 0 && (
								<div className='space-y-1'>
									{comparatorTzs.map((tz) => {
										const date = activeDate ?? new Date(now);
										const inDST = isDST(date, tz);
										const abbr = getTimezoneAbbr(date, tz);
										const formatted = formatInTimezone(date, tz);
										return (
											<div
												key={tz}
												className='flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-zinc-800/50'
											>
												<button
													onClick={() => removeComparatorTz(tz)}
													className='shrink-0 text-muted-foreground hover:text-error'
													aria-label={`Remove ${tz}`}
												>
													×
												</button>
												<span
													className='w-48 shrink-0 text-muted-foreground truncate'
													title={tz}
												>
													{tz}
												</span>
												<span className='font-mono text-foreground flex-1'>
													{formatted}
												</span>
												<span className='text-[10px] text-muted-foreground'>
													{abbr}
												</span>
												<span
													className={cn(
														"rounded-full px-1.5 py-0.5 text-[10px] font-medium",
														inDST
															? "border border-orange-500/30 bg-orange-500/10 text-orange-400"
															: "border border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
													)}
												>
													{inDST ? "DST" : "STD"}
												</span>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

// ---------------------------------------------------------------------------
// Shared display sub-component
// ---------------------------------------------------------------------------

function DateInfoDisplay({
	info,
	isMs,
}: {
	info: ReturnType<typeof formatDateInfo>;
	isMs?: boolean;
}) {
	const rows: { label: string; value: string; copyable?: boolean }[] = [
		{ label: "Epoch (sec)", value: String(info.epochSec), copyable: true },
		{ label: "Epoch (ms)", value: String(info.epochMs), copyable: true },
		{ label: "Local Time", value: info.local, copyable: true },
		{ label: "UTC", value: info.utc, copyable: true },
		{ label: "ISO 8601", value: info.iso, copyable: true },
		{ label: "Relative", value: info.relative },
		{ label: "Day of Week", value: info.dayOfWeek },
		{ label: "Day of Year", value: String(info.dayOfYear) },
		{ label: "Week Number", value: String(info.weekNumber) },
	];

	return (
		<div className='space-y-1'>
			{isMs !== undefined && (
				<div className='mb-2'>
					<span
						className={cn(
							"rounded-full border px-2 py-0.5 text-[10px] font-medium",
							isMs
								? "border-blue-500/30 bg-blue-500/10 text-blue-400"
								: "border-green-500/30 bg-green-500/10 text-green-400",
						)}
					>
						Detected: {isMs ? "milliseconds" : "seconds"}
					</span>
				</div>
			)}
			{rows.map((r) => (
				<div
					key={r.label}
					className='flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-zinc-800/50'
				>
					<span className='w-24 shrink-0 text-muted-foreground'>{r.label}</span>
					<span className='flex-1 font-mono text-foreground break-all'>
						{r.value}
					</span>
					{r.copyable && (
						<CopyButton
							text={r.value}
							className='h-6 px-1.5 opacity-60 hover:opacity-100'
						/>
					)}
				</div>
			))}
		</div>
	);
}
