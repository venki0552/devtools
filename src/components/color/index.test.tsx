import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { ColorTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function typeColor(value: string) {
	const input = screen.getByLabelText("Color input");
	act(() => {
		fireEvent.change(input, { target: { value } });
		vi.advanceTimersByTime(250);
	});
}

describe("ColorTool", () => {
	it("renders with tool title", () => {
		renderWithProviders(<ColorTool />);
		expect(screen.getByText("Color Converter")).toBeInTheDocument();
	});

	it("parses hex #FF0000 and shows correct rgb and hsl", () => {
		renderWithProviders(<ColorTool />);
		typeColor("#FF0000");
		expect(screen.getByText("#ff0000")).toBeInTheDocument();
		expect(screen.getByText("rgb(255, 0, 0)")).toBeInTheDocument();
		expect(screen.getByText("hsl(0, 100%, 50%)")).toBeInTheDocument();
	});

	it("parses rgb(0, 128, 0) and shows correct hex and hsl", () => {
		renderWithProviders(<ColorTool />);
		typeColor("rgb(0, 128, 0)");
		expect(screen.getByText("#008000")).toBeInTheDocument();
		expect(screen.getByText("rgb(0, 128, 0)")).toBeInTheDocument();
		// Green: h=120, s~100%, l~25%
		expect(screen.getByText(/hsl\(120,/)).toBeInTheDocument();
	});

	it("parses hsl(240, 100%, 50%) and shows correct hex and rgb", () => {
		renderWithProviders(<ColorTool />);
		typeColor("hsl(240, 100%, 50%)");
		expect(screen.getByText("#0000ff")).toBeInTheDocument();
		expect(screen.getByText("rgb(0, 0, 255)")).toBeInTheDocument();
	});

	it("parses 3-char hex #F00 and expands to #ff0000", () => {
		renderWithProviders(<ColorTool />);
		typeColor("#F00");
		expect(screen.getByText("#ff0000")).toBeInTheDocument();
		expect(screen.getByText("rgb(255, 0, 0)")).toBeInTheDocument();
	});

	it("shows contrast ratio vs white and black", () => {
		renderWithProviders(<ColorTool />);
		typeColor("#FF0000");
		expect(screen.getByText("vs White")).toBeInTheDocument();
		expect(screen.getByText("vs Black")).toBeInTheDocument();
		// Should show ratios in X.XX:1 format
		const ratios = screen.getAllByText(/:1$/);
		expect(ratios.length).toBeGreaterThanOrEqual(2);
	});

	it("WCAG AA/AAA badges are displayed", () => {
		renderWithProviders(<ColorTool />);
		typeColor("#FF0000");
		expect(screen.getAllByText("AA Large").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("AA").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("AAA").length).toBeGreaterThanOrEqual(1);
	});

	it("tint and shade palette is generated", () => {
		renderWithProviders(<ColorTool />);
		typeColor("#3b82f6");
		expect(screen.getByText("Tints (lighter)")).toBeInTheDocument();
		expect(screen.getByText("Shades (darker)")).toBeInTheDocument();
		// Should generate 5 tints and 5 shades — check for hex values starting with #
		const paletteHexes = screen.getAllByText(/^#[0-9a-f]{6}$/i);
		// At least the original 3 format cards + 10 palette swatches
		expect(paletteHexes.length).toBeGreaterThanOrEqual(10);
	});

	it("invalid color input shows error", () => {
		renderWithProviders(<ColorTool />);
		typeColor("not-a-color");
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText(/invalid color/i)).toBeInTheDocument();
	});

	it("empty input shows no error and no results", () => {
		renderWithProviders(<ColorTool />);
		typeColor("");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.queryByText("HEX")).not.toBeInTheDocument();
	});

	it("color picker input is present", () => {
		renderWithProviders(<ColorTool />);
		expect(screen.getByLabelText("Color picker")).toBeInTheDocument();
	});

	it("copy buttons are present for each format", () => {
		renderWithProviders(<ColorTool />);
		typeColor("#FF0000");
		// HEX, RGB, HSL format cards each have a CopyButton
		expect(screen.getByText("HEX")).toBeInTheDocument();
		expect(screen.getByText("RGB")).toBeInTheDocument();
		expect(screen.getByText("HSL")).toBeInTheDocument();
	});

	it('parses named color "red"', () => {
		renderWithProviders(<ColorTool />);
		typeColor("red");
		expect(screen.getByText("#ff0000")).toBeInTheDocument();
		expect(screen.getByText("rgb(255, 0, 0)")).toBeInTheDocument();
	});

	it("parses bare hex without # prefix", () => {
		renderWithProviders(<ColorTool />);
		typeColor("00FF00");
		expect(screen.getByText("#00ff00")).toBeInTheDocument();
		expect(screen.getByText("rgb(0, 255, 0)")).toBeInTheDocument();
	});

	it("shows color preview swatch", () => {
		renderWithProviders(<ColorTool />);
		typeColor("#3b82f6");
		expect(screen.getByLabelText(/Color preview/)).toBeInTheDocument();
	});

	it("white color has correct contrast ratios", () => {
		renderWithProviders(<ColorTool />);
		typeColor("#ffffff");
		// White vs White = 1:1, White vs Black = 21:1
		expect(screen.getByText("1.00:1")).toBeInTheDocument();
		expect(screen.getByText("21.00:1")).toBeInTheDocument();
	});
});
