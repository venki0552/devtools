import { createFileRoute } from "@tanstack/react-router";
import { RegexTool } from "@/components/regex";

export const Route = createFileRoute("/regex")({
	component: RegexPage,
});

function RegexPage() {
	return <RegexTool />;
}
