import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { DiffTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function getEditors() {
	const editors = screen.getAllByTestId("monaco-editor");
	return { original: editors[0], modified: editors[1] };
}

function typeOriginal(value: string) {
	const { original } = getEditors();
	act(() => {
		fireEvent.change(original, { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

function typeBoth(original: string, modified: string) {
	const editors = getEditors();
	act(() => {
		fireEvent.change(editors.original, { target: { value: original } });
		fireEvent.change(editors.modified, { target: { value: modified } });
		vi.advanceTimersByTime(350);
	});
}

describe("DiffTool", () => {
	it("renders with title", () => {
		renderWithProviders(<DiffTool />);
		expect(screen.getByText("Text Diff")).toBeInTheDocument();
	});

	it("renders two input editors (Original and Modified)", () => {
		renderWithProviders(<DiffTool />);
		expect(screen.getByText("Original")).toBeInTheDocument();
		expect(screen.getByText("Modified")).toBeInTheDocument();
		const editors = screen.getAllByTestId("monaco-editor");
		expect(editors).toHaveLength(2);
	});

	it("mode selector with Lines, Words, Characters, Sentences buttons present", () => {
		renderWithProviders(<DiffTool />);
		expect(screen.getByText("Lines")).toBeInTheDocument();
		expect(screen.getByText("Words")).toBeInTheDocument();
		expect(screen.getByText("Characters")).toBeInTheDocument();
		expect(screen.getByText("Sentences")).toBeInTheDocument();
	});

	it("identical text shows no changes", () => {
		renderWithProviders(<DiffTool />);
		typeBoth("hello world", "hello world");
		expect(screen.getByText(/No differences found/i)).toBeInTheDocument();
	});

	it("different lines shown in output", () => {
		renderWithProviders(<DiffTool />);
		typeBoth("line one\nline two", "line one\nline three");
		expect(screen.getByText(/\+\d+ added/)).toBeInTheDocument();
		expect(screen.getByText(/-\d+ removed/)).toBeInTheDocument();
	});

	it("added lines shown in diff output", () => {
		renderWithProviders(<DiffTool />);
		typeBoth("line one", "line one\nline two");
		expect(screen.getByText(/\+\d+ added/)).toBeInTheDocument();
	});

	it("removed lines shown in diff output", () => {
		renderWithProviders(<DiffTool />);
		typeBoth("line one\nline two", "line one");
		expect(screen.getByText(/-\d+ removed/)).toBeInTheDocument();
	});

	it("ignore case option present", () => {
		renderWithProviders(<DiffTool />);
		expect(screen.getByLabelText(/Ignore case/i)).toBeInTheDocument();
	});

	it("ignore whitespace option present", () => {
		renderWithProviders(<DiffTool />);
		expect(screen.getByLabelText(/Ignore whitespace/i)).toBeInTheDocument();
	});

	it("empty inputs show no error and no diff output", () => {
		renderWithProviders(<DiffTool />);
		expect(screen.queryByText(/No differences/)).not.toBeInTheDocument();
		expect(screen.queryByText(/\+\d+ added/)).not.toBeInTheDocument();
	});

	it("swap button swaps inputs", () => {
		renderWithProviders(<DiffTool />);
		const editors = getEditors();

		act(() => {
			fireEvent.change(editors.original, { target: { value: "alpha" } });
			fireEvent.change(editors.modified, { target: { value: "beta" } });
			vi.advanceTimersByTime(350);
		});

		fireEvent.click(screen.getByText("Swap"));

		expect(editors.original).toHaveValue("beta");
		expect(editors.modified).toHaveValue("alpha");
	});

	it("ignore case toggle makes diff case-insensitive", () => {
		renderWithProviders(<DiffTool />);
		typeBoth("Hello", "hello");
		fireEvent.click(screen.getByLabelText(/Ignore case/i));
		act(() => {
			vi.advanceTimersByTime(350);
		});
		expect(screen.getByText(/No differences found/i)).toBeInTheDocument();
	});

	it("words mode button can be selected", () => {
		renderWithProviders(<DiffTool />);
		const wordsBtn = screen.getByText("Words");
		fireEvent.click(wordsBtn);
		typeBoth("hello world", "hello planet");
		expect(screen.getByText(/\+\d+ added/)).toBeInTheDocument();
	});

	it("characters mode button can be selected", () => {
		renderWithProviders(<DiffTool />);
		const charsBtn = screen.getByText("Characters");
		fireEvent.click(charsBtn);
		typeBoth("abc", "axc");
		expect(screen.getByText(/\+\d+ added/)).toBeInTheDocument();
	});

	it("stats bar shows added, removed, unchanged counts", () => {
		renderWithProviders(<DiffTool />);
		typeBoth("aaa\nbbb\nccc", "aaa\nxxx\nccc");
		expect(screen.getByText(/\+\d+ added/)).toBeInTheDocument();
		expect(screen.getByText(/-\d+ removed/)).toBeInTheDocument();
		expect(screen.getByText(/\d+ unchanged/)).toBeInTheDocument();
	});

	// --- New feature tests ---

	describe("Sentences diff mode", () => {
		it("sentences mode button can be selected and produces diff", () => {
			renderWithProviders(<DiffTool />);
			fireEvent.click(screen.getByText("Sentences"));
			typeBoth("Hello world. Goodbye world.", "Hello world. Farewell world.");
			expect(screen.getByText(/\+\d+ added/)).toBeInTheDocument();
		});
	});

	describe("Character stats", () => {
		it("shows characters added and removed in stats bar", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("hello", "world");
			expect(screen.getByText(/Characters added: \d+/)).toBeInTheDocument();
			expect(screen.getByText(/Characters removed: \d+/)).toBeInTheDocument();
		});

		it("shows zero character changes for identical text", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("same text", "same text");
			expect(screen.getByText(/Characters added: 0/)).toBeInTheDocument();
			expect(screen.getByText(/Characters removed: 0/)).toBeInTheDocument();
		});
	});

	describe("Similarity percentage", () => {
		it("shows similarity percentage in stats bar", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("hello world", "hello earth");
			expect(screen.getByText(/Overall similarity: \d+%/)).toBeInTheDocument();
		});

		it("shows 100% similarity for identical text", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("identical", "identical");
			expect(screen.getByText(/Overall similarity: 100%/)).toBeInTheDocument();
		});

		it("shows 0% similarity when one side is empty", () => {
			renderWithProviders(<DiffTool />);
			typeOriginal("something");
			expect(screen.getByText(/Overall similarity: 0%/)).toBeInTheDocument();
		});
	});

	describe("View mode toggle", () => {
		it("renders Unified and Side-by-side view buttons", () => {
			renderWithProviders(<DiffTool />);
			expect(screen.getByText("Unified")).toBeInTheDocument();
			expect(screen.getByText("Side-by-side")).toBeInTheDocument();
		});

		it("defaults to unified view", () => {
			renderWithProviders(<DiffTool />);
			const unifiedBtn = screen.getByText("Unified");
			expect(unifiedBtn.closest("button")).toHaveClass("bg-accent");
		});

		it("can switch to side-by-side view", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("aaa\nbbb", "aaa\nccc");
			fireEvent.click(screen.getByText("Side-by-side"));
			const sideBySideBtn = screen.getByText("Side-by-side");
			expect(sideBySideBtn.closest("button")).toHaveClass("bg-accent");
		});
	});

	describe("Context lines", () => {
		it("renders context lines dropdown", () => {
			renderWithProviders(<DiffTool />);
			expect(screen.getByLabelText("Context lines")).toBeInTheDocument();
		});

		it('defaults to "All lines"', () => {
			renderWithProviders(<DiffTool />);
			const select = screen.getByLabelText(
				"Context lines",
			) as HTMLSelectElement;
			expect(select.value).toBe("all");
		});

		it("filtering with 0 context hides unchanged lines", () => {
			renderWithProviders(<DiffTool />);
			typeBoth(
				"line1\nline2\nline3\nline4\nchanged-a\nline6\nline7\nline8",
				"line1\nline2\nline3\nline4\nchanged-b\nline6\nline7\nline8",
			);
			const select = screen.getByLabelText("Context lines");
			fireEvent.change(select, { target: { value: "0" } });
			expect(screen.getAllByText(/hidden lines/).length).toBeGreaterThan(0);
		});

		it("filtering with 1 context shows adjacent lines", () => {
			renderWithProviders(<DiffTool />);
			typeBoth(
				"line1\nline2\nline3\nchanged-a\nline5\nline6",
				"line1\nline2\nline3\nchanged-b\nline5\nline6",
			);
			const select = screen.getByLabelText("Context lines");
			fireEvent.change(select, { target: { value: "1" } });
			// Should show line3, changed lines, line5 — but hide line1, line2, line6
			expect(screen.getAllByText(/hidden lines/).length).toBeGreaterThan(0);
		});
	});

	describe("Binary content detection", () => {
		it("shows binary warning for non-printable characters", () => {
			renderWithProviders(<DiffTool />);
			typeOriginal("hello\x00world");
			expect(
				screen.getByText(/Input appears to be binary/),
			).toBeInTheDocument();
		});

		it("does not show binary warning for normal text", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("normal text", "also normal");
			expect(
				screen.queryByText(/Input appears to be binary/),
			).not.toBeInTheDocument();
		});
	});

	describe("Download .patch button", () => {
		it("renders Download .patch button", () => {
			renderWithProviders(<DiffTool />);
			expect(screen.getByText("Download .patch")).toBeInTheDocument();
		});

		it("is disabled when no content", () => {
			renderWithProviders(<DiffTool />);
			const btn = screen.getByText("Download .patch").closest("button")!;
			expect(btn).toBeDisabled();
		});

		it("is enabled when content is present", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("some text", "other text");
			const btn = screen.getByText("Download .patch").closest("button")!;
			expect(btn).not.toBeDisabled();
		});
	});

	describe("Copy stats button", () => {
		it("renders Copy Stats button", () => {
			renderWithProviders(<DiffTool />);
			expect(screen.getByText("Copy Stats")).toBeInTheDocument();
		});
	});

	describe("Side-by-side diff view", () => {
		it("renders side-by-side diff output with changed lines", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("line one\nline two", "line one\nline three");
			fireEvent.click(screen.getByText("Side-by-side"));
			// Should render diff in two panels
			expect(screen.getByText(/\+\d+ added/)).toBeInTheDocument();
		});

		it("shows inner char-level diffs in side-by-side mode", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("hello world", "hello earth");
			fireEvent.click(screen.getByText("Side-by-side"));
			// The diff output should render with character-level highlighting
			expect(screen.getByText(/\+\d+ added/)).toBeInTheDocument();
		});

		it("handles pure additions in side-by-side mode", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("line one", "line one\nline two");
			fireEvent.click(screen.getByText("Side-by-side"));
			expect(screen.getByText(/\+\d+ added/)).toBeInTheDocument();
		});

		it("handles pure removals in side-by-side mode", () => {
			renderWithProviders(<DiffTool />);
			typeBoth("line one\nline two", "line one");
			fireEvent.click(screen.getByText("Side-by-side"));
			expect(screen.getByText(/-\d+ removed/)).toBeInTheDocument();
		});

		it("applies context line filtering in side-by-side mode", () => {
			renderWithProviders(<DiffTool />);
			typeBoth(
				"a\nb\nc\nd\ne\nchanged-x\ng\nh\ni",
				"a\nb\nc\nd\ne\nchanged-y\ng\nh\ni",
			);
			fireEvent.click(screen.getByText("Side-by-side"));
			const select = screen.getByLabelText("Context lines");
			fireEvent.change(select, { target: { value: "0" } });
			expect(screen.getAllByText(/hidden/).length).toBeGreaterThan(0);
		});
	});

	describe("Download .patch triggering", () => {
		it("calls download when clicked with content", () => {
			// Mock URL.createObjectURL and revokeObjectURL
			const createObjectURL = vi.fn(() => "blob:test");
			const revokeObjectURL = vi.fn();
			globalThis.URL.createObjectURL = createObjectURL;
			globalThis.URL.revokeObjectURL = revokeObjectURL;

			renderWithProviders(<DiffTool />);
			typeBoth("hello", "world");
			const btn = screen.getByText("Download .patch").closest("button")!;
			fireEvent.click(btn);

			expect(createObjectURL).toHaveBeenCalled();
			expect(revokeObjectURL).toHaveBeenCalled();
		});
	});
});
