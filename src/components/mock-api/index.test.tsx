import "@/test/mock-monaco";
import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { MockApiTool } from "./index";

describe("MockApiTool", () => {
	it("renders with title", () => {
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("Mock API Generator")).toBeInTheDocument();
	});

	it("does not show API key modal", () => {
		renderWithProviders(<MockApiTool />);
		expect(
			screen.queryByText("Anthropic API Key Required"),
		).not.toBeInTheDocument();
	});

	it("three input mode tabs present (JSON Schema, Example JSON, Plain Description)", () => {
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("JSON Schema")).toBeInTheDocument();
		expect(screen.getByText("Example JSON")).toBeInTheDocument();
		expect(screen.getByText("Plain Description")).toBeInTheDocument();
	});

	it("record count input present with correct range (1-100)", () => {
		renderWithProviders(<MockApiTool />);
		const countInput = screen.getByLabelText("Record count");
		expect(countInput).toBeInTheDocument();
		expect(countInput).toHaveAttribute("min", "1");
		expect(countInput).toHaveAttribute("max", "100");
	});

	it("output format selector present with JSON Array and NDJSON", () => {
		renderWithProviders(<MockApiTool />);
		const select = screen.getByLabelText("Output format");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("JSON Array")).toBeInTheDocument();
		expect(screen.getByText("NDJSON")).toBeInTheDocument();
	});

	it("Generate button present", () => {
		renderWithProviders(<MockApiTool />);
		expect(
			screen.getByRole("button", { name: "Generate" }),
		).toBeInTheDocument();
	});

	it("Generate button disabled when input is empty", () => {
		renderWithProviders(<MockApiTool />);
		const genBtn = screen.getByRole("button", { name: "Generate" });
		expect(genBtn).toBeDisabled();
	});

	it("successful generation from schema shows output", () => {
		renderWithProviders(<MockApiTool />);

		const editors = screen.getAllByTestId("monaco-editor");
		fireEvent.change(editors[0], {
			target: {
				value:
					'{"type":"object","properties":{"id":{"type":"integer"},"name":{"type":"string"}}}',
			},
		});

		fireEvent.click(screen.getByRole("button", { name: "Generate" }));

		// After synchronous generation, output editor should be present
		const editorsAfter = screen.getAllByTestId("monaco-editor");
		expect(editorsAfter.length).toBeGreaterThanOrEqual(2);
	});

	it("invalid JSON in schema mode shows error on generate", () => {
		renderWithProviders(<MockApiTool />);

		const editors = screen.getAllByTestId("monaco-editor");
		fireEvent.change(editors[0], { target: { value: "{not valid json" } });

		fireEvent.click(screen.getByRole("button", { name: "Generate" }));

		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("copy output button present", () => {
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("Copy")).toBeInTheDocument();
	});

	it("switching input mode tabs works", () => {
		renderWithProviders(<MockApiTool />);
		fireEvent.click(screen.getByText("Plain Description"));
		const editors = screen.getAllByTestId("monaco-editor");
		expect(editors.length).toBeGreaterThanOrEqual(1);
	});

	it("Clear button resets input and output", () => {
		renderWithProviders(<MockApiTool />);

		const editors = screen.getAllByTestId("monaco-editor");
		fireEvent.change(editors[0], { target: { value: '{"test":true}' } });

		fireEvent.click(screen.getByText("Clear"));

		expect(editors[0]).toHaveValue("");
	});

	it("output format selector includes CSV option", () => {
		renderWithProviders(<MockApiTool />);
		const select = screen.getByLabelText("Output format");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("CSV")).toBeInTheDocument();
	});

	it("locale selector present with all 6 locales", () => {
		renderWithProviders(<MockApiTool />);
		const select = screen.getByLabelText("Locale");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("US (English)")).toBeInTheDocument();
		expect(screen.getByText("UK (English)")).toBeInTheDocument();
		expect(screen.getByText("Germany (Deutsch)")).toBeInTheDocument();
		expect(screen.getByText("France (Français)")).toBeInTheDocument();
		expect(screen.getByText("Japan (日本語)")).toBeInTheDocument();
		expect(screen.getByText("India (Hindi/English)")).toBeInTheDocument();
	});

	it("locale selector changes value", () => {
		renderWithProviders(<MockApiTool />);
		const select = screen.getByLabelText("Locale") as HTMLSelectElement;
		fireEvent.change(select, { target: { value: "DE" } });
		expect(select.value).toBe("DE");
	});

	it("seed input field present", () => {
		renderWithProviders(<MockApiTool />);
		const seedInput = screen.getByLabelText("Seed");
		expect(seedInput).toBeInTheDocument();
		expect(seedInput).toHaveAttribute("placeholder", "Seed");
	});

	it("seed input accepts numeric value", () => {
		renderWithProviders(<MockApiTool />);
		const seedInput = screen.getByLabelText("Seed") as HTMLInputElement;
		fireEvent.change(seedInput, { target: { value: "42" } });
		expect(seedInput.value).toBe("42");
	});

	it("record count is a range slider", () => {
		renderWithProviders(<MockApiTool />);
		const slider = screen.getByLabelText("Record count");
		expect(slider).toBeInTheDocument();
		expect(slider).toHaveAttribute("type", "range");
		expect(slider).toHaveAttribute("min", "1");
		expect(slider).toHaveAttribute("max", "100");
	});

	it("record count slider shows current value beside it", () => {
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("10")).toBeInTheDocument();
	});

	it("N>50 does not show token warning (no API tokens)", () => {
		localStorage.setItem(
			"devtools-mock-api-prefs",
			JSON.stringify({
				inputMode: "schema",
				recordCount: 55,
				outputFormat: "json",
				locale: "US",
				seed: "",
			}),
		);
		renderWithProviders(<MockApiTool />);
		expect(
			screen.queryByLabelText("Token usage warning"),
		).not.toBeInTheDocument();
	});

	it("Copy as fetch mock button present", () => {
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("Fetch Mock")).toBeInTheDocument();
	});

	it("Copy as MSW handler button present", () => {
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("MSW")).toBeInTheDocument();
	});
});
