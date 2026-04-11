import {
	useState,
	useRef,
	useCallback,
	useEffect,
	type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface ResizablePanelProps {
	left: ReactNode;
	right: ReactNode;
	defaultLeftWidth?: number; // percentage (0-100)
	minLeftWidth?: number; // percentage
	maxLeftWidth?: number; // percentage
	className?: string;
}

export function ResizablePanel({
	left,
	right,
	defaultLeftWidth = 50,
	minLeftWidth = 20,
	maxLeftWidth = 80,
	className,
}: ResizablePanelProps) {
	const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
	const containerRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		isDragging.current = true;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
	}, []);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDragging.current || !containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const pct = ((e.clientX - rect.left) / rect.width) * 100;
			setLeftWidth(Math.max(minLeftWidth, Math.min(maxLeftWidth, pct)));
		};

		const handleMouseUp = () => {
			if (isDragging.current) {
				isDragging.current = false;
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [minLeftWidth, maxLeftWidth]);

	return (
		<div ref={containerRef} className={cn("flex h-full", className)}>
			<div
				style={{ width: `${leftWidth}%` }}
				className='flex-shrink-0 overflow-hidden'
			>
				{left}
			</div>
			<div
				className='flex w-1.5 cursor-col-resize items-center justify-center hover:bg-accent/20 transition-colors'
				onMouseDown={handleMouseDown}
				role='separator'
				aria-orientation='vertical'
				aria-label='Resize panels'
				tabIndex={0}
			>
				<div className='h-8 w-0.5 rounded-full bg-border' />
			</div>
			<div className='flex-1 overflow-hidden'>{right}</div>
		</div>
	);
}
