import { createFileRoute } from "@tanstack/react-router";
import { EnvTool } from "@/components/env";

export const Route = createFileRoute("/env")({
	component: Page,
});

function Page() {
	return <EnvTool />;
}
