import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { RegexTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function typePattern(value: string) {
	const input = screen.getByLabelText("Regex pattern");
	act(() => {
		fireEvent.change(input, { target: { value } });
		vi.advanceTimersByTime(250);
	});
}

function typeTestString(value: string) {
	const editor = screen.getAllByTestId("monaco-editor")[0];
	act(() => {
		fireEvent.change(editor, { target: { value } });
		vi.advanceTimersByTime(250);
	});
}

describe("RegexTool", () => {
	it("renders with tool title", () => {
		renderWithProviders(<RegexTool />);
		expect(screen.getByText("Regex Tester")).toBeInTheDocument();
	});

	it("renders pattern input and flag toggle buttons", () => {
		renderWithProviders(<RegexTool />);
		expect(screen.getByLabelText("Regex pattern")).toBeInTheDocument();
		expect(screen.getByLabelText("Toggle flag g")).toBeInTheDocument();
		expect(screen.getByLabelText("Toggle flag i")).toBeInTheDocument();
		expect(screen.getByLabelText("Toggle flag m")).toBeInTheDocument();
		expect(screen.getByLabelText("Toggle flag s")).toBeInTheDocument();
		expect(screen.getByLabelText("Toggle flag u")).toBeInTheDocument();
	});

	it('simple match: pattern "hello" finds match in "hello world"', () => {
		renderWithProviders(<RegexTool />);
		typePattern("hello");
		typeTestString("hello world");
		expect(screen.getByText("1 match")).toBeInTheDocument();
		expect(screen.getByText("hello")).toBeInTheDocument();
	});

	it("global flag finds all matches", () => {
		renderWithProviders(<RegexTool />);
		// g flag is on by default
		typePattern("o");
		typeTestString("hello world foo");
		expect(screen.getByText("4 matches")).toBeInTheDocument();
	});

	it("case-insensitive flag works", () => {
		renderWithProviders(<RegexTool />);
		typePattern("HELLO");
		typeTestString("hello world");
		// Without i flag, no match
		expect(screen.getByText("No matches found")).toBeInTheDocument();

		// Enable i flag
		act(() => {
			fireEvent.click(screen.getByLabelText("Toggle flag i"));
			vi.advanceTimersByTime(250);
		});
		expect(screen.getByText("1 match")).toBeInTheDocument();
	});

	it("shows match positions", () => {
		renderWithProviders(<RegexTool />);
		typePattern("world");
		typeTestString("hello world");
		// Match should show position [6–11)
		expect(screen.getByText("[6–11)")).toBeInTheDocument();
	});

	it("capture groups extracted correctly", () => {
		renderWithProviders(<RegexTool />);
		typePattern("(\\w+)@(\\w+)");
		typeTestString("user@host");

		// Switch to Groups tab
		fireEvent.click(screen.getByText("groups"));
		expect(screen.getByText(/Group 1:/)).toBeInTheDocument();
		expect(screen.getByText("user")).toBeInTheDocument();
		expect(screen.getByText("Group 2:")).toBeInTheDocument();
		expect(screen.getByText("host")).toBeInTheDocument();
	});

	it("replace mode works", () => {
		renderWithProviders(<RegexTool />);
		typePattern("world");
		typeTestString("hello world");

		fireEvent.click(screen.getByText("replace"));
		const replacementInput = screen.getByPlaceholderText(/backreferences/i);
		fireEvent.change(replacementInput, { target: { value: "universe" } });

		expect(screen.getByText("hello universe")).toBeInTheDocument();
	});

	it("common patterns sidebar toggles on button click", () => {
		renderWithProviders(<RegexTool />);
		fireEvent.click(screen.getByRole("button", { name: "Patterns" }));
		expect(screen.getByText("Common Patterns")).toBeInTheDocument();
		expect(screen.getByText("Email")).toBeInTheDocument();
		expect(screen.getByText("URL")).toBeInTheDocument();
		expect(screen.getByText("IPv4")).toBeInTheDocument();
		expect(screen.getByText("UUID")).toBeInTheDocument();
	});

	it("clicking a preset populates the pattern", () => {
		renderWithProviders(<RegexTool />);
		fireEvent.click(screen.getByRole("button", { name: "Patterns" }));
		fireEvent.click(screen.getByText("Email"));
		const patternInput = screen.getByLabelText(
			"Regex pattern",
		) as HTMLInputElement;
		expect(patternInput.value).toContain("@");
	});

	it("invalid regex shows error", () => {
		renderWithProviders(<RegexTool />);
		typePattern("[invalid");
		typeTestString("test");
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("empty pattern shows no results", () => {
		renderWithProviders(<RegexTool />);
		typePattern("");
		typeTestString("hello world");
		expect(screen.getByText("No matches found")).toBeInTheDocument();
	});

	it("shows warning when global flag is not set", () => {
		renderWithProviders(<RegexTool />);
		// Turn off the g flag (it's on by default)
		fireEvent.click(screen.getByLabelText("Toggle flag g"));
		typePattern("test");
		expect(screen.getByText(/global flag/i)).toBeInTheDocument();
	});

	it("Clear button resets pattern and input", () => {
		renderWithProviders(<RegexTool />);
		typePattern("hello");
		typeTestString("hello world");
		expect(screen.getByText("1 match")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		expect(
			(screen.getByLabelText("Regex pattern") as HTMLInputElement).value,
		).toBe("");
	});

	it("renders Matches, Groups, and Replace tabs", () => {
		renderWithProviders(<RegexTool />);
		expect(screen.getByText("matches")).toBeInTheDocument();
		expect(screen.getByText("groups")).toBeInTheDocument();
		expect(screen.getByText("replace")).toBeInTheDocument();
	});

	it("renders the Explain tab", () => {
		renderWithProviders(<RegexTool />);
		expect(screen.getByText("explain")).toBeInTheDocument();
	});

	it("Explain tab shows API key message when no key is set", () => {
		renderWithProviders(<RegexTool />);
		fireEvent.click(screen.getByText("explain"));
		expect(screen.getByText(/Set your Anthropic API key/i)).toBeInTheDocument();
	});

	it("Explain tab shows Explain button when API key is set", () => {
		localStorage.setItem("devtools-anthropic-key", JSON.stringify("test-key"));
		renderWithProviders(<RegexTool />);
		typePattern("\\d+");
		fireEvent.click(screen.getByText("explain"));
		expect(
			screen.getByRole("button", { name: /Explain this regex/i }),
		).toBeInTheDocument();
	});

	it("flag buttons show tooltips on hover", () => {
		renderWithProviders(<RegexTool />);
		// Each flag button should have a tooltip sibling
		expect(
			screen.getByText("Global: find all matches, not just the first"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Case-insensitive: ignore upper/lower case"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Multiline: ^ and $ match line boundaries"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Dotall: dot (.) also matches newline characters"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Unicode: enable full Unicode matching"),
		).toBeInTheDocument();
	});

	it("does not show backtracking warning for normal patterns", () => {
		// In test env (no Worker), the sync fallback is used, so no timeout.
		// We verify the component renders without the warning for normal patterns.
		renderWithProviders(<RegexTool />);
		typePattern("\\d+");
		typeTestString("hello 123 world 456");
		expect(
			screen.queryByText(/catastrophic backtracking/i),
		).not.toBeInTheDocument();
		expect(screen.getByText("2 matches")).toBeInTheDocument();
	});

	it("shows 100KB input warning for large input", () => {
		renderWithProviders(<RegexTool />);
		// Simulate a large input > 100KB
		const largeInput = "a".repeat(102401);
		const editor = screen.getAllByTestId("monaco-editor")[0];
		act(() => {
			fireEvent.change(editor, { target: { value: largeInput } });
		});
		expect(screen.getByText(/Input exceeds 100KB/i)).toBeInTheDocument();
	});
});
