import { createFileRoute } from "@tanstack/react-router";
import { SqlFormatterTool } from "@/components/sql-formatter";

export const Route = createFileRoute("/sql-formatter")({
	component: Page,
});

function Page() {
	return <SqlFormatterTool />;
}
