import { createFileRoute } from "@tanstack/react-router";
import { GraphqlTool } from "@/components/graphql";

export const Route = createFileRoute("/graphql")({
	component: Page,
});

function Page() {
	return <GraphqlTool />;
}
