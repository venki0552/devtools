import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { TopBar } from "./TopBar";
import { renderWithProviders } from "@/test/utils";

describe("TopBar", () => {
	it("renders default title", () => {
		renderWithProviders(<TopBar />);
		expect(screen.getByText("DevTools")).toBeInTheDocument();
	});

	it("renders custom title", () => {
		renderWithProviders(<TopBar title='My Tools' />);
		expect(screen.getByText("My Tools")).toBeInTheDocument();
	});

	it("has GitHub link", () => {
		renderWithProviders(<TopBar />);
		const link = screen.getByLabelText("GitHub repository");
		expect(link).toHaveAttribute("href", "https://github.com");
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("has theme toggle button", () => {
		renderWithProviders(<TopBar />);
		expect(screen.getByLabelText(/switch to light mode/i)).toBeInTheDocument();
	});

	it("toggles theme on click", () => {
		renderWithProviders(<TopBar />);
		const btn = screen.getByLabelText(/switch to light mode/i);
		fireEvent.click(btn);
		expect(screen.getByLabelText(/switch to dark mode/i)).toBeInTheDocument();
	});
});
