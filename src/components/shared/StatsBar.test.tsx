import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { StatsBar } from "./StatsBar";
import { renderWithProviders } from "@/test/utils";

describe("StatsBar", () => {
	it("renders input char count", () => {
		renderWithProviders(<StatsBar inputChars={42} />);
		expect(screen.getByText(/Input: 42 chars/)).toBeInTheDocument();
	});

	it("renders output char count", () => {
		renderWithProviders(<StatsBar outputChars={100} />);
		expect(screen.getByText(/Output: 100 chars/)).toBeInTheDocument();
	});

	it("renders processing time", () => {
		renderWithProviders(<StatsBar processingTime={5.2} />);
		expect(screen.getByText(/Processed in/)).toBeInTheDocument();
	});

	it("renders byte counts", () => {
		renderWithProviders(<StatsBar inputBytes={1024} outputBytes={2048} />);
		expect(screen.getByText("1 KB")).toBeInTheDocument();
		expect(screen.getByText("2 KB")).toBeInTheDocument();
	});

	it("renders nothing when no props", () => {
		const { container } = renderWithProviders(<StatsBar />);
		// Should still render the container div but no stats spans
		expect(container.querySelector("span")).toBeNull();
	});
});
