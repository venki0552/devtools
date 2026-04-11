import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";
import { renderWithProviders } from "@/test/utils";

describe("EmptyState", () => {
	it("renders default text", () => {
		renderWithProviders(<EmptyState />);
		expect(screen.getByText("No content yet")).toBeInTheDocument();
	});

	it("renders custom text", () => {
		renderWithProviders(<EmptyState text='Paste or type to start' />);
		expect(screen.getByText("Paste or type to start")).toBeInTheDocument();
	});
});
