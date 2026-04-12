import "@/test/mock-monaco";
import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SqlVisualizerTool } from "./index";

describe("SqlVisualizerTool", () => {
	it("renders with title", () => {
		renderWithProviders(<SqlVisualizerTool />);
		expect(screen.getByText("SQL Visualizer")).toBeInTheDocument();
	});

	it("Analyze button present", () => {
		renderWithProviders(<SqlVisualizerTool />);
		expect(screen.getByRole("button", { name: "Analyze" })).toBeInTheDocument();
	});

	it("dialect selector present with PostgreSQL, MySQL, SQLite", () => {
		renderWithProviders(<SqlVisualizerTool />);
		const select = screen.getByLabelText("SQL dialect");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
		expect(screen.getByText("MySQL")).toBeInTheDocument();
		expect(screen.getByText("SQLite")).toBeInTheDocument();
	});

	it("Analyze button disabled when no SQL input", () => {
		renderWithProviders(<SqlVisualizerTool />);
		const analyzeBtn = screen.getByRole("button", { name: "Analyze" });
		expect(analyzeBtn).toBeDisabled();
	});

	it("successful analysis shows summary", () => {
		renderWithProviders(<SqlVisualizerTool />);

		const editor = screen.getByTestId("monaco-editor");
		fireEvent.change(editor, {
			target: { value: "SELECT id, name FROM users WHERE active = true" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

		expect(screen.getAllByText(/users/i).length).toBeGreaterThan(0);
	});

	it("parse error displays error message", () => {
		renderWithProviders(<SqlVisualizerTool />);

		const editor = screen.getByTestId("monaco-editor");
		fireEvent.change(editor, {
			target: { value: "NOT VALID SQL AT ALL !!!" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("analysis with JOIN shows table names", () => {
		renderWithProviders(<SqlVisualizerTool />);

		const editor = screen.getByTestId("monaco-editor");
		fireEvent.change(editor, {
			target: {
				value:
					"SELECT u.name, o.total FROM users u INNER JOIN orders o ON u.id = o.user_id",
			},
		});

		fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

		expect(screen.getAllByText(/users/).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/orders/).length).toBeGreaterThan(0);
	});

	it("analysis with GROUP BY shows table names", () => {
		renderWithProviders(<SqlVisualizerTool />);

		const editor = screen.getByTestId("monaco-editor");
		fireEvent.change(editor, {
			target: {
				value:
					"SELECT department, COUNT(*) as cnt FROM employees GROUP BY department",
			},
		});

		fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

		expect(screen.getAllByText(/employees/).length).toBeGreaterThan(0);
	});

	it("does not show API key modal", () => {
		renderWithProviders(<SqlVisualizerTool />);
		expect(
			screen.queryByText("Anthropic API Key Required"),
		).not.toBeInTheDocument();
	});

	it("monaco editor is present", () => {
		renderWithProviders(<SqlVisualizerTool />);
		expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
	});
});
