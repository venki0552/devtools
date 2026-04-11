import { createFileRoute } from "@tanstack/react-router";
import { EpochTool } from "@/components/epoch";

export const Route = createFileRoute("/epoch")({
	component: EpochPage,
});

function EpochPage() {
	return <EpochTool />;
}
