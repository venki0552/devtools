import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyButton } from "./CopyButton";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/lib/clipboard", () => ({
	copyToClipboard: vi.fn(),
}));

import { copyToClipboard } from "@/lib/clipboard";
const mockCopy = vi.mocked(copyToClipboard);

describe("CopyButton", () => {
	it("renders with Copy icon by default", () => {
		renderWithProviders(<CopyButton text='hello' />);
		expect(
			screen.getByRole("button", { name: /copy to clipboard/i }),
		).toBeInTheDocument();
	});

	it("renders custom label", () => {
		renderWithProviders(<CopyButton text='hello' label='Copy JSON' />);
		expect(screen.getByText("Copy JSON")).toBeInTheDocument();
	});

	it("is disabled when text is empty", () => {
		renderWithProviders(<CopyButton text='' />);
		expect(screen.getByRole("button")).toBeDisabled();
	});

	it("shows check icon after successful copy", async () => {
		mockCopy.mockResolvedValue(true);
		renderWithProviders(<CopyButton text='hello' label='Copy' />);
		fireEvent.click(screen.getByRole("button"));
		await waitFor(() => {
			expect(screen.getByText("Copied!")).toBeInTheDocument();
		});
	});

	it("does not show check icon if copy fails", async () => {
		mockCopy.mockResolvedValue(false);
		renderWithProviders(<CopyButton text='hello' label='Copy' />);
		fireEvent.click(screen.getByRole("button"));
		await waitFor(() => {
			expect(mockCopy).toHaveBeenCalledWith("hello");
		});
		expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
	});

	it("uses custom aria-label", () => {
		renderWithProviders(<CopyButton text='x' aria-label='Copy output' />);
		expect(
			screen.getByRole("button", { name: "Copy output" }),
		).toBeInTheDocument();
	});
});
