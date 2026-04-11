import { vi } from "vitest";

// Mock @monaco-editor/react so MonacoWrapper renders a simple textarea
vi.mock("@monaco-editor/react", () => ({
	__esModule: true,
	default: ({
		value,
		onChange,
		"aria-label": ariaLabel,
	}: {
		value: string;
		onChange?: (value: string) => void;
		language?: string;
		"aria-label"?: string;
	}) => {
		return (
			<textarea
				data-testid='monaco-editor'
				aria-label={ariaLabel}
				value={value}
				onChange={(e) => onChange?.(e.target.value)}
			/>
		);
	},
}));
