import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { JsonDiffTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function typeLeft(value: string) {
	const editors = screen.getAllByTestId("monaco-editor");
	act(() => {
		fireEvent.change(editors[0], { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

function typeBoth(left: string, right: string) {
	const editors = screen.getAllByTestId("monaco-editor");
	act(() => {
		fireEvent.change(editors[0], { target: { value: left } });
		fireEvent.change(editors[1], { target: { value: right } });
		vi.advanceTimersByTime(350);
	});
}

describe("JsonDiffTool", () => {
	it("renders with title", () => {
		renderWithProviders(<JsonDiffTool />);
		expect(screen.getByText("JSON Diff")).toBeInTheDocument();
	});

	it("renders two input editors (left/right)", () => {
		renderWithProviders(<JsonDiffTool />);
		expect(screen.getByText("Left (Original)")).toBeInTheDocument();
		expect(screen.getByText("Right (Modified)")).toBeInTheDocument();
		const editors = screen.getAllByTestId("monaco-editor");
		expect(editors.length).toBeGreaterThanOrEqual(2);
	});

	it('identical JSON shows "no differences"', () => {
		renderWithProviders(<JsonDiffTool />);
		const json = '{"name":"test","value":1}';
		typeBoth(json, json);
		expect(screen.getByText(/No differences found/i)).toBeInTheDocument();
	});

	it("different values show change count", () => {
		renderWithProviders(<JsonDiffTool />);
		typeBoth('{"name":"alice"}', '{"name":"bob"}');
		expect(screen.getByText(/Changed 1/)).toBeInTheDocument();
	});

	it("added key shows as added", () => {
		renderWithProviders(<JsonDiffTool />);
		typeBoth('{"a":1}', '{"a":1,"b":2}');
		expect(screen.getByText(/Added 1/)).toBeInTheDocument();
	});

	it("removed key shows as removed", () => {
		renderWithProviders(<JsonDiffTool />);
		typeBoth('{"a":1,"b":2}', '{"a":1}');
		expect(screen.getByText(/Removed 1/)).toBeInTheDocument();
	});

	it("swap button swaps inputs", () => {
		renderWithProviders(<JsonDiffTool />);
		const editors = screen.getAllByTestId("monaco-editor");
		act(() => {
			fireEvent.change(editors[0], { target: { value: '{"side":"left"}' } });
			fireEvent.change(editors[1], { target: { value: '{"side":"right"}' } });
			vi.advanceTimersByTime(350);
		});

		fireEvent.click(screen.getByText("Swap"));

		expect(editors[0]).toHaveValue('{"side":"right"}');
		expect(editors[1]).toHaveValue('{"side":"left"}');
	});

	it("invalid left JSON shows error", () => {
		renderWithProviders(<JsonDiffTool />);
		typeBoth("{invalid", '{"valid":true}');
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText(/Left panel/)).toBeInTheDocument();
	});

	it("invalid right JSON shows error", () => {
		renderWithProviders(<JsonDiffTool />);
		typeBoth('{"valid":true}', "{invalid");
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText(/Right panel/)).toBeInTheDocument();
	});

	it("empty inputs show no error", () => {
		renderWithProviders(<JsonDiffTool />);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.queryByText(/No differences/)).not.toBeInTheDocument();
	});

	it("nested object diffs detected", () => {
		renderWithProviders(<JsonDiffTool />);
		typeBoth(
			'{"user":{"name":"alice","age":30}}',
			'{"user":{"name":"alice","age":31}}',
		);
		expect(screen.getByText(/Changed 1/)).toBeInTheDocument();
	});

	it("array element differences detected", () => {
		renderWithProviders(<JsonDiffTool />);
		typeBoth('{"items":[1,2,3]}', '{"items":[1,2,4]}');
		// Should detect the change in the array
		const changedText = screen.queryByText(/Changed/);
		expect(changedText).toBeInTheDocument();
	});

	it("stats bar shows added/removed/changed counts for mixed diff", () => {
		renderWithProviders(<JsonDiffTool />);
		typeBoth('{"a":1,"b":2,"c":3}', '{"a":1,"b":99,"d":4}');
		// b changed: 2→99, c removed, d added
		expect(screen.getByText(/Added 1/)).toBeInTheDocument();
		expect(screen.getByText(/Removed 1/)).toBeInTheDocument();
		expect(screen.getByText(/Changed 1/)).toBeInTheDocument();
		expect(screen.getByText(/Unchanged/)).toBeInTheDocument();
	});

	it("one empty panel shows no diff output", () => {
		renderWithProviders(<JsonDiffTool />);
		typeLeft('{"a":1}');
		// Only left filled, right empty — should not show diff or error
		expect(screen.queryByText(/No differences/)).not.toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("type change (number to string) detected as changed", () => {
		renderWithProviders(<JsonDiffTool />);
		typeBoth('{"val":42}', '{"val":"42"}');
		expect(screen.getByText(/Changed 1/)).toBeInTheDocument();
	});

	// --- New Feature Tests ---

	describe("Tree view", () => {
		it("switches to tree view when toggle is clicked", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1}', '{"a":1,"b":2}');
			fireEvent.click(screen.getByText("Tree view"));
			expect(screen.getByTestId("tree-view")).toBeInTheDocument();
		});

		it("shows added nodes with + prefix in tree view", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1}', '{"a":1,"b":2}');
			fireEvent.click(screen.getByText("Tree view"));
			const treeView = screen.getByTestId("tree-view");
			const addedNode = within(treeView).getByText("b");
			expect(addedNode).toBeInTheDocument();
			const addedRow = addedNode.closest('[data-node-type="added"]');
			expect(addedRow).toBeInTheDocument();
		});

		it("shows removed nodes in tree view", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1,"b":2}', '{"a":1}');
			fireEvent.click(screen.getByText("Tree view"));
			const treeView = screen.getByTestId("tree-view");
			const removedNode = within(treeView).getByText("b");
			expect(removedNode).toBeInTheDocument();
			const removedRow = removedNode.closest('[data-node-type="removed"]');
			expect(removedRow).toBeInTheDocument();
		});

		it("shows changed nodes with old → new in tree view", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"x":1}', '{"x":2}');
			fireEvent.click(screen.getByText("Tree view"));
			const treeView = screen.getByTestId("tree-view");
			expect(within(treeView).getByText("→")).toBeInTheDocument();
		});

		it("can toggle back to flat list from tree view", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1}', '{"a":1,"b":2}');
			fireEvent.click(screen.getByText("Tree view"));
			expect(screen.getByTestId("tree-view")).toBeInTheDocument();
			fireEvent.click(screen.getByText("Flat list"));
			expect(screen.queryByTestId("tree-view")).not.toBeInTheDocument();
		});

		it("nested changes show container nodes in tree", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth(
				'{"user":{"name":"a","age":1}}',
				'{"user":{"name":"b","age":1}}',
			);
			fireEvent.click(screen.getByText("Tree view"));
			const treeView = screen.getByTestId("tree-view");
			expect(within(treeView).getByText("user")).toBeInTheDocument();
			expect(within(treeView).getByText("name")).toBeInTheDocument();
		});
	});

	describe("Show/Hide unchanged", () => {
		it("hides unchanged by default", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1,"b":2}', '{"a":1,"b":99}');
			// In flat view, unchanged entries are not shown by default
			expect(screen.queryByText("unchanged")).not.toBeInTheDocument();
		});

		it("shows unchanged entries when toggled on in flat view", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1,"b":2}', '{"a":1,"b":99}');
			fireEvent.click(screen.getByText("Show unchanged"));
			expect(screen.getByText("unchanged")).toBeInTheDocument();
		});

		it("shows unchanged nodes in tree view when toggled", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1,"b":2}', '{"a":1,"b":99}');
			fireEvent.click(screen.getByText("Tree view"));
			fireEvent.click(screen.getByText("Show unchanged"));
			const treeView = screen.getByTestId("tree-view");
			const unchangedNodes = within(treeView).getAllByTestId("tree-node");
			const hasUnchanged = unchangedNodes.some(
				(n) => n.getAttribute("data-node-type") === "unchanged",
			);
			expect(hasUnchanged).toBe(true);
		});

		it("toggle button text changes between Show/Hide", () => {
			renderWithProviders(<JsonDiffTool />);
			expect(screen.getByText("Show unchanged")).toBeInTheDocument();
			fireEvent.click(screen.getByText("Show unchanged"));
			expect(screen.getByText("Hide unchanged")).toBeInTheDocument();
		});
	});

	describe("Match percentage", () => {
		it("shows match percentage in stats bar", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1,"b":2}', '{"a":1,"b":99}');
			expect(screen.getByTestId("match-percentage")).toBeInTheDocument();
			expect(screen.getByText(/% match/)).toBeInTheDocument();
		});

		it("shows 100% for identical JSON", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1,"b":2}', '{"a":1,"b":2}');
			// Identical JSONs show "no differences" and 100% match in stats
			expect(screen.getByText(/100% match/)).toBeInTheDocument();
		});

		it("shows 0% when all keys differ", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1}', '{"b":2}');
			expect(screen.getByText(/0% match/)).toBeInTheDocument();
		});
	});

	describe("Copy as JSON Patch", () => {
		it("shows JSON Patch copy button when there are diffs", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1}', '{"a":1,"b":2}');
			expect(screen.getByText("JSON Patch")).toBeInTheDocument();
		});

		it("does not show JSON Patch button when no diffs", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1}', '{"a":1}');
			expect(screen.queryByText("JSON Patch")).not.toBeInTheDocument();
		});
	});

	describe("Copy as text summary", () => {
		it("shows Text Summary copy button when there are diffs", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1}', '{"a":1,"b":2}');
			expect(screen.getByText("Text Summary")).toBeInTheDocument();
		});

		it("does not show Text Summary button when no diffs", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"a":1}', '{"a":1}');
			expect(screen.queryByText("Text Summary")).not.toBeInTheDocument();
		});
	});

	describe("Array identity key matching", () => {
		it("shows array key picker when arrays of objects are in the data", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth(
				'{"users":[{"id":1,"name":"a"}]}',
				'{"users":[{"id":1,"name":"b"}]}',
			);
			expect(screen.getByTestId("array-key-picker")).toBeInTheDocument();
			expect(screen.getByLabelText(/Identity key for/)).toBeInTheDocument();
		});

		it("does not show array key picker for primitive arrays", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth('{"items":[1,2,3]}', '{"items":[1,2,4]}');
			expect(screen.queryByTestId("array-key-picker")).not.toBeInTheDocument();
		});

		it("allows selecting an identity key from the picker", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth(
				'{"users":[{"id":1,"name":"a"},{"id":2,"name":"b"}]}',
				'{"users":[{"id":2,"name":"b"},{"id":1,"name":"c"}]}',
			);
			const select = screen.getByLabelText(/Identity key for users/);
			expect(select).toBeInTheDocument();
			act(() => {
				fireEvent.change(select, { target: { value: "id" } });
				vi.advanceTimersByTime(350);
			});
			// After setting identity key, the diff should re-compute
			expect(screen.getByText(/Changed/)).toBeInTheDocument();
		});
	});

	describe("TreeNodeRow interactions", () => {
		it("can collapse and expand tree nodes", () => {
			renderWithProviders(<JsonDiffTool />);
			typeBoth(
				'{"user":{"name":"a","age":1}}',
				'{"user":{"name":"b","age":1}}',
			);
			fireEvent.click(screen.getByText("Tree view"));

			// user container should be expanded and have a collapse button
			const collapseBtn = screen.getByLabelText("Collapse");
			expect(collapseBtn).toBeInTheDocument();
			fireEvent.click(collapseBtn);

			// After collapse, child "name" should not be visible
			expect(screen.queryByText("name")).not.toBeInTheDocument();

			// Expand again
			const expandBtn = screen.getByLabelText("Expand");
			fireEvent.click(expandBtn);
			expect(screen.getByText("name")).toBeInTheDocument();
		});
	});
});
