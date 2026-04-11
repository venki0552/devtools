import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { UrlTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function typeInput(value: string) {
	const input = screen.getAllByTestId("monaco-editor")[0];
	act(() => {
		fireEvent.change(input, { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

describe("UrlTool", () => {
	it("renders Encode, Decode, Query Parser, and URL Builder tabs", () => {
		renderWithProviders(<UrlTool />);
		expect(screen.getByRole("button", { name: /encode/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /decode/i })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /query parser/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /url builder/i }),
		).toBeInTheDocument();
	});

	it('encoding "hello world" produces "hello%20world"', () => {
		renderWithProviders(<UrlTool />);
		typeInput("hello world");
		const output = screen.getAllByTestId("monaco-editor")[1];
		expect(output).toHaveValue("hello%20world");
	});

	it('decoding "hello%20world" produces "hello world"', () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /decode/i }));
		typeInput("hello%20world");
		const output = screen.getAllByTestId("monaco-editor")[1];
		expect(output).toHaveValue("hello world");
	});

	it("encoding special char & produces %26", () => {
		renderWithProviders(<UrlTool />);
		typeInput("a&b");
		const output = screen.getAllByTestId("monaco-editor")[1];
		expect((output as HTMLTextAreaElement).value).toContain("%26");
	});

	it("encoding special char = produces %3D", () => {
		renderWithProviders(<UrlTool />);
		typeInput("a=b");
		const output = screen.getAllByTestId("monaco-editor")[1];
		expect((output as HTMLTextAreaElement).value).toContain("%3D");
	});

	it("encoding special char ? produces %3F", () => {
		renderWithProviders(<UrlTool />);
		typeInput("a?b");
		const output = screen.getAllByTestId("monaco-editor")[1];
		expect((output as HTMLTextAreaElement).value).toContain("%3F");
	});

	it("encoding special char # produces %23", () => {
		renderWithProviders(<UrlTool />);
		typeInput("a#b");
		const output = screen.getAllByTestId("monaco-editor")[1];
		expect((output as HTMLTextAreaElement).value).toContain("%23");
	});

	it("Query Parser: parsing URL shows components and params", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /query parser/i }));
		typeInput("https://example.com/path?foo=bar&baz=qux");
		expect(screen.getByText("https:")).toBeInTheDocument();
		expect(screen.getByText("example.com")).toBeInTheDocument();
		expect(screen.getByText("/path")).toBeInTheDocument();
		expect(screen.getByText("foo")).toBeInTheDocument();
		expect(screen.getByText("bar")).toBeInTheDocument();
		expect(screen.getByText("baz")).toBeInTheDocument();
		expect(screen.getByText("qux")).toBeInTheDocument();
	});

	it("double-encoded detection shows warning for %25", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /decode/i }));
		typeInput("hello%2520world");
		expect(screen.getByText(/contains %25/i)).toBeInTheDocument();
	});

	it("empty input produces no errors", () => {
		renderWithProviders(<UrlTool />);
		typeInput("");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("Clear button resets input and output", () => {
		renderWithProviders(<UrlTool />);
		typeInput("hello world");
		expect(screen.getAllByTestId("monaco-editor")[1]).toHaveValue(
			"hello%20world",
		);

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		expect(screen.getAllByTestId("monaco-editor")[0]).toHaveValue("");
		expect(screen.getAllByTestId("monaco-editor")[1]).toHaveValue("");
	});

	it("invalid URL in parse mode shows error", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /query parser/i }));
		typeInput("not-a-valid-url");
		expect(screen.getByText(/invalid url/i)).toBeInTheDocument();
	});

	it("renders the tool title", () => {
		renderWithProviders(<UrlTool />);
		expect(screen.getByText("URL Encode / Decode")).toBeInTheDocument();
	});

	it("decoding invalid percent encoding shows error", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /decode/i }));
		typeInput("%ZZinvalid");
		expect(screen.getByText(/decoding failed|malformed/i)).toBeInTheDocument();
	});

	/* ── Encode scope options (Gap #3) ────────────────────── */

	it("shows encode scope options in encode mode", () => {
		renderWithProviders(<UrlTool />);
		expect(screen.getByText("Component")).toBeInTheDocument();
		expect(screen.getByText("Full URL")).toBeInTheDocument();
		expect(screen.getByText("Form (+)")).toBeInTheDocument();
	});

	it("Full URL scope uses encodeURI (preserves : / ? # etc.)", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByText("Full URL"));
		typeInput("https://example.com/path?q=hello world");
		const output = screen.getAllByTestId("monaco-editor")[1];
		const val = (output as HTMLTextAreaElement).value;
		// encodeURI preserves :, /, ?, but encodes space
		expect(val).toContain("https://example.com/path?q=hello%20world");
	});

	it("Form encoding converts spaces to +", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByText("Form (+)"));
		typeInput("hello world");
		const output = screen.getAllByTestId("monaco-editor")[1];
		expect(output).toHaveValue("hello+world");
	});

	it("Non-ASCII only filter encodes non-ASCII but leaves ASCII", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByText("Non-ASCII only"));
		typeInput("hello café");
		const output = screen.getAllByTestId("monaco-editor")[1];
		const val = (output as HTMLTextAreaElement).value;
		expect(val).toContain("hello");
		expect(val).toContain("%"); // café has non-ASCII chars
		expect(val).not.toContain("hello%20"); // space not encoded
	});

	it("Special chars filter encodes URL-special characters", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByText("Special chars"));
		typeInput("key=val&other");
		const output = screen.getAllByTestId("monaco-editor")[1];
		const val = (output as HTMLTextAreaElement).value;
		expect(val).toContain("%3D"); // =
		expect(val).toContain("%26"); // &
	});

	it("shows encode filter options", () => {
		renderWithProviders(<UrlTool />);
		expect(screen.getByText("Everything")).toBeInTheDocument();
		expect(screen.getByText("Non-ASCII only")).toBeInTheDocument();
		expect(screen.getByText("Special chars")).toBeInTheDocument();
	});

	/* ── Decode options (Gap #4) ──────────────────────────── */

	it("shows decode options in decode mode", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /decode/i }));
		expect(screen.getByText(/decode \+ as space/i)).toBeInTheDocument();
		expect(screen.getByText(/decode twice/i)).toBeInTheDocument();
	});

	it("decode + as space converts + to spaces", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /decode/i }));
		fireEvent.click(screen.getByText(/decode \+ as space/i));
		typeInput("hello+world");
		const output = screen.getAllByTestId("monaco-editor")[1];
		expect(output).toHaveValue("hello world");
	});

	it("decode twice handles double-encoded input", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /decode/i }));
		fireEvent.click(screen.getByText(/decode twice/i));
		typeInput("hello%2520world");
		const output = screen.getAllByTestId("monaco-editor")[1];
		expect(output).toHaveValue("hello world");
	});

	/* ── Auto-detect on paste (Gap #2) ────────────────────── */

	it("suggests decode mode when input has percent-encoded chars", () => {
		renderWithProviders(<UrlTool />);
		typeInput("hello%20world");
		expect(screen.getByText(/switch to decode mode/i)).toBeInTheDocument();
	});

	it("suggests query parser when input starts with http", () => {
		renderWithProviders(<UrlTool />);
		typeInput("https://example.com/test");
		expect(screen.getByText(/switch to query parser/i)).toBeInTheDocument();
	});

	it("clicking paste hint switches mode", () => {
		renderWithProviders(<UrlTool />);
		typeInput("hello%20world");
		fireEvent.click(screen.getByText(/switch to decode mode/i));
		expect(screen.getByRole("button", { name: /decode/i })).toHaveClass(
			"bg-accent",
		);
	});

	/* ── Query Parser editable table (Gap #5) ─────────────── */

	it("query table shows edit hint", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /query parser/i }));
		typeInput("https://example.com?foo=bar");
		expect(screen.getByText(/click a cell to edit/i)).toBeInTheDocument();
	});

	it("clicking a query value cell opens an edit input", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /query parser/i }));
		typeInput("https://example.com?foo=bar");
		fireEvent.click(screen.getByText("bar"));
		expect(screen.getByDisplayValue("bar")).toBeInTheDocument();
	});

	/* ── URL Builder mode (Gap #1) ────────────────────────── */

	it("URL Builder tab renders form fields", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /url builder/i }));
		expect(screen.getByPlaceholderText(/example\.com/i)).toBeInTheDocument();
		expect(screen.getByPlaceholderText("443")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("/api/users")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("section1")).toBeInTheDocument();
	});

	it("URL Builder shows live preview as fields are filled", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /url builder/i }));
		const hostInput = screen.getByPlaceholderText(/example\.com/i);
		act(() => {
			fireEvent.change(hostInput, { target: { value: "test.com" } });
			vi.advanceTimersByTime(350);
		});
		expect(screen.getByText(/https:\/\/test\.com/)).toBeInTheDocument();
	});

	it("URL Builder validates port range", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /url builder/i }));
		const hostInput = screen.getByPlaceholderText(/example\.com/i);
		const portInput = screen.getByPlaceholderText("443");
		act(() => {
			fireEvent.change(hostInput, { target: { value: "test.com" } });
			fireEvent.change(portInput, { target: { value: "99999" } });
			vi.advanceTimersByTime(350);
		});
		expect(screen.getByText(/port must be/i)).toBeInTheDocument();
	});

	it("URL Builder adds and removes query params", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /url builder/i }));
		// Default has one row
		const addBtn = screen.getByText("Add");
		fireEvent.click(addBtn);
		// Should now have 2 'key' placeholders
		expect(screen.getAllByPlaceholderText("key").length).toBe(2);
		// Remove one
		const removeButtons = screen.getAllByLabelText("Remove parameter");
		fireEvent.click(removeButtons[0]);
		expect(screen.getAllByPlaceholderText("key").length).toBe(1);
	});

	it("URL Builder assembles path and query correctly", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /url builder/i }));
		const hostInput = screen.getByPlaceholderText(/example\.com/i);
		const pathInput = screen.getByPlaceholderText("/api/users");
		const keyInput = screen.getByPlaceholderText("key");
		const valInput = screen.getByPlaceholderText("value");
		act(() => {
			fireEvent.change(hostInput, { target: { value: "api.test.com" } });
			fireEvent.change(pathInput, { target: { value: "/v1/users" } });
			fireEvent.change(keyInput, { target: { value: "page" } });
			fireEvent.change(valInput, { target: { value: "1" } });
			vi.advanceTimersByTime(350);
		});
		expect(
			screen.getByText("https://api.test.com/v1/users?page=1"),
		).toBeInTheDocument();
	});

	it("URL Builder supports custom protocol", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /url builder/i }));
		const select = screen.getByDisplayValue("https");
		act(() => {
			fireEvent.change(select, { target: { value: "custom" } });
		});
		expect(screen.getByPlaceholderText("e.g. ws")).toBeInTheDocument();
	});

	it("URL Builder encodes path segments", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /url builder/i }));
		const hostInput = screen.getByPlaceholderText(/example\.com/i);
		const pathInput = screen.getByPlaceholderText("/api/users");
		act(() => {
			fireEvent.change(hostInput, { target: { value: "test.com" } });
			fireEvent.change(pathInput, { target: { value: "/hello world/test" } });
			vi.advanceTimersByTime(350);
		});
		expect(screen.getByText(/hello%20world/)).toBeInTheDocument();
	});

	it("URL Builder includes fragment in preview", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /url builder/i }));
		const hostInput = screen.getByPlaceholderText(/example\.com/i);
		const fragInput = screen.getByPlaceholderText("section1");
		act(() => {
			fireEvent.change(hostInput, { target: { value: "test.com" } });
			fireEvent.change(fragInput, { target: { value: "top" } });
			vi.advanceTimersByTime(350);
		});
		expect(screen.getByText(/https:\/\/test\.com#top/)).toBeInTheDocument();
	});

	/* ── >2000 char warning (Gap #8) ──────────────────────── */

	it("warns when encoded output exceeds 2000 chars", () => {
		renderWithProviders(<UrlTool />);
		// Create a long input that encodes to >2000 chars
		const longInput = "a".repeat(2001);
		typeInput(longInput);
		expect(screen.getByText(/exceeds.*2,000.*characters/i)).toBeInTheDocument();
	});

	/* ── IPv6 handling (Gap #7) ───────────────────────────── */

	it("Query Parser shows IPv6 badge for bracketed address", () => {
		renderWithProviders(<UrlTool />);
		fireEvent.click(screen.getByRole("button", { name: /query parser/i }));
		typeInput("http://[::1]:8080/test");
		expect(screen.getByText("IPv6")).toBeInTheDocument();
	});
});
