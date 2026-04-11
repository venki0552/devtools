import { createFileRoute } from "@tanstack/react-router";
import { HttpStatusTool } from "@/components/http-status";

export const Route = createFileRoute("/http-status")({
	component: Page,
});

function Page() {
	return <HttpStatusTool />;
}
