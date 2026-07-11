import {
	useState,
	useCallback,
	useEffect,
	useRef,
	type DragEvent,
	type ChangeEvent,
} from "react";
import { SEOHead } from "@/components/shared/SEOHead";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn, formatBytes } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import SparkMD5 from "spark-md5";

/* ─── Types ─── */

type OutputFormat = "hex-lower" | "hex-upper" | "base64";
type InputMode = "text" | "file";
type Encoding = "utf-8" | "utf-16le" | "utf-16be" | "latin-1";

interface HashPrefs {
	format: OutputFormat;
	encoding: Encoding;
}

/* ─── Constants ─── */

const tool = TOOLS.find((t) => t.id === "hash")!;

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
const VERY_LARGE_FILE_THRESHOLD = 2 * 1024 * 1024 * 1024; // 2 GB

const ALGORITHMS: {
	name: string;
	webCrypto: string | null;
	security: string;
	securityColor: string;
}[] = [
	{
		name: "MD5",
		webCrypto: null,
		security: "Legacy",
		securityColor: "bg-red-500/15 text-red-400 border-red-500/30",
	},
	{
		name: "SHA-1",
		webCrypto: "SHA-1",
		security: "Deprecated",
		securityColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
	},
	{
		name: "SHA-256",
		webCrypto: "SHA-256",
		security: "Recommended",
		securityColor: "bg-green-500/15 text-green-400 border-green-500/30",
	},
	{
		name: "SHA-384",
		webCrypto: "SHA-384",
		security: "High security",
		securityColor: "bg-green-500/15 text-green-400 border-green-500/30",
	},
	{
		name: "SHA-512",
		webCrypto: "SHA-512",
		security: "High security",
		securityColor: "bg-green-500/15 text-green-400 border-green-500/30",
	},
];

/* ─── Utility Functions ─── */

function bufferToHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function formatHash(hex: string, format: OutputFormat): string {
	if (format === "hex-upper") return hex.toUpperCase();
	if (format === "base64") {
		const bytes = new Uint8Array(
			hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
		);
		const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
		return btoa(binary);
	}
	return hex;
}

function encodeText(input: string, encoding: Encoding): ArrayBuffer {
	if (encoding === "utf-8") {
		return new TextEncoder().encode(input).buffer as ArrayBuffer;
	}
	if (encoding === "latin-1") {
		const bytes = new Uint8Array(input.length);
		for (let i = 0; i < input.length; i++) {
			bytes[i] = input.charCodeAt(i) & 0xff;
		}
		return bytes.buffer as ArrayBuffer;
	}
	// UTF-16LE or UTF-16BE
	const buffer = new ArrayBuffer(input.length * 2);
	const view = new DataView(buffer);
	const le = encoding === "utf-16le";
	for (let i = 0; i < input.length; i++) {
		view.setUint16(i * 2, input.charCodeAt(i), le);
	}
	return buffer;
}

async function computeHashesFromBuffer(
	data: ArrayBuffer,
): Promise<Map<string, string>> {
	const results = new Map<string, string>();

	// MD5 via spark-md5 ArrayBuffer API
	const spark = new SparkMD5.ArrayBuffer();
	spark.append(data);
	results.set("MD5", spark.end());

	// Web Crypto hashes in parallel
	const webCryptoAlgos = ALGORITHMS.filter((a) => a.webCrypto);
	const promises = webCryptoAlgos.map(async (algo) => {
		const hashBuffer = await crypto.subtle.digest(algo.webCrypto!, data);
		return { name: algo.name, hex: bufferToHex(hashBuffer) };
	});

	const cryptoResults = await Promise.all(promises);
	for (const r of cryptoResults) {
		results.set(r.name, r.hex);
	}

	return results;
}

async function readFileInChunks(
	file: File,
	onProgress: (loaded: number) => void,
	signal: AbortSignal,
): Promise<ArrayBuffer> {
	if (file.size <= CHUNK_SIZE) {
		const buffer = await file.arrayBuffer();
		onProgress(file.size);
		return buffer;
	}

	const chunks: Uint8Array[] = [];
	let offset = 0;

	while (offset < file.size) {
		if (signal.aborted) throw new DOMException("Aborted", "AbortError");
		const end = Math.min(offset + CHUNK_SIZE, file.size);
		const slice = file.slice(offset, end);
		const buffer = await slice.arrayBuffer();
		chunks.push(new Uint8Array(buffer));
		offset = end;
		onProgress(offset);
	}

	const result = new Uint8Array(file.size);
	let pos = 0;
	for (const chunk of chunks) {
		result.set(chunk, pos);
		pos += chunk.length;
	}

	return result.buffer as ArrayBuffer;
}

/* ─── Dropzone Component ─── */

interface DropzoneProps {
	file: File | null;
	progress: number | null;
	error: string | null;
	notice: string | null;
	needsConfirmation: boolean;
	onDrop: (files: FileList) => void;
	onConfirm: () => void;
	label: string;
}

function Dropzone({
	file,
	progress,
	error,
	notice,
	needsConfirmation,
	onDrop,
	onConfirm,
	label,
}: DropzoneProps) {
	const [dragOver, setDragOver] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setDragOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setDragOver(false);
			if (e.dataTransfer.files.length > 0) {
				onDrop(e.dataTransfer.files);
			}
		},
		[onDrop],
	);

	const handleClick = useCallback(() => {
		inputRef.current?.click();
	}, []);

	const handleFileChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			if (e.target.files && e.target.files.length > 0) {
				onDrop(e.target.files);
			}
		},
		[onDrop],
	);

	return (
		<div className='space-y-2 p-3'>
			<div
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				onClick={handleClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") handleClick();
				}}
				role='button'
				tabIndex={0}
				aria-label={label}
				className={cn(
					"flex min-h-30 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors",
					dragOver
						? "border-blue-500 bg-blue-500/10"
						: "border-border hover:border-muted-foreground/50",
				)}
			>
				<input
					ref={inputRef}
					type='file'
					className='hidden'
					onChange={handleFileChange}
					aria-hidden='true'
				/>
				{file ? (
					<div className='text-center'>
						<p className='text-sm font-medium text-foreground'>{file.name}</p>
						<p className='text-xs text-muted-foreground'>
							{formatBytes(file.size)}
						</p>
					</div>
				) : (
					<p className='text-sm text-muted-foreground'>
						Drop a file here or click to browse
					</p>
				)}
			</div>

			{progress !== null && progress < 100 && (
				<div className='space-y-1'>
					<div className='h-2 rounded-full bg-zinc-700'>
						<div
							className='h-2 rounded-full bg-blue-500 transition-all'
							style={{ width: `${progress}%` }}
							role='progressbar'
							aria-valuenow={Math.round(progress)}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label='File reading progress'
						/>
					</div>
					<p className='text-[10px] text-muted-foreground'>
						Reading… {Math.round(progress)}%
					</p>
				</div>
			)}

			{needsConfirmation && (
				<div
					className='flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400'
					role='alert'
				>
					<span>This file is over 2 GB. This may take a while.</span>
					<button
						onClick={(e) => {
							e.stopPropagation();
							onConfirm();
						}}
						className='ml-auto rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500'
					>
						Continue
					</button>
				</div>
			)}

			{notice && (
				<p className='text-[10px] text-amber-400' role='status'>
					{notice}
				</p>
			)}

			{error && <ErrorBox error={error} />}
		</div>
	);
}

/* ─── Main Component ─── */

export function HashTool() {
	const [mode, setMode] = useState<InputMode>("text");
	const [input, setInput] = useLocalStorage("devtools-hash-input", "");
	const [prefs, setPrefs] = useLocalStorage<HashPrefs>("devtools-hash-prefs", {
		format: "hex-lower",
		encoding: "utf-8",
	});
	const [hashes, setHashes] = useState<Map<string, string>>(new Map());
	const [computing, setComputing] = useState(false);
	const debouncedInput = useDebounce(input, 300);
	const abortRef = useRef(0);

	// Fallback for stored prefs without encoding
	const encoding: Encoding = prefs.encoding || "utf-8";

	// Compare mode
	const [compareMode, setCompareMode] = useState(false);
	const [compareInput, setCompareInput] = useState("");
	const [compareHashes, setCompareHashes] = useState<Map<string, string>>(
		new Map(),
	);
	const debouncedCompareInput = useDebounce(compareInput, 300);
	const compareAbortRef = useRef(0);

	// File mode – primary
	const [file, setFile] = useState<File | null>(null);
	const [fileProgress, setFileProgress] = useState<number | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const [fileNotice, setFileNotice] = useState<string | null>(null);
	const [fileLargeConfirmed, setFileLargeConfirmed] = useState(false);
	const fileAbortRef = useRef<AbortController | null>(null);

	// File mode – compare
	const [compareFile, setCompareFile] = useState<File | null>(null);
	const [compareFileProgress, setCompareFileProgress] = useState<number | null>(
		null,
	);
	const [compareFileError, setCompareFileError] = useState<string | null>(null);
	const [compareFileNotice, setCompareFileNotice] = useState<string | null>(
		null,
	);
	const [compareFileLargeConfirmed, setCompareFileLargeConfirmed] =
		useState(false);
	const compareFileAbortRef = useRef<AbortController | null>(null);

	// Cleanup on unmount
	useEffect(() => {
		const fileAbort = fileAbortRef.current;
		const compareFileAbort = compareFileAbortRef.current;
		return () => {
			fileAbort?.abort();
			compareFileAbort?.abort();
		};
	}, []);

	/* ─── Text hashing ─── */

	useEffect(() => {
		if (mode !== "text") return;
		if (!debouncedInput.trim()) {
			setHashes(new Map());
			return;
		}

		const id = ++abortRef.current;
		setComputing(true);

		const data = encodeText(debouncedInput, encoding);
		computeHashesFromBuffer(data).then((results) => {
			if (id === abortRef.current) {
				setHashes(results);
				setComputing(false);
			}
		});
	}, [debouncedInput, encoding, mode]);

	useEffect(() => {
		if (mode !== "text" || !compareMode) return;
		if (!debouncedCompareInput.trim()) {
			setCompareHashes(new Map());
			return;
		}

		const id = ++compareAbortRef.current;
		const data = encodeText(debouncedCompareInput, encoding);
		computeHashesFromBuffer(data).then((results) => {
			if (id === compareAbortRef.current) {
				setCompareHashes(results);
			}
		});
	}, [debouncedCompareInput, encoding, mode, compareMode]);

	/* ─── File hashing helper ─── */

	const hashFile = useCallback(
		async (
			targetFile: File,
			setProgress: (p: number | null) => void,
			setError: (e: string | null) => void,
			setResults: (h: Map<string, string>) => void,
			abortCtrlRef: React.MutableRefObject<AbortController | null>,
		) => {
			abortCtrlRef.current?.abort();
			const controller = new AbortController();
			abortCtrlRef.current = controller;

			setError(null);
			setResults(new Map());

			const isLarge = targetFile.size > LARGE_FILE_THRESHOLD;
			if (isLarge) setProgress(0);

			try {
				const buffer = await readFileInChunks(
					targetFile,
					(loaded) => {
						if (isLarge) {
							setProgress((loaded / targetFile.size) * 100);
						}
					},
					controller.signal,
				);

				if (controller.signal.aborted) return;

				setComputing(true);
				const results = await computeHashesFromBuffer(buffer);
				if (!controller.signal.aborted) {
					setResults(results);
					setProgress(null);
					setComputing(false);
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") return;
				setError(err instanceof Error ? err.message : "Failed to read file");
				setProgress(null);
				setComputing(false);
			}
		},
		[],
	);

	/* ─── File drop handlers ─── */

	const handleFileDrop = useCallback(
		(files: FileList) => {
			setFileError(null);
			setFileNotice(null);
			setFileLargeConfirmed(false);

			if (files.length > 1) {
				setFileNotice("Hashing first file only");
			}

			const droppedFile = files[0];
			setFile(droppedFile);

			if (droppedFile.size > VERY_LARGE_FILE_THRESHOLD) {
				return; // Needs explicit confirmation
			}

			hashFile(
				droppedFile,
				setFileProgress,
				setFileError,
				setHashes,
				fileAbortRef,
			);
		},
		[hashFile],
	);

	const handleFileConfirm = useCallback(() => {
		if (!file) return;
		setFileLargeConfirmed(true);
		hashFile(file, setFileProgress, setFileError, setHashes, fileAbortRef);
	}, [file, hashFile]);

	const handleCompareFileDrop = useCallback(
		(files: FileList) => {
			setCompareFileError(null);
			setCompareFileNotice(null);
			setCompareFileLargeConfirmed(false);

			if (files.length > 1) {
				setCompareFileNotice("Hashing first file only");
			}

			const droppedFile = files[0];
			setCompareFile(droppedFile);

			if (droppedFile.size > VERY_LARGE_FILE_THRESHOLD) {
				return;
			}

			hashFile(
				droppedFile,
				setCompareFileProgress,
				setCompareFileError,
				setCompareHashes,
				compareFileAbortRef,
			);
		},
		[hashFile],
	);

	const handleCompareFileConfirm = useCallback(() => {
		if (!compareFile) return;
		setCompareFileLargeConfirmed(true);
		hashFile(
			compareFile,
			setCompareFileProgress,
			setCompareFileError,
			setCompareHashes,
			compareFileAbortRef,
		);
	}, [compareFile, hashFile]);

	/* ─── Actions ─── */

	const handleClear = useCallback(() => {
		setInput("");
		setHashes(new Map());
		setCompareInput("");
		setCompareHashes(new Map());
		setFile(null);
		setCompareFile(null);
		setFileProgress(null);
		setCompareFileProgress(null);
		setFileError(null);
		setCompareFileError(null);
		setFileNotice(null);
		setCompareFileNotice(null);
		setFileLargeConfirmed(false);
		setCompareFileLargeConfirmed(false);
		fileAbortRef.current?.abort();
		compareFileAbortRef.current?.abort();
	}, [setInput]);

	const setFormat = useCallback(
		(format: OutputFormat) => {
			setPrefs((p) => ({ ...p, format }));
		},
		[setPrefs],
	);

	const setEncodingPref = useCallback(
		(enc: Encoding) => {
			setPrefs((p) => ({ ...p, encoding: enc }));
		},
		[setPrefs],
	);

	const toggleCompare = useCallback(() => {
		setCompareMode((prev) => {
			if (prev) {
				setCompareHashes(new Map());
				setCompareInput("");
				setCompareFile(null);
				setCompareFileProgress(null);
				setCompareFileError(null);
				setCompareFileNotice(null);
				setCompareFileLargeConfirmed(false);
				compareFileAbortRef.current?.abort();
			}
			return !prev;
		});
	}, []);

	/* ─── Derived values ─── */

	const allHashesText = ALGORITHMS.map((algo) => {
		const raw = hashes.get(algo.name);
		return raw ? `${algo.name}: ${formatHash(raw, prefs.format)}` : null;
	})
		.filter(Boolean)
		.join("\n");

	const needsFileConfirmation =
		file !== null &&
		file.size > VERY_LARGE_FILE_THRESHOLD &&
		!fileLargeConfirmed;

	const needsCompareFileConfirmation =
		compareFile !== null &&
		compareFile.size > VERY_LARGE_FILE_THRESHOLD &&
		!compareFileLargeConfirmed;

	return (
		<>
			<SEOHead tool={tool} />
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					{/* Output format selector */}
					<select
						value={prefs.format}
						onChange={(e) => setFormat(e.target.value as OutputFormat)}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='Output format'
					>
						<option value='hex-lower'>Lowercase Hex</option>
						<option value='hex-upper'>Uppercase Hex</option>
						<option value='base64'>Base64</option>
					</select>

					{/* Encoding selector (text mode only) */}
					{mode === "text" && (
						<select
							value={encoding}
							onChange={(e) => setEncodingPref(e.target.value as Encoding)}
							className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
							aria-label='Input encoding'
						>
							<option value='utf-8'>UTF-8</option>
							<option value='utf-16le'>UTF-16LE</option>
							<option value='utf-16be'>UTF-16BE</option>
							<option value='latin-1'>Latin-1</option>
						</select>
					)}

					{/* Compare toggle */}
					<button
						onClick={toggleCompare}
						className={cn(
							"h-8 rounded-md px-3 text-xs font-medium",
							compareMode
								? "bg-blue-600 text-white hover:bg-blue-500"
								: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
						)}
					>
						Compare
					</button>

					<CopyButton text={allHashesText} label='Copy All' />
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
				</ToolPageHeader>

				<div className='flex flex-1 flex-col overflow-hidden'>
					{/* Mode tabs */}
					<div className='flex border-b border-border'>
						<button
							onClick={() => setMode("text")}
							className={cn(
								"px-4 py-2 text-xs font-medium transition-colors",
								mode === "text"
									? "border-b-2 border-blue-500 text-blue-400"
									: "text-muted-foreground hover:text-foreground",
							)}
							aria-label='Text input mode'
						>
							Text
						</button>
						<button
							onClick={() => setMode("file")}
							className={cn(
								"px-4 py-2 text-xs font-medium transition-colors",
								mode === "file"
									? "border-b-2 border-blue-500 text-blue-400"
									: "text-muted-foreground hover:text-foreground",
							)}
							aria-label='File input mode'
						>
							File
						</button>
					</div>

					{/* Input area */}
					{mode === "text" ? (
						<div
							className={cn(
								"border-b border-border",
								compareMode && "grid grid-cols-2 divide-x divide-border",
							)}
						>
							{/* Input A */}
							<div>
								<div className='flex items-center justify-between border-b border-border px-3 py-1'>
									<span className='text-[10px] text-muted-foreground'>
										{compareMode ? "Input A" : "Input"} (
										{encoding.toUpperCase()})
									</span>
									<span className='text-[10px] text-muted-foreground'>
										{input.length.toLocaleString()} chars
									</span>
								</div>
								<textarea
									value={input}
									onChange={(e) => setInput(e.target.value)}
									placeholder='Type or paste text to hash...'
									className='w-full resize-none bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none'
									rows={6}
									aria-label='Hash input'
								/>
							</div>

							{/* Input B (compare) */}
							{compareMode && (
								<div>
									<div className='flex items-center justify-between border-b border-border px-3 py-1'>
										<span className='text-[10px] text-muted-foreground'>
											Input B ({encoding.toUpperCase()})
										</span>
										<span className='text-[10px] text-muted-foreground'>
											{compareInput.length.toLocaleString()} chars
										</span>
									</div>
									<textarea
										value={compareInput}
										onChange={(e) => setCompareInput(e.target.value)}
										placeholder='Type or paste text to compare...'
										className='w-full resize-none bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none'
										rows={6}
										aria-label='Compare hash input'
									/>
								</div>
							)}
						</div>
					) : (
						<div
							className={cn(
								"border-b border-border",
								compareMode && "grid grid-cols-2 divide-x divide-border",
							)}
						>
							<Dropzone
								file={file}
								progress={fileProgress}
								error={fileError}
								notice={fileNotice}
								needsConfirmation={needsFileConfirmation}
								onDrop={handleFileDrop}
								onConfirm={handleFileConfirm}
								label='Drop file to hash'
							/>
							{compareMode && (
								<Dropzone
									file={compareFile}
									progress={compareFileProgress}
									error={compareFileError}
									notice={compareFileNotice}
									needsConfirmation={needsCompareFileConfirmation}
									onDrop={handleCompareFileDrop}
									onConfirm={handleCompareFileConfirm}
									label='Drop file to compare'
								/>
							)}
						</div>
					)}

					{/* Hash results */}
					<div className='flex-1 overflow-y-auto p-4'>
						<div className='space-y-2'>
							{ALGORITHMS.map((algo) => {
								const raw = hashes.get(algo.name);
								const display = raw ? formatHash(raw, prefs.format) : "—";
								const compareRaw = compareHashes.get(algo.name);
								const compareDisplay = compareRaw
									? formatHash(compareRaw, prefs.format)
									: "—";
								const showMatch = compareMode && raw && compareRaw;
								const isMatch = showMatch && raw === compareRaw;

								return (
									<div
										key={algo.name}
										className='rounded-md border border-border bg-panel'
									>
										{/* Primary hash row */}
										<div className='flex items-center gap-3 px-3 py-2'>
											{/* Algorithm badge */}
											<div className='flex shrink-0 items-center gap-2'>
												<span className='text-xs font-medium w-16'>
													{algo.name}
												</span>
												<span
													className={cn(
														"rounded-full border px-2 py-0.5 text-[10px] font-medium",
														algo.securityColor,
													)}
												>
													{algo.security}
												</span>
											</div>
											{/* Hash value */}
											<span
												className={cn(
													"flex-1 font-mono text-xs break-all",
													raw
														? "text-panel-foreground"
														: "text-muted-foreground",
												)}
											>
												{computing && !raw ? "..." : display}
											</span>
											{/* Copy button */}
											{raw && (
												<CopyButton
													text={formatHash(raw, prefs.format)}
													className='shrink-0'
												/>
											)}
											{/* Match indicator */}
											{showMatch && (
												<span
													className={cn(
														"shrink-0 text-sm font-bold",
														isMatch ? "text-green-400" : "text-red-400",
													)}
													aria-label={isMatch ? "Match" : "No match"}
												>
													{isMatch ? "✓" : "✗"}
												</span>
											)}
										</div>

										{/* Compare hash row */}
										{compareMode && (
											<div className='flex items-center gap-3 border-t border-border/50 px-3 py-1.5 pl-29'>
												<span
													className={cn(
														"flex-1 break-all font-mono text-xs",
														compareRaw
															? "text-panel-foreground"
															: "text-muted-foreground",
													)}
												>
													{compareDisplay}
												</span>
												{compareRaw && (
													<CopyButton
														text={formatHash(compareRaw, prefs.format)}
														className='shrink-0'
													/>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
