import { useState, useCallback, useId } from "react";
import { SEOHead } from "@/components/shared/SEOHead";
import {
	Database,
	AlertTriangle,
	ArrowRight,
	X,
	Filter,
	GitMerge,
	Layers,
	ArrowUpDown,
	Scissors,
	LayoutList,
	History,
	ChevronRight,
} from "lucide-react";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { ErrorBox } from "@/components/shared/ErrorBox";
import { MonacoWrapper } from "@/components/shared/MonacoWrapper";
import {
	analyzeSQL,
	type AnalysisResult,
	type TableInfo,
	type JoinInfo,
	type FilterInfo,
	type PotentialIssue,
	type DataFlowStep,
	type GroupingInfo,
} from "./analyzer";

const tool = TOOLS.find((t) => t.id === "sql-visualizer")!;

type Dialect = "postgresql" | "mysql" | "sqlite" | "sqlserver" | "bigquery";

interface SqlVisualizerPrefs {
	dialect: Dialect;
}

interface HistoryEntry {
	sql: string;
	dialect: Dialect;
	result: AnalysisResult;
	timestamp: number;
}

type ResultTab =
	| "summary"
	| "tables"
	| "joins"
	| "join-graph"
	| "venn"
	| "data-flow"
	| "output-shape"
	| "filters"
	| "grouping"
	| "issues";

function getComplexityColor(score: number): string {
	if (score <= 3) return "bg-green-400";
	if (score <= 6) return "bg-amber-400";
	return "bg-red-400";
}

function getComplexityLabel(score: number): string {
	if (score <= 3) return "Simple";
	if (score <= 6) return "Moderate";
	return "Complex";
}

// -- Result Panels --
function SummaryPanel({ result }: { result: AnalysisResult }) {
	const score = result.complexityScore;
	return (
		<div className='space-y-4 p-4'>
			<div>
				<h4 className='mb-1 text-xs font-semibold text-muted-foreground'>
					Summary
				</h4>
				<p className='text-sm leading-relaxed'>{result.summary}</p>
			</div>
			<div>
				<h4 className='mb-2 text-xs font-semibold text-muted-foreground'>
					Complexity
				</h4>
				<div className='flex items-center gap-3'>
					<div className='h-2.5 flex-1 rounded-full bg-zinc-700'>
						<div
							className={cn(
								"h-full rounded-full transition-all",
								getComplexityColor(score),
							)}
							style={{ width: `${score * 10}%` }}
						/>
					</div>
					<span className='text-xs font-medium tabular-nums'>{score}/10</span>
					<span
						className={cn(
							"rounded-full px-2 py-0.5 text-[10px] font-medium text-zinc-950",
							getComplexityColor(score),
						)}
					>
						{getComplexityLabel(score)}
					</span>
				</div>
			</div>
		</div>
	);
}

function TablesPanel({ tables }: { tables: TableInfo[] }) {
	if (tables.length === 0) return <EmptyTab message='No tables detected.' />;
	return (
		<div className='grid gap-3 p-4 sm:grid-cols-2'>
			{tables.map((t, i) => (
				<div
					key={i}
					className='rounded-lg border border-border bg-zinc-800/50 p-3'
				>
					<div className='mb-1 flex items-center gap-2'>
						<Database className='h-3.5 w-3.5 text-accent' />
						<span className='text-xs font-semibold'>{t.name}</span>
						{t.alias && (
							<span className='text-[10px] text-muted-foreground'>
								as {t.alias}
							</span>
						)}
						<span
							className={cn(
								"ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
								t.role === "primary"
									? "bg-accent/20 text-accent"
									: "bg-info/20 text-info",
							)}
						>
							{t.role}
						</span>
					</div>
					{t.columns.length > 0 && (
						<div className='mt-2 flex flex-wrap gap-1'>
							{t.columns.map((col, j) => (
								<span
									key={j}
									className='rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground'
								>
									{col}
								</span>
							))}
						</div>
					)}
				</div>
			))}
		</div>
	);
}

function JoinsPanel({ joins }: { joins: JoinInfo[] }) {
	if (joins.length === 0) return <EmptyTab message='No joins detected.' />;
	return (
		<div className='space-y-3 p-4'>
			{joins.map((j, i) => (
				<div
					key={i}
					className='rounded-lg border border-border bg-zinc-800/50 p-3'
				>
					<div className='mb-1 flex items-center gap-2 text-xs'>
						<span className='rounded bg-info/20 px-2 py-0.5 text-[10px] font-medium text-info'>
							{j.type}
						</span>
						<span className='font-mono font-medium'>{j.leftTable}</span>
						<ArrowRight className='h-3 w-3 text-muted' />
						<span className='font-mono font-medium'>{j.rightTable}</span>
					</div>
					<p className='mt-1 font-mono text-[11px] text-muted-foreground'>
						{j.condition}
					</p>
					<p className='mt-1.5 text-xs text-foreground/80'>{j.explanation}</p>
				</div>
			))}
		</div>
	);
}

function FiltersPanel({ filters }: { filters: FilterInfo[] }) {
	if (filters.length === 0) return <EmptyTab message='No filters detected.' />;
	return (
		<div className='space-y-3 p-4'>
			{filters.map((f, i) => (
				<div
					key={i}
					className='rounded-lg border border-border bg-zinc-800/50 p-3'
				>
					<span className='rounded bg-warning/20 px-2 py-0.5 text-[10px] font-medium text-warning'>
						{f.clause}
					</span>
					<p className='mt-2 font-mono text-[11px] text-muted-foreground'>
						{f.expression}
					</p>
					{f.columns.length > 0 && (
						<p className='mt-1.5 text-xs text-foreground/80'>
							Columns: {f.columns.join(", ")}
						</p>
					)}
				</div>
			))}
		</div>
	);
}

function IssuesPanel({ issues }: { issues: PotentialIssue[] }) {
	if (issues.length === 0)
		return (
			<div className='flex flex-col items-center justify-center p-8 text-center'>
				<p className='text-xs text-success'>No potential issues detected.</p>
			</div>
		);
	return (
		<div className='space-y-3 p-4'>
			{issues.map((issue, i) => (
				<div
					key={i}
					className={cn(
						"rounded-lg border p-3",
						issue.severity === "warning"
							? "border-warning/30 bg-warning/5"
							: "border-info/30 bg-info/5",
					)}
				>
					<div className='mb-1 flex items-center gap-2'>
						<AlertTriangle
							className={cn(
								"h-3.5 w-3.5",
								issue.severity === "warning" ? "text-warning" : "text-info",
							)}
						/>
						<span className='text-xs font-semibold'>{issue.title}</span>
					</div>
					<p className='text-xs text-foreground/80'>{issue.description}</p>
				</div>
			))}
		</div>
	);
}

function EmptyTab({ message }: { message: string }) {
	return (
		<div className='flex flex-col items-center justify-center p-8 text-center'>
			<p className='text-xs text-muted-foreground'>{message}</p>
		</div>
	);
}

// -- SVG Helpers --
function getNodeColor(role: string): { fill: string; stroke: string } {
	switch (role) {
		case "primary":
			return { fill: "rgba(251,146,60,0.2)", stroke: "#fb923c" };
		case "joined":
			return { fill: "rgba(161,161,170,0.2)", stroke: "#a1a1aa" };
		case "subquery":
			return { fill: "rgba(192,132,252,0.2)", stroke: "#c084fc" };
		case "cte":
			return { fill: "rgba(96,165,250,0.2)", stroke: "#60a5fa" };
		default:
			return { fill: "rgba(161,161,170,0.2)", stroke: "#a1a1aa" };
	}
}

function getEdgeStyle(joinType: string): {
	strokeDasharray: string;
	stroke: string;
} {
	const upper = joinType.toUpperCase();
	if (upper.includes("CROSS"))
		return { strokeDasharray: "2,4", stroke: "#a1a1aa" };
	if (upper.includes("FULL"))
		return { strokeDasharray: "6,3", stroke: "#a1a1aa" };
	if (upper.includes("LEFT"))
		return { strokeDasharray: "6,3", stroke: "#a1a1aa" };
	if (upper.includes("RIGHT"))
		return { strokeDasharray: "6,3", stroke: "#a1a1aa" };
	return { strokeDasharray: "none", stroke: "#fb923c" };
}

// -- Join Graph Panel --
function JoinGraphPanel({
	tables,
	joins,
}: {
	tables: TableInfo[];
	joins: JoinInfo[];
}) {
	const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);

	if (tables.length === 0) return <EmptyTab message='No tables detected.' />;

	const nodeWidth = 120;
	const nodeHeight = 50;
	const spacing = 60;
	const padding = 40;
	const nodesPerRow = Math.min(tables.length, 4);
	const rows = Math.ceil(tables.length / nodesPerRow);

	const positions = tables.map((_, i) => {
		const row = Math.floor(i / nodesPerRow);
		const col = i % nodesPerRow;
		const countInRow = Math.min(nodesPerRow, tables.length - row * nodesPerRow);
		const rowWidth = countInRow * nodeWidth + (countInRow - 1) * spacing;
		const totalWidth = nodesPerRow * nodeWidth + (nodesPerRow - 1) * spacing;
		const offsetX = (totalWidth - rowWidth) / 2;
		return {
			x: padding + offsetX + col * (nodeWidth + spacing),
			y: padding + row * (nodeHeight + 80),
			cx: padding + offsetX + col * (nodeWidth + spacing) + nodeWidth / 2,
			cy: padding + row * (nodeHeight + 80) + nodeHeight / 2,
		};
	});

	const svgWidth = Math.max(
		400,
		nodesPerRow * (nodeWidth + spacing) + padding * 2,
	);
	const svgHeight = rows * (nodeHeight + 80) + padding * 2;
	const tableIndex = new Map(tables.map((t, i) => [t.name, i]));

	if (tables.length === 1) {
		const t = tables[0];
		const color = getNodeColor(t.role);
		return (
			<div className='p-4 overflow-auto'>
				<svg width={svgWidth} height={160} className='mx-auto block'>
					<rect
						x={positions[0].x}
						y={positions[0].y}
						width={nodeWidth}
						height={nodeHeight}
						rx={6}
						fill={color.fill}
						stroke={color.stroke}
						strokeWidth={1.5}
					/>
					<text
						x={positions[0].cx}
						y={positions[0].cy - 4}
						textAnchor='middle'
						fill='currentColor'
						fontSize={12}
						fontWeight={500}
					>
						{t.name}
					</text>
					{t.alias && (
						<text
							x={positions[0].cx}
							y={positions[0].cy + 12}
							textAnchor='middle'
							fill='#a1a1aa'
							fontSize={10}
						>
							({t.alias})
						</text>
					)}
					<text
						x={positions[0].cx}
						y={positions[0].cy + nodeHeight / 2 + 24}
						textAnchor='middle'
						fill='#a1a1aa'
						fontSize={11}
					>
						No JOINs
					</text>
				</svg>
			</div>
		);
	}

	return (
		<div className='p-4 overflow-auto'>
			<svg width={svgWidth} height={svgHeight} className='mx-auto block'>
				{joins.map((j, i) => {
					const li = tableIndex.get(j.leftTable);
					const ri = tableIndex.get(j.rightTable);
					if (li === undefined || ri === undefined) return null;
					const from = positions[li];
					const to = positions[ri];
					const style = getEdgeStyle(j.type);
					const midX = (from.cx + to.cx) / 2;
					const midY = (from.cy + to.cy) / 2 - 12;
					return (
						<g
							key={`edge-${i}`}
							onMouseEnter={() => setHoveredEdge(i)}
							onMouseLeave={() => setHoveredEdge(null)}
						>
							<line
								x1={from.cx}
								y1={from.cy}
								x2={to.cx}
								y2={to.cy}
								stroke={style.stroke}
								strokeWidth={hoveredEdge === i ? 2.5 : 1.5}
								strokeDasharray={
									style.strokeDasharray === "none"
										? undefined
										: style.strokeDasharray
								}
								opacity={hoveredEdge !== null && hoveredEdge !== i ? 0.3 : 1}
							/>
							<text
								x={midX}
								y={midY}
								textAnchor='middle'
								fill='#a1a1aa'
								fontSize={9}
								fontWeight={500}
							>
								{j.type}
							</text>
							{hoveredEdge === i && (
								<g>
									<rect
										x={midX - 100}
										y={midY + 4}
										width={200}
										height={22}
										rx={4}
										fill='#27272a'
										stroke='#3f3f46'
										strokeWidth={1}
									/>
									<text
										x={midX}
										y={midY + 18}
										textAnchor='middle'
										fill='#e4e4e7'
										fontSize={10}
										fontFamily='monospace'
									>
										{j.condition.length > 40
											? j.condition.slice(0, 37) + "\u2026"
											: j.condition}
									</text>
								</g>
							)}
						</g>
					);
				})}
				{tables.map((t, i) => {
					const pos = positions[i];
					const color = getNodeColor(t.role);
					return (
						<g key={`node-${i}`}>
							<rect
								x={pos.x}
								y={pos.y}
								width={nodeWidth}
								height={nodeHeight}
								rx={6}
								fill={color.fill}
								stroke={color.stroke}
								strokeWidth={1.5}
							/>
							<text
								x={pos.cx}
								y={pos.cy - 4}
								textAnchor='middle'
								fill='currentColor'
								fontSize={12}
								fontWeight={500}
							>
								{t.name}
							</text>
							{t.alias && (
								<text
									x={pos.cx}
									y={pos.cy + 12}
									textAnchor='middle'
									fill='#a1a1aa'
									fontSize={10}
								>
									({t.alias})
								</text>
							)}
						</g>
					);
				})}
			</svg>
			<div className='mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground'>
				<span className='flex items-center gap-1'>
					<span
						className='inline-block h-2.5 w-2.5 rounded-sm'
						style={{ background: "#fb923c" }}
					/>
					Primary
				</span>
				<span className='flex items-center gap-1'>
					<span
						className='inline-block h-2.5 w-2.5 rounded-sm'
						style={{ background: "#a1a1aa" }}
					/>
					Joined
				</span>
				<span className='flex items-center gap-1'>
					<span
						className='inline-block h-2.5 w-2.5 rounded-sm'
						style={{ background: "#c084fc" }}
					/>
					Subquery
				</span>
				<span className='flex items-center gap-1'>
					<span
						className='inline-block h-2.5 w-2.5 rounded-sm'
						style={{ background: "#60a5fa" }}
					/>
					CTE
				</span>
				<span>{"\u2014"} solid = INNER</span>
				<span>--- dashed = LEFT/RIGHT/FULL</span>
				<span>{"\u00B7\u00B7\u00B7"} dotted = CROSS</span>
			</div>
		</div>
	);
}

// -- Venn Diagram Components --
function VennSvg({ joinType }: { joinType: string }) {
	const upper = joinType.toUpperCase();
	const w = 120;
	const h = 80;
	const r = 28;
	const cx1 = 42;
	const cx2 = 78;
	const cy = 40;
	const active = "#fb923c";
	const inactive = "#3f3f46";
	const activeFill = "rgba(251,146,60,0.4)";
	const inactiveFill = "rgba(63,63,70,0.3)";
	const clipId = useId();

	if (upper.includes("CROSS")) {
		return (
			<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
				<circle
					cx={cx1 - 6}
					cy={cy}
					r={r}
					fill={activeFill}
					stroke={active}
					strokeWidth={1.5}
				/>
				<circle
					cx={cx2 + 6}
					cy={cy}
					r={r}
					fill={activeFill}
					stroke={active}
					strokeWidth={1.5}
				/>
				<text
					x={w / 2}
					y={cy + 4}
					textAnchor='middle'
					fill={active}
					fontSize={14}
					fontWeight={700}
				>
					{"\u00D7"}
				</text>
			</svg>
		);
	}

	const isLeft = upper.includes("LEFT");
	const isRight = upper.includes("RIGHT");
	const isFull = upper.includes("FULL");
	const leftActive = isLeft || isFull;
	const rightActive = isRight || isFull;

	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<defs>
				<clipPath id={`${clipId}-left`}>
					<circle cx={cx1} cy={cy} r={r} />
				</clipPath>
			</defs>
			<circle
				cx={cx1}
				cy={cy}
				r={r}
				fill={leftActive ? activeFill : inactiveFill}
				stroke={leftActive ? active : inactive}
				strokeWidth={1.5}
			/>
			<circle
				cx={cx2}
				cy={cy}
				r={r}
				fill={rightActive ? activeFill : inactiveFill}
				stroke={rightActive ? active : inactive}
				strokeWidth={1.5}
			/>
			<circle
				cx={cx2}
				cy={cy}
				r={r}
				fill={activeFill}
				clipPath={`url(#${clipId}-left)`}
			/>
			<circle
				cx={cx1}
				cy={cy}
				r={r}
				fill='none'
				stroke={leftActive ? active : inactive}
				strokeWidth={1.5}
			/>
			<circle
				cx={cx2}
				cy={cy}
				r={r}
				fill='none'
				stroke={rightActive ? active : inactive}
				strokeWidth={1.5}
			/>
		</svg>
	);
}

function getJoinPlainEnglish(joinType: string): string {
	const upper = joinType.toUpperCase();
	if (upper.includes("CROSS"))
		return "Every row from the left paired with every row from the right (Cartesian product)";
	if (upper.includes("FULL"))
		return "All rows from both tables; unmatched rows filled with NULLs";
	if (upper.includes("LEFT"))
		return "All rows from the left table; matched rows from the right, NULLs if no match";
	if (upper.includes("RIGHT"))
		return "All rows from the right table; matched rows from the left, NULLs if no match";
	return "Only rows that match in both tables";
}

function VennDiagramsPanel({ joins }: { joins: JoinInfo[] }) {
	if (joins.length === 0) return <EmptyTab message='No joins to visualize.' />;
	return (
		<div className='grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3'>
			{joins.map((j, i) => (
				<div
					key={i}
					className='flex flex-col items-center rounded-lg border border-border bg-zinc-800/50 p-3'
				>
					<div className='mb-1 text-[10px] font-medium text-muted-foreground'>
						{j.leftTable} {"\u2192"} {j.rightTable}
					</div>
					<span className='mb-1 rounded bg-info/20 px-2 py-0.5 text-[10px] font-medium text-info'>
						{j.type}
					</span>
					<VennSvg joinType={j.type} />
					<p className='mt-2 text-center text-[11px] text-muted-foreground leading-snug'>
						{getJoinPlainEnglish(j.type)}
					</p>
				</div>
			))}
		</div>
	);
}

// -- Data Flow Stepper Panel --
const STEP_ICONS: Record<string, React.ReactNode> = {
	FROM: <Database className='h-3.5 w-3.5' />,
	WHERE: <Filter className='h-3.5 w-3.5' />,
	JOIN: <GitMerge className='h-3.5 w-3.5' />,
	"GROUP BY": <Layers className='h-3.5 w-3.5' />,
	HAVING: <Filter className='h-3.5 w-3.5' />,
	"ORDER BY": <ArrowUpDown className='h-3.5 w-3.5' />,
	LIMIT: <Scissors className='h-3.5 w-3.5' />,
	SELECT: <LayoutList className='h-3.5 w-3.5' />,
};

function DataFlowStepperPanel({ steps }: { steps: DataFlowStep[] }) {
	if (!steps || steps.length === 0)
		return <EmptyTab message='No data flow steps available.' />;
	return (
		<div className='p-4'>
			<div className='relative space-y-0'>
				{steps.map((step, i) => (
					<div key={i} className='flex gap-3'>
						<div className='flex flex-col items-center'>
							<div
								className={cn(
									"flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold",
									step.present
										? "border-accent bg-accent/20 text-accent"
										: "border-zinc-600 bg-zinc-800 text-zinc-500",
								)}
							>
								{i + 1}
							</div>
							{i < steps.length - 1 && (
								<div
									className={cn(
										"h-8 w-px",
										step.present ? "bg-accent/40" : "bg-zinc-700",
									)}
								/>
							)}
						</div>
						<div className={cn("pb-4 pt-0.5", !step.present && "opacity-40")}>
							<div className='flex items-center gap-2'>
								<span
									className={cn(
										"flex items-center gap-1.5 text-xs font-semibold",
										step.present ? "text-foreground" : "text-zinc-500",
									)}
								>
									{STEP_ICONS[step.step] || (
										<ChevronRight className='h-3.5 w-3.5' />
									)}
									{step.step}
								</span>
							</div>
							{step.description && step.present && (
								<p className='mt-0.5 text-[11px] text-muted-foreground'>
									{step.description}
								</p>
							)}
							{!step.present && (
								<p className='mt-0.5 text-[11px] text-zinc-600 italic'>
									Not present in query
								</p>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// -- Output Shape Panel --
function OutputShapePanel({ result }: { result: AnalysisResult }) {
	const columns = result.outputColumns;
	const shape = result.outputShape;
	return (
		<div className='p-4 space-y-4'>
			{shape?.estimatedShape && (
				<blockquote className='border-l-2 border-accent pl-3 text-sm italic text-muted-foreground'>
					{shape.estimatedShape}
				</blockquote>
			)}
			{shape && (shape.limit !== null || shape.offset !== null) && (
				<p className='text-xs text-muted-foreground'>
					{shape.limit !== null && shape.offset !== null && shape.offset > 0
						? `Returns at most ${shape.limit} rows, starting at offset ${shape.offset}`
						: shape.limit !== null
							? `Returns at most ${shape.limit} rows`
							: shape.offset !== null
								? `Starting at offset ${shape.offset}`
								: ""}
				</p>
			)}
			{columns.length === 0 ? (
				<EmptyTab message='No output columns detected.' />
			) : (
				<table className='w-full text-xs'>
					<thead>
						<tr className='border-b border-border text-left text-muted-foreground'>
							<th className='pb-2 pr-4 font-medium'>Name</th>
							<th className='pb-2 pr-4 font-medium'>Source table</th>
							<th className='pb-2 pr-4 font-medium'>Expression</th>
							<th className='pb-2 font-medium'>Guessed type</th>
						</tr>
					</thead>
					<tbody>
						{columns.map((c, i) => (
							<tr key={i} className='border-b border-border/50'>
								<td className='py-1.5 pr-4 font-mono'>{c.name}</td>
								<td className='py-1.5 pr-4 text-muted-foreground'>
									{c.source}
								</td>
								<td className='py-1.5 pr-4 font-mono text-muted-foreground'>
									{c.expression || "\u2014"}
								</td>
								<td className='py-1.5 text-muted-foreground'>{c.typeGuess}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

// -- Grouping & Aggregates Panel --
function GroupingPanel({ grouping }: { grouping: GroupingInfo }) {
	if (
		!grouping ||
		(grouping.groupByColumns.length === 0 && grouping.aggregates.length === 0)
	) {
		return (
			<div className='flex flex-col items-center justify-center p-8 text-center'>
				<p className='text-xs text-muted-foreground'>
					No GROUP BY {"\u2014"} all rows returned individually
				</p>
			</div>
		);
	}
	return (
		<div className='p-4 space-y-4'>
			{grouping.groupByColumns.length > 0 && (
				<div>
					<h4 className='mb-2 text-xs font-semibold text-muted-foreground'>
						Group By Columns
					</h4>
					<div className='flex flex-wrap gap-1.5'>
						{grouping.groupByColumns.map((col, i) => (
							<span
								key={i}
								className='rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-medium font-mono text-accent'
							>
								{col}
							</span>
						))}
					</div>
				</div>
			)}
			{grouping.aggregates.length > 0 && (
				<div>
					<h4 className='mb-2 text-xs font-semibold text-muted-foreground'>
						Aggregates
					</h4>
					<table className='w-full text-xs'>
						<thead>
							<tr className='border-b border-border text-left text-muted-foreground'>
								<th className='pb-2 pr-4 font-medium'>Function</th>
								<th className='pb-2 pr-4 font-medium'>Column</th>
								<th className='pb-2 font-medium'>Output alias</th>
							</tr>
						</thead>
						<tbody>
							{grouping.aggregates.map((a, i) => (
								<tr key={i} className='border-b border-border/50'>
									<td className='py-1.5 pr-4 font-mono font-medium text-accent'>
										{a.function}
									</td>
									<td className='py-1.5 pr-4 font-mono text-muted-foreground'>
										{a.column}
									</td>
									<td className='py-1.5 font-mono text-muted-foreground'>
										{a.alias || "\u2014"}
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

// -- History Sidebar --
function HistorySidebar({
	history,
	onRestore,
	onClose,
}: {
	history: HistoryEntry[];
	onRestore: (entry: HistoryEntry) => void;
	onClose: () => void;
}) {
	return (
		<div className='fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-border bg-zinc-900 shadow-xl'>
			<div className='flex items-center justify-between border-b border-border px-4 py-3'>
				<div className='flex items-center gap-2'>
					<History className='h-4 w-4 text-accent' />
					<h3 className='text-sm font-semibold'>History</h3>
				</div>
				<button
					onClick={onClose}
					className='text-muted hover:text-foreground'
					aria-label='Close history'
				>
					<X className='h-4 w-4' />
				</button>
			</div>
			<div className='flex-1 overflow-auto'>
				{history.length === 0 ? (
					<div className='p-6 text-center text-xs text-muted-foreground'>
						No analysis history yet.
					</div>
				) : (
					<div className='divide-y divide-border'>
						{history.map((entry, i) => (
							<button
								key={i}
								onClick={() => onRestore(entry)}
								className='w-full px-4 py-3 text-left hover:bg-zinc-800 transition-colors'
							>
								<div className='flex items-center justify-between mb-1'>
									<span className='rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300'>
										{entry.dialect}
									</span>
									<span className='text-[10px] text-muted-foreground'>
										{new Date(entry.timestamp).toLocaleTimeString()}
									</span>
								</div>
								<p className='text-xs font-mono text-muted-foreground truncate'>
									{entry.sql.slice(0, 80)}
									{entry.sql.length > 80 ? "\u2026" : ""}
								</p>
								<p className='mt-1 text-[11px] text-foreground/70 truncate'>
									{entry.result.summary}
								</p>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

const TABS: { key: ResultTab; label: string }[] = [
	{ key: "summary", label: "Summary" },
	{ key: "tables", label: "Tables" },
	{ key: "joins", label: "Joins" },
	{ key: "join-graph", label: "Join Graph" },
	{ key: "venn", label: "Venn" },
	{ key: "data-flow", label: "Data Flow" },
	{ key: "output-shape", label: "Output" },
	{ key: "filters", label: "Filters" },
	{ key: "grouping", label: "Grouping" },
	{ key: "issues", label: "Issues" },
];

export function SqlVisualizerTool() {
	const [input, setInput] = useLocalStorage(
		"devtools-sql-visualizer-input",
		"",
	);
	const [prefs, setPrefs] = useLocalStorage<SqlVisualizerPrefs>(
		"devtools-sql-visualizer-prefs",
		{
			dialect: "postgresql",
		},
	);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<AnalysisResult | null>(null);
	const [activeTab, setActiveTab] = useState<ResultTab>("summary");
	const [history, setHistory] = useLocalStorage<HistoryEntry[]>(
		"devtools-sql-visualizer-history",
		[],
	);
	const [showHistory, setShowHistory] = useState(false);

	const handleAnalyze = useCallback(() => {
		const trimmed = input.trim();
		if (!trimmed) return;

		setError(null);
		setResult(null);
		try {
			const analysis = analyzeSQL(trimmed, prefs.dialect);
			setResult(analysis);
			setActiveTab("summary");
			setHistory((prev) => {
				const entry: HistoryEntry = {
					sql: trimmed,
					dialect: prefs.dialect,
					result: analysis,
					timestamp: Date.now(),
				};
				return [entry, ...prev].slice(0, 10);
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : "Analysis failed");
		}
	}, [input, prefs.dialect, setHistory]);

	const handleClear = useCallback(() => {
		setInput("");
		setResult(null);
		setError(null);
	}, [setInput]);

	const handleRestoreHistory = useCallback(
		(entry: HistoryEntry) => {
			setInput(entry.sql);
			setPrefs((p) => ({ ...p, dialect: entry.dialect }));
			setResult(entry.result);
			setActiveTab("summary");
			setShowHistory(false);
		},
		[setInput, setPrefs],
	);

	return (
		<>
			<SEOHead tool={tool} />

			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name}>
					<button
						onClick={handleAnalyze}
						disabled={!input.trim()}
						className='h-8 rounded-md bg-accent px-3 text-xs font-medium text-zinc-950 hover:bg-accent/80 disabled:opacity-50'
					>
						Analyze
					</button>
					<select
						value={prefs.dialect}
						onChange={(e) =>
							setPrefs((p) => ({ ...p, dialect: e.target.value as Dialect }))
						}
						className='h-8 rounded-md border border-border bg-zinc-700 px-2 text-xs text-zinc-200'
						aria-label='SQL dialect'
					>
						<option value='postgresql'>PostgreSQL</option>
						<option value='mysql'>MySQL</option>
						<option value='sqlite'>SQLite</option>
						<option value='sqlserver'>SQL Server</option>
						<option value='bigquery'>BigQuery</option>
					</select>
					<button
						onClick={handleClear}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
					>
						Clear
					</button>
					<button
						onClick={() => setShowHistory((v) => !v)}
						className='h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
						title='History'
					>
						<History className='h-3.5 w-3.5' />
					</button>
				</ToolPageHeader>

				<div className='flex flex-1 overflow-hidden'>
					{/* Input panel */}
					<div className='flex w-1/2 flex-col border-r border-border'>
						<div className='flex items-center justify-between border-b border-border px-3 py-1'>
							<span className='text-[10px] text-muted-foreground'>
								SQL Input
							</span>
							<span className='text-[10px] text-muted-foreground'>
								{input.length.toLocaleString()} chars
							</span>
						</div>
						<div className='flex-1'>
							<MonacoWrapper
								value={input}
								onChange={(v) => setInput(v)}
								language='sql'
								height='100%'
								aria-label='SQL input'
							/>
						</div>
					</div>

					{/* Results panel */}
					<div className='flex w-1/2 flex-col'>
						<div className='flex items-center gap-0 border-b border-border overflow-x-auto'>
							{TABS.map((tab) => (
								<button
									key={tab.key}
									onClick={() => setActiveTab(tab.key)}
									className={cn(
										"px-3 py-1.5 text-[11px] font-medium transition-colors",
										activeTab === tab.key
											? "border-b-2 border-accent text-accent"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{tab.label}
									{tab.key === "issues" &&
										result &&
										result.potentialIssues.length > 0 && (
											<span className='ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-warning/20 text-[9px] text-warning'>
												{result.potentialIssues.length}
											</span>
										)}
								</button>
							))}
						</div>

						<div className='flex-1 overflow-auto'>
							{error && (
								<div className='p-4'>
									<ErrorBox error={error} />
									<button
										onClick={handleAnalyze}
										className='mt-3 h-8 rounded-md bg-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-600'
									>
										Retry
									</button>
								</div>
							)}
							{!error && !result && (
								<div className='flex h-full flex-col items-center justify-center p-8 text-center'>
									<Database className='mb-3 h-8 w-8 text-muted' />
									<p className='text-xs text-muted-foreground'>
										Enter a SQL query and click <strong>Analyze</strong> to see
										the breakdown.
									</p>
								</div>
							)}
							{result && (
								<>
									{activeTab === "summary" && <SummaryPanel result={result} />}
									{activeTab === "tables" && (
										<TablesPanel tables={result.tables} />
									)}
									{activeTab === "joins" && <JoinsPanel joins={result.joins} />}
									{activeTab === "join-graph" && (
										<JoinGraphPanel
											tables={result.tables}
											joins={result.joins}
										/>
									)}
									{activeTab === "venn" && (
										<VennDiagramsPanel joins={result.joins} />
									)}
									{activeTab === "data-flow" && (
										<DataFlowStepperPanel steps={result.dataFlowSteps || []} />
									)}
									{activeTab === "output-shape" && (
										<OutputShapePanel result={result} />
									)}
									{activeTab === "filters" && (
										<FiltersPanel filters={result.filters} />
									)}
									{activeTab === "grouping" && (
										<GroupingPanel
											grouping={
												result.grouping || {
													groupByColumns: [],
													aggregates: [],
												}
											}
										/>
									)}
									{activeTab === "issues" && (
										<IssuesPanel issues={result.potentialIssues} />
									)}
								</>
							)}
						</div>
					</div>
				</div>
			</div>
			{showHistory && (
				<HistorySidebar
					history={history}
					onRestore={handleRestoreHistory}
					onClose={() => setShowHistory(false)}
				/>
			)}
		</>
	);
}
