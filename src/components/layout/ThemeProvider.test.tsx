import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { render } from "@testing-library/react";

function ThemeConsumer() {
	const { theme, toggleTheme } = useTheme();
	return (
		<div>
			<span data-testid='theme'>{theme}</span>
			<button onClick={toggleTheme}>Toggle</button>
		</div>
	);
}

describe("ThemeProvider", () => {
	it("defaults to dark theme", () => {
		render(
			<ThemeProvider>
				<ThemeConsumer />
			</ThemeProvider>,
		);
		expect(screen.getByTestId("theme").textContent).toBe("dark");
	});

	it("toggles to light theme", () => {
		render(
			<ThemeProvider>
				<ThemeConsumer />
			</ThemeProvider>,
		);
		fireEvent.click(screen.getByText("Toggle"));
		expect(screen.getByTestId("theme").textContent).toBe("light");
	});

	it("toggles back to dark", () => {
		render(
			<ThemeProvider>
				<ThemeConsumer />
			</ThemeProvider>,
		);
		fireEvent.click(screen.getByText("Toggle"));
		fireEvent.click(screen.getByText("Toggle"));
		expect(screen.getByTestId("theme").textContent).toBe("dark");
	});

	it("adds light class to document root", () => {
		render(
			<ThemeProvider>
				<ThemeConsumer />
			</ThemeProvider>,
		);
		fireEvent.click(screen.getByText("Toggle"));
		expect(document.documentElement.classList.contains("light")).toBe(true);
	});

	it("removes light class when toggled back", () => {
		render(
			<ThemeProvider>
				<ThemeConsumer />
			</ThemeProvider>,
		);
		fireEvent.click(screen.getByText("Toggle"));
		fireEvent.click(screen.getByText("Toggle"));
		expect(document.documentElement.classList.contains("light")).toBe(false);
	});
});

describe("useTheme", () => {
	it("throws when used outside ThemeProvider", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => render(<ThemeConsumer />)).toThrow(
			"useTheme must be used within ThemeProvider",
		);
		spy.mockRestore();
	});
});
