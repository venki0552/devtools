import { useState, useCallback, useMemo, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import { RefreshCw } from "lucide-react";
import { ulid } from "ulidx";
import { copyToClipboard } from "@/lib/clipboard";

const tool = TOOLS.find((t) => t.id === "uuid")!;

type UuidVersion = "v4" | "v7" | "ulid";
type OutputFormat =
	| "one-per-line"
	| "json-array"
	| "comma-separated"
	| "sql-values";
type UuidFormat = "hyphenated" | "no-hyphens" | "uppercase" | "braces";

interface UuidPrefs {
	version: UuidVersion;
	outputFormat: OutputFormat;
	uuidFormat: UuidFormat;
	quantity: number;
}

const QUANTITIES = [1, 5, 10, 25, 50, 100];
const MAX_BULK = 1000;

// UUIDv4 using crypto.randomUUID with fallback
function generateV4(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	// Fallback: manual v4
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// UUIDv7: time-ordered UUID
function generateV7(): string {
	const now = Date.now();
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);

	// 48-bit timestamp (ms)
	bytes[0] = (now / 2 ** 40) & 0xff;
	bytes[1] = (now / 2 ** 32) & 0xff;
	bytes[2] = (now / 2 ** 24) & 0xff;
	bytes[3] = (now / 2 ** 16) & 0xff;
	bytes[4] = (now / 2 ** 8) & 0xff;
	bytes[5] = now & 0xff;

	// version 7
	bytes[6] = (bytes[6] & 0x0f) | 0x70;
	// variant 1
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateOne(version: UuidVersion): string {
	switch (version) {
		case "v4":
			return generateV4();
		case "v7":
			return generateV7();
		case "ulid":
			return ulid();
	}
}

function formatUuid(raw: string, format: UuidFormat): string {
	// ULID doesn't have hyphens, UUIDs do
	const isUlid = raw.length === 26;

	let result = raw;
	if (!isUlid) {
		switch (format) {
			case "hyphenated":
				break;
			case "no-hyphens":
				result = raw.replace(/-/g, "");
				break;
			case "uppercase":
				result = raw.toUpperCase();
				break;
			case "braces":
				result = `{${raw}}`;
				break;
		}
	} else if (format === "uppercase") {
		result = raw.toUpperCase();
	}
	return result;
}

function formatBulk(ids: string[], outputFormat: OutputFormat): string {
	switch (outputFormat) {
		case "one-per-line":
			return ids.join("\n");
		case "json-array":
			return JSON.stringify(ids, null, 2);
		case "comma-separated":
			return ids.join(", ");
		case "sql-values":
			return ids.map((id) => `('${id}')`).join(",\n");
	}
}

interface DecodeResult {
	summary: string;
	valid: boolean;
	details?: { label: string; value: string }[];
}

function decodeUuid(input: string): DecodeResult | null {
	const clean = input.replace(/[{}-]/g, "").toLowerCase();
	if (
		clean.length === 26 &&
		/^[0-9a-hjkmnp-tv-z]{26}$/i.test(input.replace(/[{}-]/g, ""))
	) {
		return { summary: "ULID", valid: true };
	}
	if (clean.length !== 32) return null;
	const versionChar = clean[12];
	const variantChar = parseInt(clean[16], 16);
	const version = `v${versionChar}`;
	const variant =
		(variantChar & 0xc) === 0x8
			? "RFC 4122"
			: (variantChar & 0xe) === 0xc
				? "Microsoft"
				: "Other";

	const isValid =
		/^[0-9a-f]{32}$/.test(clean) &&
		["1", "2", "3", "4", "5", "6", "7", "8"].includes(versionChar);

	// Detailed v1 decode: extract timestamp, clock sequence, and node
	if (versionChar === "1" && isValid) {
		const timeLow = clean.slice(0, 8);
		const timeMid = clean.slice(8, 12);
		const timeHi = clean.slice(13, 16); // skip version nibble at [12]
		const timestamp60bit = BigInt(`0x${timeHi}${timeMid}${timeLow}`);
		// UUID epoch: 15 Oct 1582, offset from Unix epoch
		const UUID_EPOCH_OFFSET = BigInt("122192928000000000"); // 100ns intervals
		const unixNs100 = timestamp60bit - UUID_EPOCH_OFFSET;
		const unixMs = Number(unixNs100 / BigInt(10000));
		const date = new Date(unixMs);

		const clockSeqHi = parseInt(clean[16], 16) & 0x3f;
		const clockSeqLow = parseInt(clean.slice(17, 18), 16);
		// Full clock seq from bytes 8-9 (positions 16-19 in hex)
		const clockSeq =
			((clockSeqHi << 8) | parseInt(clean.slice(18, 20), 16)) & 0x3fff;

		const node = clean.slice(20, 32);
		const macFormatted = node.match(/.{2}/g)!.join(":");

		return {
			summary: `UUID ${version} (${variant})`,
			valid: true,
			details: [
				{
					label: "Timestamp",
					value: isNaN(date.getTime()) ? "Invalid" : date.toISOString(),
				},
				{ label: "Clock Sequence", value: String(clockSeq) },
				{ label: "Node (MAC)", value: macFormatted },
			],
		};
	}

	return { summary: `UUID ${version} (${variant})`, valid: isValid };
}

function isValidUuid(input: string): boolean {
	const clean = input.replace(/[{}-]/g, "").toLowerCase();
	if (
		clean.length === 26 &&
		/^[0-9a-hjkmnp-tv-z]{26}$/i.test(input.replace(/[{}-]/g, ""))
	) {
		return true;
	}
	if (clean.length !== 32) return false;
	return /^[0-9a-f]{32}$/.test(clean);
}

export function UuidTool() {
	const [prefs, setPrefs] = useLocalStorage<UuidPrefs>("devtools-uuid-prefs", {
		version: "v4",
		outputFormat: "one-per-line",
		uuidFormat: "hyphenated",
		quantity: 10,
	});
	const [single, setSingle] = useState(() =>
		formatUuid(generateOne(prefs.version), prefs.uuidFormat),
	);
	const [bulk, setBulk] = useState("");
	const [decodeInput, setDecodeInput] = useState("");

	const regenerateSingle = useCallback(() => {
		setSingle(formatUuid(generateOne(prefs.version), prefs.uuidFormat));
	}, [prefs.version, prefs.uuidFormat]);

	const generateBulk = useCallback(() => {
		const count = Math.min(prefs.quantity, MAX_BULK);
		const ids = Array.from({ length: count }, () =>
			formatUuid(generateOne(prefs.version), prefs.uuidFormat),
		);
		setBulk(formatBulk(ids, prefs.outputFormat));
	}, [prefs]);

	const decodeResult = useMemo(() => {
		if (!decodeInput.trim()) return null;
		return decodeUuid(decodeInput.trim());
	}, [decodeInput]);

	const validationStatus = useMemo(() => {
		if (!decodeInput.trim()) return null;
		return isValidUuid(decodeInput.trim());
	}, [decodeInput]);

	// Keyboard shortcuts
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.key === "Enter") {
				e.preventDefault();
				regenerateSingle();
			} else if (mod && e.key === "c" && !window.getSelection()?.toString()) {
				e.preventDefault();
				void copyToClipboard(single);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [regenerateSingle, single]);

	const setVersion = useCallback(
		(version: UuidVersion) => {
			setPrefs((p) => ({ ...p, version }));
			setSingle(formatUuid(generateOne(version), prefs.uuidFormat));
		},
		[setPrefs, prefs.uuidFormat],
	);

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name} />

				<div className='flex-1 overflow-y-auto p-4 space-y-6'>
					{/* Version tabs */}
					<div className='flex gap-1 rounded-lg border border-border bg-panel p-1 w-fit'>
						{(["v4", "v7", "ulid"] as const).map((v) => (
							<button
								key={v}
								onClick={() => setVersion(v)}
								className={cn(
									"rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
									prefs.version === v
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{v === "ulid" ? "ULID" : v.toUpperCase()}
							</button>
						))}
					</div>

					{/* Tab explanation */}
					<p
						className='text-xs text-muted-foreground mt-1'
						data-testid='tab-explanation'
					>
						{prefs.version === "v4" &&
							"Random UUID — best for most use cases where uniqueness is needed without ordering."}
						{prefs.version === "v7" &&
							"Time-ordered UUID — sortable by creation time, ideal for database primary keys."}
						{prefs.version === "ulid" &&
							"Universally Unique Lexicographically Sortable Identifier — compact, sortable, and URL-safe."}
					</p>

					{/* Single UUID */}
					<div className='rounded-lg border border-border bg-panel p-4'>
						<div className='mb-2 text-[10px] font-semibold uppercase text-muted-foreground'>
							Single {prefs.version === "ulid" ? "ULID" : "UUID"}
						</div>
						<div className='flex items-center gap-3'>
							<span className='flex-1 rounded border border-border bg-zinc-800 px-3 py-2 font-mono text-sm text-foreground select-all break-all'>
								{single}
							</span>
							<button
								onClick={regenerateSingle}
								className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600 flex items-center gap-1.5'
								aria-label='Regenerate'
							>
								<RefreshCw className='h-3.5 w-3.5' />
								Regenerate
								<kbd className='ml-1 rounded bg-zinc-600 px-1 py-0.5 text-[10px] font-mono text-zinc-400'>
									Ctrl+↵
								</kbd>
							</button>
							<CopyButton text={single} label='Copy' />
							<kbd className='rounded bg-zinc-600 px-1 py-0.5 text-[10px] font-mono text-zinc-400'>
								Ctrl+C
							</kbd>
						</div>
					</div>

					{/* Bulk generation */}
					<div className='rounded-lg border border-border bg-panel overflow-hidden'>
						<div className='flex items-center justify-between border-b border-border px-4 py-2'>
							<span className='text-[10px] font-semibold uppercase text-muted-foreground'>
								Bulk Generate
							</span>
							<div className='flex items-center gap-2'>
								{/* Quantity */}
								<select
									value={prefs.quantity}
									onChange={(e) =>
										setPrefs((p) => ({
											...p,
											quantity: Number(e.target.value),
										}))
									}
									className='h-7 rounded border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
									aria-label='Quantity'
								>
									{QUANTITIES.map((q) => (
										<option key={q} value={q}>
											{q}
										</option>
									))}
								</select>
								{/* UUID format */}
								{prefs.version !== "ulid" && (
									<select
										value={prefs.uuidFormat}
										onChange={(e) =>
											setPrefs((p) => ({
												...p,
												uuidFormat: e.target.value as UuidFormat,
											}))
										}
										className='h-7 rounded border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
										aria-label='UUID format'
									>
										<option value='hyphenated'>Hyphenated</option>
										<option value='no-hyphens'>No Hyphens</option>
										<option value='uppercase'>UPPERCASE</option>
										<option value='braces'>{"{Braces}"}</option>
									</select>
								)}
								{/* Output format */}
								<select
									value={prefs.outputFormat}
									onChange={(e) =>
										setPrefs((p) => ({
											...p,
											outputFormat: e.target.value as OutputFormat,
										}))
									}
									className='h-7 rounded border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
									aria-label='Output format'
								>
									<option value='one-per-line'>One per line</option>
									<option value='json-array'>JSON Array</option>
									<option value='comma-separated'>Comma separated</option>
									<option value='sql-values'>SQL VALUES</option>
								</select>
								<button
									onClick={generateBulk}
									className='h-7 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent/90'
								>
									Generate
								</button>
							</div>
						</div>
						{bulk && (
							<div className='relative'>
								<div className='absolute right-2 top-2 z-10'>
									<CopyButton text={bulk} />
								</div>
								<MonacoWrapper
									value={bulk}
									readOnly
									language={
										prefs.outputFormat === "json-array" ? "json" : "plaintext"
									}
									height={200}
									aria-label='Bulk UUIDs'
								/>
							</div>
						)}
					</div>

					{/* UUID decode */}
					<div className='rounded-lg border border-border bg-panel p-4'>
						<div className='mb-2 text-[10px] font-semibold uppercase text-muted-foreground'>
							Decode UUID / ULID
						</div>
						<input
							type='text'
							value={decodeInput}
							onChange={(e) => setDecodeInput(e.target.value)}
							placeholder='Paste a UUID or ULID to detect version...'
							className='w-full rounded border border-border bg-zinc-800 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent'
							aria-label='UUID decode input'
						/>
						{decodeInput.trim() && validationStatus !== null && (
							<div className='mt-2 flex items-center gap-2'>
								{validationStatus ? (
									<span
										data-testid='validation-badge'
										className='inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400'
									>
										✓ Valid
									</span>
								) : (
									<span
										data-testid='validation-badge'
										className='inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400'
									>
										✗ Invalid
									</span>
								)}
							</div>
						)}
						{decodeResult && (
							<div className='mt-2 rounded border border-border bg-zinc-800/50 px-3 py-2 font-mono text-xs text-foreground'>
								Detected:{" "}
								<span className='text-accent font-semibold'>
									{decodeResult.summary}
								</span>
								{decodeResult.details && (
									<div className='mt-2 space-y-1 border-t border-border pt-2'>
										{decodeResult.details.map((d) => (
											<div key={d.label} className='flex gap-2'>
												<span className='text-muted-foreground'>
													{d.label}:
												</span>
												<span className='text-accent'>{d.value}</span>
											</div>
										))}
									</div>
								)}
							</div>
						)}
						{decodeInput.trim() && !decodeResult && (
							<div className='mt-2 text-xs text-muted-foreground'>
								Not a recognized UUID or ULID format
							</div>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
