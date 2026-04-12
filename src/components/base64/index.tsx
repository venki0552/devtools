import {
	useState,
	useCallback,
	useEffect,
	useRef,
	type DragEvent,
	type ChangeEvent,
} from "react";
import { Helmet } from "react-helmet-async";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn, formatBytes } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { StatsBar } from "@/components/shared/StatsBar";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import { Download, Upload, AlertTriangle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TabMode = "text-encode" | "text-decode" | "file-encode" | "file-decode";
type Variant = "standard" | "urlsafe" | "mime";
type LineWrap = "off" | "64" | "76" | "80";
type TextEncoding = "utf-8" | "utf-16" | "latin-1" | "ascii";

interface Base64Prefs {
	mode: TabMode;
	variant: Variant;
	lineWrap: LineWrap;
	textEncoding: TextEncoding;
	dataUriOutput: boolean;
}

interface FileInfo {
	name: string;
	size: number;
	type: string;
	bytes: Uint8Array;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const tool = TOOLS.find((t) => t.id === "base64")!;

const BASE64_REGEX = /^[A-Za-z0-9+/\n\r]+=*$/;
const BASE64_URL_REGEX = /^[A-Za-z0-9_\-\n\r]+=*$/;
const DATA_URI_REGEX = /^data:([^;,]+)?(?:;base64)?,(.*)$/;
const FILE_SIZE_WARN = 10 * 1024 * 1024; // 10 MB

const TAB_LABELS: Record<TabMode, string> = {
	"text-encode": "Text→Base64",
	"text-decode": "Base64→Text",
	"file-encode": "File→Base64",
	"file-decode": "Base64→File",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toUrlSafe(b64: string): string {
	return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromUrlSafe(b64url: string): string {
	let s = b64url.replace(/-/g, "+").replace(/_/g, "/");
	const pad = s.length % 4;
	if (pad === 2) s += "==";
	else if (pad === 3) s += "=";
	return s;
}

function applyLineWrap(
	b64: string,
	lineWrap: LineWrap,
	useCrlf: boolean,
): string {
	if (lineWrap === "off") return b64;
	const width = parseInt(lineWrap, 10);
	const sep = useCrlf ? "\r\n" : "\n";
	const lines: string[] = [];
	for (let i = 0; i < b64.length; i += width) {
		lines.push(b64.slice(i, i + width));
	}
	return lines.join(sep);
}

function textToBytes(text: string, encoding: TextEncoding): Uint8Array {
	switch (encoding) {
		case "utf-16": {
			const buf = new ArrayBuffer(text.length * 2);
			const view = new Uint16Array(buf);
			for (let i = 0; i < text.length; i++) {
				view[i] = text.charCodeAt(i);
			}
			return new Uint8Array(buf);
		}
		case "latin-1":
			return Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
		case "ascii":
			return Uint8Array.from(text, (c) => c.charCodeAt(0) & 0x7f);
		default:
			return new TextEncoder().encode(text);
	}
}

function bytesToText(bytes: Uint8Array, encoding: TextEncoding): string {
	switch (encoding) {
		case "utf-16":
			return new TextDecoder("utf-16le").decode(bytes);
		case "latin-1":
		case "ascii":
			return new TextDecoder("iso-8859-1").decode(bytes);
		default:
			return new TextDecoder("utf-8").decode(bytes);
	}
}

function bytesToBase64(bytes: Uint8Array, variant: Variant): string {
	const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
	const b64 = btoa(binary);
	return variant === "urlsafe" ? toUrlSafe(b64) : b64;
}

function base64ToBytes(input: string, variant: Variant): Uint8Array {
	const cleaned = input.trim().replace(/[\r\n\s]/g, "");
	const standard = variant === "urlsafe" ? fromUrlSafe(cleaned) : cleaned;
	const binary = atob(standard);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function encodeText(
	input: string,
	variant: Variant,
	encoding: TextEncoding,
	lineWrap: LineWrap,
): string {
	const bytes = textToBytes(input, encoding);
	let b64 = bytesToBase64(bytes, variant);
	const effectiveWrap =
		variant === "mime" && lineWrap === "off" ? "76" : lineWrap;
	b64 = applyLineWrap(b64, effectiveWrap, variant === "mime");
	return b64;
}

function looksLikeBase64(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length < 4) return false;
	return BASE64_REGEX.test(trimmed) || BASE64_URL_REGEX.test(trimmed);
}

function findInvalidBase64Chars(
	input: string,
	variant: Variant,
): string | null {
	const validChars =
		variant === "urlsafe" ? /^[A-Za-z0-9_\-=\s]*$/ : /^[A-Za-z0-9+/=\s]*$/;
	if (validChars.test(input)) return null;
	const pattern =
		variant === "urlsafe" ? /[^A-Za-z0-9_\-=\s]/ : /[^A-Za-z0-9+/=\s]/;
	const match = pattern.exec(input);
	if (match) {
		return `Invalid character '${match[0]}' at position ${match.index}`;
	}
	return null;
}

function hasBinaryContent(bytes: Uint8Array): boolean {
	const limit = Math.min(bytes.length, 8192);
	for (let i = 0; i < limit; i++) {
		const b = bytes[i];
		if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return true;
		if (b === 0x7f) return true;
	}
	return false;
}

function parseDataUri(input: string): { mime: string; base64: string } | null {
	const match = DATA_URI_REGEX.exec(input.trim());
	if (!match) return null;
	return { mime: match[1] || "application/octet-stream", base64: match[2] };
}

function isImageMime(mime: string): boolean {
	return mime.startsWith("image/");
}

function expansionRatioLabel(
	inputSize: number,
	outputSize: number,
	mode: TabMode,
): string | null {
	if (inputSize === 0 || outputSize === 0) return null;
	if (mode === "text-encode" || mode === "file-encode") {
		const pct = Math.round(((outputSize - inputSize) / inputSize) * 100);
		return `+${pct}% (encode)`;
	}
	const pct = Math.round(((inputSize - outputSize) / inputSize) * 100);
	return `-${pct}% (decode)`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Base64Tool() {
	const [input, setInput] = useLocalStorage("devtools-base64-input", "");
	const [prefs, setPrefs] = useLocalStorage<Base64Prefs>(
		"devtools-base64-prefs-v2",
		{
			mode: "text-encode",
			variant: "standard",
			lineWrap: "off",
			textEncoding: "utf-8",
			dataUriOutput: false,
		},
	);
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [processingTime, setProcessingTime] = useState<number | undefined>();
	const [binaryWarning, setBinaryWarning] = useState(false);
	const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
	const [fileSizeWarning, setFileSizeWarning] = useState(false);
	const [dragActive, setDragActive] = useState(false);
	const [decodedFileBlob, setDecodedFileBlob] = useState<Blob | null>(null);
	const [decodedMime, setDecodedMime] = useState("application/octet-stream");
	const [decodedSize, setDecodedSize] = useState(0);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const debouncedInput = useDebounce(input, 300);

	/* ---------- text encode / decode ---------- */

	const processText = useCallback(
		(
			text: string,
			mode: TabMode,
			variant: Variant,
			encoding: TextEncoding,
			lineWrap: LineWrap,
		) => {
			if (!text.trim()) {
				setOutput("");
				setError(null);
				setProcessingTime(undefined);
				setBinaryWarning(false);
				return;
			}
			const start = performance.now();
			try {
				if (mode === "text-encode") {
					setOutput(encodeText(text, variant, encoding, lineWrap));
					setError(null);
					setBinaryWarning(false);
				} else {
					const invalidChar = findInvalidBase64Chars(text.trim(), variant);
					if (invalidChar) {
						setOutput("");
						setError(invalidChar);
						setBinaryWarning(false);
						setProcessingTime(performance.now() - start);
						return;
					}
					const bytes = base64ToBytes(text, variant);
					const isBinary = hasBinaryContent(bytes);
					setBinaryWarning(isBinary);
					if (isBinary) {
						setDecodedFileBlob(new Blob([bytes as Uint8Array<ArrayBuffer>]));
						setDecodedMime("application/octet-stream");
						setDecodedSize(bytes.length);
					}
					setOutput(bytesToText(bytes, encoding));
					setError(null);
				}
			} catch (e) {
				setOutput("");
				setError(e instanceof Error ? e.message : "Failed to process input");
				setBinaryWarning(false);
			}
			setProcessingTime(performance.now() - start);
		},
		[],
	);

	useEffect(() => {
		if (prefs.mode === "text-encode" || prefs.mode === "text-decode") {
			processText(
				debouncedInput,
				prefs.mode,
				prefs.variant,
				prefs.textEncoding,
				prefs.lineWrap,
			);
		}
	}, [
		debouncedInput,
		prefs.mode,
		prefs.variant,
		prefs.textEncoding,
		prefs.lineWrap,
		processText,
	]);

	/* ---------- file → base64 ---------- */

	const processFileEncode = useCallback(
		(
			file: FileInfo,
			variant: Variant,
			lineWrap: LineWrap,
			dataUri: boolean,
		) => {
			const start = performance.now();
			try {
				let b64 = bytesToBase64(file.bytes, variant);
				const effectiveWrap =
					variant === "mime" && lineWrap === "off" ? "76" : lineWrap;
				b64 = applyLineWrap(b64, effectiveWrap, variant === "mime");
				const result = dataUri
					? `data:${file.type || "application/octet-stream"};base64,${b64}`
					: b64;
				setOutput(result);
				setError(null);
				if (isImageMime(file.type)) {
					setPreviewUrl(
						`data:${file.type};base64,${bytesToBase64(file.bytes, "standard")}`,
					);
				} else {
					setPreviewUrl(null);
				}
			} catch (e) {
				setOutput("");
				setError(e instanceof Error ? e.message : "Failed to encode file");
				setPreviewUrl(null);
			}
			setProcessingTime(performance.now() - start);
		},
		[],
	);

	useEffect(() => {
		if (prefs.mode === "file-encode" && fileInfo) {
			processFileEncode(
				fileInfo,
				prefs.variant,
				prefs.lineWrap,
				prefs.dataUriOutput,
			);
		}
	}, [
		prefs.mode,
		prefs.variant,
		prefs.lineWrap,
		prefs.dataUriOutput,
		fileInfo,
		processFileEncode,
	]);

	/* ---------- base64 → file ---------- */

	const processFileDecode = useCallback((text: string, variant: Variant) => {
		if (!text.trim()) {
			setOutput("");
			setError(null);
			setDecodedFileBlob(null);
			setDecodedMime("application/octet-stream");
			setDecodedSize(0);
			setPreviewUrl(null);
			setProcessingTime(undefined);
			return;
		}
		const start = performance.now();
		try {
			const parsed = parseDataUri(text);
			let bytes: Uint8Array;
			let mime = "application/octet-stream";
			if (parsed) {
				mime = parsed.mime;
				bytes = base64ToBytes(parsed.base64, variant);
			} else {
				const invalidChar = findInvalidBase64Chars(text.trim(), variant);
				if (invalidChar) {
					setOutput("");
					setError(invalidChar);
					setDecodedFileBlob(null);
					setPreviewUrl(null);
					setProcessingTime(performance.now() - start);
					return;
				}
				bytes = base64ToBytes(text, variant);
			}
			setDecodedFileBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
			setDecodedMime(mime);
			setDecodedSize(bytes.length);
			setOutput(`Decoded: ${formatBytes(bytes.length)} (${mime})`);
			setError(null);
			if (isImageMime(mime)) {
				const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
				setPreviewUrl(url);
			} else {
				setPreviewUrl(null);
			}
		} catch (e) {
			setOutput("");
			setError(e instanceof Error ? e.message : "Failed to decode base64");
			setDecodedFileBlob(null);
			setPreviewUrl(null);
		}
		setProcessingTime(performance.now() - start);
	}, []);

	useEffect(() => {
		if (prefs.mode === "file-decode") {
			processFileDecode(debouncedInput, prefs.variant);
		}
	}, [debouncedInput, prefs.mode, prefs.variant, processFileDecode]);

	/* cleanup object URLs */
	useEffect(() => {
		return () => {
			if (previewUrl && previewUrl.startsWith("blob:")) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl]);

	/* ---------- file handlers ---------- */

	const loadFile = useCallback((file: File) => {
		setFileSizeWarning(file.size > FILE_SIZE_WARN);
		const reader = new FileReader();
		reader.onload = () => {
			const bytes = new Uint8Array(reader.result as ArrayBuffer);
			setFileInfo({
				name: file.name,
				size: file.size,
				type: file.type || "application/octet-stream",
				bytes,
			});
		};
		reader.readAsArrayBuffer(file);
	}, []);

	const handleFileDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setDragActive(false);
			const file = e.dataTransfer.files[0];
			if (file) loadFile(file);
		},
		[loadFile],
	);

	const handleFileSelect = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) loadFile(file);
		},
		[loadFile],
	);

	const handleDownload = useCallback(() => {
		if (!decodedFileBlob) return;
		const url = URL.createObjectURL(decodedFileBlob);
		const a = document.createElement("a");
		a.href = url;
		const ext = decodedMime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
		a.download = `decoded.${ext}`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}, [decodedFileBlob, decodedMime]);

	/* ---------- general handlers ---------- */

	const handleInputChange = useCallback(
		(value: string) => {
			setInput(value);
			if (
				prefs.mode === "text-encode" &&
				value.trim().length > 8 &&
				looksLikeBase64(value)
			) {
				setPrefs((p) => ({ ...p, mode: "text-decode" }));
			}
		},
		[setInput, prefs.mode, setPrefs],
	);

	const handleClear = useCallback(() => {
		setInput("");
		setOutput("");
		setError(null);
		setProcessingTime(undefined);
		setBinaryWarning(false);
		setFileInfo(null);
		setFileSizeWarning(false);
		setDecodedFileBlob(null);
		setDecodedSize(0);
		setPreviewUrl(null);
	}, [setInput]);

	const switchTab = useCallback(
		(mode: TabMode) => {
			setPrefs((p) => ({ ...p, mode }));
			handleClear();
		},
		[setPrefs, handleClear],
	);

	/* ---------- stats ---------- */

	const isTextMode =
		prefs.mode === "text-encode" || prefs.mode === "text-decode";
	const isFileEncode = prefs.mode === "file-encode";
	const isFileDecode = prefs.mode === "file-decode";

	const inputBytes =
		isFileEncode && fileInfo
			? fileInfo.size
			: new TextEncoder().encode(input).length;
	const outputBytes = new TextEncoder().encode(output).length;
	const effectiveOutputBytes = isFileDecode ? decodedSize : outputBytes;
	const ratioLabel = expansionRatioLabel(
		inputBytes,
		effectiveOutputBytes,
		prefs.mode,
	);

	/* ---------- render ---------- */

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					{/* Mode tabs */}
					<div className='flex rounded-md border border-border overflow-hidden'>
						{(Object.keys(TAB_LABELS) as TabMode[]).map((m) => (
							<button
								key={m}
								onClick={() => switchTab(m)}
								className={cn(
									"h-8 px-3 text-xs font-medium transition-colors",
									prefs.mode === m
										? "bg-accent text-zinc-950"
										: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
								)}
							>
								{TAB_LABELS[m]}
							</button>
						))}
					</div>

					{/* Variant */}
					<select
						value={prefs.variant}
						onChange={(e) =>
							setPrefs((p) => ({
								...p,
								variant: e.target.value as Variant,
							}))
						}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='Base64 variant'
					>
						<option value='standard'>Standard</option>
						<option value='urlsafe'>URL-safe</option>
						<option value='mime'>MIME (RFC 2045)</option>
					</select>

					{/* Line wrap – encode modes only */}
					{(prefs.mode === "text-encode" || prefs.mode === "file-encode") && (
						<select
							value={prefs.lineWrap}
							onChange={(e) =>
								setPrefs((p) => ({
									...p,
									lineWrap: e.target.value as LineWrap,
								}))
							}
							className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
							aria-label='Line wrap'
						>
							<option value='off'>No wrap</option>
							<option value='64'>64 chars</option>
							<option value='76'>76 chars</option>
							<option value='80'>80 chars</option>
						</select>
					)}

					{/* Text encoding – text modes only */}
					{isTextMode && (
						<select
							value={prefs.textEncoding}
							onChange={(e) =>
								setPrefs((p) => ({
									...p,
									textEncoding: e.target.value as TextEncoding,
								}))
							}
							className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
							aria-label='Text encoding'
						>
							<option value='utf-8'>UTF-8</option>
							<option value='utf-16'>UTF-16</option>
							<option value='latin-1'>Latin-1</option>
							<option value='ascii'>ASCII</option>
						</select>
					)}

					{/* Data URI toggle – file-encode only */}
					{isFileEncode && (
						<label className='flex items-center gap-1.5 text-xs text-zinc-200'>
							<input
								type='checkbox'
								checked={prefs.dataUriOutput}
								onChange={(e) =>
									setPrefs((p) => ({
										...p,
										dataUriOutput: e.target.checked,
									}))
								}
								className='accent-accent'
							/>
							Data URI
						</label>
					)}

					<CopyButton text={output} label='Copy' />
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
				</ToolPageHeader>

				<div className='flex flex-1 overflow-hidden'>
					{/* ---- Input panel ---- */}
					<div className='flex flex-1 flex-col border-r border-border'>
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<span className='text-[10px] text-muted-foreground'>Input</span>
							<span className='text-[10px] text-muted-foreground'>
								{isFileEncode && fileInfo
									? formatBytes(fileInfo.size)
									: `${input.length.toLocaleString()} chars`}
							</span>
						</div>

						{isFileEncode ? (
							<div className='flex flex-1 flex-col'>
								<div
									onDragOver={(e) => {
										e.preventDefault();
										setDragActive(true);
									}}
									onDragLeave={() => setDragActive(false)}
									onDrop={handleFileDrop}
									onClick={() => fileInputRef.current?.click()}
									role='button'
									tabIndex={0}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ")
											fileInputRef.current?.click();
									}}
									aria-label='Drop file here or click to browse'
									className={cn(
										"flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 p-6 transition-colors",
										dragActive ? "bg-accent/10" : "hover:bg-zinc-800/50",
										!fileInfo &&
											"border-2 border-dashed border-border m-4 rounded-lg",
									)}
								>
									<input
										ref={fileInputRef}
										type='file'
										onChange={handleFileSelect}
										className='hidden'
										aria-label='File input'
									/>
									{fileInfo ? (
										<div className='w-full space-y-2 text-xs'>
											<div className='flex items-center gap-2'>
												<Upload className='h-4 w-4 text-muted-foreground' />
												<span className='font-medium'>{fileInfo.name}</span>
											</div>
											<div className='flex gap-4 text-muted-foreground'>
												<span>{formatBytes(fileInfo.size)}</span>
												<span>{fileInfo.type}</span>
											</div>
											{fileSizeWarning && (
												<div
													className='flex items-center gap-1.5 text-warning'
													role='alert'
												>
													<AlertTriangle className='h-3.5 w-3.5' />
													<span>
														Large file (&gt;10 MB) — may use significant browser
														memory
													</span>
												</div>
											)}
										</div>
									) : (
										<>
											<Upload className='h-8 w-8 text-muted-foreground' />
											<span className='text-xs text-muted-foreground'>
												Drop a file here or click to browse
											</span>
										</>
									)}
								</div>
							</div>
						) : (
							<div className='flex-1'>
								<MonacoWrapper
									value={input}
									onChange={handleInputChange}
									language='plaintext'
									height='100%'
									aria-label='Base64 input'
								/>
							</div>
						)}

						{error && (
							<div className='p-2'>
								<ErrorBox error={error} />
							</div>
						)}
					</div>

					{/* ---- Output panel ---- */}
					<div className='flex flex-1 flex-col'>
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<span className='text-[10px] text-muted-foreground'>Output</span>
							<div className='flex items-center gap-2'>
								{isFileDecode && decodedFileBlob && (
									<button
										onClick={handleDownload}
										className='inline-flex items-center gap-1 text-[10px] text-accent hover:underline'
										aria-label='Download decoded file'
									>
										<Download className='h-3 w-3' />
										Download
									</button>
								)}
								<span className='text-[10px] text-muted-foreground'>
									{isFileDecode
										? formatBytes(decodedSize)
										: formatBytes(outputBytes)}
								</span>
							</div>
						</div>

						{/* Binary warning for text-decode */}
						{binaryWarning && prefs.mode === "text-decode" && (
							<div
								className='flex items-center gap-2 bg-warning/10 px-3 py-1.5 text-xs text-warning'
								role='alert'
								aria-label='Binary data warning'
							>
								<AlertTriangle className='h-3.5 w-3.5 shrink-0' />
								<span>Output may be binary data</span>
								<button
									onClick={handleDownload}
									className='ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline'
								>
									<Download className='h-3 w-3' />
									Download instead
								</button>
							</div>
						)}

						<div className='flex-1'>
							<MonacoWrapper
								value={output}
								language='plaintext'
								readOnly
								height='100%'
								aria-label='Base64 output'
							/>
						</div>

						{/* Image preview */}
						{previewUrl && (
							<div className='border-t border-border p-3'>
								<span className='mb-2 block text-[10px] text-muted-foreground'>
									Image Preview
								</span>
								<img
									src={previewUrl}
									alt='Preview'
									className='max-h-48 max-w-full rounded border border-border object-contain'
								/>
							</div>
						)}
					</div>
				</div>

				<StatsBar
					inputChars={isFileEncode ? undefined : input.length}
					inputBytes={inputBytes}
					outputChars={output.length}
					outputBytes={isFileDecode ? decodedSize : outputBytes}
					processingTime={processingTime}
				/>
				{ratioLabel && (
					<div className='flex items-center gap-2 border-t border-border px-3 py-1 text-[10px] text-muted-foreground'>
						<span>Expansion ratio: {ratioLabel}</span>
					</div>
				)}
			</div>
		</>
	);
}
