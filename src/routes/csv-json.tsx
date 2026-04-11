import { createFileRoute } from "@tanstack/react-router";
import { CsvJsonTool } from "@/components/csv-json";

export const Route = createFileRoute("/csv-json")({
	component: Page,
});

function Page() {
	return <CsvJsonTool />;
}
