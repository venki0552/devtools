import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { HashTool } from "./index";

// Mock crypto.subtle.digest for jsdom environment
const mockDigest = vi.fn(async () => {
	// Return a deterministic 32-byte buffer for testing
	const result = new Uint8Array(32);
	for (let i = 0; i < 32; i++) {
		result[i] = i;
	}
	return result.buffer;
});

// Only mock if subtle doesn't work properly in test env
if (!globalThis.crypto?.subtle?.digest) {
	Object.defineProperty(globalThis, "crypto", {
		value: {
			...globalThis.crypto,
			subtle: {
				digest: mockDigest,
			},
		},
	});
} else {
	vi.spyOn(crypto.subtle, "digest").mockImplementation(mockDigest);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

async function typeInput(value: string) {
	const input = screen.getByLabelText("Hash input");
	await act(async () => {
		fireEvent.change(input, { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

describe("HashTool", () => {
	it('renders with title "Hash Generator"', () => {
		renderWithProviders(<HashTool />);
		expect(screen.getByText("Hash Generator")).toBeInTheDocument();
	});

	it("shows MD5, SHA-1, SHA-256, SHA-384, SHA-512 labels", () => {
		renderWithProviders(<HashTool />);
		expect(screen.getByText("MD5")).toBeInTheDocument();
		expect(screen.getByText("SHA-1")).toBeInTheDocument();
		expect(screen.getByText("SHA-256")).toBeInTheDocument();
		expect(screen.getByText("SHA-384")).toBeInTheDocument();
		expect(screen.getByText("SHA-512")).toBeInTheDocument();
	});

	it("empty input shows dashes for all hashes", () => {
		renderWithProviders(<HashTool />);
		const dashes = screen.getAllByText("—");
		expect(dashes.length).toBe(5);
	});

	it("shows security badge indicators", () => {
		renderWithProviders(<HashTool />);
		expect(screen.getByText("Legacy")).toBeInTheDocument();
		expect(screen.getByText("Deprecated")).toBeInTheDocument();
		expect(screen.getByText("Recommended")).toBeInTheDocument();
		const highSecurity = screen.getAllByText("High security");
		expect(highSecurity.length).toBe(2);
	});

	it("Clear button resets input and hashes", async () => {
		renderWithProviders(<HashTool />);
		await typeInput("hello");
		expect(screen.queryAllByText("—").length).toBeLessThan(5);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Clear" }));
			vi.advanceTimersByTime(350);
		});
		expect(screen.getByLabelText("Hash input")).toHaveValue("");
		expect(screen.getAllByText("—").length).toBe(5);
	});

	it("output format selector has Hex and Base64 options", () => {
		renderWithProviders(<HashTool />);
		const select = screen.getByLabelText("Output format");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("Lowercase Hex")).toBeInTheDocument();
		expect(screen.getByText("Uppercase Hex")).toBeInTheDocument();
		expect(screen.getByText("Base64")).toBeInTheDocument();
	});

	it("renders hash input textarea", () => {
		renderWithProviders(<HashTool />);
		const input = screen.getByLabelText("Hash input");
		expect(input).toBeInTheDocument();
		expect(input.tagName.toLowerCase()).toBe("textarea");
	});

	it("generates hashes when input is provided", async () => {
		renderWithProviders(<HashTool />);
		await typeInput("test input");
		// After hashing, dashes should be replaced with hash values
		const dashes = screen.queryAllByText("—");
		expect(dashes.length).toBeLessThan(5);
	});

	it("shows Copy All button", () => {
		renderWithProviders(<HashTool />);
		expect(screen.getByText("Copy All")).toBeInTheDocument();
	});

	it("changing output format updates display", () => {
		renderWithProviders(<HashTool />);
		const select = screen.getByLabelText("Output format");
		fireEvent.change(select, { target: { value: "hex-upper" } });
		expect(select).toHaveValue("hex-upper");
	});

	it("shows character count for input", async () => {
		renderWithProviders(<HashTool />);
		await typeInput("Hello");
		expect(screen.getByText(/5 chars/)).toBeInTheDocument();
	});
});
