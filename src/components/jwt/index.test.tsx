import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { JwtTool } from "./index";

const VALID_JWT =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const ALG_NONE_JWT =
	"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function typeInput(value: string) {
	const input = screen.getByTestId("monaco-editor");
	act(() => {
		fireEvent.change(input, { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

describe("JwtTool", () => {
	it("renders security banner about client-side only", () => {
		renderWithProviders(<JwtTool />);
		expect(
			screen.getByText(/decodes JWTs client-side only/i),
		).toBeInTheDocument();
	});

	it("renders JWT input area", () => {
		renderWithProviders(<JwtTool />);
		expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
	});

	it("decoding valid JWT shows header card with algorithm badge", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		expect(screen.getByText("Header")).toBeInTheDocument();
		expect(screen.getByText("HS256")).toBeInTheDocument();
	});

	it("decoding valid JWT shows payload card with claims", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		expect(screen.getByText("Payload")).toBeInTheDocument();
		expect(screen.getByText("sub")).toBeInTheDocument();
		expect(screen.getByText("1234567890")).toBeInTheDocument();
		expect(screen.getByText("name")).toBeInTheDocument();
		expect(screen.getByText("John Doe")).toBeInTheDocument();
	});

	it("decoding valid JWT shows signature card", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		expect(screen.getByText("Signature")).toBeInTheDocument();
		expect(
			screen.getAllByText("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c").length,
		).toBeGreaterThanOrEqual(1);
	});

	it('shows "alg:none" warning for unsigned tokens', () => {
		renderWithProviders(<JwtTool />);
		typeInput(ALG_NONE_JWT);
		expect(screen.getByText(/alg:none/i)).toBeInTheDocument();
	});

	it("invalid JWT (not 3 parts) shows error", () => {
		renderWithProviders(<JwtTool />);
		typeInput("not.a.valid.jwt.token");
		// This has 5 parts — should trigger an error about expected 3 parts
		expect(screen.getByText(/expected 3 parts/i)).toBeInTheDocument();
	});

	it("invalid JWT with 2 parts shows error", () => {
		renderWithProviders(<JwtTool />);
		typeInput("only.twoparts");
		expect(screen.getByText(/expected 3 parts/i)).toBeInTheDocument();
	});

	it("empty input shows no error and no decoded cards", () => {
		renderWithProviders(<JwtTool />);
		typeInput("");
		expect(screen.queryByText("Header")).not.toBeInTheDocument();
		expect(screen.queryByText("Payload")).not.toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("Clear button resets everything", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		expect(screen.getByText("Header")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		expect(screen.getByTestId("monaco-editor")).toHaveValue("");
		expect(screen.queryByText("Header")).not.toBeInTheDocument();
	});

	it("History button is present", () => {
		renderWithProviders(<JwtTool />);
		expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
	});

	it("Copy Payload button is present", () => {
		renderWithProviders(<JwtTool />);
		expect(screen.getByText("Copy Payload")).toBeInTheDocument();
	});

	it("renders tool title", () => {
		renderWithProviders(<JwtTool />);
		expect(screen.getByText("JWT Decoder")).toBeInTheDocument();
	});

	it("shows iat claim with timestamp label", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		expect(screen.getByText("iat")).toBeInTheDocument();
		expect(screen.getByText(/Issued At/)).toBeInTheDocument();
	});

	it("shows subject claim with label", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		expect(screen.getByText("sub")).toBeInTheDocument();
		expect(screen.getByText(/Subject/)).toBeInTheDocument();
	});

	// --- Color-coded token preview ---
	it("shows color-coded JWT preview with three colored parts", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		const preview = screen.getByTestId("jwt-color-preview");
		expect(preview).toBeInTheDocument();
		expect(screen.getByTestId("jwt-part-header")).toHaveClass(
			"text-purple-400",
		);
		expect(screen.getByTestId("jwt-part-payload")).toHaveClass(
			"text-orange-400",
		);
		expect(screen.getByTestId("jwt-part-signature")).toHaveClass(
			"text-teal-400",
		);
	});

	// --- Raw/decoded toggle per section ---
	it("Header card toggle switches between decoded JSON and raw base64url", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		// Default: decoded JSON
		expect(screen.getByText(/"alg": "HS256"/)).toBeInTheDocument();
		// Click Raw
		fireEvent.click(screen.getByTestId("toggle-raw-header"));
		// Raw base64url appears in both color preview and header card
		expect(
			screen.getAllByText("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9").length,
		).toBeGreaterThanOrEqual(2);
		// Click Decoded
		fireEvent.click(screen.getByTestId("toggle-raw-header"));
		expect(screen.getByText(/"alg": "HS256"/)).toBeInTheDocument();
	});

	it("Payload card toggle switches between decoded claims and raw base64url", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		// Default: decoded claims
		expect(screen.getByText("John Doe")).toBeInTheDocument();
		// Click Raw
		fireEvent.click(screen.getByTestId("toggle-raw-payload"));
		// Raw base64url appears in both color preview and payload card
		expect(
			screen.getAllByText(
				"eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",
			).length,
		).toBeGreaterThanOrEqual(2);
		// Claims should be hidden in raw mode
		expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
	});

	it("Signature card toggle switches between raw base64url and decoded hex", () => {
		renderWithProviders(<JwtTool />);
		typeInput(VALID_JWT);
		// Default: raw base64url (preserves existing behavior)
		expect(
			screen.getAllByText("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c").length,
		).toBeGreaterThanOrEqual(1);
		// Click Decoded to see hex
		fireEvent.click(screen.getByTestId("toggle-raw-signature"));
		// Hex output should contain space-separated hex bytes
		const sigCard = screen
			.getByTestId("toggle-raw-signature")
			.closest(".rounded-md");
		expect(sigCard?.textContent).toMatch(/[0-9a-f]{2}\s[0-9a-f]{2}/);
	});

	// --- aud claim as array chips ---
	it("renders aud array as chips when aud is an array", () => {
		// JWT with aud: ["api", "web"]
		// Header: {"alg":"HS256","typ":"JWT"}
		// Payload: {"sub":"1234567890","aud":["api","web"],"iat":1516239022}
		const AUD_ARRAY_JWT =
			"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiYXVkIjpbImFwaSIsIndlYiJdLCJpYXQiOjE1MTYyMzkwMjJ9.signature";
		renderWithProviders(<JwtTool />);
		typeInput(AUD_ARRAY_JWT);
		const chips = screen.getAllByTestId("aud-chip");
		expect(chips).toHaveLength(2);
		expect(chips[0]).toHaveTextContent("api");
		expect(chips[1]).toHaveTextContent("web");
	});

	// --- Nested JWT detection ---
	it("shows 'Decode nested JWT' button for nested JWT claims", () => {
		// JWT where a claim contains another JWT
		// Payload: {"sub":"1234567890","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJuZXN0ZWQifQ.sig","iat":1516239022}
		const NESTED_JWT =
			"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKemRXSWlPaUp1WlhOMFpXUWlmUS5zaWciLCJpYXQiOjE1MTYyMzkwMjJ9.fakesig";
		renderWithProviders(<JwtTool />);
		typeInput(NESTED_JWT);
		const nestedBtn = screen.getByTestId("nested-jwt-token");
		expect(nestedBtn).toBeInTheDocument();
		expect(nestedBtn).toHaveTextContent("Decode nested JWT");
	});

	it("clicking nested JWT button expands inline decode", () => {
		const NESTED_JWT =
			"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKemRXSWlPaUp1WlhOMFpXUWlmUS5zaWciLCJpYXQiOjE1MTYyMzkwMjJ9.fakesig";
		renderWithProviders(<JwtTool />);
		typeInput(NESTED_JWT);
		fireEvent.click(screen.getByTestId("nested-jwt-token"));
		expect(screen.getByText("Nested Header")).toBeInTheDocument();
		expect(screen.getByText("Nested Payload")).toBeInTheDocument();
		expect(screen.getByTestId("nested-jwt-content-token")).toBeInTheDocument();
	});
});
