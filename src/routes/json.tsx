import { createFileRoute } from "@tanstack/react-router";
import { JsonTool } from "@/components/json";

export const Route = createFileRoute("/json")({
	component: JsonPage,
});

function JsonPage() {
	return <JsonTool />;
}
