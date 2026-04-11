import { createFileRoute, Link } from "@tanstack/react-router";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { Search } from "lucide-react";
import {
	TOOL_CATEGORIES,
	getToolsByCategory,
	searchTools,
} from "@/lib/constants";

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	const [query, setQuery] = useState("");
	const toolsByCategory = getToolsByCategory();
	const filtered = query ? searchTools(query) : null;

	return (
		<>
			<Helmet>
				<title>DevTools — Free Online Developer Utilities</title>
				<meta
					name='description'
					content='A collection of 21+ free, client-side developer tools: JSON formatter, SQL visualizer, Base64 encoder, JWT decoder, regex tester, and more. All data stays in your browser.'
				/>
				<meta
					name='keywords'
					content='developer tools, json formatter, sql formatter, base64, jwt decoder, regex tester, url encoder, hash generator, uuid generator, color converter'
				/>
			</Helmet>

			<div className='mx-auto max-w-5xl px-6 py-8'>
				{/* Hero section — static HTML for crawlers */}
				<section className='mb-8'>
					<h1 className='mb-2 text-2xl font-bold tracking-tight'>
						Developer Tools
					</h1>
					<p className='mb-6 max-w-2xl text-sm text-muted'>
						A suite of 21+ free, privacy-first developer utilities. All
						processing happens in your browser — no data is ever sent to a
						server. Format JSON, decode JWTs, test regex, hash strings, convert
						colors, and much more.
					</p>

					{/* Search */}
					<div className='relative max-w-md'>
						<Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
						<input
							type='search'
							placeholder='Search tools...'
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className='h-10 w-full rounded-lg border border-border bg-panel pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none'
							aria-label='Search developer tools'
						/>
					</div>
				</section>

				{/* Filtered results */}
				{filtered ? (
					<section>
						<h2 className='mb-3 text-xs font-medium text-muted'>
							{filtered.length} result{filtered.length !== 1 ? "s" : ""}
						</h2>
						<div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
							{filtered.map((tool) => (
								<ToolCard key={tool.id} tool={tool} />
							))}
						</div>
					</section>
				) : (
					/* Grouped by category */
					TOOL_CATEGORIES.map((category) => {
						const tools = toolsByCategory[category];
						if (!tools.length) return null;
						return (
							<section key={category} className='mb-8'>
								<h2 className='mb-3 text-xs font-medium uppercase tracking-wider text-muted'>
									{category}
								</h2>
								<div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
									{tools.map((tool) => (
										<ToolCard key={tool.id} tool={tool} />
									))}
								</div>
							</section>
						);
					})
				)}
			</div>
		</>
	);
}

function ToolCard({
	tool,
}: {
	tool: (typeof import("@/lib/constants"))["TOOLS"][number];
}) {
	const Icon = tool.icon;
	return (
		<Link
			to={tool.route}
			className='group flex items-start gap-3 rounded-lg border border-border bg-panel p-4 transition-colors hover:border-accent/40 hover:bg-accent/5'
		>
			<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent'>
				<Icon className='h-4 w-4' />
			</div>
			<div className='min-w-0'>
				<h3 className='text-sm font-medium group-hover:text-accent transition-colors'>
					{tool.name}
				</h3>
				<p className='mt-0.5 text-xs text-muted-foreground line-clamp-2'>
					{tool.description}
				</p>
			</div>
		</Link>
	);
}
