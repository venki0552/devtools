import { createFileRoute } from "@tanstack/react-router";
import { XmlTool } from "@/components/xml";

export const Route = createFileRoute("/xml")({
	component: Page,
});

function Page() {
	return <XmlTool />;
}
