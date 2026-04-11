import { createFileRoute } from "@tanstack/react-router";
import { UuidTool } from "@/components/uuid";

export const Route = createFileRoute("/uuid")({
	component: UuidPage,
});

function UuidPage() {
	return <UuidTool />;
}
