import { Clock, Trash2, RotateCcw, X } from "lucide-react";
import type { HistoryEntry } from "@/lib/use-history";

interface HistoryPanelProps {
	entries: HistoryEntry[];
	onRestore: (value: string) => void;
	onRemove: (timestamp: number) => void;
	onClear: () => void;
	onClose: () => void;
}

export function HistoryPanel({
	entries,
	onRestore,
	onRemove,
	onClear,
	onClose,
}: HistoryPanelProps) {
	return (
		<div className='flex h-full w-72 flex-col border-l border-border bg-panel'>
			{/* Header */}
			<div className='flex items-center justify-between border-b border-border px-3 py-2'>
				<div className='flex items-center gap-1.5'>
					<Clock className='h-3.5 w-3.5 text-muted' />
					<span className='text-xs font-medium'>History</span>
					<span className='rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] text-muted'>
						{entries.length}
					</span>
				</div>
				<button
					onClick={onClose}
					className='rounded-md p-1 text-muted hover:text-foreground transition-colors'
					aria-label='Close history'
				>
					<X className='h-3.5 w-3.5' />
				</button>
			</div>

			{/* Entries */}
			<div className='flex-1 overflow-y-auto'>
				{entries.length === 0 ? (
					<p className='p-4 text-center text-xs text-muted-foreground'>
						No history yet
					</p>
				) : (
					entries.map((entry) => (
						<div
							key={entry.timestamp}
							className='border-b border-border px-3 py-2 hover:bg-zinc-800/50 transition-colors'
						>
							<pre className='mb-1 max-h-12 overflow-hidden text-[10px] font-mono text-panel-foreground truncate'>
								{entry.value.slice(0, 120)}
								{entry.value.length > 120 ? "..." : ""}
							</pre>
							<div className='flex items-center justify-between'>
								<span className='text-[10px] text-muted-foreground'>
									{new Date(entry.timestamp).toLocaleString()}
								</span>
								<div className='flex items-center gap-1'>
									<button
										onClick={() => onRestore(entry.value)}
										className='rounded p-1 text-muted hover:text-accent transition-colors'
										aria-label='Restore this entry'
									>
										<RotateCcw className='h-3 w-3' />
									</button>
									<button
										onClick={() => onRemove(entry.timestamp)}
										className='rounded p-1 text-muted hover:text-error transition-colors'
										aria-label='Remove this entry'
									>
										<Trash2 className='h-3 w-3' />
									</button>
								</div>
							</div>
						</div>
					))
				)}
			</div>

			{/* Footer */}
			{entries.length > 0 && (
				<div className='border-t border-border p-2'>
					<button
						onClick={onClear}
						className='flex w-full items-center justify-center gap-1.5 rounded-md bg-error/10 px-3 py-1.5 text-xs text-error hover:bg-error/20 transition-colors'
					>
						<Trash2 className='h-3 w-3' />
						Clear history
					</button>
				</div>
			)}
		</div>
	);
}
