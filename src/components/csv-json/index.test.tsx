import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { CsvJsonTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function typeInput(value: string) {
	const editors = screen.getAllByTestId("monaco-editor");
	act(() => {
		fireEvent.change(editors[0], { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

function getOutput(): string {
	const editors = screen.getAllByTestId("monaco-editor");
	return (editors[1] as HTMLTextAreaElement).value;
}

function switchToJsonToCsv() {
	fireEvent.click(screen.getByText("JSON → CSV"));
	act(() => {
		vi.advanceTimersByTime(50);
	});
}

describe("CsvJsonTool", () => {
	it("renders with tool title", () => {
		renderWithProviders(<CsvJsonTool />);
		expect(screen.getByText("CSV ↔ JSON")).toBeInTheDocument();
	});

	it("renders CSV→JSON and JSON→CSV mode buttons", () => {
		renderWithProviders(<CsvJsonTool />);
		expect(screen.getByText("CSV → JSON")).toBeInTheDocument();
		expect(screen.getByText("JSON → CSV")).toBeInTheDocument();
	});

	it("converts simple CSV to JSON with header row", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput("name,age\nJohn,30\nJane,25");
		const output = getOutput();
		const parsed = JSON.parse(output);
		expect(parsed).toEqual([
			{ name: "John", age: "30" },
			{ name: "Jane", age: "25" },
		]);
	});

	it("converts JSON array of objects to CSV", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("JSON → CSV"));
		act(() => {
			vi.advanceTimersByTime(50);
		});
		typeInput(
			JSON.stringify([
				{ name: "John", age: 30 },
				{ name: "Jane", age: 25 },
			]),
		);
		const output = getOutput();
		const lines = output.split("\n");
		expect(lines[0]).toBe("name,age");
		expect(lines[1]).toBe("John,30");
		expect(lines[2]).toBe("Jane,25");
	});

	it("handles quoted fields with commas inside", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput(
			'name,address\nJohn,"123 Main St, Apt 4"\nJane,"456 Oak Ave, Suite 5"',
		);
		const output = getOutput();
		const parsed = JSON.parse(output);
		expect(parsed[0].address).toBe("123 Main St, Apt 4");
		expect(parsed[1].address).toBe("456 Oak Ave, Suite 5");
	});

	it("handles tab delimiter", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.change(screen.getByLabelText("Delimiter"), {
			target: { value: "tab" },
		});
		typeInput("name\tage\nJohn\t30\nJane\t25");
		const output = getOutput();
		const parsed = JSON.parse(output);
		expect(parsed[0].name).toBe("John");
		expect(parsed[0].age).toBe("30");
	});

	it("handles semicolon delimiter", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.change(screen.getByLabelText("Delimiter"), {
			target: { value: ";" },
		});
		typeInput("name;age\nJohn;30\nJane;25");
		const output = getOutput();
		const parsed = JSON.parse(output);
		expect(parsed[0].name).toBe("John");
		expect(parsed[1].age).toBe("25");
	});

	it("handles pipe delimiter", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.change(screen.getByLabelText("Delimiter"), {
			target: { value: "|" },
		});
		typeInput("name|age\nJohn|30");
		const output = getOutput();
		const parsed = JSON.parse(output);
		expect(parsed[0].name).toBe("John");
	});

	it("auto-detects tab delimiter", () => {
		renderWithProviders(<CsvJsonTool />);
		// Default delimiter is auto
		typeInput("name\tage\nAlice\t28");
		const output = getOutput();
		const parsed = JSON.parse(output);
		expect(parsed[0].name).toBe("Alice");
		expect(parsed[0].age).toBe("28");
	});

	it("empty input produces no error and no output", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput("");
		const output = getOutput();
		expect(output).toBe("");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("header row toggle changes output format", () => {
		renderWithProviders(<CsvJsonTool />);
		// Header Row is on by default — turn it off
		fireEvent.click(screen.getByText("Header Row"));
		typeInput("name,age\nJohn,30");
		const output = getOutput();
		const parsed = JSON.parse(output);
		// Without header row, should be array of arrays
		expect(Array.isArray(parsed[0])).toBe(true);
		expect(parsed[0]).toEqual(["name", "age"]);
		expect(parsed[1]).toEqual(["John", "30"]);
	});

	it("Clear button resets input and output", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput("name,age\nJohn,30");
		expect(getOutput()).not.toBe("");

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		const editors = screen.getAllByTestId("monaco-editor");
		expect((editors[0] as HTMLTextAreaElement).value).toBe("");
		expect(getOutput()).toBe("");
	});

	it("handles missing columns in uneven rows", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput("a,b,c\n1,2\n4,5,6");
		const output = getOutput();
		const parsed = JSON.parse(output);
		// First data row has missing column c
		expect(parsed[0].c).toBe("");
		expect(parsed[1].c).toBe("6");
	});

	it("shows row and column count in stats", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput("name,age\nJohn,30\nJane,25");
		expect(screen.getByText("2 rows")).toBeInTheDocument();
		expect(screen.getByText("2 columns")).toBeInTheDocument();
	});

	it("handles quoted fields with escaped double quotes", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput('name,quote\nJohn,"He said ""hello"""\nJane,"No quotes"');
		const output = getOutput();
		const parsed = JSON.parse(output);
		expect(parsed[0].quote).toBe('He said "hello"');
	});

	it("JSON→CSV handles array of arrays input", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("JSON → CSV"));
		act(() => {
			vi.advanceTimersByTime(50);
		});
		typeInput(
			JSON.stringify([
				["a", "b"],
				["1", "2"],
			]),
		);
		const output = getOutput();
		expect(output).toContain("a,b");
		expect(output).toContain("1,2");
	});

	it("JSON→CSV shows error for non-array JSON", () => {
		renderWithProviders(<CsvJsonTool />);
		switchToJsonToCsv();
		typeInput('{"key": "value"}');
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	// --- Trim Whitespace ---
	it("trims whitespace from values by default", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput("name, age\n John , 30 ");
		const parsed = JSON.parse(getOutput());
		expect(parsed[0].name).toBe("John");
		expect(parsed[0].age).toBe("30");
	});

	it("preserves whitespace when trim toggle is off", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Trim Whitespace"));
		typeInput("name, age\n John , 30 ");
		const parsed = JSON.parse(getOutput());
		expect(parsed[0][" age"]).toBeDefined(); // header not trimmed
	});

	// --- Skip Empty Rows ---
	it("skips empty rows by default", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput("name,age\nJohn,30\n\nJane,25");
		const parsed = JSON.parse(getOutput());
		expect(parsed).toHaveLength(2);
	});

	it("includes empty rows when toggle is off", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Skip Empty Rows"));
		typeInput("name,age\nJohn,30\n\nJane,25");
		const parsed = JSON.parse(getOutput());
		// With empty rows kept, there are 3 data rows (one empty)
		expect(parsed.length).toBeGreaterThan(2);
	});

	// --- Quote Character ---
	it("renders quote character selector", () => {
		renderWithProviders(<CsvJsonTool />);
		expect(screen.getByLabelText("Quote Character")).toBeInTheDocument();
	});

	it("parses single-quoted CSV fields", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.change(screen.getByLabelText("Quote Character"), {
			target: { value: "'" },
		});
		typeInput("name,address\nJohn,'123 Main, Apt 4'");
		const parsed = JSON.parse(getOutput());
		expect(parsed[0].address).toBe("123 Main, Apt 4");
	});

	// --- Output Format selector ---
	it("renders output format selector in CSV→JSON mode", () => {
		renderWithProviders(<CsvJsonTool />);
		expect(screen.getByLabelText("Output Format")).toBeInTheDocument();
	});

	it("outputs array of arrays when format selected", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.change(screen.getByLabelText("Output Format"), {
			target: { value: "array-of-arrays" },
		});
		typeInput("name,age\nJohn,30\nJane,25");
		const parsed = JSON.parse(getOutput());
		// First row is headers
		expect(parsed[0]).toEqual(["name", "age"]);
		expect(parsed[1]).toEqual(["John", "30"]);
	});

	it("outputs object keyed by first column", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.change(screen.getByLabelText("Output Format"), {
			target: { value: "keyed-by-first-column" },
		});
		typeInput("id,name,age\n1,John,30\n2,Jane,25");
		const parsed = JSON.parse(getOutput());
		expect(parsed["1"]).toEqual({ name: "John", age: "30" });
		expect(parsed["2"]).toEqual({ name: "Jane", age: "25" });
	});

	// --- Number Parsing ---
	it("parses numbers when toggle is on", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Parse Numbers"));
		typeInput("name,age,score\nJohn,30,95.5");
		const parsed = JSON.parse(getOutput());
		expect(parsed[0].age).toBe(30);
		expect(parsed[0].score).toBe(95.5);
		expect(typeof parsed[0].age).toBe("number");
	});

	it("does not parse numbers by default", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput("name,age\nJohn,30");
		const parsed = JSON.parse(getOutput());
		expect(typeof parsed[0].age).toBe("string");
	});

	// --- Boolean Parsing ---
	it("parses booleans when toggle is on", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Parse Booleans"));
		typeInput("name,active,verified\nJohn,true,yes\nJane,false,no");
		const parsed = JSON.parse(getOutput());
		expect(parsed[0].active).toBe(true);
		expect(parsed[0].verified).toBe(true);
		expect(parsed[1].active).toBe(false);
		expect(parsed[1].verified).toBe(false);
	});

	it("parses 1/0 as booleans when toggle is on", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Parse Booleans"));
		typeInput("name,flag\nJohn,1\nJane,0");
		const parsed = JSON.parse(getOutput());
		expect(parsed[0].flag).toBe(true);
		expect(parsed[1].flag).toBe(false);
	});

	// --- Null Parsing ---
	it("parses null values when toggle is on", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Parse Nulls"));
		typeInput(
			"name,value\nJohn,\nJane,null\nBob,N/A\nAnn,n/a\nTom,-\nSam,NULL",
		);
		const parsed = JSON.parse(getOutput());
		expect(parsed[0].value).toBeNull();
		expect(parsed[1].value).toBeNull();
		expect(parsed[2].value).toBeNull();
		expect(parsed[3].value).toBeNull();
		expect(parsed[4].value).toBeNull();
		expect(parsed[5].value).toBeNull();
	});

	// --- Nested Object Handling ---
	it("renders nested objects selector in JSON→CSV mode", () => {
		renderWithProviders(<CsvJsonTool />);
		switchToJsonToCsv();
		expect(screen.getByLabelText("Nested Objects")).toBeInTheDocument();
	});

	it("flattens nested objects with dot notation by default", () => {
		renderWithProviders(<CsvJsonTool />);
		switchToJsonToCsv();
		typeInput(
			JSON.stringify([
				{ name: "John", address: { city: "NYC", zip: "10001" } },
			]),
		);
		const output = getOutput();
		expect(output).toContain("address.city");
		expect(output).toContain("address.zip");
		expect(output).toContain("NYC");
	});

	it("JSON-stringifies nested objects when option selected", () => {
		renderWithProviders(<CsvJsonTool />);
		switchToJsonToCsv();
		fireEvent.change(screen.getByLabelText("Nested Objects"), {
			target: { value: "stringify" },
		});
		typeInput(JSON.stringify([{ name: "John", address: { city: "NYC" } }]));
		const output = getOutput();
		// The nested object is stringified then CSV-escaped (quotes doubled)
		expect(output).toContain("address");
		expect(output).toContain('"city"');
		expect(output).toContain("NYC");
	});

	it("skips nested objects when option selected", () => {
		renderWithProviders(<CsvJsonTool />);
		switchToJsonToCsv();
		fireEvent.change(screen.getByLabelText("Nested Objects"), {
			target: { value: "skip" },
		});
		typeInput(JSON.stringify([{ name: "John", address: { city: "NYC" } }]));
		const output = getOutput();
		const lines = output.split("\n");
		// Header should only have "name" since address was skipped
		expect(lines[0]).toBe("name");
		expect(lines[1]).toBe("John");
	});

	// --- BOM Strip ---
	it("silently strips BOM from CSV input", () => {
		renderWithProviders(<CsvJsonTool />);
		const bom = "\uFEFF";
		typeInput(`${bom}name,age\nJohn,30`);
		const parsed = JSON.parse(getOutput());
		expect(parsed[0].name).toBe("John");
		// Key should NOT start with BOM
		expect(Object.keys(parsed[0])[0]).toBe("name");
	});

	// --- Stats Bar (between panels) ---
	it("shows nulls replaced count in stats", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Parse Nulls"));
		typeInput("name,value\nJohn,null\nJane,N/A");
		expect(screen.getByTestId("stat-nulls")).toHaveTextContent("2 nulls");
	});

	it("shows type conversions count in stats", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Parse Numbers"));
		typeInput("name,age\nJohn,30\nJane,25");
		expect(screen.getByTestId("stat-conversions")).toHaveTextContent(
			"2 conversions",
		);
	});

	// --- Download Button ---
	it("renders download button", () => {
		renderWithProviders(<CsvJsonTool />);
		expect(screen.getByLabelText("Download")).toBeInTheDocument();
	});

	it("download button is disabled when no output", () => {
		renderWithProviders(<CsvJsonTool />);
		expect(screen.getByLabelText("Download")).toBeDisabled();
	});

	it("download button is enabled when output exists", () => {
		renderWithProviders(<CsvJsonTool />);
		typeInput("name,age\nJohn,30");
		expect(screen.getByLabelText("Download")).not.toBeDisabled();
	});

	// --- Combined Features ---
	it("number + boolean + null parsing together", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Parse Numbers"));
		fireEvent.click(screen.getByText("Parse Booleans"));
		fireEvent.click(screen.getByText("Parse Nulls"));
		typeInput("name,age,active,value\nJohn,30,true,null");
		const parsed = JSON.parse(getOutput());
		expect(parsed[0].age).toBe(30);
		expect(parsed[0].active).toBe(true);
		expect(parsed[0].value).toBeNull();
	});

	it("trim + skip empty + number parsing together", () => {
		renderWithProviders(<CsvJsonTool />);
		fireEvent.click(screen.getByText("Parse Numbers"));
		typeInput("name , age \n John , 30 \n\n Jane , 25 ");
		const parsed = JSON.parse(getOutput());
		expect(parsed).toHaveLength(2);
		expect(parsed[0].name).toBe("John");
		expect(parsed[0].age).toBe(30);
	});

	// --- Drag and drop target areas ---
	it("shows drop zone overlay on drag enter", () => {
		renderWithProviders(<CsvJsonTool />);
		const inputPanel = screen
			.getByText("Input (CSV)")
			.closest("div[class*='flex-1 flex-col']")!;
		fireEvent.dragEnter(inputPanel, {
			dataTransfer: { files: [] },
		});
		expect(screen.getAllByText("Drop file here").length).toBeGreaterThan(0);
	});
});
