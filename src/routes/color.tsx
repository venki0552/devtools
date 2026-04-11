import { createFileRoute } from "@tanstack/react-router";
import { ColorTool } from "@/components/color";

export const Route = createFileRoute("/color")({
	component: ColorPage,
});

function ColorPage() {
	return <ColorTool />;
}
