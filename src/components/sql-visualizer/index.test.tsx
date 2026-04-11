import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { SqlVisualizerTool } from "./index";

// Mock fetch globally for Anthropic API calls
const mockFetch = vi.fn();

beforeEach(() => {
	vi.stubGlobal("fetch", mockFetch);
	mockFetch.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function setApiKeyInStorage(key = "sk-ant-test-key") {
	localStorage.setItem("devtools-anthropic-key", JSON.stringify(key));
}

describe("SqlVisualizerTool", () => {
	it("renders with title", () => {
		setApiKeyInStorage();
		renderWithProviders(<SqlVisualizerTool />);
		expect(screen.getByText("SQL Visualizer")).toBeInTheDocument();
	});

	it("shows API key setup when no key stored", () => {
		renderWithProviders(<SqlVisualizerTool />);
		expect(screen.getByText("Anthropic API Key Required")).toBeInTheDocument();
	});

	it("API key input is password type", () => {
		renderWithProviders(<SqlVisualizerTool />);
		const input = screen.getByPlaceholderText("sk-ant-...");
		expect(input).toHaveAttribute("type", "password");
	});

	it("after setting key, shows SQL editor", async () => {
		renderWithProviders(<SqlVisualizerTool />);
		const input = screen.getByPlaceholderText("sk-ant-...");
		fireEvent.change(input, { target: { value: "sk-ant-my-key-123" } });
		fireEvent.click(screen.getByText("Save API Key"));

		await waitFor(() => {
			expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
		});
	});

	it("Analyze button present", () => {
		setApiKeyInStorage();
		renderWithProviders(<SqlVisualizerTool />);
		expect(screen.getByRole("button", { name: "Analyze" })).toBeInTheDocument();
	});

	it("dialect selector present with PostgreSQL, MySQL, SQLite", () => {
		setApiKeyInStorage();
		renderWithProviders(<SqlVisualizerTool />);
		const select = screen.getByLabelText("SQL dialect");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
		expect(screen.getByText("MySQL")).toBeInTheDocument();
		expect(screen.getByText("SQLite")).toBeInTheDocument();
	});

	it("Analyze button disabled when no SQL input", () => {
		setApiKeyInStorage();
		renderWithProviders(<SqlVisualizerTool />);
		const analyzeBtn = screen.getByRole("button", { name: "Analyze" });
		expect(analyzeBtn).toBeDisabled();
	});

	it("API error displays error message", async () => {
		setApiKeyInStorage();
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 401,
			text: async () => "Unauthorized",
		});

		renderWithProviders(<SqlVisualizerTool />);

		const editor = screen.getByTestId("monaco-editor");
		fireEvent.change(editor, { target: { value: "SELECT * FROM users" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
		});

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
			expect(screen.getByText(/Invalid API key/i)).toBeInTheDocument();
		});
	});

	it("rate limit error displays appropriate message", async () => {
		setApiKeyInStorage();
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 429,
			text: async () => "Rate limited",
		});

		renderWithProviders(<SqlVisualizerTool />);

		const editor = screen.getByTestId("monaco-editor");
		fireEvent.change(editor, { target: { value: "SELECT 1" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
		});

		await waitFor(() => {
			expect(screen.getByText(/Rate limited/i)).toBeInTheDocument();
		});
	});

	it("successful analysis shows results", async () => {
		setApiKeyInStorage();
		const mockResult = {
			summary: "Selects all users",
			complexityScore: 2,
			tables: [
				{
					name: "users",
					alias: null,
					role: "primary",
					columns: ["id", "name"],
				},
			],
			joins: [],
			filters: [],
			outputColumns: [{ name: "id", source: "users", typeGuess: "integer" }],
			potentialIssues: [],
		};

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				content: [{ text: JSON.stringify(mockResult) }],
			}),
		});

		renderWithProviders(<SqlVisualizerTool />);

		const editor = screen.getByTestId("monaco-editor");
		fireEvent.change(editor, { target: { value: "SELECT * FROM users" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
		});

		await waitFor(() => {
			expect(screen.getByText("Selects all users")).toBeInTheDocument();
		});
	});

	it("Change API key button present after key set", () => {
		setApiKeyInStorage();
		renderWithProviders(<SqlVisualizerTool />);
		// The Key icon button acts as "Change API key"
		const keyButton = screen.getByTitle("Change API key");
		expect(keyButton).toBeInTheDocument();
	});

	it("security note about local storage present in key modal", () => {
		renderWithProviders(<SqlVisualizerTool />);
		expect(
			screen.getByText(/stored locally and sent directly to Anthropic/i),
		).toBeInTheDocument();
	});

	it("Clear button resets state", async () => {
		setApiKeyInStorage();
		renderWithProviders(<SqlVisualizerTool />);

		const editor = screen.getByTestId("monaco-editor");
		fireEvent.change(editor, { target: { value: "SELECT 1" } });

		fireEvent.click(screen.getByText("Clear"));

		expect(editor).toHaveValue("");
	});
});
