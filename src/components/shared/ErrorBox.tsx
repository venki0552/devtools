import { AlertCircle } from "lucide-react";

interface ErrorBoxProps {
	error: string | null;
}

export function ErrorBox({ error }: ErrorBoxProps) {
	if (!error) return null;

	return (
		<div
			role='alert'
			className='flex items-start gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-xs text-error'
		>
			<AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
			<pre className='whitespace-pre-wrap break-all font-mono'>{error}</pre>
		</div>
	);
}
