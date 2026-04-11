import "@/test/mock-monaco";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders } from "@/test/utils";
import { GraphqlTool } from "./index";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function typeInput(value: string) {
	const editor = screen.getAllByTestId("monaco-editor")[0];
	act(() => {
		fireEvent.change(editor, { target: { value } });
		vi.advanceTimersByTime(350);
	});
}

describe("GraphqlTool", () => {
	it("renders with title", () => {
		renderWithProviders(<GraphqlTool />);
		expect(screen.getByText("GraphQL Formatter")).toBeInTheDocument();
	});

	it("renders input and output editors", () => {
		renderWithProviders(<GraphqlTool />);
		expect(screen.getByText("Input")).toBeInTheDocument();
		expect(screen.getByText("Formatted Output")).toBeInTheDocument();
		const editors = screen.getAllByTestId("monaco-editor");
		expect(editors).toHaveLength(2);
	});

	it("formatting messy GraphQL produces clean output", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("{ user { name   email } }");
		const output = screen.getAllByTestId(
			"monaco-editor",
		)[1] as HTMLTextAreaElement;
		expect(output.value).toContain("user");
		expect(output.value).toContain("name");
		expect(output.value).toContain("email");
	});

	it("detects query operations", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("query GetUser { user { name } }");
		expect(screen.getByText("query")).toBeInTheDocument();
		expect(screen.getByText("GetUser")).toBeInTheDocument();
	});

	it("detects mutation operations", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput(
			"mutation CreateUser($name: String!) { createUser(name: $name) { id } }",
		);
		expect(screen.getByText("mutation")).toBeInTheDocument();
		expect(screen.getByText("CreateUser")).toBeInTheDocument();
	});

	it("detects subscription operations", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("subscription OnMessage { messageAdded { text sender } }");
		expect(screen.getByText("subscription")).toBeInTheDocument();
		expect(screen.getByText("OnMessage")).toBeInTheDocument();
	});

	it("detects fragment definitions", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("fragment UserFields on User { name email }");
		expect(screen.getByText("fragment")).toBeInTheDocument();
		expect(screen.getByText("UserFields")).toBeInTheDocument();
	});

	it("invalid GraphQL shows error with location", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("query { user { name");
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("empty input shows no error and no output", () => {
		renderWithProviders(<GraphqlTool />);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		const output = screen.getAllByTestId(
			"monaco-editor",
		)[1] as HTMLTextAreaElement;
		expect(output.value).toBe("");
	});

	it("shows operation inspector with operation count", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("query A { user { name } } query B { post { title } }");
		expect(screen.getByText(/Operation Inspector/)).toBeInTheDocument();
		expect(screen.getByText(/2 operations/)).toBeInTheDocument();
	});

	it("copy button present", () => {
		renderWithProviders(<GraphqlTool />);
		expect(screen.getByText("Copy")).toBeInTheDocument();
	});

	it("clear button clears input and output", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("query { user { name } }");
		const output = screen.getAllByTestId(
			"monaco-editor",
		)[1] as HTMLTextAreaElement;
		expect(output.value).not.toBe("");

		fireEvent.click(screen.getByText("Clear"));

		const input = screen.getAllByTestId(
			"monaco-editor",
		)[0] as HTMLTextAreaElement;
		expect(input.value).toBe("");
		expect(output.value).toBe("");
	});

	it("shows variables for operations with variables", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput(
			"query GetUser($id: ID!, $limit: Int) { user(id: $id) { name } }",
		);
		expect(screen.getByText("$id")).toBeInTheDocument();
		expect(screen.getByText("$limit")).toBeInTheDocument();
	});

	it("shows fields for operations", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("query { user { name email age } }");
		expect(screen.getAllByText(/user/).length).toBeGreaterThanOrEqual(1);
	});

	it("anonymous operations show (anonymous)", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("{ user { name } }");
		expect(screen.getByText("(anonymous)")).toBeInTheDocument();
	});

	it("shows directives in operation inspector", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput(
			"query GetUser($includeEmail: Boolean!) { user { name email @include(if: $includeEmail) } }",
		);
		expect(screen.getByText(/Directives:/)).toBeInTheDocument();
		expect(screen.getByText("@include(if)")).toBeInTheDocument();
	});

	it("shows fragment spreads in operation inspector", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput(
			"fragment UserFields on User { name email } query GetUser { user { ...UserFields } }",
		);
		expect(screen.getByText(/Fragments:/)).toBeInTheDocument();
		const fragmentsLabel = screen.getByText(/Fragments:/);
		const fragmentsRow = fragmentsLabel.closest("div")!;
		expect(
			within(fragmentsRow).getByText(/\.\.\.UserFields/),
		).toBeInTheDocument();
	});

	it("minify button produces single-line output", () => {
		renderWithProviders(<GraphqlTool />);
		typeInput("query GetUser { user { name email } }");

		const minifyButton = screen.getByText("Minify");
		expect(minifyButton).toBeInTheDocument();

		fireEvent.click(minifyButton);

		const output = screen.getAllByTestId(
			"monaco-editor",
		)[1] as HTMLTextAreaElement;
		const lines = output.value.trim().split("\n");
		expect(lines).toHaveLength(1);
	});

	it("minify button is disabled when input is empty", () => {
		renderWithProviders(<GraphqlTool />);
		const minifyButton = screen.getByText("Minify").closest("button")!;
		expect(minifyButton).toBeDisabled();
	});
});

describe("GraphqlTool - Mode Tabs", () => {
	it("renders mode tabs", () => {
		renderWithProviders(<GraphqlTool />);
		expect(screen.getByText("Query Formatter")).toBeInTheDocument();
		expect(screen.getByText("Schema Explorer")).toBeInTheDocument();
		expect(screen.getByText("Variables Inspector")).toBeInTheDocument();
	});

	it("switches to Schema Explorer mode", () => {
		renderWithProviders(<GraphqlTool />);
		fireEvent.click(screen.getByText("Schema Explorer"));
		expect(screen.getByText("Schema (SDL)")).toBeInTheDocument();
		expect(screen.getByText("Type Detail")).toBeInTheDocument();
	});

	it("switches to Variables Inspector mode", () => {
		renderWithProviders(<GraphqlTool />);
		fireEvent.click(screen.getByText("Variables Inspector"));
		expect(screen.getByText("Query")).toBeInTheDocument();
		expect(screen.getByText("Variables (JSON)")).toBeInTheDocument();
		expect(screen.getByText("Validation Result")).toBeInTheDocument();
	});
});

describe("GraphqlTool - Schema Explorer", () => {
	function switchToSchema() {
		renderWithProviders(<GraphqlTool />);
		fireEvent.click(screen.getByText("Schema Explorer"));
	}

	function typeSchema(value: string) {
		const editor = screen.getAllByTestId("monaco-editor")[0];
		act(() => {
			fireEvent.change(editor, { target: { value } });
			vi.advanceTimersByTime(350);
		});
	}

	it("parses a basic SDL schema and shows types", () => {
		switchToSchema();
		typeSchema(
			"type Query { user(id: ID!): User } type User { name: String! email: String }",
		);
		expect(screen.getByText("Types")).toBeInTheDocument();
		expect(screen.getByText("User")).toBeInTheDocument();
	});

	it("shows enum types", () => {
		switchToSchema();
		typeSchema("type Query { status: Status } enum Status { ACTIVE INACTIVE }");
		expect(screen.getByText("Enums")).toBeInTheDocument();
		expect(screen.getByText("Status")).toBeInTheDocument();
	});

	it("shows query root fields", () => {
		switchToSchema();
		typeSchema("type Query { user: String posts: String }");
		expect(screen.getByText("user")).toBeInTheDocument();
		expect(screen.getByText("posts")).toBeInTheDocument();
	});

	it("shows type detail when clicked", () => {
		switchToSchema();
		typeSchema(
			"type Query { user: User } type User { name: String! email: String }",
		);
		fireEvent.click(screen.getByText("User"));
		expect(screen.getByText("OBJECT")).toBeInTheDocument();
		expect(screen.getByText("name")).toBeInTheDocument();
		expect(screen.getByText("email")).toBeInTheDocument();
	});

	it("shows error for invalid SDL", () => {
		switchToSchema();
		typeSchema("type { broken }");
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("search filters types and fields", () => {
		switchToSchema();
		typeSchema(
			"type Query { user: User } type User { name: String } type Post { title: String }",
		);
		const searchInput = screen.getByPlaceholderText("Search types & fields...");
		fireEvent.change(searchInput, { target: { value: "User" } });
		expect(screen.getByText("User")).toBeInTheDocument();
	});

	it("empty input shows no error", () => {
		switchToSchema();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("shows example snippet for types with fields", () => {
		switchToSchema();
		typeSchema(
			"type Query { user: User } type User { name: String! email: String }",
		);
		fireEvent.click(screen.getByText("User"));
		expect(screen.getByText("Example Snippet")).toBeInTheDocument();
	});
});

describe("GraphqlTool - Variables Inspector", () => {
	function switchToVariables() {
		renderWithProviders(<GraphqlTool />);
		fireEvent.click(screen.getByText("Variables Inspector"));
	}

	function typeQuery(value: string) {
		const editor = screen.getAllByTestId("monaco-editor")[0];
		act(() => {
			fireEvent.change(editor, { target: { value } });
			vi.advanceTimersByTime(350);
		});
	}

	function typeVariables(value: string) {
		const editor = screen.getAllByTestId("monaco-editor")[1];
		act(() => {
			fireEvent.change(editor, { target: { value } });
			vi.advanceTimersByTime(350);
		});
	}

	it("shows empty state when no query", () => {
		switchToVariables();
		expect(
			screen.getByText("Enter a query with variables to inspect"),
		).toBeInTheDocument();
	});

	it("shows no variables message for query without variables", () => {
		switchToVariables();
		typeQuery("query { user { name } }");
		expect(
			screen.getByText("No variables found in the query"),
		).toBeInTheDocument();
	});

	it("extracts variables from query", () => {
		switchToVariables();
		typeQuery(
			"query GetUser($id: ID!, $limit: Int) { user(id: $id) { name } }",
		);
		expect(screen.getByText("$id")).toBeInTheDocument();
		expect(screen.getByText("$limit")).toBeInTheDocument();
		expect(screen.getByText("ID!")).toBeInTheDocument();
		expect(screen.getByText("Int")).toBeInTheDocument();
	});

	it("shows provided status for matching variables", () => {
		switchToVariables();
		typeQuery(
			"query GetUser($id: ID!, $limit: Int) { user(id: $id) { name } }",
		);
		typeVariables('{ "id": "123", "limit": 10 }');
		const yesIndicators = screen.getAllByText("Yes");
		expect(yesIndicators.length).toBe(2);
	});

	it("shows not provided for missing required variable", () => {
		switchToVariables();
		typeQuery("query GetUser($id: ID!) { user(id: $id) { name } }");
		typeVariables("{}");
		expect(screen.getByText("No")).toBeInTheDocument();
		expect(screen.getByText("Mismatch")).toBeInTheDocument();
	});

	it("shows type match for correct types", () => {
		switchToVariables();
		typeQuery("query GetUser($id: ID!) { user(id: $id) { name } }");
		typeVariables('{ "id": "abc" }');
		expect(screen.getByText("Match")).toBeInTheDocument();
	});

	it("shows type mismatch for wrong types", () => {
		switchToVariables();
		typeQuery("query GetUser($id: Int!) { user(id: $id) { name } }");
		typeVariables('{ "id": "not-a-number" }');
		expect(screen.getByText("Mismatch")).toBeInTheDocument();
	});

	it("shows error for invalid JSON variables", () => {
		switchToVariables();
		typeQuery("query GetUser($id: ID!) { user(id: $id) { name } }");
		typeVariables("{ not valid json }");
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("shows error for invalid query", () => {
		switchToVariables();
		typeQuery("query { user {");
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("clear button clears both editors", () => {
		switchToVariables();
		typeQuery("query GetUser($id: ID!) { user(id: $id) { name } }");
		typeVariables('{ "id": "123" }');

		fireEvent.click(screen.getByText("Clear"));

		const editors = screen.getAllByTestId(
			"monaco-editor",
		) as HTMLTextAreaElement[];
		expect(editors[0].value).toBe("");
		expect(editors[1].value).toBe("");
	});
});
