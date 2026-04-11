import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { ErrorBox } from "./ErrorBox";
import { renderWithProviders } from "@/test/utils";

describe("ErrorBox", () => {
	it("renders nothing when error is null", () => {
		const { container } = renderWithProviders(<ErrorBox error={null} />);
		expect(container.firstChild).toBeNull();
	});

	it("renders error message", () => {
		renderWithProviders(<ErrorBox error='Something went wrong' />);
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
	});

	it("preserves whitespace in error messages", () => {
		renderWithProviders(<ErrorBox error={"Line 1\nLine 2"} />);
		const pre = screen.getByText(/Line 1/);
		expect(pre.tagName).toBe("PRE");
	});
});
