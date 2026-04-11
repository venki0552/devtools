import { createFileRoute } from "@tanstack/react-router";
import { Base64Tool } from "@/components/base64";

export const Route = createFileRoute("/base64")({
	component: Base64Page,
});

function Base64Page() {
	return <Base64Tool />;
}
