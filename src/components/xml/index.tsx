import { useState, useCallback, useEffect, useRef } from "react";
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
import {
	CheckCircle2,
	ChevronRight,
	ChevronDown,
	AlertTriangle,
	ArrowRight,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type IndentSize = 2 | 4 | "tab";
type ParseStrategy =
	| "valid"
	| "html-fragment"
	| "unescaped-entities"
	| "unclosed-tags";
type OutputTab = "output" | "structure" | "json";

interface XmlPrefs {
	indent: IndentSize;
}

interface SmartParseResult {
	doc: Document | null;
	error: string | null;
	strategy: ParseStrategy;
	strategyLabel: string | null;
	warnings: string[];
}

interface ValidationError {
	line: number;
	column: number;
	message: string;
}

interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	stats: {
		totalElements: number;
		totalAttributes: number;
		maxDepth: number;
		totalTextNodes: number;
	};
}

interface StructureNode {
	tagName: string;
	attributes: { name: string; value: string }[];
	children: StructureNode[];
	textPreview: string;
	childElementCount: number;
	line?: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const tool = TOOLS.find((t) => t.id === "xml")!;

/* ------------------------------------------------------------------ */
/*  XML Core Helpers                                                   */
/* ------------------------------------------------------------------ */

function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseXml(input: string): { doc: Document; error: string | null } {
	const cleaned = stripBom(input);
	const parser = new DOMParser();
	const doc = parser.parseFromString(cleaned, "application/xml");
	const parseError = doc.querySelector("parsererror");
	if (parseError) {
		const msg = parseError.textContent ?? "Invalid XML";
		return { doc, error: msg };
	}
	return { doc, error: null };
}

function formatXml(node: Node, indentStr: string, level: number = 0): string {
	if (node.nodeType === Node.TEXT_NODE) {
		const text = node.textContent ?? "";
		const trimmed = text.trim();
		if (!trimmed) return "";
		return indentStr.repeat(level) + trimmed;
	}
	if (node.nodeType === Node.COMMENT_NODE) {
		return indentStr.repeat(level) + "<!--" + (node.textContent ?? "") + "-->";
	}
	if (node.nodeType === Node.CDATA_SECTION_NODE) {
		return (
			indentStr.repeat(level) + "<![CDATA[" + (node.textContent ?? "") + "]]>"
		);
	}
	if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
		const pi = node as ProcessingInstruction;
		return indentStr.repeat(level) + "<?" + pi.target + " " + pi.data + "?>";
	}
	if (node.nodeType === Node.DOCUMENT_NODE) {
		const lines: string[] = [];
		for (let i = 0; i < node.childNodes.length; i++) {
			const line = formatXml(node.childNodes[i], indentStr, 0);
			if (line) lines.push(line);
		}
		return lines.join("\n");
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return "";
	const el = node as Element;
	const prefix = indentStr.repeat(level);
	let tag = "<" + el.tagName;
	for (let i = 0; i < el.attributes.length; i++) {
		const attr = el.attributes[i];
		tag += " " + attr.name + '="' + attr.value + '"';
	}
	if (!el.childNodes.length) return prefix + tag + " />";
	if (
		el.childNodes.length === 1 &&
		el.childNodes[0].nodeType === Node.TEXT_NODE
	) {
		const text = (el.childNodes[0].textContent ?? "").trim();
		return prefix + tag + ">" + text + "</" + el.tagName + ">";
	}
	const lines: string[] = [prefix + tag + ">"];
	for (let i = 0; i < el.childNodes.length; i++) {
		const line = formatXml(el.childNodes[i], indentStr, level + 1);
		if (line) lines.push(line);
	}
	lines.push(prefix + "</" + el.tagName + ">");
	return lines.join("\n");
}

function minifyXml(input: string): string {
	return input
		.replace(/>\s+</g, "><")
		.replace(/\s+/g, " ")
		.replace(/>\s+/g, ">")
		.replace(/\s+</g, "<")
		.trim();
}

function getIndentStr(indent: IndentSize): string {
	return indent === "tab" ? "\t" : " ".repeat(indent);
}

/* ------------------------------------------------------------------ */
/*  Smart Parsing Strategies                                           */
/* ------------------------------------------------------------------ */

function escapeUnescapedEntities(input: string): {
	escaped: string;
	fixes: string[];
} {
	const fixes: string[] = [];
	const escaped = input.replace(
		/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g,
		(_match, offset: number) => {
			const line = input.substring(0, offset).split("\n").length;
			fixes.push(`Line ${line}: escaped '&' → '&amp;'`);
			return "&amp;";
		},
	);
	return { escaped, fixes };
}

function detectUnclosedTags(input: string): { name: string; line: number }[] {
	const stack: { name: string; line: number }[] = [];
	let i = 0;
	let line = 1;

	while (i < input.length) {
		if (input[i] === "\n") {
			line++;
			i++;
			continue;
		}
		if (input.startsWith("<!--", i)) {
			const end = input.indexOf("-->", i + 4);
			if (end === -1) break;
			for (let j = i; j < end + 3; j++) if (input[j] === "\n") line++;
			i = end + 3;
			continue;
		}
		if (input.startsWith("<![CDATA[", i)) {
			const end = input.indexOf("]]>", i + 9);
			if (end === -1) break;
			for (let j = i; j < end + 3; j++) if (input[j] === "\n") line++;
			i = end + 3;
			continue;
		}
		if (input.startsWith("<?", i)) {
			const end = input.indexOf("?>", i + 2);
			if (end === -1) break;
			for (let j = i; j < end + 2; j++) if (input[j] === "\n") line++;
			i = end + 2;
			continue;
		}
		if (input.startsWith("</", i)) {
			const end = input.indexOf(">", i + 2);
			if (end === -1) break;
			const name = input
				.substring(i + 2, end)
				.trim()
				.split(/\s/)[0];
			for (let j = stack.length - 1; j >= 0; j--) {
				if (stack[j].name === name) {
					stack.splice(j, 1);
					break;
				}
			}
			i = end + 1;
			continue;
		}
		if (
			input[i] === "<" &&
			i + 1 < input.length &&
			/[a-zA-Z_]/.test(input[i + 1])
		) {
			const startLine = line;
			let j = i + 1;
			let inQ: string | null = null;
			while (j < input.length) {
				if (inQ) {
					if (input[j] === inQ) inQ = null;
				} else {
					if (input[j] === '"' || input[j] === "'") inQ = input[j];
					if (input[j] === ">") break;
				}
				if (input[j] === "\n") line++;
				j++;
			}
			if (j >= input.length) break;
			const content = input.substring(i + 1, j);
			const selfClose = content.trimEnd().endsWith("/");
			const name = (selfClose ? content.slice(0, -1) : content)
				.trim()
				.split(/\s+/)[0];
			if (!selfClose) stack.push({ name, line: startLine });
			i = j + 1;
			continue;
		}
		i++;
	}
	return stack;
}

function smartParseXml(input: string): SmartParseResult {
	const cleaned = stripBom(input).trim();

	// Strategy 1: direct parse
	const r1 = parseXml(cleaned);
	if (!r1.error)
		return {
			doc: r1.doc,
			error: null,
			strategy: "valid",
			strategyLabel: null,
			warnings: [],
		};

	// Strategy 4: escape unescaped entities
	const { escaped, fixes } = escapeUnescapedEntities(cleaned);
	if (escaped !== cleaned) {
		const r4 = parseXml(escaped);
		if (!r4.error)
			return {
				doc: r4.doc,
				error: null,
				strategy: "unescaped-entities",
				strategyLabel: `Fixed: ${fixes.length} unescaped entit${fixes.length === 1 ? "y" : "ies"}`,
				warnings: fixes,
			};
	}

	// Strategy 2: wrap in <root>
	const wrapped = `<root>${cleaned}</root>`;
	const r2 = parseXml(wrapped);
	if (!r2.error)
		return {
			doc: r2.doc,
			error: null,
			strategy: "html-fragment",
			strategyLabel: "Fixed: wrapped fragment in <root>",
			warnings: [],
		};

	// Strategy 2+4: wrap + escape
	const { escaped: we, fixes: wf } = escapeUnescapedEntities(wrapped);
	if (we !== wrapped) {
		const r24 = parseXml(we);
		if (!r24.error)
			return {
				doc: r24.doc,
				error: null,
				strategy: "html-fragment",
				strategyLabel: "Fixed: wrapped + escaped entities",
				warnings: wf,
			};
	}

	// Strategy 3: detect unclosed tags for enhanced error reporting
	const unclosed = detectUnclosedTags(cleaned);
	if (unclosed.length > 0) {
		const details = unclosed
			.map((t) => `<${t.name}> at line ${t.line}`)
			.join(", ");
		return {
			doc: null,
			error: `Unclosed tags: ${details}\n\n${r1.error}`,
			strategy: "unclosed-tags",
			strategyLabel: `Unclosed: ${unclosed.map((t) => `<${t.name}>`).join(", ")}`,
			warnings: [],
		};
	}

	return {
		doc: null,
		error: r1.error,
		strategy: "valid",
		strategyLabel: null,
		warnings: [],
	};
}

/* ------------------------------------------------------------------ */
/*  Validation Scanner (multi-error)                                  */
/* ------------------------------------------------------------------ */

function scanXmlErrors(input: string): ValidationResult {
	const errors: ValidationError[] = [];
	const stack: { name: string; line: number; col: number }[] = [];
	let totalElements = 0;
	let totalAttributes = 0;
	let maxDepth = 0;
	let totalTextNodes = 0;
	let depth = 0;
	let i = 0;
	let line = 1;
	let col = 1;

	function advance(count: number) {
		for (let k = 0; k < count && i + k < input.length; k++) {
			if (input[i + k] === "\n") {
				line++;
				col = 1;
			} else {
				col++;
			}
		}
		i += count;
	}

	while (i < input.length) {
		if (input.startsWith("<!--", i)) {
			const end = input.indexOf("-->", i + 4);
			if (end === -1) {
				errors.push({ line, column: col, message: "Unclosed comment" });
				break;
			}
			advance(end + 3 - i);
			continue;
		}
		if (input.startsWith("<![CDATA[", i)) {
			const end = input.indexOf("]]>", i + 9);
			if (end === -1) {
				errors.push({
					line,
					column: col,
					message: "Unclosed CDATA section",
				});
				break;
			}
			advance(end + 3 - i);
			continue;
		}
		if (input.startsWith("<?", i)) {
			const end = input.indexOf("?>", i + 2);
			if (end === -1) {
				errors.push({
					line,
					column: col,
					message: "Unclosed processing instruction",
				});
				break;
			}
			advance(end + 2 - i);
			continue;
		}
		if (input.startsWith("</", i)) {
			const cLine = line;
			const cCol = col;
			const end = input.indexOf(">", i + 2);
			if (end === -1) {
				errors.push({
					line: cLine,
					column: cCol,
					message: "Unclosed closing tag",
				});
				break;
			}
			const name = input
				.substring(i + 2, end)
				.trim()
				.split(/\s/)[0];
			if (stack.length === 0) {
				errors.push({
					line: cLine,
					column: cCol,
					message: `Unexpected closing tag </${name}>`,
				});
			} else if (stack[stack.length - 1].name !== name) {
				const top = stack[stack.length - 1];
				errors.push({
					line: cLine,
					column: cCol,
					message: `Mismatched: expected </${top.name}> (line ${top.line}) but found </${name}>`,
				});
				const idx = stack.findLastIndex((t) => t.name === name);
				if (idx >= 0) {
					while (stack.length > idx + 1) {
						const u = stack.pop()!;
						errors.push({
							line: u.line,
							column: u.col,
							message: `Unclosed tag <${u.name}>`,
						});
						depth--;
					}
					stack.pop();
					depth--;
				}
			} else {
				stack.pop();
				depth--;
			}
			advance(end + 1 - i);
			continue;
		}
		if (
			input[i] === "<" &&
			i + 1 < input.length &&
			/[a-zA-Z_]/.test(input[i + 1])
		) {
			const sLine = line;
			const sCol = col;
			let j = i + 1;
			let inQ: string | null = null;
			while (j < input.length) {
				if (inQ) {
					if (input[j] === inQ) inQ = null;
				} else {
					if (input[j] === '"' || input[j] === "'") inQ = input[j];
					if (input[j] === ">") break;
				}
				j++;
			}
			if (j >= input.length) {
				errors.push({
					line: sLine,
					column: sCol,
					message: "Unclosed opening tag",
				});
				break;
			}
			const content = input.substring(i + 1, j);
			const selfClose = content.trimEnd().endsWith("/");
			const clean = (selfClose ? content.slice(0, -1) : content).trim();
			const parts = clean.split(/\s+/);
			const name = parts[0];
			totalElements++;
			const attrStr = clean.substring(name.length);
			if (attrStr.trim()) {
				const m = attrStr.match(/[\w:.-]+\s*=/g);
				if (m) totalAttributes += m.length;
			}
			if (!selfClose) {
				depth++;
				maxDepth = Math.max(maxDepth, depth);
				stack.push({ name, line: sLine, col: sCol });
			}
			advance(j + 1 - i);
			continue;
		}
		if (input[i] !== "<") {
			let j = i;
			while (j < input.length && input[j] !== "<") j++;
			const text = input.substring(i, j).trim();
			if (text) {
				totalTextNodes++;
				const ampRegex = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;
				let am;
				while ((am = ampRegex.exec(text)) !== null) {
					errors.push({
						line,
						column: col + am.index,
						message: "Unescaped '&' in text content",
					});
				}
			}
			advance(j - i);
			continue;
		}
		advance(1);
	}

	while (stack.length) {
		const u = stack.pop()!;
		errors.push({
			line: u.line,
			column: u.col,
			message: `Unclosed tag <${u.name}>`,
		});
	}

	return {
		valid: errors.length === 0,
		errors,
		stats: { totalElements, totalAttributes, maxDepth, totalTextNodes },
	};
}

function collectDomStats(doc: Document) {
	let totalElements = 0;
	let totalAttributes = 0;
	let maxDepth = 0;
	let totalTextNodes = 0;
	function walk(node: Node, d: number) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			totalElements++;
			totalAttributes += (node as Element).attributes.length;
			maxDepth = Math.max(maxDepth, d);
		}
		if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
			totalTextNodes++;
		for (let i = 0; i < node.childNodes.length; i++)
			walk(node.childNodes[i], node.nodeType === Node.ELEMENT_NODE ? d + 1 : d);
	}
	walk(doc, 0);
	return { totalElements, totalAttributes, maxDepth, totalTextNodes };
}

/* ------------------------------------------------------------------ */
/*  XML → JSON Converter                                              */
/* ------------------------------------------------------------------ */

function xmlToJson(el: Element): unknown {
	const obj: Record<string, unknown> = {};
	for (let i = 0; i < el.attributes.length; i++) {
		const a = el.attributes[i];
		obj[`@${a.name}`] = a.value;
	}
	for (let i = 0; i < el.childNodes.length; i++) {
		const child = el.childNodes[i];
		if (child.nodeType === Node.TEXT_NODE) {
			const t = child.textContent?.trim();
			if (t) obj["#text"] = t;
		} else if (child.nodeType === Node.CDATA_SECTION_NODE) {
			obj["#cdata"] = child.textContent ?? "";
		} else if (child.nodeType === Node.ELEMENT_NODE) {
			const ce = child as Element;
			const cj = xmlToJson(ce);
			if (obj[ce.tagName] !== undefined) {
				if (Array.isArray(obj[ce.tagName]))
					(obj[ce.tagName] as unknown[]).push(cj);
				else obj[ce.tagName] = [obj[ce.tagName], cj];
			} else {
				obj[ce.tagName] = cj;
			}
		}
	}
	const keys = Object.keys(obj);
	if (keys.length === 1 && keys[0] === "#text") return obj["#text"];
	if (keys.length === 0) return "";
	return obj;
}

/* ------------------------------------------------------------------ */
/*  Structure Tree Builder                                            */
/* ------------------------------------------------------------------ */

function buildStructureTree(el: Element): StructureNode {
	const children: StructureNode[] = [];
	for (let i = 0; i < el.children.length; i++)
		children.push(buildStructureTree(el.children[i]));
	const texts: string[] = [];
	for (let i = 0; i < el.childNodes.length; i++) {
		if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
			const t = el.childNodes[i].textContent?.trim();
			if (t) texts.push(t);
		}
	}
	const tp = texts.join(" ");
	return {
		tagName: el.tagName,
		attributes: Array.from(el.attributes).map((a) => ({
			name: a.name,
			value: a.value,
		})),
		children,
		textPreview: tp.length > 60 ? tp.substring(0, 57) + "..." : tp,
		childElementCount: el.children.length,
	};
}

function assignLineNumbers(root: StructureNode, formatted: string) {
	const nodes: StructureNode[] = [];
	(function dfs(n: StructureNode) {
		nodes.push(n);
		n.children.forEach(dfs);
	})(root);
	const lines = formatted.split("\n");
	let idx = 0;
	for (let i = 0; i < lines.length && idx < nodes.length; i++) {
		const trimmed = lines[i].trimStart();
		if (
			trimmed.startsWith("<") &&
			!trimmed.startsWith("</") &&
			!trimmed.startsWith("<!") &&
			!trimmed.startsWith("<?")
		) {
			nodes[idx].line = i + 1;
			idx++;
		}
	}
}

function collectNamespaces(el: Element): { prefix: string; uri: string }[] {
	const ns: { prefix: string; uri: string }[] = [];
	const seen = new Set<string>();
	(function walk(e: Element) {
		for (let i = 0; i < e.attributes.length; i++) {
			const a = e.attributes[i];
			if (a.name === "xmlns" || a.name.startsWith("xmlns:")) {
				const prefix = a.name === "xmlns" ? "(default)" : a.name.substring(6);
				const key = `${prefix}=${a.value}`;
				if (!seen.has(key)) {
					seen.add(key);
					ns.push({ prefix, uri: a.value });
				}
			}
		}
		for (let i = 0; i < e.children.length; i++) walk(e.children[i]);
	})(el);
	return ns;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StructureTreeNode({
	node,
	depth,
	selectedNode,
	onSelect,
	onJumpToLine,
}: {
	node: StructureNode;
	depth: number;
	selectedNode: StructureNode | null;
	onSelect: (n: StructureNode) => void;
	onJumpToLine: (line: number) => void;
}) {
	const [expanded, setExpanded] = useState(depth < 2);
	const hasChildren = node.children.length > 0;
	const isSelected = selectedNode === node;

	return (
		<div style={{ paddingLeft: depth * 16 }}>
			<div
				className={cn(
					"flex items-center gap-1 rounded px-1 py-0.5 text-xs cursor-pointer hover:bg-zinc-700/50",
					isSelected && "bg-zinc-700",
				)}
				role='treeitem'
				onClick={() => {
					onSelect(node);
					if (node.line) onJumpToLine(node.line);
				}}
			>
				{hasChildren ? (
					<button
						className='p-0.5 hover:bg-zinc-600 rounded'
						onClick={(e) => {
							e.stopPropagation();
							setExpanded(!expanded);
						}}
						aria-label={expanded ? "Collapse" : "Expand"}
					>
						{expanded ? (
							<ChevronDown className='h-3 w-3' />
						) : (
							<ChevronRight className='h-3 w-3' />
						)}
					</button>
				) : (
					<span className='w-4' />
				)}
				<span className='font-mono text-accent'>&lt;{node.tagName}&gt;</span>
				{node.attributes.length > 0 && (
					<span className='text-muted-foreground'>
						({node.attributes.length} attr
						{node.attributes.length !== 1 ? "s" : ""})
					</span>
				)}
				{node.childElementCount > 0 && (
					<span className='text-muted-foreground'>
						[{node.childElementCount}]
					</span>
				)}
				{node.textPreview && (
					<span className='text-zinc-500 truncate max-w-30'>
						&quot;{node.textPreview}&quot;
					</span>
				)}
			</div>
			{expanded &&
				hasChildren &&
				node.children.map((child, i) => (
					<StructureTreeNode
						key={i}
						node={child}
						depth={depth + 1}
						selectedNode={selectedNode}
						onSelect={onSelect}
						onJumpToLine={onJumpToLine}
					/>
				))}
		</div>
	);
}

function StructurePanel({
	tree,
	namespaces,
	selectedNode,
	onSelectNode,
	onJumpToLine,
}: {
	tree: StructureNode | null;
	namespaces: { prefix: string; uri: string }[];
	selectedNode: StructureNode | null;
	onSelectNode: (n: StructureNode) => void;
	onJumpToLine: (line: number) => void;
}) {
	if (!tree)
		return (
			<div className='flex items-center justify-center h-full text-xs text-muted-foreground'>
				No XML parsed
			</div>
		);

	return (
		<div className='flex flex-col h-full overflow-hidden'>
			{namespaces.length > 0 && (
				<div className='border-b border-border px-3 py-2'>
					<div className='text-[10px] font-semibold text-muted-foreground mb-1'>
						Namespaces
					</div>
					{namespaces.map((ns, i) => (
						<div key={i} className='text-[10px] font-mono text-zinc-400'>
							<span className='text-accent'>{ns.prefix}</span>: {ns.uri}
						</div>
					))}
				</div>
			)}
			<div className='flex-1 overflow-auto py-1' role='tree'>
				<StructureTreeNode
					node={tree}
					depth={0}
					selectedNode={selectedNode}
					onSelect={onSelectNode}
					onJumpToLine={onJumpToLine}
				/>
			</div>
			{selectedNode && selectedNode.attributes.length > 0 && (
				<div className='border-t border-border px-3 py-2 max-h-40 overflow-auto'>
					<div className='text-[10px] font-semibold text-muted-foreground mb-1'>
						Attributes — &lt;{selectedNode.tagName}&gt;
					</div>
					<table className='w-full text-[10px]'>
						<thead>
							<tr className='text-muted-foreground'>
								<th className='text-left pr-2 font-medium'>Name</th>
								<th className='text-left font-medium'>Value</th>
							</tr>
						</thead>
						<tbody>
							{selectedNode.attributes.map((attr, i) => (
								<tr key={i} className='border-t border-border/50'>
									<td className='pr-2 py-0.5 font-mono text-accent'>
										{attr.name}
									</td>
									<td className='py-0.5 font-mono text-zinc-300 break-all'>
										{attr.value}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function ValidationDrawer({
	result,
	onJumpToLine,
	onClose,
}: {
	result: ValidationResult;
	onJumpToLine: (line: number) => void;
	onClose: () => void;
}) {
	return (
		<div className='border-t border-border bg-zinc-900/50 max-h-60 overflow-auto'>
			<div className='flex items-center justify-between px-3 py-1.5 border-b border-border sticky top-0 bg-zinc-900'>
				<span className='text-[10px] font-semibold text-muted-foreground'>
					Validation Results
				</span>
				<button
					onClick={onClose}
					className='text-[10px] text-muted-foreground hover:text-zinc-300'
					aria-label='Close validation'
				>
					✕
				</button>
			</div>
			<div className='flex gap-4 px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/50'>
				<span>Elements: {result.stats.totalElements}</span>
				<span>Attributes: {result.stats.totalAttributes}</span>
				<span>Max depth: {result.stats.maxDepth}</span>
				<span>Text nodes: {result.stats.totalTextNodes}</span>
			</div>
			{result.valid ? (
				<div className='flex items-center gap-2 px-3 py-3 text-xs text-green-400'>
					<CheckCircle2 className='h-4 w-4' />
					<span>XML is well-formed — no errors found</span>
				</div>
			) : (
				<div className='divide-y divide-border/30'>
					{result.errors.map((err, i) => (
						<div
							key={i}
							className='flex items-start gap-2 px-3 py-1.5 text-[10px]'
						>
							<AlertTriangle className='h-3 w-3 mt-0.5 text-amber-400 shrink-0' />
							<span className='flex-1 text-zinc-300'>
								<span className='text-muted-foreground'>
									Ln {err.line}, Col {err.column}:
								</span>{" "}
								{err.message}
							</span>
							<button
								onClick={() => onJumpToLine(err.line)}
								className='flex items-center gap-0.5 text-accent hover:text-accent/80 shrink-0'
								aria-label={`Jump to line ${err.line}`}
							>
								Jump <ArrowRight className='h-2.5 w-2.5' />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function XmlTool() {
	const [input, setInput] = useLocalStorage("devtools-xml-input", "");
	const [prefs, setPrefs] = useLocalStorage<XmlPrefs>("devtools-xml-prefs", {
		indent: 2,
	});
	const [output, setOutput] = useState("");
	const [jsonOutput, setJsonOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [strategy, setStrategy] = useState<string | null>(null);
	const [processingTime, setProcessingTime] = useState<number | undefined>();
	const [outputTab, setOutputTab] = useState<OutputTab>("output");
	const [validationResult, setValidationResult] =
		useState<ValidationResult | null>(null);
	const [showValidation, setShowValidation] = useState(false);
	const [structureTree, setStructureTree] = useState<StructureNode | null>(
		null,
	);
	const [namespaces, setNamespaces] = useState<
		{ prefix: string; uri: string }[]
	>([]);
	const [selectedStructureNode, setSelectedStructureNode] =
		useState<StructureNode | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const inputEditorRef = useRef<any>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const outputEditorRef = useRef<any>(null);
	const debouncedInput = useDebounce(input, 300);

	const processInput = useCallback(
		(text: string) => {
			if (!text.trim()) {
				setOutput("");
				setJsonOutput("");
				setError(null);
				setStrategy(null);
				setProcessingTime(undefined);
				setStructureTree(null);
				setNamespaces([]);
				return;
			}
			const start = performance.now();
			const result = smartParseXml(text);

			if (result.doc && !result.error) {
				const indentStr = getIndentStr(prefs.indent);
				const formatted = formatXml(result.doc, indentStr);
				setOutput(formatted);
				setError(null);
				setStrategy(result.strategyLabel);

				const root = result.doc.documentElement;
				if (root) {
					const tree = buildStructureTree(root);
					assignLineNumbers(tree, formatted);
					setStructureTree(tree);
					setNamespaces(collectNamespaces(root));
					try {
						const json = xmlToJson(root);
						const wrapper: Record<string, unknown> = {};
						wrapper[root.tagName] = json;
						setJsonOutput(
							JSON.stringify(
								wrapper,
								null,
								prefs.indent === "tab" ? 2 : prefs.indent,
							),
						);
					} catch {
						setJsonOutput("");
					}
				}
			} else {
				setOutput("");
				setJsonOutput("");
				setError(result.error);
				setStrategy(result.strategyLabel);
				setStructureTree(null);
				setNamespaces([]);
			}
			setProcessingTime(performance.now() - start);
		},
		[prefs.indent],
	);

	useEffect(() => {
		processInput(debouncedInput);
	}, [debouncedInput, processInput]);

	const handleFormat = useCallback(() => {
		if (!input.trim()) return;
		processInput(input);
	}, [input, processInput]);

	const handleMinify = useCallback(() => {
		if (!input.trim()) return;
		const start = performance.now();
		const { error: parseErr } = parseXml(input);
		if (parseErr) {
			setError(parseErr);
			setOutput("");
		} else {
			setOutput(minifyXml(input));
			setError(null);
		}
		setProcessingTime(performance.now() - start);
	}, [input]);

	const handleValidate = useCallback(() => {
		if (!input.trim()) return;
		const { error: parseErr, doc } = parseXml(input);
		if (!parseErr && doc) {
			const stats = collectDomStats(doc);
			setValidationResult({ valid: true, errors: [], stats });
		} else {
			setValidationResult(scanXmlErrors(input));
		}
		setShowValidation(true);
	}, [input]);

	const handleXmlToJson = useCallback(() => {
		if (!input.trim()) return;
		const result = smartParseXml(input);
		if (result.doc && !result.error) {
			const root = result.doc.documentElement;
			if (root) {
				try {
					const json = xmlToJson(root);
					const wrapper: Record<string, unknown> = {};
					wrapper[root.tagName] = json;
					setJsonOutput(
						JSON.stringify(
							wrapper,
							null,
							prefs.indent === "tab" ? 2 : prefs.indent,
						),
					);
					setOutputTab("json");
				} catch (e) {
					setError(String(e));
				}
			}
		}
	}, [input, prefs.indent]);

	const handleClear = useCallback(() => {
		setInput("");
		setOutput("");
		setJsonOutput("");
		setError(null);
		setStrategy(null);
		setProcessingTime(undefined);
		setStructureTree(null);
		setNamespaces([]);
		setValidationResult(null);
		setShowValidation(false);
		setSelectedStructureNode(null);
	}, [setInput]);

	const jumpToInputLine = useCallback((line: number) => {
		const editor = inputEditorRef.current;
		if (editor) {
			editor.revealLineInCenter(line);
			editor.setPosition({ lineNumber: line, column: 1 });
			editor.focus();
		}
	}, []);

	const jumpToOutputLine = useCallback((line: number) => {
		const editor = outputEditorRef.current;
		if (editor) {
			editor.revealLineInCenter(line);
			editor.setPosition({ lineNumber: line, column: 1 });
			editor.focus();
		}
		setOutputTab("output");
	}, []);

	const inputBytes = new TextEncoder().encode(input).length;
	const activeOutput = outputTab === "json" ? jsonOutput : output;
	const outputBytes = new TextEncoder().encode(activeOutput).length;

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
					<button
						onClick={handleValidate}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Validate
					</button>
					<button
						onClick={handleXmlToJson}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						XML→JSON
					</button>
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
					<CopyButton text={activeOutput} label='Copy' />
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
				</ToolPageHeader>

				<div className='flex flex-1 overflow-hidden'>
					{/* Input panel */}
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
								language='xml'
								height='100%'
								onEditorMount={(e) => {
									inputEditorRef.current = e;
								}}
							/>
						</div>
						{error && (
							<div className='p-2'>
								<ErrorBox error={error} />
							</div>
						)}
						{strategy && !error && (
							<div className='px-3 py-1'>
								<span className='inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent'>
									{strategy}
								</span>
							</div>
						)}
					</div>

					{/* Output panel with tabs */}
					<div className='flex flex-1 flex-col'>
						<div className='flex items-center border-b border-border px-3 py-1 gap-3'>
							{(["output", "structure", "json"] as OutputTab[]).map((tab) => (
								<button
									key={tab}
									onClick={() => setOutputTab(tab)}
									className={cn(
										"text-[10px] font-medium pb-0.5",
										outputTab === tab
											? "text-accent border-b border-accent"
											: "text-muted-foreground hover:text-zinc-300",
									)}
								>
									{tab === "output"
										? "Output"
										: tab === "structure"
											? "Structure"
											: "JSON"}
								</button>
							))}
							<span className='ml-auto text-[10px] text-muted-foreground'>
								{formatBytes(outputBytes)}
							</span>
						</div>
						<div className='flex-1'>
							{outputTab === "output" && (
								<MonacoWrapper
									value={output}
									language='xml'
									readOnly
									height='100%'
									onEditorMount={(e) => {
										outputEditorRef.current = e;
									}}
								/>
							)}
							{outputTab === "structure" && (
								<StructurePanel
									tree={structureTree}
									namespaces={namespaces}
									selectedNode={selectedStructureNode}
									onSelectNode={setSelectedStructureNode}
									onJumpToLine={jumpToOutputLine}
								/>
							)}
							{outputTab === "json" && (
								<MonacoWrapper
									value={jsonOutput}
									language='json'
									readOnly
									height='100%'
								/>
							)}
						</div>
					</div>
				</div>

				{showValidation && validationResult && (
					<ValidationDrawer
						result={validationResult}
						onJumpToLine={jumpToInputLine}
						onClose={() => setShowValidation(false)}
					/>
				)}

				<StatsBar
					inputChars={input.length}
					inputBytes={inputBytes}
					outputChars={activeOutput.length}
					outputBytes={outputBytes}
					processingTime={processingTime}
				/>
			</div>
		</>
	);
}
