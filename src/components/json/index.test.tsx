import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { JsonTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function getInputEditor() {
	// The first monaco-editor is the input, the second is the output
	return screen.getAllByTestId("monaco-editor")[0];
}

function getOutputEditor() {
	return screen.getAllByTestId("monaco-editor")[1];
}

function typeInput(value: string) {
	const input = getInputEditor();
	act(() => {
		fireEvent.change(input, { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

describe("JsonTool", () => {
	it('renders with title "JSON Parser & Formatter"', () => {
		renderWithProviders(<JsonTool />);
		expect(screen.getByText("JSON Parser & Formatter")).toBeInTheDocument();
	});

	it("input editor and output editor present", () => {
		renderWithProviders(<JsonTool />);
		expect(screen.getByText("Input")).toBeInTheDocument();
		expect(screen.getByText("Output")).toBeInTheDocument();
		const editors = screen.getAllByTestId("monaco-editor");
		expect(editors.length).toBeGreaterThanOrEqual(2);
	});

	it("valid JSON input produces formatted output", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"name":"test","value":42}');
		const output = getOutputEditor();
		const val = (output as HTMLTextAreaElement).value;
		expect(val).toContain('"name"');
		expect(val).toContain('"test"');
		expect(val).toContain("42");
	});

	it("format button formats JSON", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"a":1}');
		fireEvent.click(screen.getByText("Format"));
		const output = getOutputEditor();
		const val = (output as HTMLTextAreaElement).value;
		expect(val).toContain("{\n");
		expect(val).toContain('"a"');
	});

	it("minify button minifies JSON", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{ "a" : 1 , "b" : 2 }');
		fireEvent.click(screen.getByText("Minify"));
		const output = getOutputEditor();
		const val = (output as HTMLTextAreaElement).value;
		expect(val).not.toContain("\n");
		expect(val).toContain('"a":1');
	});

	it("indent selector present with 2 spaces, 4 spaces, Tab options", () => {
		renderWithProviders(<JsonTool />);
		const select = screen.getByLabelText("Indent size");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("2 spaces")).toBeInTheDocument();
		expect(screen.getByText("4 spaces")).toBeInTheDocument();
		expect(screen.getByText("Tab")).toBeInTheDocument();
	});

	it("changing indent to 4 spaces reformats output", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"a":1}');
		const select = screen.getByLabelText("Indent size");
		act(() => {
			fireEvent.change(select, { target: { value: "4" } });
			vi.advanceTimersByTime(350);
		});
		const output = getOutputEditor();
		const val = (output as HTMLTextAreaElement).value;
		expect(val).toContain('    "a"');
	});

	it("sort keys toggle present and works", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"z":1,"a":2,"m":3}');

		fireEvent.click(screen.getByText("Sort Keys"));
		act(() => {
			vi.advanceTimersByTime(350);
		});

		const output = getOutputEditor();
		const val = (output as HTMLTextAreaElement).value;
		const aPos = val.indexOf('"a"');
		const mPos = val.indexOf('"m"');
		const zPos = val.indexOf('"z"');
		expect(aPos).toBeLessThan(mPos);
		expect(mPos).toBeLessThan(zPos);
	});

	it("strategy badge shown for non-standard JSON (single quotes)", () => {
		renderWithProviders(<JsonTool />);
		typeInput("{'name':'test'}");
		// Should show strategy badge for single quotes
		expect(screen.getByText(/Single.Quotes/i)).toBeInTheDocument();
	});

	it("invalid JSON shows error box", () => {
		renderWithProviders(<JsonTool />);
		typeInput("{invalid json}");
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("empty input shows no output and no error", () => {
		renderWithProviders(<JsonTool />);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		const output = getOutputEditor();
		expect((output as HTMLTextAreaElement).value).toBe("");
	});

	it("history button present", () => {
		renderWithProviders(<JsonTool />);
		expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
	});

	it("clear button clears input and output", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"a":1}');

		const output = getOutputEditor();
		expect((output as HTMLTextAreaElement).value).not.toBe("");

		fireEvent.click(screen.getByText("Clear"));

		const input = getInputEditor();
		expect((input as HTMLTextAreaElement).value).toBe("");
		expect((output as HTMLTextAreaElement).value).toBe("");
	});

	it("handles nested JSON properly", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"user":{"name":"alice","address":{"city":"NYC"}}}');
		const output = getOutputEditor();
		const val = (output as HTMLTextAreaElement).value;
		expect(val).toContain('"user"');
		expect(val).toContain('"address"');
		expect(val).toContain('"city"');
		expect(val).toContain('"NYC"');
	});

	it("copy button present", () => {
		renderWithProviders(<JsonTool />);
		expect(screen.getByText("Copy")).toBeInTheDocument();
	});

	it("valid JSON with trailing commas parsed", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"a":1,"b":2,}');
		// Should auto-fix and show output (strategy badge for trailing commas)
		const output = getOutputEditor();
		expect((output as HTMLTextAreaElement).value).toContain('"a"');
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("tree view tab is present", () => {
		renderWithProviders(<JsonTool />);
		expect(screen.getByText("Tree View")).toBeInTheDocument();
	});

	it("clicking Tree View tab shows tree for valid JSON", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"name":"alice","age":30}');
		fireEvent.click(screen.getByText("Tree View"));
		expect(screen.getByText("root")).toBeInTheDocument();
		expect(screen.getByText("name")).toBeInTheDocument();
		expect(screen.getByText("age")).toBeInTheDocument();
	});

	it("tree view shows type badges", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"name":"alice","age":30,"active":true,"data":null}');
		fireEvent.click(screen.getByText("Tree View"));
		expect(screen.getByText("string")).toBeInTheDocument();
		expect(screen.getByText("number")).toBeInTheDocument();
		expect(screen.getByText("boolean")).toBeInTheDocument();
		// "null" appears as both value and type badge
		expect(screen.getAllByText("null").length).toBeGreaterThanOrEqual(2);
	});

	it("tree view shows key count and max depth", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"a":{"b":1},"c":2}');
		fireEvent.click(screen.getByText("Tree View"));
		expect(screen.getByText(/Keys:/)).toBeInTheDocument();
		expect(screen.getByText(/Max depth:/)).toBeInTheDocument();
	});

	it("tree view collapsible nodes", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"nested":{"child":"value"}}');
		fireEvent.click(screen.getByText("Tree View"));
		// Root is expanded by default, child is not
		expect(screen.getByText("nested")).toBeInTheDocument();
		// Expand nested
		const expandBtn = screen.getAllByLabelText("Expand")[0];
		fireEvent.click(expandBtn);
		expect(screen.getByText("child")).toBeInTheDocument();
	});

	it("tree view search highlights matching keys", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"name":"alice","email":"a@b.com"}');
		fireEvent.click(screen.getByText("Tree View"));
		const searchInput = screen.getByPlaceholderText("Search keys and values…");
		fireEvent.change(searchInput, { target: { value: "name" } });
		// Search input should have the value
		expect((searchInput as HTMLInputElement).value).toBe("name");
	});

	it("tree view shows no valid JSON message when input is empty", () => {
		renderWithProviders(<JsonTool />);
		fireEvent.click(screen.getByText("Tree View"));
		expect(screen.getByText("No valid JSON to display")).toBeInTheDocument();
	});

	it("keyboard shortcut badges are shown", () => {
		renderWithProviders(<JsonTool />);
		// The Format button should contain a kbd element
		const formatBtn = screen.getByText("Format").closest("button");
		const kbd = formatBtn?.querySelector("kbd");
		expect(kbd).toBeInTheDocument();
	});

	it("restored badge shown when input restored from localStorage", () => {
		// Set localStorage before rendering
		window.localStorage.setItem(
			"devtools-json-input",
			JSON.stringify('{"restored":true}'),
		);
		renderWithProviders(<JsonTool />);
		expect(screen.getByText("Restored")).toBeInTheDocument();

		// Badge disappears after 2s
		act(() => {
			vi.advanceTimersByTime(2100);
		});
		expect(screen.queryByText("Restored")).not.toBeInTheDocument();

		// Cleanup
		window.localStorage.removeItem("devtools-json-input");
	});

	it("output tab is active by default and shows monaco editor", () => {
		renderWithProviders(<JsonTool />);
		typeInput('{"a":1}');
		// Output tab should show the monaco editor output
		const editors = screen.getAllByTestId("monaco-editor");
		expect(editors.length).toBeGreaterThanOrEqual(2);
	});
});
