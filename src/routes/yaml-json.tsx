import { createFileRoute } from "@tanstack/react-router";
import { YamlJsonTool } from "@/components/yaml-json";

export const Route = createFileRoute("/yaml-json")({
	component: Page,
});

function Page() {
	return <YamlJsonTool />;
}
