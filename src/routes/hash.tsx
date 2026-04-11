import { createFileRoute } from "@tanstack/react-router";
import { HashTool } from "@/components/hash";

export const Route = createFileRoute("/hash")({
	component: HashPage,
});

function HashPage() {
	return <HashTool />;
}
