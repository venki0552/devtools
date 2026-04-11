import { Suspense, lazy, useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/components/layout/ThemeProvider";

const Editor = lazy(() => import("@monaco-editor/react"));

interface MonacoWrapperProps {
	value: string;
	onChange?: (value: string) => void;
	language?: string;
	readOnly?: boolean;
	height?: string | number;
	placeholder?: string;
	"aria-label"?: string;
	onEditorMount?: (editor: unknown) => void;
}

export function MonacoWrapper({
	value,
	onChange,
	language = "plaintext",
	readOnly = false,
	height = "100%",
	placeholder,
	"aria-label": ariaLabel,
	onEditorMount,
}: MonacoWrapperProps) {
	const { theme } = useTheme();
	const editorRef = useRef<unknown>(null);

	const handleMount = useCallback(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(editor: any) => {
			editorRef.current = editor;
			if (ariaLabel) {
				editor.getDomNode()?.setAttribute("aria-label", ariaLabel);
			}
			onEditorMount?.(editor);
		},
		[ariaLabel, onEditorMount],
	);

	useEffect(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const editor = editorRef.current as any;
		if (editor && ariaLabel) {
			editor.getDomNode()?.setAttribute("aria-label", ariaLabel);
		}
	}, [ariaLabel]);

	return (
		<Suspense
			fallback={
				<div
					className='flex items-center justify-center border border-border rounded-md'
					style={{ height }}
				>
					<p className='text-xs text-muted-foreground'>Loading editor...</p>
				</div>
			}
		>
			<Editor
				height={height}
				language={language}
				value={value || ""}
				theme={theme === "dark" ? "vs-dark" : "vs"}
				onChange={(v) => onChange?.(v ?? "")}
				onMount={handleMount}
				options={{
					readOnly,
					minimap: { enabled: false },
					fontSize: 13,
					fontFamily: '"JetBrains Mono", monospace',
					lineNumbers: "on",
					scrollBeyondLastLine: false,
					wordWrap: "on",
					tabSize: 2,
					automaticLayout: true,
					renderLineHighlight: "none",
					overviewRulerLanes: 0,
					hideCursorInOverviewRuler: true,
					scrollbar: {
						verticalScrollbarSize: 8,
						horizontalScrollbarSize: 8,
					},
					padding: { top: 8, bottom: 8 },
					placeholder,
				}}
			/>
		</Suspense>
	);
}
