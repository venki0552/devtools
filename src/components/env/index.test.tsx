import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { EnvTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function createProjectAndSelect() {
	fireEvent.click(screen.getByText("New Project"));
	// The new project should auto-select
}

describe("EnvTool", () => {
	it("renders with title", () => {
		renderWithProviders(<EnvTool />);
		expect(screen.getByText("Env Var Manager")).toBeInTheDocument();
	});

	it("security banner is present", () => {
		renderWithProviders(<EnvTool />);
		expect(
			screen.getByText(/All data stored in browser localStorage/i),
		).toBeInTheDocument();
	});

	it("shows empty state when no project is selected", () => {
		renderWithProviders(<EnvTool />);
		expect(screen.getByText(/Select or create a project/i)).toBeInTheDocument();
	});

	it("create new project button works", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		// Should now show the add variable button instead of the empty state
		expect(
			screen.getByRole("button", { name: /Add variable/i }),
		).toBeInTheDocument();
	});

	it("add variable creates a new row", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
		// Should see key and value input placeholders
		expect(screen.getByPlaceholderText("KEY_NAME")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("value")).toBeInTheDocument();
	});

	it("enter key and value for a variable", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));

		const keyInput = screen.getByPlaceholderText("KEY_NAME");
		const valueInput = screen.getByPlaceholderText("value");

		fireEvent.change(keyInput, { target: { value: "DATABASE_URL" } });
		fireEvent.change(valueInput, {
			target: { value: "postgres://localhost:5432/db" },
		});

		expect(keyInput).toHaveValue("DATABASE_URL");
		expect(valueInput).toHaveValue("postgres://localhost:5432/db");
	});

	it("mask/unmask toggle (eye icon) works", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));

		const valueInput = screen.getByPlaceholderText("value");
		expect(valueInput).toHaveAttribute("type", "password");

		// Click "Show value" button
		fireEvent.click(screen.getByLabelText("Show value"));

		expect(valueInput).toHaveAttribute("type", "text");

		// Click "Hide value" button to toggle back
		fireEvent.click(screen.getByLabelText("Hide value"));

		expect(valueInput).toHaveAttribute("type", "password");
	});

	it("delete variable removes it from the list", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));

		const keyInput = screen.getByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInput, { target: { value: "TO_DELETE" } });

		fireEvent.click(screen.getByLabelText("Delete variable"));

		expect(screen.queryByDisplayValue("TO_DELETE")).not.toBeInTheDocument();
	});

	it("import .env format parsing", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		// Click the Import button
		fireEvent.click(screen.getByText("Import"));

		// The import textarea should appear
		const importArea = screen.getByPlaceholderText(/Comments are ignored/i);
		fireEvent.change(importArea, {
			target: { value: "# Comment\nDB_HOST=localhost\nDB_PORT=5432" },
		});

		// Click Preview to see import preview
		fireEvent.click(screen.getByText("Preview"));

		// Should show preview with parsed variables
		expect(screen.getByText(/Import Preview/)).toBeInTheDocument();
		expect(screen.getByText("DB_HOST")).toBeInTheDocument();
		expect(screen.getByText("DB_PORT")).toBeInTheDocument();

		// Click Confirm Import
		fireEvent.click(screen.getByText("Confirm Import"));

		// Variables should be added
		expect(screen.getByDisplayValue("DB_HOST")).toBeInTheDocument();
		expect(screen.getByDisplayValue("localhost")).toBeInTheDocument();
		expect(screen.getByDisplayValue("DB_PORT")).toBeInTheDocument();
		expect(screen.getByDisplayValue("5432")).toBeInTheDocument();
	});

	it("export .env format button present when project selected", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		expect(screen.getByText(".env")).toBeInTheDocument();
	});

	it("export JSON format button present when project selected", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		expect(screen.getByText("JSON")).toBeInTheDocument();
	});

	it("duplicate key warning shown", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		// Add two variables with the same key
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
		const keyInputs = screen.getAllByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInputs[0], { target: { value: "DUPE_KEY" } });

		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
		const keyInputs2 = screen.getAllByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInputs2[keyInputs2.length - 1], {
			target: { value: "DUPE_KEY" },
		});

		expect(screen.getByText(/Duplicate keys detected/i)).toBeInTheDocument();
		expect(screen.getByText(/DUPE_KEY/)).toBeInTheDocument();
	});

	it("empty state message when project has no variables", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		expect(screen.getByText(/No variables yet/i)).toBeInTheDocument();
	});

	it("handles values with = signs via import", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByText("Import"));

		const importArea = screen.getByPlaceholderText(/Comments are ignored/i);
		fireEvent.change(importArea, {
			target: { value: "CONNECTION=host=localhost;port=5432" },
		});
		fireEvent.click(screen.getByText("Preview"));
		fireEvent.click(screen.getByText("Confirm Import"));

		expect(screen.getByDisplayValue("CONNECTION")).toBeInTheDocument();
		expect(
			screen.getByDisplayValue("host=localhost;port=5432"),
		).toBeInTheDocument();
	});

	it("handles quoted values via import", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByText("Import"));

		const importArea = screen.getByPlaceholderText(/Comments are ignored/i);
		fireEvent.change(importArea, {
			target: { value: 'SECRET="my secret value"' },
		});
		fireEvent.click(screen.getByText("Preview"));
		fireEvent.click(screen.getByText("Confirm Import"));

		expect(screen.getByDisplayValue("SECRET")).toBeInTheDocument();
		expect(screen.getByDisplayValue("my secret value")).toBeInTheDocument();
	});

	it("delete project removes it from sidebar", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		const deleteBtn = screen.getByLabelText(/Delete Project/i);
		fireEvent.click(deleteBtn);
		expect(screen.getByText(/Select or create a project/i)).toBeInTheDocument();
	});

	// ─── Feature: UPPER_SNAKE_CASE warning ────────────────

	it("shows UPPER_SNAKE_CASE warning for non-conforming keys", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));

		const keyInput = screen.getByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInput, { target: { value: "myKey" } });

		expect(screen.getByText("Not UPPER_SNAKE_CASE")).toBeInTheDocument();
	});

	it("does not show UPPER_SNAKE_CASE warning for valid keys", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));

		const keyInput = screen.getByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInput, { target: { value: "MY_KEY_123" } });

		expect(screen.queryByText("Not UPPER_SNAKE_CASE")).not.toBeInTheDocument();
	});

	// ─── Feature: Duplicate row action ────────────────────

	it("duplicate button copies variable with _COPY suffix", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));

		const keyInput = screen.getByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInput, { target: { value: "API_KEY" } });

		const valueInput = screen.getByPlaceholderText("value");
		fireEvent.change(valueInput, { target: { value: "secret123" } });

		fireEvent.click(screen.getByLabelText("Duplicate variable"));

		expect(screen.getByDisplayValue("API_KEY")).toBeInTheDocument();
		expect(screen.getByDisplayValue("API_KEY_COPY")).toBeInTheDocument();
		// Both should have the same value
		const valueInputs = screen.getAllByPlaceholderText("value");
		expect(valueInputs).toHaveLength(2);
	});

	// ─── Feature: Drag to reorder ─────────────────────────

	it("rows have drag handles", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));

		// Check that the row is draggable
		const rows = document.querySelectorAll("tr[draggable]");
		expect(rows.length).toBeGreaterThan(0);
	});

	// ─── Feature: Reveal all toggle ───────────────────────

	it("reveal all button exists and requires confirmation", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		const revealAllBtn = screen.getByText("Reveal all");
		expect(revealAllBtn).toBeInTheDocument();

		// Mock window.confirm to reject
		vi.spyOn(window, "confirm").mockReturnValueOnce(false);
		fireEvent.click(revealAllBtn);

		// Button text should not change since user cancelled
		expect(screen.getByText("Reveal all")).toBeInTheDocument();
	});

	it("reveal all shows all values when confirmed", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));

		const valueInput = screen.getByPlaceholderText("value");
		fireEvent.change(valueInput, { target: { value: "mysecret" } });
		expect(valueInput).toHaveAttribute("type", "password");

		vi.spyOn(window, "confirm").mockReturnValueOnce(true);
		fireEvent.click(screen.getByText("Reveal all"));

		expect(screen.getByText("Hide all")).toBeInTheDocument();
		expect(screen.getByDisplayValue("mysecret")).toHaveAttribute(
			"type",
			"text",
		);
	});

	// ─── Feature: Import preview ──────────────────────────

	it("import shows preview table before confirming", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByText("Import"));

		const importArea = screen.getByPlaceholderText(/Comments are ignored/i);
		fireEvent.change(importArea, {
			target: { value: "FOO=bar\nBAZ=qux" },
		});

		fireEvent.click(screen.getByText("Preview"));

		expect(screen.getByText(/Import Preview/)).toBeInTheDocument();
		expect(screen.getByText(/2 variables found/)).toBeInTheDocument();
		expect(screen.getByText("FOO")).toBeInTheDocument();
		expect(screen.getByText("BAZ")).toBeInTheDocument();
	});

	it("import preview back button returns to input phase", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByText("Import"));

		const importArea = screen.getByPlaceholderText(/Comments are ignored/i);
		fireEvent.change(importArea, { target: { value: "X=1" } });

		fireEvent.click(screen.getByText("Preview"));
		expect(screen.getByText(/Import Preview/)).toBeInTheDocument();

		fireEvent.click(screen.getByText("Back"));
		expect(
			screen.getByPlaceholderText(/Comments are ignored/i),
		).toBeInTheDocument();
	});

	// ─── Feature: Import conflict resolution ──────────────

	it("import detects conflicts with existing keys", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		// Add an existing variable
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
		const keyInput = screen.getByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInput, { target: { value: "DB_HOST" } });

		// Import with conflicting key
		fireEvent.click(screen.getByText("Import"));
		const importArea = screen.getByPlaceholderText(/Comments are ignored/i);
		fireEvent.change(importArea, { target: { value: "DB_HOST=newvalue" } });

		fireEvent.click(screen.getByText("Preview"));

		// Should show conflict resolution dropdown
		const select = screen.getByDisplayValue("Overwrite");
		expect(select).toBeInTheDocument();
	});

	// ─── Feature: Export formats ──────────────────────────

	it("export dropdown shows additional export formats", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		fireEvent.click(screen.getByText("Export ▾"));

		expect(screen.getByText("Shell exports")).toBeInTheDocument();
		expect(screen.getByText("Docker run flags")).toBeInTheDocument();
		expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
		expect(screen.getByText("Kubernetes Secret")).toBeInTheDocument();
	});

	// ─── Feature: Group filter chips ──────────────────────

	it("shows group filter chips when groups exist", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
		const groupInputs = screen.getAllByPlaceholderText("group");
		fireEvent.change(groupInputs[0], { target: { value: "Database" } });

		expect(screen.getByText("Groups:")).toBeInTheDocument();
		// Filter chip is a button with rounded-full class
		const chips = screen.getAllByText("Database");
		expect(chips.length).toBeGreaterThanOrEqual(1);
	});

	it("clicking group chip filters variables", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		// Add two variables in different groups
		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
		let keyInputs = screen.getAllByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInputs[0], { target: { value: "DB_HOST" } });
		let groupInputs = screen.getAllByPlaceholderText("group");
		fireEvent.change(groupInputs[0], { target: { value: "Database" } });

		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
		keyInputs = screen.getAllByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInputs[keyInputs.length - 1], {
			target: { value: "API_URL" },
		});
		groupInputs = screen.getAllByPlaceholderText("group");
		fireEvent.change(groupInputs[groupInputs.length - 1], {
			target: { value: "API" },
		});

		// Click the "Database" filter chip (first match is the chip)
		const dbChips = screen.getAllByText("Database");
		fireEvent.click(dbChips[0]);

		// Only DB_HOST visible, API_URL hidden
		expect(screen.getByDisplayValue("DB_HOST")).toBeInTheDocument();
		expect(screen.queryByDisplayValue("API_URL")).not.toBeInTheDocument();
	});

	// ─── Feature: Collapsible group sections ──────────────

	it("groups show collapsible section headers", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
		const keyInputs = screen.getAllByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInputs[0], { target: { value: "DB_HOST" } });
		const groupInputs = screen.getAllByPlaceholderText("group");
		fireEvent.change(groupInputs[0], { target: { value: "Database" } });

		// Group header should show with count
		expect(screen.getByText("(1)")).toBeInTheDocument();
	});

	// ─── Feature: Compare two projects ────────────────────

	it("compare button opens compare panel", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		fireEvent.click(screen.getByText("Compare"));
		expect(screen.getByText("Compare Projects")).toBeInTheDocument();
		expect(screen.getByText("Select left project")).toBeInTheDocument();
		expect(screen.getByText("Select right project")).toBeInTheDocument();
	});

	// ─── Feature: Search values option ────────────────────

	it("search values checkbox toggles value searching", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		const checkbox = screen.getByLabelText("Search values");
		expect(checkbox).not.toBeChecked();

		fireEvent.click(checkbox);
		expect(checkbox).toBeChecked();
	});

	it("search values finds vars by value when enabled", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();

		fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
		const keyInput = screen.getByPlaceholderText("KEY_NAME");
		fireEvent.change(keyInput, { target: { value: "SECRET" } });
		const valueInput = screen.getByPlaceholderText("value");
		fireEvent.change(valueInput, { target: { value: "findme123" } });

		// Enable search values
		fireEvent.click(screen.getByLabelText("Search values"));

		// Reveal the value first so we can see it
		fireEvent.click(screen.getByLabelText("Show value"));

		// Search for the value
		const searchInput = screen.getByPlaceholderText("Filter keys...");
		fireEvent.change(searchInput, { target: { value: "findme" } });

		expect(screen.getByDisplayValue("SECRET")).toBeInTheDocument();
	});

	// ─── Feature: Multi-line value support ────────────────

	it("handles multi-line values in .env import", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByText("Import"));

		const importArea = screen.getByPlaceholderText(/Comments are ignored/i);
		fireEvent.change(importArea, {
			target: { value: 'CERT="line1\nline2\nline3"' },
		});

		fireEvent.click(screen.getByText("Preview"));
		fireEvent.click(screen.getByText("Confirm Import"));

		// The variable should be added (key should be visible)
		expect(screen.getByDisplayValue("CERT")).toBeInTheDocument();
	});

	// ─── Feature: >200 vars warning ──────────────────────

	it("shows large import warning when importing >200 vars", () => {
		renderWithProviders(<EnvTool />);
		createProjectAndSelect();
		fireEvent.click(screen.getByText("Import"));

		// Generate 201 variables
		const lines = Array.from(
			{ length: 201 },
			(_, i) => `VAR_${i}=value_${i}`,
		).join("\n");

		const importArea = screen.getByPlaceholderText(/Comments are ignored/i);
		fireEvent.change(importArea, { target: { value: lines } });

		fireEvent.click(screen.getByText("Preview"));

		expect(
			screen.getByText(/may affect localStorage size limits/),
		).toBeInTheDocument();
	});
});
