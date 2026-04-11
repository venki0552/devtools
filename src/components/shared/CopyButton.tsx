import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

interface CopyButtonProps {
	text: string;
	className?: string;
	label?: string;
	"aria-label"?: string;
}

export function CopyButton({
	text,
	className,
	label,
	"aria-label": ariaLabel,
}: CopyButtonProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		const success = await copyToClipboard(text);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}
	}, [text]);

	return (
		<button
			onClick={handleCopy}
			className={cn(
				"inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
				"bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
				"dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600",
				className,
			)}
			aria-label={ariaLabel ?? "Copy to clipboard"}
			disabled={!text}
		>
			{copied ? (
				<>
					<Check className='h-3.5 w-3.5 text-success' />
					{label ? "Copied!" : null}
				</>
			) : (
				<>
					<Copy className='h-3.5 w-3.5' />
					{label ?? null}
				</>
			)}
		</button>
	);
}
