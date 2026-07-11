import { useState, useEffect, useMemo, useCallback } from "react";
import { SEOHead } from "@/components/shared/SEOHead";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import {
	parse,
	print,
	buildSchema,
	isObjectType,
	isEnumType,
	isInterfaceType,
	isUnionType,
	isScalarType,
	isInputObjectType,
	type DocumentNode,
	type DefinitionNode,
	type OperationDefinitionNode,
	type FragmentDefinitionNode,
	type VariableDefinitionNode,
} from "graphql";
import {
	Trash2,
	Minimize2,
	Search,
	ChevronDown,
	ChevronRight,
	Check,
	X,
	AlertTriangle,
} from "lucide-react";

const tool = TOOLS.find((t) => t.id === "graphql")!;

// ─── Types ───────────────────────────────────────────────────────────────

type Mode = "formatter" | "schema" | "variables";

const MODE_TABS: { key: Mode; label: string }[] = [
	{ key: "formatter", label: "Query Formatter" },
	{ key: "schema", label: "Schema Explorer" },
	{ key: "variables", label: "Variables Inspector" },
];

interface OperationInfo {
	kind: "query" | "mutation" | "subscription" | "fragment";
	name: string;
	fields: string[];
	variables: { name: string; type: string }[];
	directives: string[];
	fragments: string[];
}

interface SchemaFieldInfo {
	name: string;
	type: string;
	args: { name: string; type: string; defaultValue?: string }[];
	description?: string;
	isDeprecated: boolean;
	deprecationReason?: string;
}

interface SchemaTypeInfo {
	name: string;
	kind: string;
	description?: string;
	fields?: SchemaFieldInfo[];
	enumValues?: {
		name: string;
		description?: string;
		isDeprecated: boolean;
		deprecationReason?: string;
	}[];
	interfaces?: string[];
	possibleTypes?: string[];
	usedBy: string[];
}

interface SchemaCategories {
	queries: string[];
	mutations: string[];
	subscriptions: string[];
	types: string[];
	inputTypes: string[];
	enums: string[];
	interfaces: string[];
	unions: string[];
	scalars: string[];
}

interface VariableCheck {
	name: string;
	expectedType: string;
	provided: boolean;
	typeMatch: "match" | "mismatch" | "unknown";
}

// ─── Utility Functions ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printType(type: any): string {
	if (type.kind === "NamedType") return type.name.value;
	if (type.kind === "NonNullType") return `${printType(type.type)}!`;
	if (type.kind === "ListType") return `[${printType(type.type)}]`;
	return "?";
}

function minifyGraphQL(source: string): string {
	const doc = parse(source);
	const printed = print(doc);
	return printed
		.split("\n")
		.map((l) => l.trim())
		.join(" ")
		.replace(/\s+/g, " ")
		.replace(/ ?\{ ?/g, "{")
		.replace(/ ?\} ?/g, "}")
		.replace(/ ?\( ?/g, "(")
		.replace(/ ?\) ?/g, ")")
		.replace(/ ?: ?/g, ":")
		.trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectDirectives(node: any): string[] {
	const directives = new Set<string>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function walk(n: any) {
		if (n.directives) {
			for (const d of n.directives) {
				let str = `@${d.name.value}`;
				if (d.arguments?.length) {
					str += `(${d.arguments
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						.map((a: any) => a.name.value)
						.join(", ")})`;
				}
				directives.add(str);
			}
		}
		if (n.selectionSet) {
			for (const sel of n.selectionSet.selections) {
				walk(sel);
			}
		}
	}
	walk(node);
	return Array.from(directives);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectFragmentSpreads(node: any): string[] {
	const frags = new Set<string>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function walk(n: any) {
		if (n.kind === "FragmentSpread") {
			frags.add(n.name.value);
		}
		if (n.selectionSet) {
			for (const sel of n.selectionSet.selections) {
				walk(sel);
			}
		}
	}
	walk(node);
	return Array.from(frags);
}

function extractOperations(doc: DocumentNode): OperationInfo[] {
	return doc.definitions.map((def: DefinitionNode) => {
		if (def.kind === "OperationDefinition") {
			const op = def as OperationDefinitionNode;
			const fields = op.selectionSet.selections.map((sel) => {
				if (sel.kind === "Field") return sel.name.value;
				if (sel.kind === "FragmentSpread") return `...${sel.name.value}`;
				if (sel.kind === "InlineFragment")
					return `... on ${sel.typeCondition?.name.value ?? "?"}`;
				return "?";
			});

			const variables = (op.variableDefinitions ?? []).map(
				(v: VariableDefinitionNode) => ({
					name: `$${v.variable.name.value}`,
					type: printType(v.type),
				}),
			);

			return {
				kind: op.operation as "query" | "mutation" | "subscription",
				name: op.name?.value ?? "(anonymous)",
				fields,
				variables,
				directives: collectDirectives(op),
				fragments: collectFragmentSpreads(op),
			};
		}

		if (def.kind === "FragmentDefinition") {
			const frag = def as FragmentDefinitionNode;
			const fields = frag.selectionSet.selections.map((sel) => {
				if (sel.kind === "Field") return sel.name.value;
				return "?";
			});

			return {
				kind: "fragment" as const,
				name: frag.name.value,
				fields,
				variables: [],
				directives: collectDirectives(frag),
				fragments: collectFragmentSpreads(frag),
			};
		}

		return {
			kind: "query" as const,
			name: "(unknown definition)",
			fields: [],
			variables: [],
			directives: [],
			fragments: [],
		};
	});
}

// ─── Schema Parsing ──────────────────────────────────────────────────────

const BUILTIN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);

function getBaseTypeName(typeStr: string): string {
	return typeStr.replace(/[[\]!]/g, "").trim();
}

function generateExampleSnippet(info: SchemaTypeInfo): string {
	if (!info.fields?.length) return "";
	const fields = info.fields
		.slice(0, 8)
		.map((f) => `  ${f.name}`)
		.join("\n");
	return `fragment ${info.name}Fields on ${info.name} {\n${fields}\n}`;
}

function parseSchemaSDL(sdl: string): {
	types: Map<string, SchemaTypeInfo>;
	categories: SchemaCategories;
	rootTypeNames: { query?: string; mutation?: string; subscription?: string };
	error: string | null;
} {
	const emptyCategories: SchemaCategories = {
		queries: [],
		mutations: [],
		subscriptions: [],
		types: [],
		inputTypes: [],
		enums: [],
		interfaces: [],
		unions: [],
		scalars: [],
	};
	const emptyResult = {
		types: new Map<string, SchemaTypeInfo>(),
		categories: emptyCategories,
		rootTypeNames: {},
		error: null,
	};
	if (!sdl.trim()) return emptyResult;

	try {
		const schema = buildSchema(sdl);
		const typeMap = schema.getTypeMap();
		const types = new Map<string, SchemaTypeInfo>();
		const categories: SchemaCategories = { ...emptyCategories };
		const reverseRefs = new Map<string, Set<string>>();

		const queryType = schema.getQueryType();
		const mutationType = schema.getMutationType();
		const subscriptionType = schema.getSubscriptionType();
		const rootTypeNames: {
			query?: string;
			mutation?: string;
			subscription?: string;
		} = {
			query: queryType?.name,
			mutation: mutationType?.name,
			subscription: subscriptionType?.name,
		};

		for (const [name, type] of Object.entries(typeMap)) {
			if (name.startsWith("__")) continue;

			const info: SchemaTypeInfo = { name, kind: "", usedBy: [] };

			if (isObjectType(type)) {
				info.kind = "OBJECT";
				info.description = type.description ?? undefined;
				const fields = type.getFields();
				info.fields = Object.values(fields).map((f) => {
					const ftName = getBaseTypeName(String(f.type));
					if (ftName) {
						if (!reverseRefs.has(ftName)) reverseRefs.set(ftName, new Set());
						reverseRefs.get(ftName)!.add(name);
					}
					return {
						name: f.name,
						type: String(f.type),
						args: f.args.map((a) => ({
							name: a.name,
							type: String(a.type),
							defaultValue:
								a.defaultValue !== undefined
									? JSON.stringify(a.defaultValue)
									: undefined,
						})),
						description: f.description ?? undefined,
						isDeprecated: f.deprecationReason != null,
						deprecationReason: f.deprecationReason ?? undefined,
					};
				});
				info.interfaces = type.getInterfaces().map((i) => i.name);

				if (queryType && name === queryType.name) {
					categories.queries = Object.keys(fields);
				} else if (mutationType && name === mutationType.name) {
					categories.mutations = Object.keys(fields);
				} else if (subscriptionType && name === subscriptionType.name) {
					categories.subscriptions = Object.keys(fields);
				} else {
					categories.types.push(name);
				}
			} else if (isInputObjectType(type)) {
				info.kind = "INPUT_OBJECT";
				info.description = type.description ?? undefined;
				const fields = type.getFields();
				info.fields = Object.values(fields).map((f) => {
					const ftName = getBaseTypeName(String(f.type));
					if (ftName) {
						if (!reverseRefs.has(ftName)) reverseRefs.set(ftName, new Set());
						reverseRefs.get(ftName)!.add(name);
					}
					return {
						name: f.name,
						type: String(f.type),
						args: [],
						description: f.description ?? undefined,
						isDeprecated: f.deprecationReason != null,
						deprecationReason: f.deprecationReason ?? undefined,
					};
				});
				categories.inputTypes.push(name);
			} else if (isEnumType(type)) {
				info.kind = "ENUM";
				info.description = type.description ?? undefined;
				info.enumValues = type.getValues().map((v) => ({
					name: v.name,
					description: v.description ?? undefined,
					isDeprecated: v.deprecationReason != null,
					deprecationReason: v.deprecationReason ?? undefined,
				}));
				categories.enums.push(name);
			} else if (isInterfaceType(type)) {
				info.kind = "INTERFACE";
				info.description = type.description ?? undefined;
				const fields = type.getFields();
				info.fields = Object.values(fields).map((f) => ({
					name: f.name,
					type: String(f.type),
					args: f.args.map((a) => ({
						name: a.name,
						type: String(a.type),
						defaultValue:
							a.defaultValue !== undefined
								? JSON.stringify(a.defaultValue)
								: undefined,
					})),
					description: f.description ?? undefined,
					isDeprecated: f.deprecationReason != null,
					deprecationReason: f.deprecationReason ?? undefined,
				}));
				info.possibleTypes = schema.getPossibleTypes(type).map((t) => t.name);
				categories.interfaces.push(name);
			} else if (isUnionType(type)) {
				info.kind = "UNION";
				info.description = type.description ?? undefined;
				info.possibleTypes = type.getTypes().map((t) => t.name);
				categories.unions.push(name);
			} else if (isScalarType(type)) {
				info.kind = "SCALAR";
				info.description = type.description ?? undefined;
				if (!BUILTIN_SCALARS.has(name)) {
					categories.scalars.push(name);
				}
			}

			types.set(name, info);
		}

		for (const [typeName, refs] of reverseRefs) {
			const info = types.get(typeName);
			if (info) {
				info.usedBy = Array.from(refs);
			}
		}

		return { types, categories, rootTypeNames, error: null };
	} catch (e) {
		return {
			types: new Map(),
			categories: emptyCategories,
			rootTypeNames: {},
			error: (e as Error).message,
		};
	}
}

// ─── Variables Validation ────────────────────────────────────────────────

function validateVariables(
	query: string,
	variablesJson: string,
): { checks: VariableCheck[]; error: string | null } {
	if (!query.trim()) return { checks: [], error: null };

	let doc: DocumentNode;
	try {
		doc = parse(query);
	} catch (e) {
		return {
			checks: [],
			error: `Query parse error: ${(e as Error).message}`,
		};
	}

	const varDefs: { name: string; type: string; required: boolean }[] = [];
	for (const def of doc.definitions) {
		if (def.kind === "OperationDefinition") {
			for (const v of def.variableDefinitions ?? []) {
				const typeName = printType(v.type);
				varDefs.push({
					name: v.variable.name.value,
					type: typeName,
					required: typeName.endsWith("!"),
				});
			}
		}
	}

	if (varDefs.length === 0) return { checks: [], error: null };

	let vars: Record<string, unknown> = {};
	if (variablesJson.trim()) {
		try {
			vars = JSON.parse(variablesJson);
			if (typeof vars !== "object" || vars === null || Array.isArray(vars)) {
				return { checks: [], error: "Variables must be a JSON object" };
			}
		} catch (e) {
			return {
				checks: [],
				error: `Variables JSON error: ${(e as Error).message}`,
			};
		}
	}

	const checks: VariableCheck[] = varDefs.map(({ name, type, required }) => {
		const provided = name in vars;
		const value = vars[name];
		let typeMatch: "match" | "mismatch" | "unknown" = "unknown";

		if (provided) {
			typeMatch = checkTypeMatch(type, value);
		} else if (required) {
			typeMatch = "mismatch";
		}

		return { name: `$${name}`, expectedType: type, provided, typeMatch };
	});

	return { checks, error: null };
}

function checkTypeMatch(
	gqlType: string,
	value: unknown,
): "match" | "mismatch" | "unknown" {
	const isRequired = gqlType.endsWith("!");
	const baseType = gqlType.replace(/!$/, "");

	if (value === null) return isRequired ? "mismatch" : "match";
	if (baseType.startsWith("[") && baseType.endsWith("]"))
		return Array.isArray(value) ? "match" : "mismatch";

	switch (baseType) {
		case "String":
		case "ID":
			return typeof value === "string" ? "match" : "mismatch";
		case "Int":
			return typeof value === "number" && Number.isInteger(value)
				? "match"
				: "mismatch";
		case "Float":
			return typeof value === "number" ? "match" : "mismatch";
		case "Boolean":
			return typeof value === "boolean" ? "match" : "mismatch";
		default:
			return "unknown";
	}
}

// ─── Colors ──────────────────────────────────────────────────────────────

const OPERATION_COLORS: Record<string, string> = {
	query: "bg-blue-500/15 text-blue-400",
	mutation: "bg-purple-500/15 text-purple-400",
	subscription: "bg-green-500/15 text-green-400",
	fragment: "bg-amber-500/15 text-amber-400",
};

const KIND_COLORS: Record<string, string> = {
	OBJECT: "bg-blue-500/15 text-blue-400",
	INPUT_OBJECT: "bg-teal-500/15 text-teal-400",
	ENUM: "bg-green-500/15 text-green-400",
	INTERFACE: "bg-purple-500/15 text-purple-400",
	UNION: "bg-amber-500/15 text-amber-400",
	SCALAR: "bg-zinc-500/15 text-zinc-400",
};

// ─── Mode Tabs ───────────────────────────────────────────────────────────

function ModeTabs({
	mode,
	setMode,
}: {
	mode: Mode;
	setMode: (m: Mode) => void;
}) {
	return (
		<div className='flex rounded-md border border-border overflow-hidden'>
			{MODE_TABS.map(({ key, label }) => (
				<button
					key={key}
					onClick={() => setMode(key)}
					className={cn(
						"h-8 px-3 text-xs font-medium transition-colors",
						mode === key
							? "bg-accent text-zinc-950"
							: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
					)}
				>
					{label}
				</button>
			))}
		</div>
	);
}

// ─── Main Component ──────────────────────────────────────────────────────

export function GraphqlTool() {
	const [mode, setMode] = useLocalStorage<Mode>(
		"devtools-graphql-mode",
		"formatter",
	);

	return (
		<>
			<SEOHead tool={tool} />
			<div className='flex h-full flex-col'>
				{mode === "formatter" && (
					<QueryFormatter mode={mode} setMode={setMode} />
				)}
				{mode === "schema" && <SchemaExplorer mode={mode} setMode={setMode} />}
				{mode === "variables" && (
					<VariablesInspector mode={mode} setMode={setMode} />
				)}
			</div>
		</>
	);
}

// ─── Mode A: Query Formatter ─────────────────────────────────────────────

function QueryFormatter({
	mode,
	setMode,
}: {
	mode: Mode;
	setMode: (m: Mode) => void;
}) {
	const [input, setInput] = useLocalStorage("devtools-graphql-input", "");
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [operations, setOperations] = useState<OperationInfo[]>([]);

	const debouncedInput = useDebounce(input, 300);

	useEffect(() => {
		if (!debouncedInput.trim()) {
			setOutput("");
			setError(null);
			setOperations([]);
			return;
		}

		try {
			const doc = parse(debouncedInput);
			const formatted = print(doc);
			setOutput(formatted);
			setError(null);
			setOperations(extractOperations(doc));
		} catch (e) {
			const err = e as Error & {
				locations?: { line: number; column: number }[];
			};
			const loc = err.locations?.[0];
			const prefix = loc ? `Line ${loc.line}:${loc.column} — ` : "";
			setError(`${prefix}${err.message}`);
			setOutput("");
			setOperations([]);
		}
	}, [debouncedInput]);

	const handleClear = useCallback(() => {
		setInput("");
		setOutput("");
		setError(null);
		setOperations([]);
	}, [setInput]);

	const handleMinify = useCallback(() => {
		if (!input.trim()) return;
		try {
			const minified = minifyGraphQL(input);
			setOutput(minified);
		} catch {
			// parse errors already shown by the debounced handler
		}
	}, [input]);

	return (
		<>
			<ToolPageHeader title={tool.name}>
				<ModeTabs mode={mode} setMode={setMode} />
				<CopyButton text={output} label='Copy' />
				<button
					onClick={handleMinify}
					disabled={!input.trim()}
					className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50'
				>
					<Minimize2 className='h-3.5 w-3.5' /> Minify
				</button>
				<button
					onClick={handleClear}
					className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
				>
					<Trash2 className='h-3.5 w-3.5' /> Clear
				</button>
			</ToolPageHeader>

			{/* Editors */}
			<div className='flex flex-1 min-h-0'>
				<div className='flex-1 flex flex-col border-r border-border min-w-0'>
					<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
						Input
					</div>
					<div className='flex-1 min-h-0'>
						<MonacoWrapper
							value={input}
							onChange={setInput}
							language='graphql'
							aria-label='GraphQL input'
						/>
					</div>
				</div>
				<div className='flex-1 flex flex-col min-w-0'>
					<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
						Formatted Output
					</div>
					<div className='flex-1 min-h-0'>
						<MonacoWrapper
							value={output}
							language='graphql'
							readOnly
							aria-label='Formatted GraphQL output'
						/>
					</div>
				</div>
			</div>

			{/* Error */}
			{error && (
				<div className='px-3 py-2 border-t border-border'>
					<ErrorBox error={error} />
				</div>
			)}

			{/* Operation Inspector */}
			{operations.length > 0 && (
				<div className='border-t border-border max-h-[30%] overflow-auto'>
					<div className='px-3 py-2 text-xs font-medium text-muted-foreground bg-panel border-b border-border'>
						Operation Inspector ({operations.length}{" "}
						{operations.length === 1 ? "operation" : "operations"})
					</div>
					<div className='divide-y divide-border/50'>
						{operations.map((op, i) => (
							<div key={i} className='px-3 py-2 text-xs'>
								<div className='flex items-center gap-2 mb-1.5'>
									<span
										className={cn(
											"rounded px-1.5 py-0.5 text-[10px] font-medium",
											OPERATION_COLORS[op.kind],
										)}
									>
										{op.kind}
									</span>
									<span className='font-mono font-semibold text-foreground'>
										{op.name}
									</span>
								</div>

								{op.variables.length > 0 && (
									<div className='mb-1'>
										<span className='text-muted-foreground'>Variables: </span>
										{op.variables.map((v, vi) => (
											<span
												key={vi}
												className='font-mono text-muted-foreground'
											>
												{vi > 0 && ", "}
												<span className='text-amber-400'>{v.name}</span>
												<span className='text-muted-foreground/60'>
													: {v.type}
												</span>
											</span>
										))}
									</div>
								)}

								<div>
									<span className='text-muted-foreground'>Fields: </span>
									<span className='font-mono text-muted-foreground'>
										{op.fields.join(", ") || "(none)"}
									</span>
								</div>

								{op.directives.length > 0 && (
									<div className='mt-1'>
										<span className='text-muted-foreground'>Directives: </span>
										{op.directives.map((d, di) => (
											<span key={di} className='font-mono text-cyan-400'>
												{di > 0 && ", "}
												{d}
											</span>
										))}
									</div>
								)}

								{op.fragments.length > 0 && (
									<div className='mt-1'>
										<span className='text-muted-foreground'>Fragments: </span>
										{op.fragments.map((f, fi) => (
											<span key={fi} className='font-mono text-amber-400'>
												{fi > 0 && ", "}
												...{f}
											</span>
										))}
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</>
	);
}

// ─── Mode B: Schema Explorer ─────────────────────────────────────────────

function SchemaExplorer({
	mode,
	setMode,
}: {
	mode: Mode;
	setMode: (m: Mode) => void;
}) {
	const [sdl, setSdl] = useLocalStorage("devtools-graphql-schema", "");
	const [search, setSearch] = useState("");
	const [selectedType, setSelectedType] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	const debouncedSdl = useDebounce(sdl, 300);

	const { types, categories, rootTypeNames, error } = useMemo(
		() => parseSchemaSDL(debouncedSdl),
		[debouncedSdl],
	);

	const searchLower = search.toLowerCase();

	const filterNames = useCallback(
		(names: string[]) => {
			if (!searchLower) return names;
			return names.filter((n) => {
				if (n.toLowerCase().includes(searchLower)) return true;
				const info = types.get(n);
				if (
					info?.fields?.some((f) => f.name.toLowerCase().includes(searchLower))
				)
					return true;
				return false;
			});
		},
		[searchLower, types],
	);

	const filterRootFields = useCallback(
		(fields: string[]) => {
			if (!searchLower) return fields;
			return fields.filter((f) => f.toLowerCase().includes(searchLower));
		},
		[searchLower],
	);

	const toggleCollapse = useCallback((key: string) => {
		setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
	}, []);

	const selected = selectedType ? types.get(selectedType) : null;

	const sections: {
		key: string;
		label: string;
		items: string[];
		rootTypeName?: string;
	}[] = [
		{
			key: "queries",
			label: "Query",
			items: filterRootFields(categories.queries),
			rootTypeName: rootTypeNames.query,
		},
		{
			key: "mutations",
			label: "Mutation",
			items: filterRootFields(categories.mutations),
			rootTypeName: rootTypeNames.mutation,
		},
		{
			key: "subscriptions",
			label: "Subscription",
			items: filterRootFields(categories.subscriptions),
			rootTypeName: rootTypeNames.subscription,
		},
		{ key: "types", label: "Types", items: filterNames(categories.types) },
		{
			key: "inputTypes",
			label: "Input Types",
			items: filterNames(categories.inputTypes),
		},
		{ key: "enums", label: "Enums", items: filterNames(categories.enums) },
		{
			key: "interfaces",
			label: "Interfaces",
			items: filterNames(categories.interfaces),
		},
		{
			key: "unions",
			label: "Unions",
			items: filterNames(categories.unions),
		},
		{
			key: "scalars",
			label: "Scalars",
			items: filterNames(categories.scalars),
		},
	];

	return (
		<>
			<ToolPageHeader title={tool.name}>
				<ModeTabs mode={mode} setMode={setMode} />
			</ToolPageHeader>

			<div className='flex flex-1 min-h-0'>
				{/* SDL Editor */}
				<div className='w-[35%] flex flex-col border-r border-border min-w-0'>
					<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
						Schema (SDL)
					</div>
					<div className='flex-1 min-h-0'>
						<MonacoWrapper
							value={sdl}
							onChange={setSdl}
							language='graphql'
							aria-label='GraphQL schema SDL'
						/>
					</div>
				</div>

				{/* Type Tree */}
				<div className='w-[25%] flex flex-col border-r border-border min-w-0'>
					<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel flex items-center gap-2'>
						<Search className='h-3 w-3' />
						<input
							type='text'
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder='Search types & fields...'
							className='flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none'
							aria-label='Search schema types'
						/>
					</div>
					<div className='flex-1 overflow-auto text-xs'>
						{sections.map(({ key, label, items, rootTypeName }) => {
							if (items.length === 0) return null;
							const isOpen = !collapsed[key];
							return (
								<div key={key}>
									<button
										onClick={() => toggleCollapse(key)}
										className='flex w-full items-center gap-1 px-2 py-1.5 text-muted-foreground hover:bg-zinc-800/50 font-medium'
									>
										{isOpen ? (
											<ChevronDown className='h-3 w-3' />
										) : (
											<ChevronRight className='h-3 w-3' />
										)}
										{label}
										<span className='ml-auto text-[10px] opacity-60'>
											{items.length}
										</span>
									</button>
									{isOpen && (
										<div>
											{items.map((name) => (
												<button
													key={name}
													onClick={() => setSelectedType(rootTypeName ?? name)}
													className={cn(
														"block w-full px-4 py-1 text-left font-mono hover:bg-zinc-800/50 truncate",
														selectedType === (rootTypeName ?? name)
															? "bg-accent/20 text-accent"
															: "text-foreground",
													)}
												>
													{name}
												</button>
											))}
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>

				{/* Detail Panel */}
				<div className='flex-1 flex flex-col min-w-0'>
					<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
						Type Detail
					</div>
					<div className='flex-1 overflow-auto p-3 text-xs'>
						{selected ? (
							<TypeDetail info={selected} onNavigate={setSelectedType} />
						) : (
							<div className='flex h-full items-center justify-center text-muted-foreground'>
								Select a type to view details
							</div>
						)}
					</div>
				</div>
			</div>

			{error && (
				<div className='px-3 py-2 border-t border-border'>
					<ErrorBox error={error} />
				</div>
			)}
		</>
	);
}

function TypeDetail({
	info,
	onNavigate,
}: {
	info: SchemaTypeInfo;
	onNavigate: (name: string) => void;
}) {
	return (
		<div className='space-y-4'>
			{/* Header */}
			<div>
				<div className='flex items-center gap-2 mb-1'>
					<span
						className={cn(
							"rounded px-1.5 py-0.5 text-[10px] font-medium",
							KIND_COLORS[info.kind] ?? "bg-zinc-500/15 text-zinc-400",
						)}
					>
						{info.kind}
					</span>
					<span className='font-mono font-bold text-sm text-foreground'>
						{info.name}
					</span>
				</div>
				{info.description && (
					<p className='text-muted-foreground mt-1'>{info.description}</p>
				)}
			</div>

			{/* Interfaces */}
			{info.interfaces && info.interfaces.length > 0 && (
				<div>
					<div className='font-medium text-muted-foreground mb-1'>
						Implements
					</div>
					<div className='flex flex-wrap gap-1'>
						{info.interfaces.map((name) => (
							<button
								key={name}
								onClick={() => onNavigate(name)}
								className='font-mono text-purple-400 hover:underline'
							>
								{name}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Fields */}
			{info.fields && info.fields.length > 0 && (
				<div>
					<div className='font-medium text-muted-foreground mb-1'>
						Fields ({info.fields.length})
					</div>
					<div className='space-y-1.5'>
						{info.fields.map((f) => (
							<div
								key={f.name}
								className={cn(
									"rounded border border-border/50 px-2 py-1.5",
									f.isDeprecated && "opacity-60 border-amber-500/30",
								)}
							>
								<div className='flex items-center gap-1.5 flex-wrap'>
									<span className='font-mono font-semibold text-foreground'>
										{f.name}
									</span>
									{f.args.length > 0 && (
										<span className='text-muted-foreground/60'>
											({f.args.map((a) => `${a.name}: ${a.type}`).join(", ")})
										</span>
									)}
									<span className='text-muted-foreground/60'>→</span>
									<button
										onClick={() => onNavigate(getBaseTypeName(f.type))}
										className='font-mono text-blue-400 hover:underline'
									>
										{f.type}
									</button>
									{f.isDeprecated && (
										<span className='rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400 font-medium'>
											DEPRECATED
											{f.deprecationReason ? `: ${f.deprecationReason}` : ""}
										</span>
									)}
								</div>
								{f.description && (
									<p className='text-muted-foreground mt-0.5'>
										{f.description}
									</p>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{/* Enum values */}
			{info.enumValues && info.enumValues.length > 0 && (
				<div>
					<div className='font-medium text-muted-foreground mb-1'>
						Values ({info.enumValues.length})
					</div>
					<div className='space-y-1'>
						{info.enumValues.map((v) => (
							<div
								key={v.name}
								className={cn(
									"flex items-center gap-2 rounded border border-border/50 px-2 py-1",
									v.isDeprecated && "opacity-60 border-amber-500/30",
								)}
							>
								<span className='font-mono font-semibold text-green-400'>
									{v.name}
								</span>
								{v.description && (
									<span className='text-muted-foreground'>
										— {v.description}
									</span>
								)}
								{v.isDeprecated && (
									<span className='rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400'>
										DEPRECATED
									</span>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{/* Possible types */}
			{info.possibleTypes && info.possibleTypes.length > 0 && (
				<div>
					<div className='font-medium text-muted-foreground mb-1'>
						{info.kind === "INTERFACE" ? "Implemented by" : "Possible types"}
					</div>
					<div className='flex flex-wrap gap-1'>
						{info.possibleTypes.map((name) => (
							<button
								key={name}
								onClick={() => onNavigate(name)}
								className='rounded border border-border/50 px-2 py-0.5 font-mono text-blue-400 hover:bg-zinc-800/50'
							>
								{name}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Used by */}
			{info.usedBy.length > 0 && (
				<div>
					<div className='font-medium text-muted-foreground mb-1'>
						Used by ({info.usedBy.length})
					</div>
					<div className='flex flex-wrap gap-1'>
						{info.usedBy.map((name) => (
							<button
								key={name}
								onClick={() => onNavigate(name)}
								className='rounded border border-border/50 px-2 py-0.5 font-mono text-foreground hover:bg-zinc-800/50'
							>
								{name}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Example snippet */}
			{info.fields && info.fields.length > 0 && (
				<div>
					<div className='flex items-center justify-between mb-1'>
						<span className='font-medium text-muted-foreground'>
							Example Snippet
						</span>
						<CopyButton text={generateExampleSnippet(info)} />
					</div>
					<pre className='rounded border border-border/50 bg-zinc-900/50 p-2 font-mono text-[11px] text-foreground overflow-auto'>
						{generateExampleSnippet(info)}
					</pre>
				</div>
			)}
		</div>
	);
}

// ─── Mode C: Variables Inspector ─────────────────────────────────────────

function VariablesInspector({
	mode,
	setMode,
}: {
	mode: Mode;
	setMode: (m: Mode) => void;
}) {
	const [query, setQuery] = useLocalStorage("devtools-graphql-vars-query", "");
	const [variables, setVariables] = useLocalStorage(
		"devtools-graphql-vars-json",
		"",
	);

	const debouncedQuery = useDebounce(query, 300);
	const debouncedVars = useDebounce(variables, 300);

	const { checks, error } = useMemo(
		() => validateVariables(debouncedQuery, debouncedVars),
		[debouncedQuery, debouncedVars],
	);

	const handleClear = useCallback(() => {
		setQuery("");
		setVariables("");
	}, [setQuery, setVariables]);

	return (
		<>
			<ToolPageHeader title={tool.name}>
				<ModeTabs mode={mode} setMode={setMode} />
				<button
					onClick={handleClear}
					className='inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
				>
					<Trash2 className='h-3.5 w-3.5' /> Clear
				</button>
			</ToolPageHeader>

			<div className='flex flex-1 min-h-0'>
				{/* Left: editors stacked */}
				<div className='w-1/2 flex flex-col border-r border-border min-w-0'>
					<div className='flex-1 flex flex-col border-b border-border min-h-0'>
						<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
							Query
						</div>
						<div className='flex-1 min-h-0'>
							<MonacoWrapper
								value={query}
								onChange={setQuery}
								language='graphql'
								aria-label='GraphQL query for variable inspection'
							/>
						</div>
					</div>
					<div className='flex-1 flex flex-col min-h-0'>
						<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
							Variables (JSON)
						</div>
						<div className='flex-1 min-h-0'>
							<MonacoWrapper
								value={variables}
								onChange={setVariables}
								language='json'
								aria-label='JSON variables'
							/>
						</div>
					</div>
				</div>

				{/* Right: validation */}
				<div className='flex-1 flex flex-col min-w-0'>
					<div className='px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-panel'>
						Validation Result
					</div>
					<div className='flex-1 overflow-auto'>
						{error && (
							<div className='p-3'>
								<ErrorBox error={error} />
							</div>
						)}
						{checks.length > 0 ? (
							<table className='w-full text-xs'>
								<thead>
									<tr className='border-b border-border bg-panel text-left'>
										<th className='px-3 py-2 font-medium text-muted-foreground'>
											Variable
										</th>
										<th className='px-3 py-2 font-medium text-muted-foreground'>
											Expected Type
										</th>
										<th className='px-3 py-2 font-medium text-muted-foreground'>
											Provided?
										</th>
										<th className='px-3 py-2 font-medium text-muted-foreground'>
											Type Match
										</th>
									</tr>
								</thead>
								<tbody className='divide-y divide-border/50'>
									{checks.map((c) => (
										<tr key={c.name}>
											<td className='px-3 py-2 font-mono font-semibold text-foreground'>
												{c.name}
											</td>
											<td className='px-3 py-2 font-mono text-muted-foreground'>
												{c.expectedType}
											</td>
											<td className='px-3 py-2'>
												{c.provided ? (
													<span className='inline-flex items-center gap-1 text-green-400'>
														<Check className='h-3 w-3' /> Yes
													</span>
												) : (
													<span className='inline-flex items-center gap-1 text-red-400'>
														<X className='h-3 w-3' /> No
													</span>
												)}
											</td>
											<td className='px-3 py-2'>
												{c.typeMatch === "match" ? (
													<span className='inline-flex items-center gap-1 text-green-400'>
														<Check className='h-3 w-3' /> Match
													</span>
												) : c.typeMatch === "mismatch" ? (
													<span className='inline-flex items-center gap-1 text-red-400'>
														<X className='h-3 w-3' /> Mismatch
													</span>
												) : (
													<span className='inline-flex items-center gap-1 text-amber-400'>
														<AlertTriangle className='h-3 w-3' /> Unknown
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						) : !error ? (
							<div className='flex h-full items-center justify-center text-muted-foreground'>
								{debouncedQuery.trim()
									? "No variables found in the query"
									: "Enter a query with variables to inspect"}
							</div>
						) : null}
					</div>
				</div>
			</div>
		</>
	);
}
