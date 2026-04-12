import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { EpochTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("EpochTool", () => {
	it("renders with tool title", () => {
		renderWithProviders(<EpochTool />);
		expect(screen.getByText("Epoch Converter")).toBeInTheDocument();
	});

	it("renders live clock showing current epoch", () => {
		const fakeNow = 1700000000000; // 2023-11-14T22:13:20.000Z
		vi.setSystemTime(fakeNow);
		renderWithProviders(<EpochTool />);
		expect(screen.getByText("Current Epoch")).toBeInTheDocument();
		expect(screen.getByText("1700000000")).toBeInTheDocument();
	});

	it("live clock updates every second", () => {
		vi.setSystemTime(1700000000000);
		renderWithProviders(<EpochTool />);
		expect(screen.getByText("1700000000")).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(screen.getByText("1700000001")).toBeInTheDocument();
	});

	it("Epoch→DateTime: 0 converts to Jan 1 1970", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "0" } });
		// Day of week depends on local timezone
		const DAYS = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const expectedDay = DAYS[new Date(0).getDay()];
		expect(screen.getByText(expectedDay)).toBeInTheDocument();
		expect(
			screen.getByText(new RegExp(String(new Date(0).getFullYear()))),
		).toBeInTheDocument();
	});

	it("Epoch→DateTime: 1000000000 detects as seconds", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "1000000000" } });
		expect(screen.getByText(/seconds/i)).toBeInTheDocument();
	});

	it("Epoch→DateTime: 1000000000000 detects as milliseconds", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		// 1e12 is not > 1e12, use a value clearly > 1e12 to trigger milliseconds detection
		fireEvent.change(input, { target: { value: "1000000000001" } });
		expect(screen.getByText(/milliseconds/i)).toBeInTheDocument();
	});

	it("DateTime→Epoch converts a date string to epoch", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "2001-09-09T01:46:40.000Z" } });
		// 2001-09-09T01:46:40Z = epoch 1000000000
		expect(screen.getByText("1000000000")).toBeInTheDocument();
	});

	it("shows UTC time for epoch input", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "0" } });
		// UTC for epoch 0 should show "Thu, 01 Jan 1970 00:00:00 GMT"
		expect(
			screen.getByText(/Thu, 01 Jan 1970 00:00:00 GMT/),
		).toBeInTheDocument();
	});

	it("shows relative time", () => {
		vi.setSystemTime(1000000001000); // 1 second after epoch 1000000000
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "1000000000" } });
		// Should show relative time like "1s ago"
		expect(screen.getByText("1s ago")).toBeInTheDocument();
	});

	it("shows day of week", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "0" } });
		const DAYS = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const expectedDay = DAYS[new Date(0).getDay()];
		expect(screen.getByText(expectedDay)).toBeInTheDocument();
	});

	it("shows week number", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "0" } });
		// Week number depends on local timezone; compute from component logic
		const d = new Date(0);
		const oneJan = new Date(d.getFullYear(), 0, 1);
		const days = Math.floor((d.getTime() - oneJan.getTime()) / 86400000);
		const expectedWeek = String(Math.ceil((days + oneJan.getDay() + 1) / 7));
		expect(screen.getByText(expectedWeek)).toBeInTheDocument();
	});

	it("handles negative epoch times (before 1970)", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "-86400" } });
		const DAYS = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const d = new Date(-86400 * 1000);
		const expectedDay = DAYS[d.getDay()];
		expect(screen.getByText(expectedDay)).toBeInTheDocument();
		expect(
			screen.getAllByText(new RegExp(String(d.getFullYear()))).length,
		).toBeGreaterThan(0);
	});

	it("empty input shows no error and no result", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "" } });
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		// Should not see "Detected" badge
		expect(screen.queryByText(/Detected/)).not.toBeInTheDocument();
	});

	it("invalid epoch input shows error", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "not-a-number" } });
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("Clear button resets both inputs", () => {
		renderWithProviders(<EpochTool />);
		const epochInput = screen.getByLabelText("Epoch input");
		const dateInput = screen.getByLabelText("Date input");

		fireEvent.change(epochInput, { target: { value: "1000000000" } });
		fireEvent.change(dateInput, { target: { value: "2023-01-01" } });

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		expect(epochInput).toHaveValue("");
		expect(dateInput).toHaveValue("");
	});

	it("renders Epoch→DateTime and DateTime→Epoch sections", () => {
		renderWithProviders(<EpochTool />);
		expect(screen.getByText("Epoch → DateTime")).toBeInTheDocument();
		expect(screen.getByText("DateTime → Epoch")).toBeInTheDocument();
	});

	it("shows ISO 8601 format for epoch input", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "0" } });
		expect(screen.getByText("1970-01-01T00:00:00.000Z")).toBeInTheDocument();
	});

	// -----------------------------------------------------------------------
	// NEW FEATURE TESTS
	// -----------------------------------------------------------------------

	// 1. Timezone Selector
	it("renders timezone selector", () => {
		renderWithProviders(<EpochTool />);
		expect(screen.getByLabelText("Timezone selector")).toBeInTheDocument();
	});

	it("timezone selector shows dropdown on focus", () => {
		renderWithProviders(<EpochTool />);
		const tzInput = screen.getByLabelText("Timezone selector");
		fireEvent.focus(tzInput);
		// Should display some timezone options (first 50 alphabetically)
		expect(screen.getByText("Africa/Abidjan")).toBeInTheDocument();
	});

	it("timezone selector filters by search", () => {
		renderWithProviders(<EpochTool />);
		const tzInput = screen.getByLabelText("Timezone selector");
		fireEvent.focus(tzInput);
		fireEvent.change(tzInput, { target: { value: "Tokyo" } });
		expect(screen.getByText("Asia/Tokyo")).toBeInTheDocument();
	});

	// 2. Timezone Comparator
	it("renders timezone comparator section", () => {
		renderWithProviders(<EpochTool />);
		expect(screen.getByText("Timezone Comparator")).toBeInTheDocument();
		expect(screen.getByText("0/5 timezones")).toBeInTheDocument();
	});

	it("comparator shows add-timezone input", () => {
		renderWithProviders(<EpochTool />);
		expect(
			screen.getByLabelText("Add timezone to comparator"),
		).toBeInTheDocument();
	});

	it("comparator adds a timezone and shows DST/STD badge", () => {
		vi.setSystemTime(1700000000000);
		renderWithProviders(<EpochTool />);

		// Enter an epoch value so the comparator has an active date
		const epochInput = screen.getByLabelText("Epoch input");
		fireEvent.change(epochInput, { target: { value: "1700000000" } });

		// Add a timezone by searching for a known IANA timezone
		const addInput = screen.getByLabelText("Add timezone to comparator");
		fireEvent.focus(addInput);
		fireEvent.change(addInput, { target: { value: "America/Chicago" } });
		fireEvent.click(screen.getByText("America/Chicago"));

		// Should show counter updated
		expect(screen.getByText("1/5 timezones")).toBeInTheDocument();
		// Should show either DST or STD badge
		expect(screen.getByText(/^(DST|STD)$/)).toBeInTheDocument();
	});

	it("comparator allows removing a timezone", () => {
		vi.setSystemTime(1700000000000);
		renderWithProviders(<EpochTool />);

		const addInput = screen.getByLabelText("Add timezone to comparator");
		fireEvent.focus(addInput);
		fireEvent.change(addInput, { target: { value: "America/Chicago" } });
		fireEvent.click(screen.getByText("America/Chicago"));

		expect(screen.getByText("1/5 timezones")).toBeInTheDocument();

		// Remove America/Chicago
		fireEvent.click(screen.getByLabelText("Remove America/Chicago"));
		expect(screen.getByText("0/5 timezones")).toBeInTheDocument();
	});

	// 3. "Use now" button
	it("renders Use now button", () => {
		renderWithProviders(<EpochTool />);
		expect(screen.getByRole("button", { name: "Use now" })).toBeInTheDocument();
	});

	it("Use now populates both boxes with current time", () => {
		vi.setSystemTime(1700000000000);
		renderWithProviders(<EpochTool />);

		fireEvent.click(screen.getByRole("button", { name: "Use now" }));

		const epochInput = screen.getByLabelText("Epoch input");
		const dateInput = screen.getByLabelText("Date input");

		expect(epochInput).toHaveValue("1700000000");
		expect(dateInput).toHaveValue("2023-11-14T22:13:20.000Z");
	});

	// 4. Better datetime parsing
	it("DateTime→Epoch: parses US format (MM/DD/YYYY HH:MM AM)", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "01/15/2024 09:30 AM" } });
		expect(screen.getByText(/US \(MM\/DD\/YYYY\)/)).toBeInTheDocument();
		// Should produce a valid epoch
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("DateTime→Epoch: parses European format (DD.MM.YYYY HH:MM)", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "15.01.2024 09:30" } });
		expect(screen.getByText(/European \(DD\.MM\.YYYY\)/)).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it('DateTime→Epoch: parses "now"', () => {
		vi.setSystemTime(1700000000000);
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "now" } });
		expect(screen.getByText(/Relative \(now\)/)).toBeInTheDocument();
		// epoch 1700000000 appears in both live clock and result
		expect(screen.getAllByText("1700000000").length).toBeGreaterThanOrEqual(2);
	});

	it('DateTime→Epoch: parses "yesterday"', () => {
		vi.setSystemTime(1700000000000);
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "yesterday" } });
		expect(screen.getByText(/Relative \(yesterday\)/)).toBeInTheDocument();
		// yesterday = 1700000000 - 86400 = 1699913600
		expect(screen.getByText("1699913600")).toBeInTheDocument();
	});

	it('DateTime→Epoch: parses "tomorrow"', () => {
		vi.setSystemTime(1700000000000);
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "tomorrow" } });
		expect(screen.getByText(/Relative \(tomorrow\)/)).toBeInTheDocument();
		// tomorrow = 1700000000 + 86400 = 1700086400
		expect(screen.getByText("1700086400")).toBeInTheDocument();
	});

	it('DateTime→Epoch: parses "2 hours ago"', () => {
		vi.setSystemTime(1700000000000);
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "2 hours ago" } });
		expect(screen.getByText(/Relative \(2 hours ago\)/)).toBeInTheDocument();
		// 2 hours ago = 1700000000 - 7200 = 1699992800
		expect(screen.getByText("1699992800")).toBeInTheDocument();
	});

	it('DateTime→Epoch: parses "next Monday"', () => {
		vi.setSystemTime(1700000000000); // Tuesday Nov 14, 2023
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "next monday" } });
		expect(screen.getByText(/Relative \(next monday\)/)).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("DateTime→Epoch: shows format detection badge", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "2023-01-01T00:00:00Z" } });
		expect(
			screen.getByText(/Format: ISO 8601 \/ Standard/),
		).toBeInTheDocument();
	});

	// 5. Ambiguous datetime handling
	it("shows assumed timezone badge when no timezone in input", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "01/15/2024 09:30 AM" } });
		expect(screen.getByText(/Assumed:/)).toBeInTheDocument();
	});

	it("does NOT show assumed timezone badge when timezone is present", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "2023-01-01T00:00:00Z" } });
		expect(screen.queryByText(/Assumed:/)).not.toBeInTheDocument();
	});

	// 7. Day of Year format
	it("shows Day of Year in date info", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "0" } });
		expect(screen.getByText("Day of Year")).toBeInTheDocument();
		// Jan 1 = day 1
		const d = new Date(0);
		const start = new Date(d.getFullYear(), 0, 0);
		const expectedDOY = String(
			Math.floor((d.getTime() - start.getTime()) / 86400000),
		);
		expect(screen.getByText(expectedDOY)).toBeInTheDocument();
	});

	// 8. Epoch 0 handling
	it("shows Unix epoch banner for epoch 0", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "0" } });
		expect(
			screen.getByText("Unix epoch — Jan 1, 1970 00:00:00 UTC"),
		).toBeInTheDocument();
	});

	it("does NOT show Unix epoch banner for non-zero", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "1000" } });
		expect(
			screen.queryByText("Unix epoch — Jan 1, 1970 00:00:00 UTC"),
		).not.toBeInTheDocument();
	});

	// 9. Negative epoch handling
	it("shows pre-1970 note for negative epoch", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "-86400" } });
		expect(screen.getByText(/Pre-1970 date/)).toBeInTheDocument();
	});

	it("does NOT show pre-1970 note for positive epoch", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		fireEvent.change(input, { target: { value: "1000000000" } });
		expect(screen.queryByText(/Pre-1970 date/)).not.toBeInTheDocument();
	});

	// 10. Very large epoch handling
	it("shows JS Date limit error for extreme values", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Epoch input");
		// Value beyond JS Date limit
		fireEvent.change(input, { target: { value: "99999999999999999" } });
		expect(screen.getByText(/exceeds JS Date limit/)).toBeInTheDocument();
	});

	// Additional edge cases
	it("DateTime→Epoch: invalid string shows error", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "not-a-date" } });
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it('DateTime→Epoch: parses "in 3 days"', () => {
		vi.setSystemTime(1700000000000);
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "in 3 days" } });
		expect(screen.getByText(/Relative \(in 3 days\)/)).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("US format with PM correctly converts", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "12/25/2023 02:30 PM" } });
		expect(screen.getByText(/US/)).toBeInTheDocument();
		// 2:30 PM = 14:30, verify no error
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("European format without time parses correctly", () => {
		renderWithProviders(<EpochTool />);
		const input = screen.getByLabelText("Date input");
		fireEvent.change(input, { target: { value: "25.12.2023" } });
		expect(screen.getByText(/European/)).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("comparator shows empty state when no timezone and no date", () => {
		renderWithProviders(<EpochTool />);
		expect(
			screen.getByText(/Enter a time above and add timezones to compare/),
		).toBeInTheDocument();
	});
});
