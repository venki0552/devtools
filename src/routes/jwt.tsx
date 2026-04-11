import { createFileRoute } from "@tanstack/react-router";
import { JwtTool } from "@/components/jwt";

export const Route = createFileRoute("/jwt")({
	component: JwtPage,
});

function JwtPage() {
	return <JwtTool />;
}
