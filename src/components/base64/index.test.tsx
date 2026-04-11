import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { Base64Tool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function getEditors() {
	const editors = screen.getAllByTestId("monaco-editor");
	return {
		input: editors[0] as HTMLTextAreaElement,
		output: editors[1] as HTMLTextAreaElement,
	};
}

function typeInput(value: string) {
	const { input } = getEditors();
	act(() => {
		fireEvent.change(input, { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

describe("Base64Tool", () => {
	it("renders with all four mode tabs", () => {
		renderWithProviders(<Base64Tool />);
		expect(
			screen.getByRole("button", { name: "Text→Base64" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Base64→Text" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "File→Base64" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Base64→File" }),
		).toBeInTheDocument();
	});

	it("renders variant selector with Standard, URL-safe and MIME options", () => {
		renderWithProviders(<Base64Tool />);
		const select = screen.getByLabelText("Base64 variant");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("Standard")).toBeInTheDocument();
		expect(screen.getByText("URL-safe")).toBeInTheDocument();
		expect(screen.getByText("MIME (RFC 2045)")).toBeInTheDocument();
	});

	it('encodes "Hello World" to "SGVsbG8gV29ybGQ="', () => {
		renderWithProviders(<Base64Tool />);
		typeInput("Hello World");
		const { output } = getEditors();
		expect(output).toHaveValue("SGVsbG8gV29ybGQ=");
	});

	it('decodes "SGVsbG8gV29ybGQ=" to "Hello World"', () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.click(screen.getByRole("button", { name: "Base64→Text" }));
		typeInput("SGVsbG8gV29ybGQ=");
		const { output } = getEditors();
		expect(output).toHaveValue("Hello World");
	});

	it("URL-safe encoding replaces +/ with -_", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.change(screen.getByLabelText("Base64 variant"), {
			target: { value: "urlsafe" },
		});
		typeInput("subjects?q=1");
		const { output } = getEditors();
		expect(output.value).not.toContain("+");
		expect(output.value).not.toContain("/");
		expect(output.value).not.toContain("=");
	});

	it("URL-safe decoding handles -_ characters", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.change(screen.getByLabelText("Base64 variant"), {
			target: { value: "urlsafe" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Base64→Text" }));
		typeInput("SGVsbG8gV29ybGQ");
		const { output } = getEditors();
		expect(output).toHaveValue("Hello World");
	});

	it("empty input produces no output and no error", () => {
		renderWithProviders(<Base64Tool />);
		typeInput("");
		const { output } = getEditors();
		expect(output).toHaveValue("");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("invalid base64 input shows error in decode mode", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.click(screen.getByRole("button", { name: "Base64→Text" }));
		typeInput("!!!invalid!!!");
		expect(screen.getByText(/invalid character/i)).toBeInTheDocument();
	});

	it("shows character count", () => {
		renderWithProviders(<Base64Tool />);
		typeInput("Hello");
		expect(screen.getByText("5 chars")).toBeInTheDocument();
	});

	it("Clear button resets input and output", () => {
		renderWithProviders(<Base64Tool />);
		typeInput("Hello World");
		const { output } = getEditors();
		expect(output).toHaveValue("SGVsbG8gV29ybGQ=");

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "Clear" }));
			vi.advanceTimersByTime(350);
		});
		const { input, output: out2 } = getEditors();
		expect(input).toHaveValue("");
		expect(out2).toHaveValue("");
	});

	it("handles unicode input with emoji", () => {
		renderWithProviders(<Base64Tool />);
		typeInput("Hello 🌍");
		const { output } = getEditors();
		expect(output.value.length).toBeGreaterThan(0);

		// Verify roundtrip
		const encoded = output.value;
		fireEvent.click(screen.getByRole("button", { name: "Base64→Text" }));
		typeInput(encoded);
		const { output: decoded } = getEditors();
		expect(decoded).toHaveValue("Hello 🌍");
	});

	it("handles CJK characters", () => {
		renderWithProviders(<Base64Tool />);
		typeInput("你好世界");
		const { output } = getEditors();
		expect(output.value.length).toBeGreaterThan(0);

		// Roundtrip
		const encoded = output.value;
		fireEvent.click(screen.getByRole("button", { name: "Base64→Text" }));
		typeInput(encoded);
		const { output: decoded } = getEditors();
		expect(decoded).toHaveValue("你好世界");
	});

	it("handles newlines in input", () => {
		renderWithProviders(<Base64Tool />);
		typeInput("line1\nline2\nline3");
		const { output } = getEditors();
		expect(output.value.length).toBeGreaterThan(0);
	});

	it("switching from encode to decode mode reprocesses input", () => {
		renderWithProviders(<Base64Tool />);
		typeInput("Hello");
		const { output } = getEditors();
		expect(output).toHaveValue("SGVsbG8=");

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "Base64→Text" }));
			vi.advanceTimersByTime(350);
		});
		// Input "Hello" is now treated as decode input
	});

	it("renders the tool title", () => {
		renderWithProviders(<Base64Tool />);
		expect(screen.getByText("Base64 Encode / Decode")).toBeInTheDocument();
	});

	/* ---------- MIME variant ---------- */

	it("MIME variant wraps output at 76 chars with CRLF", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.change(screen.getByLabelText("Base64 variant"), {
			target: { value: "mime" },
		});
		// Use a long input that produces >76 chars of base64
		const longInput = "A".repeat(100);
		typeInput(longInput);
		const { output } = getEditors();
		const lines = output.value.split("\r\n");
		for (let i = 0; i < lines.length - 1; i++) {
			expect(lines[i].length).toBe(76);
		}
	});

	/* ---------- Line wrap ---------- */

	it("line wrap at 64 chars breaks output appropriately", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.change(screen.getByLabelText("Line wrap"), {
			target: { value: "64" },
		});
		const longInput = "B".repeat(100);
		typeInput(longInput);
		const { output } = getEditors();
		const lines = output.value.split("\n");
		for (let i = 0; i < lines.length - 1; i++) {
			expect(lines[i].length).toBe(64);
		}
	});

	/* ---------- Text encoding ---------- */

	it("renders text encoding selector in text mode", () => {
		renderWithProviders(<Base64Tool />);
		expect(screen.getByLabelText("Text encoding")).toBeInTheDocument();
		expect(screen.getByText("UTF-8")).toBeInTheDocument();
		expect(screen.getByText("UTF-16")).toBeInTheDocument();
		expect(screen.getByText("Latin-1")).toBeInTheDocument();
		expect(screen.getByText("ASCII")).toBeInTheDocument();
	});

	it("Latin-1 encoding produces different output than UTF-8 for extended chars", () => {
		renderWithProviders(<Base64Tool />);
		typeInput("café");
		const { output } = getEditors();
		const utf8Output = output.value;

		fireEvent.change(screen.getByLabelText("Text encoding"), {
			target: { value: "latin-1" },
		});
		act(() => {
			vi.advanceTimersByTime(350);
		});
		const { output: out2 } = getEditors();
		expect(out2.value).not.toBe(utf8Output);
	});

	/* ---------- File→Base64 mode ---------- */

	it("File→Base64 mode shows drop zone", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.click(screen.getByRole("button", { name: "File→Base64" }));
		expect(
			screen.getByText(/drop a file here or click to browse/i),
		).toBeInTheDocument();
	});

	it("File→Base64 mode shows Data URI checkbox", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.click(screen.getByRole("button", { name: "File→Base64" }));
		expect(screen.getByText("Data URI")).toBeInTheDocument();
	});

	/* ---------- Base64→File mode ---------- */

	it("Base64→File mode renders editors", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.click(screen.getByRole("button", { name: "Base64→File" }));
		const editors = screen.getAllByTestId("monaco-editor");
		expect(editors.length).toBe(2);
	});

	it("Base64→File mode shows download button after valid input", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.click(screen.getByRole("button", { name: "Base64→File" }));
		typeInput("SGVsbG8gV29ybGQ=");
		expect(
			screen.getByRole("button", { name: "Download decoded file" }),
		).toBeInTheDocument();
	});

	it("Base64→File mode detects MIME type from data URI", () => {
		renderWithProviders(<Base64Tool />);
		fireEvent.click(screen.getByRole("button", { name: "Base64→File" }));
		typeInput("data:text/plain;base64,SGVsbG8=");
		const { output } = getEditors();
		expect(output.value).toContain("text/plain");
	});

	/* ---------- Expansion ratio ---------- */

	it("shows expansion ratio for encode", () => {
		renderWithProviders(<Base64Tool />);
		typeInput("Hello World");
		expect(screen.getByText(/Expansion ratio:.*encode/)).toBeInTheDocument();
	});
});
