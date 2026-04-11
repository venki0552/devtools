import { formatBytes, formatDuration } from "@/lib/utils";

interface StatsBarProps {
	inputChars?: number;
	inputBytes?: number;
	outputChars?: number;
	outputBytes?: number;
	processingTime?: number;
}

export function StatsBar({
	inputChars,
	inputBytes,
	outputChars,
	outputBytes,
	processingTime,
}: StatsBarProps) {
	return (
		<div className='flex items-center gap-4 border-t border-border px-3 py-1 text-[10px] text-muted-foreground'>
			{inputChars !== undefined && (
				<span>Input: {inputChars.toLocaleString()} chars</span>
			)}
			{inputBytes !== undefined && <span>{formatBytes(inputBytes)}</span>}
			{outputChars !== undefined && (
				<span>Output: {outputChars.toLocaleString()} chars</span>
			)}
			{outputBytes !== undefined && <span>{formatBytes(outputBytes)}</span>}
			{processingTime !== undefined && (
				<span className='ml-auto'>
					Processed in {formatDuration(processingTime)}
				</span>
			)}
		</div>
	);
}
