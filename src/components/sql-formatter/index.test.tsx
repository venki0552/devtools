import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { SqlFormatterTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function getInputEditor() {
	// SQL formatter has two monaco editors: input and output
	// The input editor is the first one (not readOnly)
	const editors = screen.getAllByTestId("monaco-editor");
	return editors[0];
}

function getOutputEditor() {
	const editors = screen.getAllByTestId("monaco-editor");
	return editors[1];
}

function typeInput(value: string) {
	const input = getInputEditor();
	act(() => {
		fireEvent.change(input, { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

describe("SqlFormatterTool", () => {
	it("renders with title", () => {
		renderWithProviders(<SqlFormatterTool />);
		expect(screen.getByText("SQL Formatter")).toBeInTheDocument();
	});

	it("renders dialect selector", () => {
		renderWithProviders(<SqlFormatterTool />);
		const select = screen.getByLabelText("SQL dialect");
		expect(select).toBeInTheDocument();
	});

	it("renders keyword case selector", () => {
		renderWithProviders(<SqlFormatterTool />);
		const select = screen.getByLabelText("Keyword case");
		expect(select).toBeInTheDocument();
	});

	it("formatting basic SQL produces formatted output", () => {
		renderWithProviders(<SqlFormatterTool />);
		typeInput("SELECT * FROM users WHERE id=1");
		const output = getOutputEditor();
		const outputValue = (output as HTMLTextAreaElement).value;
		expect(outputValue).toContain("SELECT");
		expect(outputValue).toContain("FROM");
		expect(outputValue.length).toBeGreaterThan(0);
	});

	it("Format button reformats input immediately", () => {
		renderWithProviders(<SqlFormatterTool />);
		const input = getInputEditor();
		act(() => {
			fireEvent.change(input, {
				target: { value: "select id,name from users where active=true" },
			});
		});
		fireEvent.click(screen.getByRole("button", { name: "Format" }));
		const output = getOutputEditor();
		const outputValue = (output as HTMLTextAreaElement).value;
		expect(outputValue).toContain("SELECT");
		expect(outputValue).toContain("FROM");
	});

	it("Minify button removes whitespace", () => {
		renderWithProviders(<SqlFormatterTool />);
		const input = getInputEditor();
		act(() => {
			fireEvent.change(input, {
				target: { value: "SELECT\n  *\nFROM\n  users\nWHERE\n  id = 1" },
			});
		});
		fireEvent.click(screen.getByRole("button", { name: "Minify" }));
		const output = getOutputEditor();
		const outputValue = (output as HTMLTextAreaElement).value;
		expect(outputValue).not.toContain("\n");
		// Minified SQL should be on a single line
		expect(outputValue.split("\n")).toHaveLength(1);
	});

	it("Clear button resets input and output", () => {
		renderWithProviders(<SqlFormatterTool />);
		typeInput("SELECT * FROM users");
		expect(
			(getOutputEditor() as HTMLTextAreaElement).value.length,
		).toBeGreaterThan(0);

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		expect((getInputEditor() as HTMLTextAreaElement).value).toBe("");
		expect((getOutputEditor() as HTMLTextAreaElement).value).toBe("");
	});

	it("different dialects are available", () => {
		renderWithProviders(<SqlFormatterTool />);
		screen.getByLabelText("SQL dialect");
		expect(screen.getByText("Standard SQL")).toBeInTheDocument();
		expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
		expect(screen.getByText("MySQL")).toBeInTheDocument();
		expect(screen.getByText("SQLite")).toBeInTheDocument();
		expect(screen.getByText("BigQuery")).toBeInTheDocument();
		expect(screen.getByText("T-SQL")).toBeInTheDocument();
	});

	it("changing dialect reprocesses output", () => {
		renderWithProviders(<SqlFormatterTool />);
		typeInput("SELECT * FROM users WHERE id=1");

		act(() => {
			fireEvent.change(screen.getByLabelText("SQL dialect"), {
				target: { value: "postgresql" },
			});
			vi.advanceTimersByTime(350);
		});
		// Output should still contain formatted SQL
		const outputAfter = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(outputAfter.length).toBeGreaterThan(0);
	});

	it("keyword case options are available", () => {
		renderWithProviders(<SqlFormatterTool />);
		expect(screen.getByText("UPPER")).toBeInTheDocument();
		expect(screen.getByText("lower")).toBeInTheDocument();
		expect(screen.getByText("Preserve")).toBeInTheDocument();
	});

	it("indent size selector is present", () => {
		renderWithProviders(<SqlFormatterTool />);
		const select = screen.getByLabelText("Indent size");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("2 spaces")).toBeInTheDocument();
		expect(screen.getByText("4 spaces")).toBeInTheDocument();
		expect(screen.getByText("Tab")).toBeInTheDocument();
	});

	it("empty input produces no output and no error", () => {
		renderWithProviders(<SqlFormatterTool />);
		typeInput("");
		expect((getOutputEditor() as HTMLTextAreaElement).value).toBe("");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("Copy button is present", () => {
		renderWithProviders(<SqlFormatterTool />);
		expect(screen.getByText("Copy")).toBeInTheDocument();
	});
});
