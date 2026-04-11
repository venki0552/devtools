import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	TOOL_CATEGORIES,
	getToolsByCategory,
	type ToolCategory,
} from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";

export function Sidebar() {
	const router = useRouterState();
	const currentPath = router.location.pathname;
	const toolsByCategory = getToolsByCategory();
	const [collapsed, setCollapsed] = useLocalStorage<Record<string, boolean>>(
		"devtools-sidebar-collapsed",
		{},
	);
	const [mobileOpen, setMobileOpen] = useState(false);

	const toggleCategory = (cat: ToolCategory) => {
		setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
	};

	const sidebarContent = (
		<div className='flex h-full flex-col'>
			{/* Logo */}
			<Link
				to='/'
				className='flex items-center gap-2 border-b border-border px-4 py-3'
				aria-label='DevTools Home'
			>
				<Wrench className='h-5 w-5 text-accent' />
				<span className='font-semibold text-sm tracking-tight'>DevTools</span>
			</Link>

			{/* Tool list */}
			<nav
				className='flex-1 overflow-y-auto px-2 py-2'
				aria-label='Tool navigation'
			>
				{TOOL_CATEGORIES.map((category) => {
					const tools = toolsByCategory[category];
					if (!tools.length) return null;
					const isCollapsed = collapsed[category];

					return (
						<div key={category} className='mb-1'>
							<button
								onClick={() => toggleCategory(category)}
								className='flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors'
								aria-expanded={!isCollapsed}
							>
								<span>{category}</span>
								<ChevronDown
									className={cn(
										"h-3 w-3 transition-transform",
										isCollapsed && "-rotate-90",
									)}
								/>
							</button>

							{!isCollapsed && (
								<div className='mt-0.5 space-y-0.5'>
									{tools.map((tool) => {
										const Icon = tool.icon;
										const isActive = currentPath === tool.route;
										return (
											<Link
												key={tool.id}
												to={tool.route}
												onClick={() => setMobileOpen(false)}
												className={cn(
													"flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
													isActive
														? "bg-accent/10 text-accent font-medium"
														: "text-muted-foreground hover:bg-zinc-800/50 hover:text-foreground",
												)}
												aria-current={isActive ? "page" : undefined}
											>
												<Icon className='h-3.5 w-3.5 shrink-0' />
												<span className='truncate'>{tool.name}</span>
											</Link>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</nav>
		</div>
	);

	return (
		<>
			{/* Mobile toggle */}
			<button
				onClick={() => setMobileOpen(!mobileOpen)}
				className='fixed top-3 left-3 z-50 rounded-md bg-panel p-2 lg:hidden'
				aria-label='Toggle sidebar'
			>
				<Wrench className='h-4 w-4' />
			</button>

			{/* Mobile overlay */}
			{mobileOpen && (
				<div
					className='fixed inset-0 z-40 bg-black/50 lg:hidden'
					onClick={() => setMobileOpen(false)}
				/>
			)}

			{/* Sidebar */}
			<aside
				className={cn(
					"fixed left-0 top-0 z-40 h-screen w-60 border-r border-border bg-panel transition-transform lg:translate-x-0",
					mobileOpen ? "translate-x-0" : "-translate-x-full",
				)}
			>
				{sidebarContent}
			</aside>
		</>
	);
}
