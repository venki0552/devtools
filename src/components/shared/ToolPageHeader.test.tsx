import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { ToolPageHeader } from "./ToolPageHeader";
import { renderWithProviders } from "@/test/utils";

describe("ToolPageHeader", () => {
	it("renders title", () => {
		renderWithProviders(<ToolPageHeader title='JSON Parser' />);
		expect(screen.getByText("JSON Parser")).toBeInTheDocument();
	});

	it("renders children actions", () => {
		renderWithProviders(
			<ToolPageHeader title='Test'>
				<button>Action</button>
			</ToolPageHeader>,
		);
		expect(screen.getByText("Action")).toBeInTheDocument();
	});

	it("does not render actions container when no children", () => {
		const { container } = renderWithProviders(<ToolPageHeader title='Test' />);
		// Only the h2 should be inside the header, no actions div
		const header = container.firstChild as HTMLElement;
		expect(header.children).toHaveLength(1);
	});
});
