import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ToolPageHeaderProps {
	title: string;
	children?: ReactNode;
	className?: string;
}

export function ToolPageHeader({
	title,
	children,
	className,
}: ToolPageHeaderProps) {
	return (
		<div
			className={cn(
				"flex h-10 items-center justify-between border-b border-border bg-panel px-3",
				className,
			)}
		>
			<h2 className='text-xs font-semibold'>{title}</h2>
			{children && <div className='flex items-center gap-1.5'>{children}</div>}
		</div>
	);
}
