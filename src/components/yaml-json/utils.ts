import yaml from "js-yaml";

export type Mode = "yaml-to-json" | "json-to-yaml";
export type IndentSize = 2 | 4;
export type NumberHandling = "keep" | "string" | "number";
export type NullHandling = "null" | "empty" | "omit";
export type QuoteStyle = "auto" | "always" | "minimal";
export type FlowStyle = "block" | "flow";
export type MultiDocMode = "all" | "first";

export interface RoundTripResult {
	safe: boolean;
	description?: string;
}

export function sortKeysDeep(obj: unknown): unknown {
	if (Array.isArray(obj)) return obj.map(sortKeysDeep);
	if (obj !== null && typeof obj === "object") {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
			sorted[key] = sortKeysDeep((obj as Record<string, unknown>)[key]);
		}
		return sorted;
	}
	return obj;
}

export function applyNumberHandling(
	obj: unknown,
	handling: NumberHandling,
): unknown {
	if (handling === "keep") return obj;
	if (Array.isArray(obj))
		return obj.map((v) => applyNumberHandling(v, handling));
	if (obj !== null && typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
			result[k] = applyNumberHandling(v, handling);
		}
		return result;
	}
	if (handling === "string" && typeof obj === "number") return String(obj);
	if (handling === "number" && typeof obj === "string") {
		const n = Number(obj);
		if (!isNaN(n) && obj.trim() !== "") return n;
	}
	return obj;
}

export function applyNullHandling(
	obj: unknown,
	handling: NullHandling,
): unknown {
	if (handling === "null") return obj;
	if (Array.isArray(obj))
		return obj.map((v) =>
			v === null && handling === "empty" ? "" : applyNullHandling(v, handling),
		);
	if (obj !== null && typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
			if (v === null && handling === "omit") continue;
			result[k] =
				v === null && handling === "empty"
					? ""
					: applyNullHandling(v, handling);
		}
		return result;
	}
	return obj;
}

export function detectAnchors(text: string): boolean {
	return /&\w+/.test(text) && /\*\w+/.test(text);
}

export function detectDuplicateKeys(text: string): string[] {
	const keys: Record<string, number> = {};
	const lines = text.split("\n");
	for (const line of lines) {
		const trimmed = line.trimStart();
		if (trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
		const match = trimmed.match(/^([^\s:]+)\s*:/);
		if (match) {
			const key = match[1];
			keys[key] = (keys[key] || 0) + 1;
		}
	}
	return Object.entries(keys)
		.filter(([, count]) => count > 1)
		.map(([key]) => key);
}

export function detectMultiDoc(text: string): boolean {
	const lines = text.split("\n");
	let docCount = 0;
	for (const line of lines) {
		if (line.trim() === "---") docCount++;
	}
	return (
		docCount >= 2 || (docCount === 1 && !text.trimStart().startsWith("---"))
	);
}

function getLoadSchema(strict: boolean): yaml.Schema {
	return strict ? yaml.JSON_SCHEMA : yaml.DEFAULT_SCHEMA;
}

export function yamlToJson(
	input: string,
	indent: IndentSize,
	sort: boolean,
	strict: boolean,
	numberHandling: NumberHandling,
	nullHandling: NullHandling,
	multiDocMode: MultiDocMode,
): string {
	const schema = getLoadSchema(strict);
	const isMulti = detectMultiDoc(input);

	let data: unknown;
	const hasDupes = detectDuplicateKeys(input).length > 0;
	if (isMulti) {
		const docs = yaml.loadAll(input, undefined, { schema, json: hasDupes });
		data = multiDocMode === "all" ? docs : docs[0];
	} else {
		data = yaml.load(input, { schema, json: hasDupes });
	}

	let processed = sort ? sortKeysDeep(data) : data;
	processed = applyNumberHandling(processed, numberHandling);
	processed = applyNullHandling(processed, nullHandling);
	return JSON.stringify(processed, null, indent);
}

export function jsonToYaml(
	input: string,
	indent: IndentSize,
	sort: boolean,
	quoteStyle: QuoteStyle,
	flowStyle: FlowStyle,
): string {
	const data = JSON.parse(input);
	const processed = sort ? sortKeysDeep(data) : data;
	return yaml.dump(processed, {
		indent,
		lineWidth: -1,
		noRefs: true,
		sortKeys: sort,
		forceQuotes: quoteStyle === "always",
		quotingType: quoteStyle === "minimal" ? "'" : '"',
		flowLevel: flowStyle === "flow" ? 0 : -1,
	});
}

export function checkRoundTrip(
	input: string,
	mode: Mode,
	indent: IndentSize,
	sort: boolean,
	strict: boolean,
	numberHandling: NumberHandling,
	nullHandling: NullHandling,
	multiDocMode: MultiDocMode,
	quoteStyle: QuoteStyle,
	flowStyle: FlowStyle,
): RoundTripResult {
	try {
		if (mode === "yaml-to-json") {
			const json = yamlToJson(
				input,
				indent,
				sort,
				strict,
				numberHandling,
				nullHandling,
				multiDocMode,
			);
			const backToYaml = jsonToYaml(json, indent, sort, quoteStyle, flowStyle);
			const jsonAgain = yamlToJson(
				backToYaml,
				indent,
				sort,
				strict,
				numberHandling,
				nullHandling,
				multiDocMode,
			);
			if (json === jsonAgain) return { safe: true };
			return {
				safe: false,
				description: "YAML→JSON→YAML→JSON produced different JSON output",
			};
		} else {
			const yamlOut = jsonToYaml(input, indent, sort, quoteStyle, flowStyle);
			const jsonAgain = yamlToJson(
				yamlOut,
				indent,
				sort,
				strict,
				"keep",
				"null",
				"first",
			);
			const yamlAgain = jsonToYaml(
				jsonAgain,
				indent,
				sort,
				quoteStyle,
				flowStyle,
			);
			if (yamlOut === yamlAgain) return { safe: true };
			return {
				safe: false,
				description: "JSON→YAML→JSON→YAML produced different YAML output",
			};
		}
	} catch {
		return { safe: false, description: "Round-trip conversion failed" };
	}
}
