import { createFileRoute } from "@tanstack/react-router";
import { CronTool } from "@/components/cron";

export const Route = createFileRoute("/cron")({
	component: CronPage,
});

function CronPage() {
	return <CronTool />;
}
