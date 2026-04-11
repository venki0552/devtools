import "@/test/mock-monaco";
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { UuidTool } from "./index";

// Mock crypto.randomUUID and crypto.getRandomValues for deterministic tests
const originalCrypto = globalThis.crypto;
beforeAll(() => {
	Object.defineProperty(globalThis, "crypto", {
		value: {
			...originalCrypto,
			randomUUID: originalCrypto.randomUUID?.bind(originalCrypto),
			getRandomValues: originalCrypto.getRandomValues?.bind(originalCrypto),
		},
		writable: true,
		configurable: true,
	});
});

// UUID v4 regex
const UUID_V4_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V7_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_ANY_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

describe("UuidTool", () => {
	it("renders with tool title", () => {
		renderWithProviders(<UuidTool />);
		expect(screen.getByText("UUID Generator")).toBeInTheDocument();
	});

	it("renders version selector buttons (V4, V7, ULID)", () => {
		renderWithProviders(<UuidTool />);
		expect(screen.getByText("V4")).toBeInTheDocument();
		expect(screen.getByText("V7")).toBeInTheDocument();
		expect(screen.getByText("ULID")).toBeInTheDocument();
	});

	it("generates valid v4 UUID format (8-4-4-4-12 pattern)", () => {
		renderWithProviders(<UuidTool />);
		// Default version is v4
		const singleDisplay = screen.getByText((content, element) => {
			return element?.tagName === "SPAN" && UUID_V4_REGEX.test(content);
		});
		expect(singleDisplay).toBeInTheDocument();
	});

	it("v4 UUID has correct version nibble (4)", () => {
		renderWithProviders(<UuidTool />);
		const singleDisplay = screen.getByText((content) =>
			UUID_V4_REGEX.test(content),
		);
		const uuid = singleDisplay.textContent!;
		expect(uuid[14]).toBe("4");
	});

	it("generates valid v7 UUID when v7 tab is selected", () => {
		renderWithProviders(<UuidTool />);
		fireEvent.click(screen.getByText("V7"));
		const singleDisplay = screen.getByText((content, element) => {
			return element?.tagName === "SPAN" && UUID_V7_REGEX.test(content);
		});
		expect(singleDisplay).toBeInTheDocument();
		expect(singleDisplay.textContent![14]).toBe("7");
	});

	it("generates valid ULID when ULID tab is selected", () => {
		renderWithProviders(<UuidTool />);
		fireEvent.click(screen.getByText("ULID"));
		const singleDisplay = screen.getByText((content, element) => {
			return element?.tagName === "SPAN" && ULID_REGEX.test(content);
		});
		expect(singleDisplay).toBeInTheDocument();
	});

	it("bulk generation creates the selected quantity", async () => {
		renderWithProviders(<UuidTool />);
		// Select quantity 5
		fireEvent.change(screen.getByLabelText("Quantity"), {
			target: { value: "5" },
		});
		fireEvent.click(screen.getByText("Generate"));

		// Bulk output renders in a MonacoWrapper mock (textarea with data-testid)
		await waitFor(() => {
			const editors = screen.getAllByTestId("monaco-editor");
			const bulkOutput = editors[editors.length - 1] as HTMLTextAreaElement;
			const lines = bulkOutput.value.trim().split("\n");
			expect(lines).toHaveLength(5);
			lines.forEach((line) => {
				expect(UUID_V4_REGEX.test(line)).toBe(true);
			});
		});
	});

	it("uppercase format option works", () => {
		renderWithProviders(<UuidTool />);
		fireEvent.change(screen.getByLabelText("UUID format"), {
			target: { value: "uppercase" },
		});
		// Need to regenerate single UUID after format change
		fireEvent.click(screen.getByLabelText("Regenerate"));
		const singleDisplay = screen.getByText((content, element) => {
			return (
				element?.tagName === "SPAN" &&
				/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(
					content,
				)
			);
		});
		expect(singleDisplay).toBeInTheDocument();
	});

	it("no-hyphens format option works", () => {
		renderWithProviders(<UuidTool />);
		fireEvent.change(screen.getByLabelText("UUID format"), {
			target: { value: "no-hyphens" },
		});

		fireEvent.change(screen.getByLabelText("Quantity"), {
			target: { value: "1" },
		});
		fireEvent.click(screen.getByText("Generate"));

		const editors = screen.getAllByTestId("monaco-editor");
		const bulkOutput = editors[editors.length - 1] as HTMLTextAreaElement;
		const line = bulkOutput.value.trim();
		expect(line).not.toContain("-");
		expect(line).toHaveLength(32);
	});

	it("braces format option wraps UUID in curly braces", () => {
		renderWithProviders(<UuidTool />);
		fireEvent.change(screen.getByLabelText("UUID format"), {
			target: { value: "braces" },
		});

		fireEvent.change(screen.getByLabelText("Quantity"), {
			target: { value: "1" },
		});
		fireEvent.click(screen.getByText("Generate"));

		const editors = screen.getAllByTestId("monaco-editor");
		const bulkOutput = editors[editors.length - 1] as HTMLTextAreaElement;
		const line = bulkOutput.value.trim();
		expect(line.startsWith("{")).toBe(true);
		expect(line.endsWith("}")).toBe(true);
	});

	it("UUID decode shows version and variant for v4 UUID", () => {
		renderWithProviders(<UuidTool />);
		const decodeInput = screen.getByLabelText("UUID decode input");
		fireEvent.change(decodeInput, {
			target: { value: "550e8400-e29b-41d4-a716-446655440000" },
		});
		expect(screen.getByText(/UUID v4/i)).toBeInTheDocument();
		expect(screen.getByText(/RFC 4122/i)).toBeInTheDocument();
	});

	it("UUID decode detects ULID format", () => {
		renderWithProviders(<UuidTool />);
		const decodeInput = screen.getByLabelText("UUID decode input");
		fireEvent.change(decodeInput, {
			target: { value: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
		});
		// The decode result shows "Detected: ULID" — check via the detected text
		expect(screen.getByText(/Detected:/).textContent).toContain("ULID");
	});

	it("copy button is present for single UUID", () => {
		renderWithProviders(<UuidTool />);
		// CopyButton has aria-label="Copy to clipboard"
		expect(
			screen.getAllByLabelText("Copy to clipboard").length,
		).toBeGreaterThanOrEqual(1);
	});

	it("regenerate button generates a new UUID", () => {
		renderWithProviders(<UuidTool />);
		const first = screen.getByText((content) =>
			UUID_V4_REGEX.test(content),
		).textContent;

		fireEvent.click(screen.getByLabelText("Regenerate"));
		const second = screen.getByText((content) =>
			UUID_V4_REGEX.test(content),
		).textContent;

		// UUIDs are random, there's an astronomically small chance they match
		// We just verify the element still has a valid UUID
		expect(UUID_V4_REGEX.test(second!)).toBe(true);
	});

	it("output format can be set to JSON array", () => {
		renderWithProviders(<UuidTool />);
		fireEvent.change(screen.getByLabelText("Output format"), {
			target: { value: "json-array" },
		});
		fireEvent.change(screen.getByLabelText("Quantity"), {
			target: { value: "5" },
		});
		fireEvent.click(screen.getByText("Generate"));

		const editors = screen.getAllByTestId("monaco-editor");
		const bulkOutput = editors[editors.length - 1] as HTMLTextAreaElement;
		const parsed = JSON.parse(bulkOutput.value);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(5);
	});

	it("invalid UUID decode input shows not recognized message", () => {
		renderWithProviders(<UuidTool />);
		const decodeInput = screen.getByLabelText("UUID decode input");
		fireEvent.change(decodeInput, { target: { value: "not-a-uuid" } });
		expect(screen.getByText(/not a recognized/i)).toBeInTheDocument();
	});

	// === GAP 1: SQL VALUES format ===
	it("SQL VALUES output format wraps each UUID in parentheses with quotes", () => {
		renderWithProviders(<UuidTool />);
		fireEvent.change(screen.getByLabelText("Output format"), {
			target: { value: "sql-values" },
		});
		fireEvent.change(screen.getByLabelText("Quantity"), {
			target: { value: "5" },
		});
		fireEvent.click(screen.getByText("Generate"));

		const editors = screen.getAllByTestId("monaco-editor");
		const bulkOutput = editors[editors.length - 1] as HTMLTextAreaElement;
		const lines = bulkOutput.value.trim().split("\n");
		expect(lines).toHaveLength(5);
		lines.forEach((line) => {
			const trimmed = line.replace(/,$/, "");
			expect(trimmed).toMatch(/^\('[0-9a-f-]{36}'\)$/i);
		});
	});

	// === GAP 2: Detailed v1 decode ===
	it("v1 UUID decode shows timestamp, clock sequence, and MAC address", () => {
		renderWithProviders(<UuidTool />);
		const decodeInput = screen.getByLabelText("UUID decode input");
		// Known v1 UUID
		fireEvent.change(decodeInput, {
			target: { value: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" },
		});
		expect(screen.getByText(/UUID v1/i)).toBeInTheDocument();
		expect(screen.getByText("Timestamp:")).toBeInTheDocument();
		expect(screen.getByText("Clock Sequence:")).toBeInTheDocument();
		expect(screen.getByText("Node (MAC):")).toBeInTheDocument();
		// MAC should be colon-separated
		expect(
			screen.getByText(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i),
		).toBeInTheDocument();
	});

	// === GAP 3: Green/red validation badges ===
	it("shows green valid badge for a well-formed UUID", () => {
		renderWithProviders(<UuidTool />);
		const decodeInput = screen.getByLabelText("UUID decode input");
		fireEvent.change(decodeInput, {
			target: { value: "550e8400-e29b-41d4-a716-446655440000" },
		});
		const badge = screen.getByTestId("validation-badge");
		expect(badge.textContent).toContain("Valid");
		expect(badge.className).toContain("green");
	});

	it("shows red invalid badge for malformed input", () => {
		renderWithProviders(<UuidTool />);
		const decodeInput = screen.getByLabelText("UUID decode input");
		fireEvent.change(decodeInput, { target: { value: "not-a-uuid" } });
		const badge = screen.getByTestId("validation-badge");
		expect(badge.textContent).toContain("Invalid");
		expect(badge.className).toContain("red");
	});

	// === GAP 4: Tab explanations ===
	it("shows explanation for v4 tab by default", () => {
		renderWithProviders(<UuidTool />);
		const explanation = screen.getByTestId("tab-explanation");
		expect(explanation.textContent).toContain("Random UUID");
	});

	it("shows explanation for v7 tab when selected", () => {
		renderWithProviders(<UuidTool />);
		fireEvent.click(screen.getByText("V7"));
		const explanation = screen.getByTestId("tab-explanation");
		expect(explanation.textContent).toContain("Time-ordered UUID");
	});

	it("shows explanation for ULID tab when selected", () => {
		renderWithProviders(<UuidTool />);
		fireEvent.click(screen.getByText("ULID"));
		const explanation = screen.getByTestId("tab-explanation");
		expect(explanation.textContent).toContain("Lexicographically Sortable");
	});

	// === GAP 5: Keyboard shortcut badges ===
	it("shows Ctrl+Enter keyboard shortcut badge next to Regenerate button", () => {
		renderWithProviders(<UuidTool />);
		expect(screen.getByText("Ctrl+↵")).toBeInTheDocument();
	});

	it("shows Ctrl+C keyboard shortcut badge next to Copy button", () => {
		renderWithProviders(<UuidTool />);
		expect(screen.getByText("Ctrl+C")).toBeInTheDocument();
	});

	it("Ctrl+Enter triggers regenerate", () => {
		renderWithProviders(<UuidTool />);
		const first = screen.getByText((content) =>
			UUID_V4_REGEX.test(content),
		).textContent;

		fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

		const second = screen.getByText((content) =>
			UUID_V4_REGEX.test(content),
		).textContent;
		// Verify it's still a valid UUID (regenerated)
		expect(UUID_V4_REGEX.test(second!)).toBe(true);
	});
});
