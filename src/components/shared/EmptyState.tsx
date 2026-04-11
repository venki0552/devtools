interface EmptyStateProps {
	text?: string;
}

export function EmptyState({ text = "No content yet" }: EmptyStateProps) {
	return (
		<div className='flex h-full min-h-[120px] items-center justify-center rounded-md border border-dashed border-border'>
			<p className='text-xs text-muted-foreground'>{text}</p>
		</div>
	);
}
