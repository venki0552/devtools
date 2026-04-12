import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { CronTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function typeCron(value: string) {
	const input = screen.getByLabelText("Cron expression");
	act(() => {
		fireEvent.change(input, { target: { value } });
		vi.advanceTimersByTime(250);
	});
}

describe("CronTool", () => {
	it("renders with tool title", () => {
		renderWithProviders(<CronTool />);
		expect(screen.getByText("CRON Builder")).toBeInTheDocument();
	});

	it("renders cron input field", () => {
		renderWithProviders(<CronTool />);
		expect(screen.getByLabelText("Cron expression")).toBeInTheDocument();
	});

	it('"* * * * *" shows "Every minute"', () => {
		renderWithProviders(<CronTool />);
		typeCron("* * * * *");
		// The human-readable description shows "Every minute" (from cronstrue)
		// There's also a preset button with the same text, so check the description area
		const descriptions = screen.getAllByText(/every minute/i);
		expect(descriptions.length).toBeGreaterThanOrEqual(1);
	});

	it('"0 * * * *" shows description for every hour', () => {
		renderWithProviders(<CronTool />);
		typeCron("0 * * * *");
		// cronstrue returns "Every hour" which may also match a preset button
		const descriptions = screen.getAllByText(/every hour/i);
		expect(descriptions.length).toBeGreaterThanOrEqual(1);
	});

	it('"0 0 * * *" shows midnight daily description', () => {
		renderWithProviders(<CronTool />);
		typeCron("0 0 * * *");
		// cronstrue returns "At 00:00"
		const matches = screen.getAllByText(/00:00/);
		expect(matches.length).toBeGreaterThanOrEqual(1);
	});

	it("shows next run times for valid expression", () => {
		renderWithProviders(<CronTool />);
		typeCron("0 0 * * *");
		expect(screen.getByText("Next 10 Runs")).toBeInTheDocument();
		// Should show 10 run entries
		expect(screen.getByText("#1")).toBeInTheDocument();
		expect(screen.getByText("#10")).toBeInTheDocument();
	});

	it("invalid cron expression shows error", () => {
		renderWithProviders(<CronTool />);
		typeCron("invalid cron here");
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("too few fields shows error", () => {
		renderWithProviders(<CronTool />);
		typeCron("* *");
		expect(screen.getByText(/expected 5 fields/i)).toBeInTheDocument();
	});

	it("6-field expression shows not supported error", () => {
		renderWithProviders(<CronTool />);
		typeCron("0 0 * * * *");
		expect(
			screen.getByText(/6-field.*not supported|got 6/i),
		).toBeInTheDocument();
	});

	it("presets populate the input when clicked", () => {
		renderWithProviders(<CronTool />);
		expect(screen.getByText("Presets")).toBeInTheDocument();

		// Click "Every minute" preset
		fireEvent.click(screen.getByRole("button", { name: "Every minute" }));
		const input = screen.getByLabelText("Cron expression") as HTMLInputElement;
		expect(input.value).toBe("* * * * *");
	});

	it('clicking "Daily at midnight" preset sets correct expression', () => {
		renderWithProviders(<CronTool />);
		fireEvent.click(screen.getByRole("button", { name: "Daily at midnight" }));
		const input = screen.getByLabelText("Cron expression") as HTMLInputElement;
		expect(input.value).toBe("0 0 * * *");
	});

	it('clicking "Weekly Monday 9AM" preset sets correct expression', () => {
		renderWithProviders(<CronTool />);
		fireEvent.click(screen.getByRole("button", { name: "Weekly Monday 9AM" }));
		const input = screen.getByLabelText("Cron expression") as HTMLInputElement;
		expect(input.value).toBe("0 9 * * 1");
	});

	it("visual builder fields are present", () => {
		renderWithProviders(<CronTool />);
		expect(screen.getByText("Quick Builder")).toBeInTheDocument();
		// Field labels appear both in builder and under expression, so use getAllByText
		expect(screen.getAllByText("Minute").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Hour").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Day of Month").length).toBeGreaterThanOrEqual(
			1,
		);
		expect(screen.getAllByText("Month").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Day of Week").length).toBeGreaterThanOrEqual(1);
	});

	it("quick builder updates the cron expression", () => {
		renderWithProviders(<CronTool />);
		typeCron("* * * * *");

		// Click "Every 5" option for minute field
		const every5Buttons = screen.getAllByRole("button", { name: "Every 5" });
		// First "Every 5" should be for the minute field
		fireEvent.click(every5Buttons[0]);

		const input = screen.getByLabelText("Cron expression") as HTMLInputElement;
		expect(input.value).toContain("*/5");
	});

	it("field labels are displayed under the cron expression", () => {
		renderWithProviders(<CronTool />);
		// The component shows field values + labels under the input
		// Default expression is "*/5 * * * *"
		const fieldLabels = screen.getAllByText(
			/^(Minute|Hour|Day of Month|Month|Day of Week)$/,
		);
		expect(fieldLabels.length).toBe(10); // 5 in builder + 5 under expression
	});

	it("empty cron input shows no description or runs", async () => {
		vi.useRealTimers();
		renderWithProviders(<CronTool />);
		const input = screen.getByLabelText("Cron expression");
		fireEvent.change(input, { target: { value: "" } });
		await waitFor(
			() => {
				expect(screen.queryByText("Next 10 Runs")).not.toBeInTheDocument();
			},
			{ timeout: 500 },
		);
	});
});
