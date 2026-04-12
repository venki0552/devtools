import { Parser } from "node-sql-parser";

// Re-export interfaces so the component can use them
export interface TableInfo {
	name: string;
	alias: string | null;
	role: "primary" | "joined" | "subquery" | "cte";
	columns: string[];
}

export interface JoinInfo {
	type: string;
	leftTable: string;
	rightTable: string;
	condition: string;
	explanation: string;
}

export interface FilterInfo {
	clause: "WHERE" | "HAVING";
	expression: string;
	columns: string[];
}

export interface OutputColumn {
	name: string;
	source: string;
	expression?: string;
	typeGuess: string;
}

export interface PotentialIssue {
	severity: "info" | "warning" | "error";
	title: string;
	description: string;
}

export interface DataFlowStep {
	step: string;
	present: boolean;
	description: string;
}

export interface AggregateInfo {
	function: string;
	column: string;
	alias: string;
}

export interface GroupingInfo {
	groupByColumns: string[];
	aggregates: AggregateInfo[];
}

export interface OutputShapeInfo {
	estimatedShape: string;
	limit: number | null;
	offset: number | null;
}

export interface AnalysisResult {
	summary: string;
	complexityScore: number;
	tables: TableInfo[];
	joins: JoinInfo[];
	filters: FilterInfo[];
	outputColumns: OutputColumn[];
	potentialIssues: PotentialIssue[];
	dataFlowSteps: DataFlowStep[];
	grouping: GroupingInfo;
	outputShape: OutputShapeInfo;
}

type Dialect = "postgresql" | "mysql" | "sqlite" | "sqlserver" | "bigquery";

const DIALECT_MAP: Record<Dialect, string> = {
	postgresql: "PostgreSQL",
	mysql: "MySQL",
	sqlite: "SQLite",
	sqlserver: "TransactSQL",
	bigquery: "BigQuery",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any;

function getColumnName(col: AstNode): string {
	if (!col) return "*";
	if (typeof col === "string") return col;
	if (col.expr?.value) return col.expr.value;
	if (col.value) return String(col.value);
	return "*";
}

function exprToString(expr: AstNode): string {
	if (!expr) return "";
	if (expr.type === "column_ref") {
		const col = getColumnName(expr.column);
		return expr.table ? `${expr.table}.${col}` : col;
	}
	if (expr.type === "binary_expr") {
		return `${exprToString(expr.left)} ${expr.operator} ${exprToString(expr.right)}`;
	}
	if (expr.type === "number") return String(expr.value);
	if (expr.type === "single_quote_string" || expr.type === "string")
		return `'${expr.value}'`;
	if (expr.type === "double_quote_string") return `"${expr.value}"`;
	if (expr.type === "bool") return String(expr.value);
	if (expr.type === "null") return "NULL";
	if (expr.type === "star") return "*";
	if (expr.type === "aggr_func") {
		const args = expr.args?.expr ? exprToString(expr.args.expr) : "*";
		return `${expr.name}(${args})`;
	}
	if (expr.type === "function") {
		const args = expr.args?.value
			?.map((a: AstNode) => exprToString(a))
			.join(", ");
		return `${expr.name}(${args || ""})`;
	}
	if (expr.type === "expr_list") {
		if (expr.value?.[0]?.ast) return "(subquery)";
		return `(${expr.value?.map((v: AstNode) => exprToString(v)).join(", ") || ""})`;
	}
	if (expr.type === "unary_expr") {
		return `${expr.operator} ${exprToString(expr.expr)}`;
	}
	if (expr.type === "case") {
		return "CASE...END";
	}
	if (expr.type === "cast") {
		return `CAST(${exprToString(expr.expr)} AS ${expr.target?.dataType || "?"})`;
	}
	if (expr.type === "interval") {
		return `INTERVAL ${exprToString(expr.expr)} ${expr.unit || ""}`.trim();
	}
	if (expr.value !== undefined) return String(expr.value);
	return "?";
}

function extractColumnsFromExpr(expr: AstNode, result: string[] = []): string[] {
	if (!expr) return result;
	if (expr.type === "column_ref") {
		result.push(exprToString(expr));
	}
	if (expr.left) extractColumnsFromExpr(expr.left, result);
	if (expr.right) extractColumnsFromExpr(expr.right, result);
	if (expr.expr) extractColumnsFromExpr(expr.expr, result);
	if (expr.args?.expr) extractColumnsFromExpr(expr.args.expr, result);
	return result;
}

function resolveAlias(
	tables: { name: string; alias: string | null }[],
	aliasOrName: string | null,
): string {
	if (!aliasOrName) return "";
	const t = tables.find(
		(t) => t.alias === aliasOrName || t.name === aliasOrName,
	);
	return t ? t.name : aliasOrName;
}

function getJoinExplanation(type: string, left: string, right: string, condition: string): string {
	const upper = type.toUpperCase();
	if (upper.includes("CROSS"))
		return `Cartesian product of ${left} and ${right}`;
	if (upper.includes("LEFT"))
		return `All rows from ${left}, matching rows from ${right} on ${condition}`;
	if (upper.includes("RIGHT"))
		return `All rows from ${right}, matching rows from ${left} on ${condition}`;
	if (upper.includes("FULL"))
		return `All rows from both ${left} and ${right} on ${condition}`;
	return `Rows from ${left} and ${right} matching on ${condition}`;
}

function guessColumnType(name: string, expr: AstNode): string {
	const lower = name.toLowerCase();
	if (expr?.type === "aggr_func") {
		const fn = expr.name?.toUpperCase();
		if (fn === "COUNT") return "integer";
		if (fn === "AVG" || fn === "SUM") return "numeric";
		if (fn === "MIN" || fn === "MAX") return "varies";
		return "numeric";
	}
	if (lower.includes("id") && !lower.includes("video")) return "integer";
	if (lower.includes("name") || lower.includes("title") || lower.includes("description"))
		return "text";
	if (lower.includes("email")) return "text";
	if (lower.includes("date") || lower.includes("created") || lower.includes("updated"))
		return "timestamp";
	if (lower.includes("price") || lower.includes("amount") || lower.includes("total") || lower.includes("salary"))
		return "numeric";
	if (lower.includes("count") || lower.includes("quantity") || lower.includes("age"))
		return "integer";
	if (
		lower.includes("is_") ||
		lower.includes("has_") ||
		lower.includes("active") ||
		lower.includes("enabled")
	)
		return "boolean";
	return "unknown";
}

function computeComplexity(ast: AstNode, tables: TableInfo[], joins: JoinInfo[]): number {
	let score = 1;
	// Joins add complexity
	score += joins.length * 2;
	// Subqueries
	score += tables.filter((t) => t.role === "subquery").length * 3;
	// CTEs
	score += tables.filter((t) => t.role === "cte").length * 2;
	// GROUP BY
	if (ast.groupby) score += 2;
	// HAVING
	if (ast.having) score += 1;
	// ORDER BY
	if (ast.orderby) score += 1;
	// Subquery in WHERE
	if (ast.where && JSON.stringify(ast.where).includes('"ast"')) score += 2;
	// DISTINCT
	if (ast.distinct?.type) score += 1;
	return Math.min(score, 10);
}

function buildDataFlowSteps(ast: AstNode): DataFlowStep[] {
	const steps: DataFlowStep[] = [
		{
			step: "FROM",
			present: Boolean(ast.from?.length),
			description: ast.from?.length
				? `Source tables: ${ast.from.map((f: AstNode) => f.table || "(subquery)").join(", ")}`
				: "",
		},
		{
			step: "JOIN",
			present: ast.from?.some((f: AstNode) => f.join) ?? false,
			description: ast.from
				?.filter((f: AstNode) => f.join)
				.map((f: AstNode) => `${f.join} ${f.table || "(subquery)"}`)
				.join("; ") || "",
		},
		{
			step: "WHERE",
			present: Boolean(ast.where),
			description: ast.where ? exprToString(ast.where) : "",
		},
		{
			step: "GROUP BY",
			present: Boolean(ast.groupby),
			description: ast.groupby
				? `Grouped by: ${ast.groupby.columns?.map((c: AstNode) => exprToString(c)).join(", ") || ""}`
				: "",
		},
		{
			step: "HAVING",
			present: Boolean(ast.having),
			description: ast.having ? exprToString(ast.having) : "",
		},
		{
			step: "SELECT",
			present: true,
			description: ast.columns === "*"
				? "All columns (*)"
				: `${Array.isArray(ast.columns) ? ast.columns.length : 0} columns`,
		},
		{
			step: "ORDER BY",
			present: Boolean(ast.orderby?.length),
			description: ast.orderby
				? ast.orderby
						.map((o: AstNode) => `${exprToString(o.expr)} ${o.type || "ASC"}`)
						.join(", ")
				: "",
		},
		{
			step: "LIMIT",
			present: Boolean(ast.limit?.value?.length),
			description: ast.limit?.value?.length
				? `Limit: ${ast.limit.value.map((v: AstNode) => v.value).join(", ")}`
				: "",
		},
	];
	return steps;
}

function extractFilters(ast: AstNode): FilterInfo[] {
	const filters: FilterInfo[] = [];
	if (ast.where) {
		filters.push({
			clause: "WHERE",
			expression: exprToString(ast.where),
			columns: extractColumnsFromExpr(ast.where),
		});
	}
	if (ast.having) {
		filters.push({
			clause: "HAVING",
			expression: exprToString(ast.having),
			columns: extractColumnsFromExpr(ast.having),
		});
	}
	return filters;
}

function extractTables(ast: AstNode): TableInfo[] {
	const tables: TableInfo[] = [];
	const cteTables = new Set<string>();

	// Extract CTEs
	if (ast.with) {
		const ctes = Array.isArray(ast.with) ? ast.with : [ast.with];
		for (const cte of ctes) {
			if (cte.name?.value || cte.name) {
				const name = cte.name?.value || cte.name;
				cteTables.add(name);
				tables.push({
					name,
					alias: null,
					role: "cte",
					columns: extractCteColumns(cte),
				});
			}
		}
	}

	// Extract FROM tables
	if (ast.from) {
		for (let i = 0; i < ast.from.length; i++) {
			const f = ast.from[i];
			if (f.table) {
				const role = cteTables.has(f.table)
					? "cte" as const
					: f.join
						? "joined" as const
						: i === 0
							? "primary" as const
							: "joined" as const;

				// Don't duplicate CTE entries
				if (role === "cte" && tables.some((t) => t.name === f.table)) {
					continue;
				}

				tables.push({
					name: f.table,
					alias: f.as || null,
					role,
					columns: extractTableColumns(ast, f.table, f.as),
				});
			} else if (f.expr?.ast) {
				// Subquery in FROM
				tables.push({
					name: f.as || "(subquery)",
					alias: f.as || null,
					role: "subquery",
					columns: extractSubqueryColumns(f.expr.ast),
				});
			}
		}
	}

	return tables;
}

function extractCteColumns(cte: AstNode): string[] {
	if (cte.stmt?.ast?.columns && Array.isArray(cte.stmt.ast.columns)) {
		return cte.stmt.ast.columns
			.map((c: AstNode) => c.as || getOutputColName(c.expr))
			.filter(Boolean);
	}
	return [];
}

function extractSubqueryColumns(ast: AstNode): string[] {
	if (!ast.columns || ast.columns === "*") return ["*"];
	return ast.columns
		.map((c: AstNode) => c.as || getOutputColName(c.expr))
		.filter(Boolean);
}

function getOutputColName(expr: AstNode): string {
	if (!expr) return "";
	if (expr.type === "column_ref") return getColumnName(expr.column);
	if (expr.type === "aggr_func") return `${expr.name}(${expr.args?.expr ? exprToString(expr.args.expr) : "*"})`;
	return exprToString(expr);
}

function extractTableColumns(ast: AstNode, tableName: string, alias: string | null): string[] {
	const cols = new Set<string>();
	const tableRef = alias || tableName;

	// Collect columns referenced with this table prefix from SELECT, WHERE, ORDER BY, GROUP BY, JOIN ON
	const visitExpr = (node: AstNode) => {
		if (!node) return;
		if (node.type === "column_ref" && (node.table === tableRef || node.table === tableName)) {
			cols.add(getColumnName(node.column));
		}
		if (node.left) visitExpr(node.left);
		if (node.right) visitExpr(node.right);
		if (node.expr) visitExpr(node.expr);
		if (node.args?.expr) visitExpr(node.args.expr);
		if (Array.isArray(node.value)) {
			for (const v of node.value) visitExpr(v);
		}
	};

	// Visit columns in SELECT
	if (Array.isArray(ast.columns)) {
		for (const c of ast.columns) visitExpr(c.expr);
	}
	// Visit WHERE
	visitExpr(ast.where);
	// Visit ORDER BY
	if (ast.orderby) for (const o of ast.orderby) visitExpr(o.expr);
	// Visit GROUP BY
	if (ast.groupby?.columns) for (const g of ast.groupby.columns) visitExpr(g);
	// Visit HAVING
	visitExpr(ast.having);
	// Visit JOIN ON conditions
	if (ast.from) {
		for (const f of ast.from) {
			if (f.on) visitExpr(f.on);
		}
	}

	return Array.from(cols);
}

function extractJoins(ast: AstNode, tables: TableInfo[]): JoinInfo[] {
	const joins: JoinInfo[] = [];
	if (!ast.from) return joins;

	let prevTable = ast.from[0]?.table || ast.from[0]?.as || "(source)";

	for (let i = 1; i < ast.from.length; i++) {
		const f = ast.from[i];
		if (f.join) {
			const rightTable = f.table || f.as || "(subquery)";
			const leftTableName = f.on?.left?.table
				? resolveAlias(tables, f.on.left.table)
				: resolveAlias(tables, prevTable);
			const condition = f.on ? exprToString(f.on) : "CROSS";

			joins.push({
				type: f.join,
				leftTable: leftTableName || prevTable,
				rightTable: resolveAlias(tables, rightTable) || rightTable,
				condition,
				explanation: getJoinExplanation(
					f.join,
					leftTableName || prevTable,
					resolveAlias(tables, rightTable) || rightTable,
					condition,
				),
			});
		}
		if (f.table) prevTable = f.table;
	}

	return joins;
}

function extractOutputColumns(ast: AstNode, tables: TableInfo[]): OutputColumn[] {
	if (!ast.columns || ast.columns === "*") {
		return [
			{
				name: "*",
				source: tables[0]?.name || "unknown",
				expression: "*",
				typeGuess: "all columns",
			},
		];
	}

	return ast.columns.map((col: AstNode) => {
		const expr = col.expr;
		const alias = col.as;
		const name = alias || getOutputColName(expr);
		const source = expr?.table
			? resolveAlias(tables, expr.table) || expr.table
			: expr?.type === "aggr_func"
				? "(aggregate)"
				: tables[0]?.name || "derived";
		const expression =
			alias && expr ? exprToString(expr) : undefined;
		const typeGuess = guessColumnType(name, expr);

		return { name, source, expression, typeGuess };
	});
}

function extractGrouping(ast: AstNode): GroupingInfo {
	const groupByColumns: string[] = [];
	const aggregates: AggregateInfo[] = [];

	if (ast.groupby?.columns) {
		for (const col of ast.groupby.columns) {
			groupByColumns.push(exprToString(col));
		}
	}

	// Find aggregate functions in SELECT
	if (Array.isArray(ast.columns)) {
		for (const col of ast.columns) {
			if (col.expr?.type === "aggr_func") {
				aggregates.push({
					function: col.expr.name,
					column: col.expr.args?.expr ? exprToString(col.expr.args.expr) : "*",
					alias: col.as || "",
				});
			}
		}
	}

	return { groupByColumns, aggregates };
}

function extractOutputShape(ast: AstNode, tables: TableInfo[], grouping: GroupingInfo): OutputShapeInfo {
	let limit: number | null = null;
	let offset: number | null = null;

	if (ast.limit?.value?.length) {
		const vals = ast.limit.value;
		if (vals.length === 1) {
			limit = vals[0].value;
		} else if (vals.length === 2) {
			// MySQL-style: LIMIT offset, count
			offset = vals[0].value;
			limit = vals[1].value;
		}
	}

	// Build shape description
	const parts: string[] = [];
	if (grouping.groupByColumns.length > 0) {
		parts.push(`Grouped by ${grouping.groupByColumns.join(", ")} — one row per unique combination`);
	}
	if (ast.distinct?.type) {
		parts.push("Only distinct rows returned");
	}
	if (grouping.aggregates.length > 0 && grouping.groupByColumns.length === 0) {
		parts.push("Single-row aggregate result");
	}
	if (limit !== null) {
		parts.push(`Limited to ${limit} rows`);
	}
	if (parts.length === 0) {
		parts.push(`Returns rows from ${tables.map((t) => t.name).join(", ")}`);
	}

	return {
		estimatedShape: parts.join(". "),
		limit,
		offset,
	};
}

function detectIssues(ast: AstNode, tables: TableInfo[], joins: JoinInfo[], grouping: GroupingInfo): PotentialIssue[] {
	const issues: PotentialIssue[] = [];

	// SELECT * warning
	if (ast.columns === "*" || (Array.isArray(ast.columns) && ast.columns.some((c: AstNode) => c.expr?.type === "star"))) {
		issues.push({
			severity: "warning",
			title: "SELECT * usage",
			description: "Using SELECT * retrieves all columns, which may impact performance. Consider selecting only needed columns.",
		});
	}

	// Missing WHERE clause
	if (!ast.where && tables.length > 0 && !ast.groupby) {
		issues.push({
			severity: "info",
			title: "No WHERE clause",
			description: "This query has no WHERE filter and will process all rows from the source tables.",
		});
	}

	// CROSS JOIN warning
	for (const j of joins) {
		if (j.type.toUpperCase().includes("CROSS")) {
			issues.push({
				severity: "warning",
				title: "CROSS JOIN detected",
				description: `Cross join between ${j.leftTable} and ${j.rightTable} produces a Cartesian product, which can result in very large result sets.`,
			});
		}
	}

	// GROUP BY without aggregate
	if (grouping.groupByColumns.length > 0 && grouping.aggregates.length === 0) {
		issues.push({
			severity: "info",
			title: "GROUP BY without aggregates",
			description: "GROUP BY is used without any aggregate functions. Consider using DISTINCT instead.",
		});
	}

	// Many joins
	if (joins.length >= 4) {
		issues.push({
			severity: "info",
			title: "Complex join chain",
			description: `Query joins ${joins.length} tables — consider whether all are necessary for the desired result.`,
		});
	}

	// No LIMIT on large result set
	if (!ast.limit?.value?.length && joins.length > 0 && !ast.groupby) {
		issues.push({
			severity: "info",
			title: "No LIMIT clause",
			description: "Query has no LIMIT and joins multiple tables — may return large result sets.",
		});
	}

	return issues;
}

function buildSummary(ast: AstNode, tables: TableInfo[], joins: JoinInfo[], grouping: GroupingInfo): string {
	const parts: string[] = [];
	const type = (ast.type || "select").toUpperCase();

	if (type === "SELECT") {
		if (tables.length === 1) {
			parts.push(`Selects from ${tables[0].name}`);
		} else if (tables.length > 1) {
			parts.push(
				`Selects from ${tables.length} tables: ${tables.map((t) => t.name).join(", ")}`,
			);
		}
		if (joins.length > 0) {
			parts.push(`with ${joins.length} join${joins.length > 1 ? "s" : ""}`);
		}
		if (grouping.groupByColumns.length > 0) {
			parts.push(`grouped by ${grouping.groupByColumns.join(", ")}`);
		}
		if (grouping.aggregates.length > 0) {
			parts.push(
				`using ${grouping.aggregates.map((a) => `${a.function}(${a.column})`).join(", ")}`,
			);
		}
		if (ast.where) {
			parts.push("with filtering conditions");
		}
		if (ast.orderby) {
			parts.push("with ordering");
		}
		if (ast.limit?.value?.length) {
			parts.push(`limited to ${ast.limit.value[0].value} rows`);
		}
	} else {
		parts.push(`${type} statement`);
	}

	return parts.join(" ") + ".";
}

export function analyzeSQL(sql: string, dialect: Dialect): AnalysisResult {
	const parser = new Parser();
	const dbType = DIALECT_MAP[dialect] || "PostgreSQL";

	let ast: AstNode;
	try {
		ast = parser.astify(sql, { database: dbType });
	} catch (e) {
		throw new Error(
			`SQL parse error: ${e instanceof Error ? e.message : "Invalid SQL syntax"}`,
		);
	}

	// Handle multiple statements — analyze the first one
	if (Array.isArray(ast)) {
		ast = ast[0];
	}

	if (!ast || ast.type !== "select") {
		// For non-SELECT statements, return a minimal result
		return {
			summary: `${(ast?.type || "unknown").toUpperCase()} statement — only SELECT queries provide full visual analysis.`,
			complexityScore: 1,
			tables: [],
			joins: [],
			filters: [],
			outputColumns: [],
			potentialIssues: [],
			dataFlowSteps: [],
			grouping: { groupByColumns: [], aggregates: [] },
			outputShape: { estimatedShape: "N/A for non-SELECT statements", limit: null, offset: null },
		};
	}

	const tables = extractTables(ast);
	const joins = extractJoins(ast, tables);
	const outputColumns = extractOutputColumns(ast, tables);
	const grouping = extractGrouping(ast);
	const filters = extractFilters(ast);
	const dataFlowSteps = buildDataFlowSteps(ast);
	const outputShape = extractOutputShape(ast, tables, grouping);
	const potentialIssues = detectIssues(ast, tables, joins, grouping);
	const complexityScore = computeComplexity(ast, tables, joins);
	const summary = buildSummary(ast, tables, joins, grouping);

	return {
		summary,
		complexityScore,
		tables,
		joins,
		filters,
		outputColumns,
		potentialIssues,
		dataFlowSteps,
		grouping,
		outputShape,
	};
}
