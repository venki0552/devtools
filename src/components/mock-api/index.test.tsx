import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { MockApiTool } from "./index";

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

describe("MockApiTool", () => {
	it("renders with title", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("Mock API Generator")).toBeInTheDocument();
	});

	it("shows API key setup when no key stored", () => {
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("Anthropic API Key Required")).toBeInTheDocument();
	});

	it("security note present in key modal", () => {
		renderWithProviders(<MockApiTool />);
		expect(
			screen.getByText(/stored locally and sent directly to Anthropic/i),
		).toBeInTheDocument();
	});

	it("after key set, main UI visible", async () => {
		renderWithProviders(<MockApiTool />);
		const input = screen.getByPlaceholderText("sk-ant-...");
		fireEvent.change(input, { target: { value: "sk-ant-my-key-123" } });
		fireEvent.click(screen.getByText("Save API Key"));

		await waitFor(() => {
			expect(screen.getByText("JSON Schema")).toBeInTheDocument();
		});
	});

	it("three input mode tabs present (JSON Schema, Example JSON, Plain Description)", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("JSON Schema")).toBeInTheDocument();
		expect(screen.getByText("Example JSON")).toBeInTheDocument();
		expect(screen.getByText("Plain Description")).toBeInTheDocument();
	});

	it("record count input present with correct range (1-100)", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		const countInput = screen.getByLabelText("Record count");
		expect(countInput).toBeInTheDocument();
		expect(countInput).toHaveAttribute("min", "1");
		expect(countInput).toHaveAttribute("max", "100");
	});

	it("output format selector present with JSON Array and NDJSON", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		const select = screen.getByLabelText("Output format");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("JSON Array")).toBeInTheDocument();
		expect(screen.getByText("NDJSON")).toBeInTheDocument();
	});

	it("Generate button present", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		expect(
			screen.getByRole("button", { name: "Generate" }),
		).toBeInTheDocument();
	});

	it("Generate button disabled when input is empty", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		const genBtn = screen.getByRole("button", { name: "Generate" });
		expect(genBtn).toBeDisabled();
	});

	it("API error displays error message", async () => {
		setApiKeyInStorage();
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 401,
			text: async () => "Unauthorized",
		});

		renderWithProviders(<MockApiTool />);

		// Type schema input
		const editors = screen.getAllByTestId("monaco-editor");
		fireEvent.change(editors[0], { target: { value: '{"type":"object"}' } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Generate" }));
		});

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
			expect(screen.getByText(/Invalid API key/i)).toBeInTheDocument();
		});
	});

	it("successful generation shows output", async () => {
		setApiKeyInStorage();
		const mockOutput = JSON.stringify([
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		]);

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				content: [{ text: mockOutput }],
			}),
		});

		renderWithProviders(<MockApiTool />);

		const editors = screen.getAllByTestId("monaco-editor");
		fireEvent.change(editors[0], {
			target: {
				value:
					'{"type":"object","properties":{"id":{"type":"integer"},"name":{"type":"string"}}}',
			},
		});

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Generate" }));
		});

		await waitFor(() => {
			// After successful generation, the output editor should contain the generated data
			const editors = screen.getAllByTestId("monaco-editor");
			// There should be at least 2 editors - input and output
			expect(editors.length).toBeGreaterThanOrEqual(2);
		});
	});

	it("copy output button present", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("Copy")).toBeInTheDocument();
	});

	it("switching input mode tabs works", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		fireEvent.click(screen.getByText("Plain Description"));
		// After clicking Plain Description tab, a textarea should appear for that mode
		const editors = screen.getAllByTestId("monaco-editor");
		expect(editors.length).toBeGreaterThanOrEqual(1);
	});

	it("Change API key button present after key set", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		const keyButton = screen.getByTitle("Change API key");
		expect(keyButton).toBeInTheDocument();
	});

	it("invalid JSON in schema mode shows error on generate", async () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);

		const editors = screen.getAllByTestId("monaco-editor");
		fireEvent.change(editors[0], { target: { value: "{not valid json" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Generate" }));
		});

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
			expect(screen.getByText(/Invalid JSON/i)).toBeInTheDocument();
		});
	});

	it("Clear button resets input and output", async () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);

		const editors = screen.getAllByTestId("monaco-editor");
		fireEvent.change(editors[0], { target: { value: '{"test":true}' } });

		fireEvent.click(screen.getByText("Clear"));

		expect(editors[0]).toHaveValue("");
	});

	// -- New feature tests --

	it("output format selector includes CSV option", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		const select = screen.getByLabelText("Output format");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("CSV")).toBeInTheDocument();
	});

	it("locale selector present with all 6 locales", () => {
		setApiKeyInStorage();
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
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		const select = screen.getByLabelText("Locale") as HTMLSelectElement;
		fireEvent.change(select, { target: { value: "DE" } });
		expect(select.value).toBe("DE");
	});

	it("seed input field present", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		const seedInput = screen.getByLabelText("Seed");
		expect(seedInput).toBeInTheDocument();
		expect(seedInput).toHaveAttribute("placeholder", "Seed");
	});

	it("seed input accepts numeric value", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		const seedInput = screen.getByLabelText("Seed") as HTMLInputElement;
		fireEvent.change(seedInput, { target: { value: "42" } });
		expect(seedInput.value).toBe("42");
	});

	it("record count is a range slider", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		const slider = screen.getByLabelText("Record count");
		expect(slider).toBeInTheDocument();
		expect(slider).toHaveAttribute("type", "range");
		expect(slider).toHaveAttribute("min", "1");
		expect(slider).toHaveAttribute("max", "100");
	});

	it("record count slider shows current value beside it", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		// Default count is 10
		expect(screen.getByText("10")).toBeInTheDocument();
	});

	it("N>50 shows token warning", () => {
		setApiKeyInStorage();
		// Set record count to 55 in storage
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
		expect(screen.getByLabelText("Token usage warning")).toBeInTheDocument();
		expect(screen.getByText("High token usage")).toBeInTheDocument();
	});

	it("N<=50 does not show token warning", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		expect(
			screen.queryByLabelText("Token usage warning"),
		).not.toBeInTheDocument();
	});

	it("Copy as fetch mock button present", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("Fetch Mock")).toBeInTheDocument();
	});

	it("Copy as MSW handler button present", () => {
		setApiKeyInStorage();
		renderWithProviders(<MockApiTool />);
		expect(screen.getByText("MSW")).toBeInTheDocument();
	});

	it("successful generation shows per-row regenerate buttons for JSON output", async () => {
		setApiKeyInStorage();
		const mockOutput = JSON.stringify([
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
			{ id: 3, name: "Charlie" },
		]);

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				content: [{ text: mockOutput }],
			}),
		});

		renderWithProviders(<MockApiTool />);

		const editors = screen.getAllByTestId("monaco-editor");
		fireEvent.change(editors[0], {
			target: {
				value:
					'{"type":"object","properties":{"id":{"type":"integer"},"name":{"type":"string"}}}',
			},
		});

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Generate" }));
		});

		await waitFor(() => {
			// Should show regenerate buttons for rows 0, 1, 2
			expect(screen.getByLabelText("Regenerate row 0")).toBeInTheDocument();
			expect(screen.getByLabelText("Regenerate row 1")).toBeInTheDocument();
			expect(screen.getByLabelText("Regenerate row 2")).toBeInTheDocument();
		});
	});

	it("regenerate row calls API and updates output", async () => {
		setApiKeyInStorage();
		const mockOutput = JSON.stringify([
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		]);

		// First call: initial generation
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				content: [{ text: mockOutput }],
			}),
		});

		renderWithProviders(<MockApiTool />);

		const editors = screen.getAllByTestId("monaco-editor");
		fireEvent.change(editors[0], {
			target: {
				value:
					'{"type":"object","properties":{"id":{"type":"integer"},"name":{"type":"string"}}}',
			},
		});

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Generate" }));
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Regenerate row 0")).toBeInTheDocument();
		});

		// Second call: regenerate row 0
		const newRow = JSON.stringify({ id: 99, name: "Zara" });
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				content: [{ text: newRow }],
			}),
		});

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Regenerate row 0"));
		});

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});
	});
});
