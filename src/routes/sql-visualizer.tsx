import { createFileRoute } from "@tanstack/react-router";
import { SqlVisualizerTool } from "@/components/sql-visualizer";

export const Route = createFileRoute("/sql-visualizer")({
	component: Page,
});

function Page() {
	return <SqlVisualizerTool />;
}
