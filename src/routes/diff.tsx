import { createFileRoute } from "@tanstack/react-router";
import { DiffTool } from "@/components/diff";

export const Route = createFileRoute("/diff")({
	component: Page,
});

function Page() {
	return <DiffTool />;
}
