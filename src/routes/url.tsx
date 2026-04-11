import { createFileRoute } from "@tanstack/react-router";
import { UrlTool } from "@/components/url";

export const Route = createFileRoute("/url")({
	component: UrlPage,
});

function UrlPage() {
	return <UrlTool />;
}
