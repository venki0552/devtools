import { useState, useCallback, useEffect, useMemo } from "react";
import { SEOHead } from "@/components/shared/SEOHead";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { useHistory } from "@/lib/use-history";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { HistoryPanel } from "@/components/shared/HistoryPanel";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import {
	ShieldAlert,
	Clock,
	AlertTriangle,
	ChevronDown,
	ChevronRight,
} from "lucide-react";

const tool = TOOLS.find((t) => t.id === "jwt")!;

interface JwtParts {
	header: Record<string, unknown>;
	payload: Record<string, unknown>;
	signatureRaw: string;
	rawSegments: [string, string, string];
}

function base64UrlDecode(str: string): string {
	let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
	const pad = base64.length % 4;
	if (pad === 2) base64 += "==";
	else if (pad === 3) base64 += "=";
	return decodeURIComponent(
		atob(base64)
			.split("")
			.map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
			.join(""),
	);
}

function decodeJwt(token: string): {
	parts: JwtParts | null;
	error: string | null;
} {
	const trimmed = token.trim();
	if (!trimmed) return { parts: null, error: null };

	const segments = trimmed.split(".");
	if (segments.length !== 3) {
		return {
			parts: null,
			error: `Expected 3 parts separated by dots, got ${segments.length}`,
		};
	}

	try {
		const header = JSON.parse(base64UrlDecode(segments[0])) as Record<
			string,
			unknown
		>;
		const payload = JSON.parse(base64UrlDecode(segments[1])) as Record<
			string,
			unknown
		>;
		return {
			parts: {
				header,
				payload,
				signatureRaw: segments[2],
				rawSegments: [segments[0], segments[1], segments[2]],
			},
			error: null,
		};
	} catch (e) {
		return {
			parts: null,
			error: e instanceof Error ? e.message : "Failed to decode JWT",
		};
	}
}

const ALG_COLORS: Record<string, string> = {
	RS256: "bg-green-500/15 text-green-400 border-green-500/30",
	RS384: "bg-green-500/15 text-green-400 border-green-500/30",
	RS512: "bg-green-500/15 text-green-400 border-green-500/30",
	ES256: "bg-green-500/15 text-green-400 border-green-500/30",
	ES384: "bg-green-500/15 text-green-400 border-green-500/30",
	ES512: "bg-green-500/15 text-green-400 border-green-500/30",
	PS256: "bg-green-500/15 text-green-400 border-green-500/30",
	HS256: "bg-amber-500/15 text-amber-400 border-amber-500/30",
	HS384: "bg-amber-500/15 text-amber-400 border-amber-500/30",
	HS512: "bg-amber-500/15 text-amber-400 border-amber-500/30",
	none: "bg-red-500/15 text-red-400 border-red-500/30",
};

const CLAIM_LABELS: Record<string, string> = {
	iss: "Issuer",
	sub: "Subject",
	aud: "Audience",
	exp: "Expiration",
	iat: "Issued At",
	nbf: "Not Before",
	jti: "JWT ID",
};

function getExpStatus(exp: number): {
	label: string;
	className: string;
	detail: string;
} {
	const now = Math.floor(Date.now() / 1000);
	const diff = exp - now;

	if (diff < 0) {
		const ago = Math.abs(diff);
		const detail =
			ago < 60
				? `${ago}s ago`
				: ago < 3600
					? `${Math.floor(ago / 60)}m ago`
					: ago < 86400
						? `${Math.floor(ago / 3600)}h ago`
						: `${Math.floor(ago / 86400)}d ago`;
		return {
			label: "Expired",
			className: "bg-red-500/15 text-red-400",
			detail: `Expired ${detail}`,
		};
	}
	if (diff < 300) {
		return {
			label: "Expiring soon",
			className: "bg-amber-500/15 text-amber-400",
			detail: `Expires in ${diff}s`,
		};
	}
	const detail =
		diff < 60
			? `${diff}s`
			: diff < 3600
				? `${Math.floor(diff / 60)}m`
				: diff < 86400
					? `${Math.floor(diff / 3600)}h`
					: `${Math.floor(diff / 86400)}d`;
	return {
		label: "Valid",
		className: "bg-green-500/15 text-green-400",
		detail: `Expires in ${detail}`,
	};
}

function formatTimestamp(ts: number): string {
	return new Date(ts * 1000).toLocaleString();
}

function base64UrlToHex(str: string): string {
	if (!str) return "";
	try {
		let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
		const pad = base64.length % 4;
		if (pad === 2) base64 += "==";
		else if (pad === 3) base64 += "=";
		const binary = atob(base64);
		return Array.from(binary, (c) =>
			c.charCodeAt(0).toString(16).padStart(2, "0"),
		).join(" ");
	} catch {
		return "(unable to decode)";
	}
}

function isNestedJwt(value: unknown): boolean {
	if (typeof value !== "string") return false;
	const jwtParts = value.split(".");
	if (jwtParts.length !== 3) return false;
	if (!jwtParts[0].startsWith("eyJ")) return false;
	try {
		JSON.parse(base64UrlDecode(jwtParts[0]));
		JSON.parse(base64UrlDecode(jwtParts[1]));
		return true;
	} catch {
		return false;
	}
}

export function JwtTool() {
	const [input, setInput] = useLocalStorage("devtools-jwt-input", "");
	const [error, setError] = useState<string | null>(null);
	const [parts, setParts] = useState<JwtParts | null>(null);
	const [showHistory, setShowHistory] = useState(false);
	const [showRawHeader, setShowRawHeader] = useState(false);
	const [showRawPayload, setShowRawPayload] = useState(false);
	const [showRawSignature, setShowRawSignature] = useState(true);
	const [expandedNested, setExpandedNested] = useState<Set<string>>(new Set());
	const { entries, addEntry, removeEntry, clearHistory } = useHistory(
		"devtools-jwt-history",
	);
	const debouncedInput = useDebounce(input, 300);

	useEffect(() => {
		const result = decodeJwt(debouncedInput);
		setParts(result.parts);
		setError(result.error);
		setShowRawHeader(false);
		setShowRawPayload(false);
		setShowRawSignature(true);
		setExpandedNested(new Set());
		if (result.parts && debouncedInput.trim()) {
			addEntry(debouncedInput.trim());
		}
	}, [debouncedInput, addEntry]);

	const handleClear = useCallback(() => {
		setInput("");
		setParts(null);
		setError(null);
		setShowRawHeader(false);
		setShowRawPayload(false);
		setShowRawSignature(true);
		setExpandedNested(new Set());
	}, [setInput]);

	const toggleNestedJwt = useCallback((key: string) => {
		setExpandedNested((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const algName = parts?.header?.alg as string | undefined;
	const algColor = algName
		? (ALG_COLORS[algName] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")
		: "";

	// Re-compute exp status every second
	const [, setTick] = useState(0);
	useEffect(() => {
		if (!parts?.payload?.exp) return;
		const id = setInterval(() => setTick((t) => t + 1), 1000);
		return () => clearInterval(id);
	}, [parts?.payload?.exp]);

	const liveExpStatus = useMemo(() => {
		if (!parts?.payload?.exp || typeof parts.payload.exp !== "number")
			return null;
		return getExpStatus(parts.payload.exp);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [parts?.payload?.exp, Math.floor(Date.now() / 1000)]);

	return (
		<>
			<SEOHead tool={tool} />
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<CopyButton
						text={parts ? JSON.stringify(parts.payload, null, 2) : ""}
						label='Copy Payload'
					/>
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
					<button
						onClick={() => setShowHistory(true)}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						History
					</button>
				</ToolPageHeader>

				<div className='flex flex-1 overflow-hidden'>
					<div className='flex flex-1 flex-col overflow-y-auto p-4 gap-4'>
						{/* Security banner */}
						<div className='flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400'>
							<ShieldAlert className='h-4 w-4 shrink-0' />
							<span>
								This tool decodes JWTs client-side only. It does NOT verify the
								signature.
							</span>
						</div>

						{/* Input */}
						<div className='rounded-md border border-border overflow-hidden'>
							<div className='border-b border-border px-3 py-1'>
								<span className='text-[10px] text-muted-foreground'>
									JWT Token
								</span>
							</div>
							<MonacoWrapper
								value={input}
								onChange={(v) => setInput(v)}
								language='plaintext'
								height='120px'
								aria-label='JWT input'
								placeholder='Paste a JWT token here...'
							/>
						</div>

						{/* Color-coded token preview */}
						{parts &&
							input.trim() &&
							(() => {
								const segments = input.trim().split(".");
								if (segments.length !== 3) return null;
								return (
									<div
										className='rounded-md border border-border bg-zinc-900/50 p-3 font-mono text-xs break-all leading-relaxed'
										data-testid='jwt-color-preview'
									>
										<span
											className='text-purple-400'
											data-testid='jwt-part-header'
										>
											{segments[0]}
										</span>
										<span className='text-zinc-500'>.</span>
										<span
											className='text-orange-400'
											data-testid='jwt-part-payload'
										>
											{segments[1]}
										</span>
										<span className='text-zinc-500'>.</span>
										<span
											className='text-teal-400'
											data-testid='jwt-part-signature'
										>
											{segments[2]}
										</span>
									</div>
								);
							})()}

						{error && <ErrorBox error={error} />}

						{algName === "none" && (
							<div className='flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400'>
								<AlertTriangle className='h-4 w-4 shrink-0' />
								<span>
									Warning: This token uses alg:none — it has no signature and
									should not be trusted.
								</span>
							</div>
						)}

						{parts && (
							<div className='grid gap-4 md:grid-cols-1 lg:grid-cols-3'>
								{/* Header card */}
								<div className='rounded-md border border-border bg-panel'>
									<div className='flex items-center justify-between border-b border-border px-3 py-2'>
										<div className='flex items-center gap-2'>
											<span className='text-xs font-medium'>Header</span>
											{algName && (
												<span
													className={cn(
														"rounded-full border px-2 py-0.5 text-[10px] font-medium",
														algColor,
													)}
												>
													{algName}
												</span>
											)}
										</div>
										<button
											onClick={() => setShowRawHeader((v) => !v)}
											className='h-6 rounded bg-zinc-700 px-2 text-[10px] font-medium text-zinc-300 hover:bg-zinc-600'
											data-testid='toggle-raw-header'
										>
											{showRawHeader ? "Decoded" : "Raw"}
										</button>
									</div>
									<pre className='overflow-auto p-3 text-xs font-mono text-panel-foreground break-all'>
										{showRawHeader
											? parts.rawSegments[0]
											: JSON.stringify(parts.header, null, 2)}
									</pre>
								</div>

								{/* Payload card */}
								<div className='rounded-md border border-border bg-panel'>
									<div className='flex items-center justify-between border-b border-border px-3 py-2'>
										<div className='flex items-center gap-2'>
											<span className='text-xs font-medium'>Payload</span>
											{liveExpStatus && (
												<span
													className={cn(
														"rounded-full px-2 py-0.5 text-[10px] font-medium",
														liveExpStatus.className,
													)}
												>
													{liveExpStatus.label}
												</span>
											)}
										</div>
										<button
											onClick={() => setShowRawPayload((v) => !v)}
											className='h-6 rounded bg-zinc-700 px-2 text-[10px] font-medium text-zinc-300 hover:bg-zinc-600'
											data-testid='toggle-raw-payload'
										>
											{showRawPayload ? "Decoded" : "Raw"}
										</button>
									</div>
									{showRawPayload ? (
										<pre className='overflow-auto p-3 text-xs font-mono text-panel-foreground break-all'>
											{parts.rawSegments[1]}
										</pre>
									) : (
										<div className='p-3 space-y-2'>
											{Object.entries(parts.payload).map(([key, value]) => {
												const label = CLAIM_LABELS[key];
												const isTimestamp =
													["exp", "iat", "nbf"].includes(key) &&
													typeof value === "number";
												const isAudArray =
													key === "aud" && Array.isArray(value);
												const nested = isNestedJwt(value);
												return (
													<div key={key} className='space-y-1'>
														<div className='flex items-start gap-2 text-xs'>
															<span className='shrink-0 font-mono text-muted-foreground'>
																{key}
															</span>
															{label && (
																<span className='shrink-0 text-[10px] text-muted-foreground'>
																	({label})
																</span>
															)}
															<span className='font-mono text-panel-foreground break-all'>
																{isTimestamp ? (
																	<span className='flex items-center gap-1.5'>
																		<span>{String(value)}</span>
																		<span className='text-[10px] text-muted-foreground'>
																			({formatTimestamp(value as number)})
																		</span>
																		{key === "exp" && liveExpStatus && (
																			<span className='flex items-center gap-1 text-[10px]'>
																				<Clock className='h-3 w-3' />
																				{liveExpStatus.detail}
																			</span>
																		)}
																	</span>
																) : isAudArray ? (
																	<span className='flex flex-wrap gap-1'>
																		{(value as string[]).map((v, i) => (
																			<span
																				key={i}
																				className='inline-block rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-200'
																				data-testid='aud-chip'
																			>
																				{String(v)}
																			</span>
																		))}
																	</span>
																) : typeof value === "object" ? (
																	JSON.stringify(value)
																) : (
																	String(value)
																)}
															</span>
														</div>
														{nested && (
															<div className='ml-4'>
																<button
																	onClick={() => toggleNestedJwt(key)}
																	className='flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300'
																	data-testid={`nested-jwt-${key}`}
																>
																	{expandedNested.has(key) ? (
																		<ChevronDown className='h-3 w-3' />
																	) : (
																		<ChevronRight className='h-3 w-3' />
																	)}
																	Decode nested JWT
																</button>
																{expandedNested.has(key) &&
																	(() => {
																		const result = decodeJwt(value as string);
																		if (!result.parts)
																			return (
																				<span className='text-[10px] text-red-400'>
																					Failed to decode nested token
																				</span>
																			);
																		return (
																			<div
																				className='mt-1 space-y-1 rounded border border-border bg-zinc-900/50 p-2'
																				data-testid={`nested-jwt-content-${key}`}
																			>
																				<div>
																					<span className='text-[10px] font-medium text-purple-400'>
																						Nested Header
																					</span>
																					<pre className='text-[10px] font-mono text-panel-foreground'>
																						{JSON.stringify(
																							result.parts.header,
																							null,
																							2,
																						)}
																					</pre>
																				</div>
																				<div>
																					<span className='text-[10px] font-medium text-orange-400'>
																						Nested Payload
																					</span>
																					<pre className='text-[10px] font-mono text-panel-foreground'>
																						{JSON.stringify(
																							result.parts.payload,
																							null,
																							2,
																						)}
																					</pre>
																				</div>
																			</div>
																		);
																	})()}
															</div>
														)}
													</div>
												);
											})}
										</div>
									)}
								</div>

								{/* Signature card */}
								<div className='rounded-md border border-border bg-panel'>
									<div className='flex items-center justify-between border-b border-border px-3 py-2'>
										<span className='text-xs font-medium'>Signature</span>
										<div className='flex items-center gap-2'>
											<button
												onClick={() => setShowRawSignature((v) => !v)}
												className='h-6 rounded bg-zinc-700 px-2 text-[10px] font-medium text-zinc-300 hover:bg-zinc-600'
												data-testid='toggle-raw-signature'
											>
												{showRawSignature ? "Decoded" : "Raw"}
											</button>
											<CopyButton text={parts.signatureRaw} />
										</div>
									</div>
									<div className='p-3 space-y-2'>
										<pre className='overflow-auto text-xs font-mono text-panel-foreground break-all'>
											{showRawSignature
												? parts.signatureRaw || "(empty)"
												: parts.signatureRaw
													? base64UrlToHex(parts.signatureRaw)
													: "(empty)"}
										</pre>
										<p className='text-[10px] text-muted-foreground'>
											Signature not verified — this tool only decodes tokens.
										</p>
									</div>
								</div>
							</div>
						)}
					</div>

					{showHistory && (
						<HistoryPanel
							entries={entries}
							onRestore={(value) => {
								setInput(value);
								setShowHistory(false);
							}}
							onRemove={removeEntry}
							onClear={clearHistory}
							onClose={() => setShowHistory(false)}
						/>
					)}
				</div>
			</div>
		</>
	);
}
