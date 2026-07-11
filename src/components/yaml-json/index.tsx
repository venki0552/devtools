import { useState, useCallback, useEffect } from "react";
import { SEOHead } from "@/components/shared/SEOHead";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn, formatBytes } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { StatsBar } from "@/components/shared/StatsBar";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import {
	detectAnchors,
	detectDuplicateKeys,
	detectMultiDoc,
	yamlToJson,
	jsonToYaml,
	checkRoundTrip,
} from "./utils";
import type {
	Mode,
	IndentSize,
	NumberHandling,
	NullHandling,
	QuoteStyle,
	FlowStyle,
	MultiDocMode,
	RoundTripResult,
} from "./utils";

interface YamlJsonPrefs {
	mode: Mode;
	indent: IndentSize;
	sortKeys: boolean;
	strict: boolean;
	numberHandling: NumberHandling;
	nullHandling: NullHandling;
	quoteStyle: QuoteStyle;
	flowStyle: FlowStyle;
	multiDocMode: MultiDocMode;
}

interface ConversionWarnings {
	hasComments: boolean;
	anchorsResolved: boolean;
	duplicateKeys: string[];
	isMultiDoc: boolean;
}

const tool = TOOLS.find((t) => t.id === "yaml-json")!;

export function YamlJsonTool() {
	const [input, setInput] = useLocalStorage("devtools-yaml-json-input", "");
	const [prefs, setPrefs] = useLocalStorage<YamlJsonPrefs>(
		"devtools-yaml-json-prefs",
		{
			mode: "yaml-to-json",
			indent: 2,
			sortKeys: false,
			strict: false,
			numberHandling: "keep",
			nullHandling: "null",
			quoteStyle: "auto",
			flowStyle: "block",
			multiDocMode: "all",
		},
	);
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [processingTime, setProcessingTime] = useState<number | undefined>();
	const [warnings, setWarnings] = useState<ConversionWarnings>({
		hasComments: false,
		anchorsResolved: false,
		duplicateKeys: [],
		isMultiDoc: false,
	});
	const [roundTrip, setRoundTrip] = useState<RoundTripResult | null>(null);
	const debouncedInput = useDebounce(input, 300);

	const processInput = useCallback(
		(text: string) => {
			if (!text.trim()) {
				setOutput("");
				setError(null);
				setProcessingTime(undefined);
				setWarnings({
					hasComments: false,
					anchorsResolved: false,
					duplicateKeys: [],
					isMultiDoc: false,
				});
				setRoundTrip(null);
				return;
			}
			const start = performance.now();
			try {
				const newWarnings: ConversionWarnings = {
					hasComments: false,
					anchorsResolved: false,
					duplicateKeys: [],
					isMultiDoc: false,
				};

				if (prefs.mode === "yaml-to-json") {
					newWarnings.hasComments = /^\s*#/m.test(text);
					newWarnings.anchorsResolved = detectAnchors(text);
					newWarnings.duplicateKeys = detectDuplicateKeys(text);
					newWarnings.isMultiDoc = detectMultiDoc(text);
					setOutput(
						yamlToJson(
							text,
							prefs.indent,
							prefs.sortKeys,
							prefs.strict,
							prefs.numberHandling,
							prefs.nullHandling,
							prefs.multiDocMode,
						),
					);
				} else {
					setOutput(
						jsonToYaml(
							text,
							prefs.indent,
							prefs.sortKeys,
							prefs.quoteStyle,
							prefs.flowStyle,
						),
					);
				}
				setWarnings(newWarnings);
				setError(null);
			} catch (e) {
				setOutput("");
				setError(e instanceof Error ? e.message : "Conversion failed");
				setWarnings({
					hasComments: false,
					anchorsResolved: false,
					duplicateKeys: [],
					isMultiDoc: false,
				});
			}
			setProcessingTime(performance.now() - start);
			setRoundTrip(null);
		},
		[
			prefs.mode,
			prefs.indent,
			prefs.sortKeys,
			prefs.strict,
			prefs.numberHandling,
			prefs.nullHandling,
			prefs.quoteStyle,
			prefs.flowStyle,
			prefs.multiDocMode,
		],
	);

	useEffect(() => {
		processInput(debouncedInput);
	}, [debouncedInput, processInput]);

	const handleSwap = useCallback(() => {
		const newMode: Mode =
			prefs.mode === "yaml-to-json" ? "json-to-yaml" : "yaml-to-json";
		setPrefs((p) => ({ ...p, mode: newMode }));
		if (output) {
			setInput(output);
		}
	}, [prefs.mode, output, setPrefs, setInput]);

	const handleClear = useCallback(() => {
		setInput("");
		setOutput("");
		setError(null);
		setProcessingTime(undefined);
		setWarnings({
			hasComments: false,
			anchorsResolved: false,
			duplicateKeys: [],
			isMultiDoc: false,
		});
		setRoundTrip(null);
	}, [setInput]);

	const handleRoundTrip = useCallback(() => {
		if (!input.trim()) return;
		const result = checkRoundTrip(
			input,
			prefs.mode,
			prefs.indent,
			prefs.sortKeys,
			prefs.strict,
			prefs.numberHandling,
			prefs.nullHandling,
			prefs.multiDocMode,
			prefs.quoteStyle,
			prefs.flowStyle,
		);
		setRoundTrip(result);
	}, [input, prefs]);

	const inputLang = prefs.mode === "yaml-to-json" ? "yaml" : "json";
	const outputLang = prefs.mode === "yaml-to-json" ? "json" : "yaml";
	const inputBytes = new TextEncoder().encode(input).length;
	const outputBytes = new TextEncoder().encode(output).length;

	const btnClass =
		"h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600";
	const activeBtnClass =
		"h-8 rounded-md px-3 text-xs font-medium bg-accent/20 text-accent";
	const selectClass =
		"h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200";

	return (
		<>
			<SEOHead tool={tool} />
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<div className='flex rounded-md border border-border overflow-hidden'>
						<button
							onClick={() => setPrefs((p) => ({ ...p, mode: "yaml-to-json" }))}
							className={cn(
								"h-8 px-3 text-xs font-medium transition-colors",
								prefs.mode === "yaml-to-json"
									? "bg-accent text-zinc-950"
									: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
							)}
						>
							YAML → JSON
						</button>
						<button
							onClick={() => setPrefs((p) => ({ ...p, mode: "json-to-yaml" }))}
							className={cn(
								"h-8 px-3 text-xs font-medium transition-colors",
								prefs.mode === "json-to-yaml"
									? "bg-accent text-zinc-950"
									: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
							)}
						>
							JSON → YAML
						</button>
					</div>
					<button onClick={handleSwap} className={btnClass}>
						Swap
					</button>
					<select
						value={String(prefs.indent)}
						onChange={(e) =>
							setPrefs((p) => ({
								...p,
								indent: Number(e.target.value) as IndentSize,
							}))
						}
						className={selectClass}
						aria-label='Indent size'
					>
						<option value='2'>2 spaces</option>
						<option value='4'>4 spaces</option>
					</select>
					<button
						onClick={() => setPrefs((p) => ({ ...p, sortKeys: !p.sortKeys }))}
						className={cn(
							"h-8 rounded-md px-3 text-xs font-medium",
							prefs.sortKeys
								? "bg-accent/20 text-accent"
								: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
						)}
					>
						Sort Keys
					</button>
					<button
						onClick={() => setPrefs((p) => ({ ...p, strict: !p.strict }))}
						className={prefs.strict ? activeBtnClass : btnClass}
						title='Strict: fail on YAML 1.2 incompatibilities'
					>
						Strict
					</button>
					<CopyButton text={output} label='Copy' />
					<button onClick={handleClear} className={btnClass}>
						Clear
					</button>
				</ToolPageHeader>

				<div className='flex items-center gap-2 border-b border-border px-3 py-1.5 flex-wrap'>
					<select
						value={prefs.numberHandling}
						onChange={(e) =>
							setPrefs((p) => ({
								...p,
								numberHandling: e.target.value as NumberHandling,
							}))
						}
						className={selectClass}
						aria-label='Number handling'
					>
						<option value='keep'>Numbers: keep as-is</option>
						<option value='string'>Numbers: always string</option>
						<option value='number'>Numbers: always number</option>
					</select>
					<select
						value={prefs.nullHandling}
						onChange={(e) =>
							setPrefs((p) => ({
								...p,
								nullHandling: e.target.value as NullHandling,
							}))
						}
						className={selectClass}
						aria-label='Null handling'
					>
						<option value='null'>Null: explicit null</option>
						<option value='empty'>Null: empty string</option>
						<option value='omit'>Null: omit key</option>
					</select>
					{prefs.mode === "json-to-yaml" && (
						<>
							<select
								value={prefs.quoteStyle}
								onChange={(e) =>
									setPrefs((p) => ({
										...p,
										quoteStyle: e.target.value as QuoteStyle,
									}))
								}
								className={selectClass}
								aria-label='Quote style'
							>
								<option value='auto'>Quotes: auto</option>
								<option value='always'>Quotes: always</option>
								<option value='minimal'>Quotes: minimal</option>
							</select>
							<select
								value={prefs.flowStyle}
								onChange={(e) =>
									setPrefs((p) => ({
										...p,
										flowStyle: e.target.value as FlowStyle,
									}))
								}
								className={selectClass}
								aria-label='Flow style'
							>
								<option value='block'>Arrays: block</option>
								<option value='flow'>Arrays: flow</option>
							</select>
						</>
					)}
					{prefs.mode === "yaml-to-json" && warnings.isMultiDoc && (
						<select
							value={prefs.multiDocMode}
							onChange={(e) =>
								setPrefs((p) => ({
									...p,
									multiDocMode: e.target.value as MultiDocMode,
								}))
							}
							className={selectClass}
							aria-label='Multi-document mode'
						>
							<option value='all'>Convert all documents</option>
							<option value='first'>Convert only first</option>
						</select>
					)}
					<button
						onClick={handleRoundTrip}
						className={btnClass}
						disabled={!input.trim()}
					>
						Round-trip check
					</button>
					{roundTrip && (
						<span
							className={cn(
								"inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
								roundTrip.safe
									? "bg-green-500/10 text-green-500"
									: "bg-yellow-500/10 text-yellow-500",
							)}
						>
							{roundTrip.safe ? "Round-trip safe" : roundTrip.description}
						</span>
					)}
				</div>

				<div className='flex flex-1 overflow-hidden'>
					<div className='flex flex-1 flex-col border-r border-border'>
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<span className='text-[10px] text-muted-foreground'>
								Input ({inputLang.toUpperCase()})
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
						{warnings.hasComments && !error && (
							<div className='px-3 py-1'>
								<span className='inline-block rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-500'>
									YAML comments are not preserved in JSON
								</span>
							</div>
						)}
						{warnings.anchorsResolved && !error && (
							<div className='px-3 py-1'>
								<span className='inline-block rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-500'>
									Anchors resolved
								</span>
							</div>
						)}
						{warnings.duplicateKeys.length > 0 && !error && (
							<div className='px-3 py-1'>
								<span className='inline-block rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-500'>
									Duplicate keys found — last value wins (
									{warnings.duplicateKeys.join(", ")})
								</span>
							</div>
						)}
						{warnings.isMultiDoc && !error && (
							<div className='px-3 py-1'>
								<span className='inline-block rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-500'>
									Multi-document YAML detected (
									{prefs.multiDocMode === "all"
										? "converting all"
										: "first only"}
									)
								</span>
							</div>
						)}
					</div>

					<div className='flex flex-1 flex-col'>
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<span className='text-[10px] text-muted-foreground'>
								Output ({outputLang.toUpperCase()})
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
