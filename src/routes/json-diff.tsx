import { createFileRoute } from "@tanstack/react-router";
import { JsonDiffTool } from "@/components/json-diff";

export const Route = createFileRoute("/json-diff")({
	component: Page,
});

function Page() {
	return <JsonDiffTool />;
}
