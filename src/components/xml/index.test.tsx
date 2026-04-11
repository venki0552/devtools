import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { XmlTool } from "./index";

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

describe("XmlTool", () => {
	it("renders with title", () => {
		renderWithProviders(<XmlTool />);
		expect(screen.getByText("XML Formatter")).toBeInTheDocument();
	});

	it("formatting compact XML produces indented output", () => {
		renderWithProviders(<XmlTool />);
		typeInput("<root><child>text</child></root>");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain("<root>");
		expect(output).toContain("<child>text</child>");
		expect(output).toContain("</root>");
		// Should have newlines for indentation
		expect(output.split("\n").length).toBeGreaterThan(1);
	});

	it("Minify button removes whitespace from XML", () => {
		renderWithProviders(<XmlTool />);
		const input = getInputEditor();
		const indentedXml = "<root>\n  <child>text</child>\n</root>";
		act(() => {
			fireEvent.change(input, { target: { value: indentedXml } });
		});
		fireEvent.click(screen.getByRole("button", { name: "Minify" }));
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).not.toContain("\n");
		expect(output).toContain("<root><child>text</child></root>");
	});

	it("invalid XML shows parse error", () => {
		renderWithProviders(<XmlTool />);
		typeInput("<root><unclosed>");
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("empty input produces no error", () => {
		renderWithProviders(<XmlTool />);
		typeInput("");
		expect((getOutputEditor() as HTMLTextAreaElement).value).toBe("");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("handles self-closing tags", () => {
		renderWithProviders(<XmlTool />);
		typeInput("<root><empty/></root>");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain("<empty />");
		expect(output).toContain("<root>");
	});

	it("handles CDATA sections", () => {
		renderWithProviders(<XmlTool />);
		typeInput("<root><![CDATA[some <special> data]]></root>");
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain("CDATA");
		expect(output).toContain("some <special> data");
	});

	it("Clear button resets input and output", () => {
		renderWithProviders(<XmlTool />);
		typeInput("<root><child>text</child></root>");
		expect(
			(getOutputEditor() as HTMLTextAreaElement).value.length,
		).toBeGreaterThan(0);

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		expect((getInputEditor() as HTMLTextAreaElement).value).toBe("");
		expect((getOutputEditor() as HTMLTextAreaElement).value).toBe("");
	});

	it("Format button reformats input immediately", () => {
		renderWithProviders(<XmlTool />);
		const input = getInputEditor();
		act(() => {
			fireEvent.change(input, {
				target: { value: "<root><a>1</a><b>2</b></root>" },
			});
		});
		fireEvent.click(screen.getByRole("button", { name: "Format" }));
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain("<root>");
		expect(output.split("\n").length).toBeGreaterThan(1);
	});

	it("handles XML with attributes", () => {
		renderWithProviders(<XmlTool />);
		typeInput(
			'<root id="1" class="main"><child name="test">value</child></root>',
		);
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain('id="1"');
		expect(output).toContain('class="main"');
		expect(output).toContain('name="test"');
	});

	it("indent size selector is available", () => {
		renderWithProviders(<XmlTool />);
		const select = screen.getByLabelText("Indent size");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("2 spaces")).toBeInTheDocument();
		expect(screen.getByText("4 spaces")).toBeInTheDocument();
		expect(screen.getByText("Tab")).toBeInTheDocument();
	});

	it("Copy button is present", () => {
		renderWithProviders(<XmlTool />);
		expect(screen.getByText("Copy")).toBeInTheDocument();
	});

	it("handles nested XML structure", () => {
		renderWithProviders(<XmlTool />);
		typeInput(
			"<root><level1><level2><level3>deep</level3></level2></level1></root>",
		);
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain("<level1>");
		expect(output).toContain("<level2>");
		expect(output).toContain("<level3>deep</level3>");
		// Deeply nested should produce multiple indent levels
		expect(output.split("\n").length).toBeGreaterThan(3);
	});

	it("handles XML declaration", () => {
		renderWithProviders(<XmlTool />);
		typeInput(
			'<?xml version="1.0" encoding="UTF-8"?><root><child>data</child></root>',
		);
		const output = (getOutputEditor() as HTMLTextAreaElement).value;
		expect(output).toContain("<root>");
		expect(output).toContain("<child>data</child>");
	});
});
