import { createFileRoute } from "@tanstack/react-router";
import { MockApiTool } from "@/components/mock-api";

export const Route = createFileRoute("/mock-api")({
	component: Page,
});

function Page() {
	return <MockApiTool />;
}
