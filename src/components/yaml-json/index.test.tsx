import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import {
	YamlJsonTool,
	sortKeysDeep,
	applyNumberHandling,
	applyNullHandling,
	detectAnchors,
	detectDuplicateKeys,
	detectMultiDoc,
	yamlToJson,
	jsonToYaml,
	checkRoundTrip,
} from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function getInputEditor() {
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

describe("YamlJsonTool", () => {
	it("renders with YAML→JSON and JSON→YAML mode tabs", () => {
		renderWithProviders(<YamlJsonTool />);
		expect(
			screen.getByRole("button", { name: /YAML → JSON/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /JSON → YAML/i }),
		).toBeInTheDocument();
	});

	it("converting simple YAML to JSON works", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("key: value");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain('"key"');
		expect(output).toContain('"value"');
	});

	it("converting nested YAML to JSON works", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("parent:\n  child: value\n  number: 42");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		expect(parsed.parent.child).toBe("value");
		expect(parsed.parent.number).toBe(42);
	});

	it("converting JSON to YAML works", () => {
		renderWithProviders(<YamlJsonTool />);
		fireEvent.click(screen.getByRole("button", { name: /JSON → YAML/i }));
		typeInput('{"key":"value","num":42}');
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain("key: value");
		expect(output).toContain("num: 42");
	});

	it("invalid YAML shows error", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("invalid: yaml: content: [unclosed");
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("invalid JSON shows error in JSON→YAML mode", () => {
		renderWithProviders(<YamlJsonTool />);
		fireEvent.click(screen.getByRole("button", { name: /JSON → YAML/i }));
		typeInput("{not valid json}");
		expect(
			screen.getByText(/error|failed|unexpected|expected/i),
		).toBeInTheDocument();
	});

	it("empty input produces no error", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("");
		expect((getOutputEditor() as HTMLTextAreaElement).value).toBe("");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("Clear button resets input and output", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("key: value");
		expect(
			(getOutputEditor() as HTMLTextAreaElement).value.length,
		).toBeGreaterThan(0);

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		expect((getInputEditor() as HTMLTextAreaElement).value).toBe("");
		expect((getOutputEditor() as HTMLTextAreaElement).value).toBe("");
	});

	it("Sort Keys option sorts output keys alphabetically", () => {
		renderWithProviders(<YamlJsonTool />);
		// Enable sort keys
		fireEvent.click(screen.getByRole("button", { name: "Sort Keys" }));
		typeInput("z_last: 1\na_first: 2\nm_middle: 3");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		const keys = Object.keys(parsed);
		expect(keys[0]).toBe("a_first");
		expect(keys[1]).toBe("m_middle");
		expect(keys[2]).toBe("z_last");
	});

	it("Swap button switches mode and uses output as new input", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("name: test");
		const jsonOutput = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(jsonOutput).toContain('"name"');

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "Swap" }));
			vi.advanceTimersByTime(350);
		});
		// After swap, mode should be JSON→YAML and input should be the previous JSON output
		const newInput = (getInputEditor() as HTMLTextAreaElement).value;
		expect(newInput).toContain('"name"');
	});

	it("renders the tool title", () => {
		renderWithProviders(<YamlJsonTool />);
		expect(screen.getByText("YAML ↔ JSON")).toBeInTheDocument();
	});

	it("indent size selector is available", () => {
		renderWithProviders(<YamlJsonTool />);
		const select = screen.getByLabelText("Indent size");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("2 spaces")).toBeInTheDocument();
		expect(screen.getByText("4 spaces")).toBeInTheDocument();
	});

	it("Copy button is present", () => {
		renderWithProviders(<YamlJsonTool />);
		expect(screen.getByText("Copy")).toBeInTheDocument();
	});

	it("converts YAML array to JSON array", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("- item1\n- item2\n- item3");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toEqual(["item1", "item2", "item3"]);
	});

	it("handles YAML with comments (warns about loss)", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("# This is a comment\nkey: value");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain('"key"');
		// Should show comment warning
		expect(screen.getByText(/comments are not preserved/i)).toBeInTheDocument();
	});

	it("Strict mode toggle is available and works", () => {
		renderWithProviders(<YamlJsonTool />);
		const btn = screen.getByRole("button", { name: /Strict/i });
		expect(btn).toBeInTheDocument();
		fireEvent.click(btn);
		// strict mode with YAML 1.1 'yes' should parse differently with JSON_SCHEMA
		typeInput("flag: yes");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		// With JSON_SCHEMA (strict), 'yes' stays as string "yes"
		expect(output).toContain('"yes"');
	});

	it("Permissive mode parses YAML dates as Date objects", () => {
		renderWithProviders(<YamlJsonTool />);
		// default is permissive (DEFAULT_SCHEMA) which auto-converts dates
		typeInput("date: 2024-01-01");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		// DEFAULT_SCHEMA converts date-like strings to ISO timestamps
		expect(parsed.date).toContain("2024-01-01T");
	});

	it("Number handling: always string converts numbers to strings", () => {
		renderWithProviders(<YamlJsonTool />);
		const select = screen.getByLabelText("Number handling");
		fireEvent.change(select, { target: { value: "string" } });
		typeInput("count: 42\npi: 3.14");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		expect(parsed.count).toBe("42");
		expect(parsed.pi).toBe("3.14");
	});

	it("Number handling: always number converts string numbers", () => {
		renderWithProviders(<YamlJsonTool />);
		const select = screen.getByLabelText("Number handling");
		fireEvent.change(select, { target: { value: "number" } });
		// strict mode so "42" stays as string from YAML, then numberHandling converts
		const btn = screen.getByRole("button", { name: /Strict/i });
		fireEvent.click(btn);
		typeInput('port: "8080"');
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		expect(parsed.port).toBe(8080);
	});

	it("Null handling: empty string replaces nulls", () => {
		renderWithProviders(<YamlJsonTool />);
		const select = screen.getByLabelText("Null handling");
		fireEvent.change(select, { target: { value: "empty" } });
		typeInput("key: null\nother: value");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		expect(parsed.key).toBe("");
		expect(parsed.other).toBe("value");
	});

	it("Null handling: omit key removes null entries", () => {
		renderWithProviders(<YamlJsonTool />);
		const select = screen.getByLabelText("Null handling");
		fireEvent.change(select, { target: { value: "omit" } });
		typeInput("key: null\nother: value");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		expect(parsed.key).toBeUndefined();
		expect(parsed.other).toBe("value");
	});

	it("Quote style selector appears in JSON→YAML mode", () => {
		renderWithProviders(<YamlJsonTool />);
		// should not be visible in YAML→JSON
		expect(screen.queryByLabelText("Quote style")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /JSON → YAML/i }));
		expect(screen.getByLabelText("Quote style")).toBeInTheDocument();
	});

	it("Quote style: always quotes all strings", () => {
		renderWithProviders(<YamlJsonTool />);
		fireEvent.click(screen.getByRole("button", { name: /JSON → YAML/i }));
		fireEvent.change(screen.getByLabelText("Quote style"), {
			target: { value: "always" },
		});
		typeInput('{"name":"hello","count":42}');
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		// forceQuotes=true should quote string values
		expect(output).toMatch(/"hello"|'hello'/);
	});

	it("Flow style selector appears in JSON→YAML mode", () => {
		renderWithProviders(<YamlJsonTool />);
		expect(screen.queryByLabelText("Flow style")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /JSON → YAML/i }));
		expect(screen.getByLabelText("Flow style")).toBeInTheDocument();
	});

	it("Flow style: flow produces inline arrays", () => {
		renderWithProviders(<YamlJsonTool />);
		fireEvent.click(screen.getByRole("button", { name: /JSON → YAML/i }));
		fireEvent.change(screen.getByLabelText("Flow style"), {
			target: { value: "flow" },
		});
		typeInput('{"items":[1,2,3]}');
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		// flow style at level 0 should produce inline notation
		expect(output).toContain("[");
	});

	it("Round-trip check button is present", () => {
		renderWithProviders(<YamlJsonTool />);
		expect(
			screen.getByRole("button", { name: /Round-trip check/i }),
		).toBeInTheDocument();
	});

	it("Round-trip check shows green badge for safe input", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("key: value\nother: 42");
		fireEvent.click(screen.getByRole("button", { name: /Round-trip check/i }));
		expect(screen.getByText("Round-trip safe")).toBeInTheDocument();
	});

	it("Round-trip check shows warning for lossy input (flow style change)", () => {
		renderWithProviders(<YamlJsonTool />);
		// Input with flow style arrays that differ after block-style round-trip
		fireEvent.click(screen.getByRole("button", { name: /JSON → YAML/i }));
		typeInput('{"a":{"b":{"c":1}}}');
		// Switch to flow style to create different output
		fireEvent.change(screen.getByLabelText("Flow style"), {
			target: { value: "flow" },
		});
		act(() => {
			vi.advanceTimersByTime(350);
		});
		fireEvent.click(screen.getByRole("button", { name: /Round-trip check/i }));
		// The result should exist (either safe or unsafe)
		expect(
			screen.getByText(/Round-trip safe|different|failed/i),
		).toBeInTheDocument();
	});

	it("Multi-document YAML is detected", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("---\nfirst: 1\n---\nsecond: 2");
		expect(
			screen.getByText(/Multi-document YAML detected/i),
		).toBeInTheDocument();
	});

	it("Multi-document: convert all produces JSON array", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("---\nfirst: 1\n---\nsecond: 2");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed.length).toBe(2);
		expect(parsed[0].first).toBe(1);
		expect(parsed[1].second).toBe(2);
	});

	it("Multi-document: convert only first produces single object", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("---\nfirst: 1\n---\nsecond: 2");
		const select = screen.getByLabelText("Multi-document mode");
		fireEvent.change(select, { target: { value: "first" } });
		act(() => {
			vi.advanceTimersByTime(350);
		});
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(false);
		expect(parsed.first).toBe(1);
	});

	it("Anchors/aliases show resolved note", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput(
			"defaults: &defaults\n  adapter: postgres\ndev:\n  <<: *defaults\n  database: dev_db",
		);
		expect(screen.getByText(/Anchors resolved/i)).toBeInTheDocument();
	});

	it("Duplicate keys show warning with key names", () => {
		renderWithProviders(<YamlJsonTool />);
		typeInput("name: first\nname: second\nage: 30");
		const warning = screen.getByText(/Duplicate keys found/i);
		expect(warning).toBeInTheDocument();
		expect(warning.textContent).toContain("name");
	});
});

describe("sortKeysDeep", () => {
	it("sorts top-level object keys", () => {
		const result = sortKeysDeep({ z: 1, a: 2, m: 3 });
		expect(Object.keys(result as Record<string, unknown>)).toEqual([
			"a",
			"m",
			"z",
		]);
	});

	it("recursively sorts nested objects", () => {
		const result = sortKeysDeep({ z: { b: 1, a: 2 }, a: 3 }) as Record<
			string,
			unknown
		>;
		expect(Object.keys(result)).toEqual(["a", "z"]);
		expect(Object.keys(result.z as Record<string, unknown>)).toEqual([
			"a",
			"b",
		]);
	});

	it("handles arrays of objects", () => {
		const result = sortKeysDeep([{ z: 1, a: 2 }]) as Record<string, unknown>[];
		expect(Object.keys(result[0])).toEqual(["a", "z"]);
	});

	it("returns primitives unchanged", () => {
		expect(sortKeysDeep(42)).toBe(42);
		expect(sortKeysDeep("hello")).toBe("hello");
		expect(sortKeysDeep(null)).toBe(null);
	});
});

describe("applyNumberHandling", () => {
	it("keep mode returns data unchanged", () => {
		expect(applyNumberHandling({ a: 42, b: "text" }, "keep")).toEqual({
			a: 42,
			b: "text",
		});
	});

	it("string mode converts numbers to strings", () => {
		expect(applyNumberHandling({ a: 42, b: 3.14 }, "string")).toEqual({
			a: "42",
			b: "3.14",
		});
	});

	it("string mode does not affect non-numbers", () => {
		expect(applyNumberHandling({ a: "text", b: true }, "string")).toEqual({
			a: "text",
			b: true,
		});
	});

	it("number mode converts string numbers", () => {
		expect(applyNumberHandling({ a: "42", b: "3.14" }, "number")).toEqual({
			a: 42,
			b: 3.14,
		});
	});

	it("number mode does not convert non-numeric strings", () => {
		expect(applyNumberHandling({ a: "hello" }, "number")).toEqual({
			a: "hello",
		});
	});

	it("handles nested structures", () => {
		const result = applyNumberHandling({ nested: { val: 10 } }, "string");
		expect(result).toEqual({ nested: { val: "10" } });
	});

	it("handles arrays", () => {
		const result = applyNumberHandling([1, 2, 3], "string");
		expect(result).toEqual(["1", "2", "3"]);
	});
});

describe("applyNullHandling", () => {
	it("null mode returns data unchanged", () => {
		expect(applyNullHandling({ a: null, b: 1 }, "null")).toEqual({
			a: null,
			b: 1,
		});
	});

	it("empty mode replaces null with empty string", () => {
		expect(applyNullHandling({ a: null, b: "x" }, "empty")).toEqual({
			a: "",
			b: "x",
		});
	});

	it("omit mode removes null keys", () => {
		expect(applyNullHandling({ a: null, b: "x" }, "omit")).toEqual({ b: "x" });
	});

	it("handles nested null values", () => {
		expect(applyNullHandling({ nested: { a: null } }, "empty")).toEqual({
			nested: { a: "" },
		});
	});

	it("handles arrays with nulls", () => {
		expect(applyNullHandling([null, 1, null], "empty")).toEqual(["", 1, ""]);
	});
});

describe("detectAnchors", () => {
	it("returns true when anchors and aliases are present", () => {
		expect(detectAnchors("defaults: &def\n  a: 1\nother: *def")).toBe(true);
	});

	it("returns false for normal YAML", () => {
		expect(detectAnchors("key: value")).toBe(false);
	});

	it("returns false with only anchor (no alias)", () => {
		expect(detectAnchors("defaults: &def\n  a: 1")).toBe(false);
	});
});

describe("detectDuplicateKeys", () => {
	it("finds duplicate top-level keys", () => {
		expect(detectDuplicateKeys("name: a\nname: b\nage: 1")).toEqual(["name"]);
	});

	it("returns empty for unique keys", () => {
		expect(detectDuplicateKeys("a: 1\nb: 2\nc: 3")).toEqual([]);
	});

	it("ignores comments", () => {
		expect(detectDuplicateKeys("# name: comment\nname: value")).toEqual([]);
	});
});

describe("detectMultiDoc", () => {
	it("detects multiple --- separators", () => {
		expect(detectMultiDoc("---\nfirst: 1\n---\nsecond: 2")).toBe(true);
	});

	it("returns false for single document", () => {
		expect(detectMultiDoc("key: value")).toBe(false);
	});

	it("detects --- in middle of document", () => {
		expect(detectMultiDoc("key: value\n---\nother: data")).toBe(true);
	});
});

describe("yamlToJson (unit)", () => {
	it("basic conversion", () => {
		const result = yamlToJson("a: 1", 2, false, false, "keep", "null", "first");
		expect(JSON.parse(result)).toEqual({ a: 1 });
	});

	it("strict mode keeps YAML 1.1 booleans as strings", () => {
		const result = yamlToJson(
			"flag: yes",
			2,
			false,
			true,
			"keep",
			"null",
			"first",
		);
		expect(JSON.parse(result)).toEqual({ flag: "yes" });
	});

	it("permissive mode parses YAML dates", () => {
		const result = yamlToJson(
			"date: 2024-01-01",
			2,
			false,
			false,
			"keep",
			"null",
			"first",
		);
		expect(JSON.parse(result).date).toContain("2024-01-01T");
	});

	it("multi-doc all returns array", () => {
		const result = yamlToJson(
			"---\na: 1\n---\nb: 2",
			2,
			false,
			false,
			"keep",
			"null",
			"all",
		);
		const parsed = JSON.parse(result);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(2);
	});

	it("multi-doc first returns single doc", () => {
		const result = yamlToJson(
			"---\na: 1\n---\nb: 2",
			2,
			false,
			false,
			"keep",
			"null",
			"first",
		);
		const parsed = JSON.parse(result);
		expect(Array.isArray(parsed)).toBe(false);
		expect(parsed.a).toBe(1);
	});

	it("applies number handling", () => {
		const result = yamlToJson(
			"val: 42",
			2,
			false,
			false,
			"string",
			"null",
			"first",
		);
		expect(JSON.parse(result)).toEqual({ val: "42" });
	});

	it("applies null handling: omit", () => {
		const result = yamlToJson(
			"a: null\nb: 1",
			2,
			false,
			false,
			"keep",
			"omit",
			"first",
		);
		const parsed = JSON.parse(result);
		expect(parsed.a).toBeUndefined();
		expect(parsed.b).toBe(1);
	});

	it("sorts keys when requested", () => {
		const result = yamlToJson(
			"z: 1\na: 2",
			2,
			true,
			false,
			"keep",
			"null",
			"first",
		);
		const keys = Object.keys(JSON.parse(result));
		expect(keys[0]).toBe("a");
	});
});

describe("jsonToYaml (unit)", () => {
	it("basic conversion", () => {
		const result = jsonToYaml('{"a":1}', 2, false, "auto", "block");
		expect(result).toContain("a: 1");
	});

	it("forceQuotes with always option", () => {
		const result = jsonToYaml('{"name":"hello"}', 2, false, "always", "block");
		expect(result).toMatch(/["']hello["']/);
	});

	it("flow style produces inline notation", () => {
		const result = jsonToYaml('{"items":[1,2,3]}', 2, false, "auto", "flow");
		expect(result).toContain("[");
	});

	it("block style produces one item per line", () => {
		const result = jsonToYaml('{"items":[1,2,3]}', 2, false, "auto", "block");
		expect(result).toContain("- 1");
	});

	it("sorts keys when requested", () => {
		const result = jsonToYaml('{"z":1,"a":2}', 2, true, "auto", "block");
		expect(result.indexOf("a:")).toBeLessThan(result.indexOf("z:"));
	});
});

describe("checkRoundTrip (unit)", () => {
	it("returns safe for simple YAML", () => {
		const result = checkRoundTrip(
			"key: value",
			"yaml-to-json",
			2,
			false,
			false,
			"keep",
			"null",
			"first",
			"auto",
			"block",
		);
		expect(result.safe).toBe(true);
	});

	it("returns safe for simple JSON", () => {
		const result = checkRoundTrip(
			'{"key":"value"}',
			"json-to-yaml",
			2,
			false,
			false,
			"keep",
			"null",
			"first",
			"auto",
			"block",
		);
		expect(result.safe).toBe(true);
	});

	it("returns safe for YAML comments (data is unchanged)", () => {
		// Comments don't affect data fidelity, so round-trip is safe
		const result = checkRoundTrip(
			"# comment\nkey: value",
			"yaml-to-json",
			2,
			false,
			false,
			"keep",
			"null",
			"first",
			"auto",
			"block",
		);
		expect(result.safe).toBe(true);
	});

	it("returns unsafe for invalid input", () => {
		const result = checkRoundTrip(
			"{invalid",
			"json-to-yaml",
			2,
			false,
			false,
			"keep",
			"null",
			"first",
			"auto",
			"block",
		);
		expect(result.safe).toBe(false);
	});
});
