import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { HttpStatusTool } from "./index";

// Mock clipboard
vi.mock("@/lib/clipboard", () => ({
	copyToClipboard: vi.fn().mockResolvedValue(true),
}));

describe("HttpStatusTool", () => {
	it("renders with tool title", () => {
		renderWithProviders(<HttpStatusTool />);
		expect(screen.getByText("HTTP Status Codes")).toBeInTheDocument();
	});

	it("shows common status codes (200, 404, 500)", () => {
		renderWithProviders(<HttpStatusTool />);
		expect(screen.getByText("200")).toBeInTheDocument();
		expect(screen.getByText("OK")).toBeInTheDocument();
		expect(screen.getByText("404")).toBeInTheDocument();
		expect(screen.getByText("Not Found")).toBeInTheDocument();
		expect(screen.getByText("500")).toBeInTheDocument();
		expect(screen.getByText("Internal Server Error")).toBeInTheDocument();
	});

	it("search filters codes by number", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "404" } });
		expect(screen.getByText("404")).toBeInTheDocument();
		expect(screen.getByText("Not Found")).toBeInTheDocument();
		// Other codes should be filtered out
		expect(screen.queryByText("200")).not.toBeInTheDocument();
	});

	it('search filters by text (e.g. "not found")', () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "not found" } });
		expect(screen.getByText("404")).toBeInTheDocument();
		expect(screen.queryByText("200")).not.toBeInTheDocument();
	});

	it("filter chips for families (1xx through 5xx) are present", () => {
		renderWithProviders(<HttpStatusTool />);
		expect(screen.getByText("1xx")).toBeInTheDocument();
		expect(screen.getByText("2xx")).toBeInTheDocument();
		expect(screen.getByText("3xx")).toBeInTheDocument();
		expect(screen.getByText("4xx")).toBeInTheDocument();
		expect(screen.getByText("5xx")).toBeInTheDocument();
	});

	it("clicking a family filter narrows results to that family", () => {
		renderWithProviders(<HttpStatusTool />);
		fireEvent.click(screen.getByText("2xx"));
		// Should see 2xx codes
		expect(screen.getByText("200")).toBeInTheDocument();
		expect(screen.getByText("201")).toBeInTheDocument();
		expect(screen.getByText("204")).toBeInTheDocument();
		// Should not see 4xx or 5xx codes
		expect(screen.queryByText("404")).not.toBeInTheDocument();
		expect(screen.queryByText("500")).not.toBeInTheDocument();
	});

	it("clicking the same family filter again removes it", () => {
		renderWithProviders(<HttpStatusTool />);
		fireEvent.click(screen.getByText("2xx"));
		expect(screen.queryByText("404")).not.toBeInTheDocument();

		fireEvent.click(screen.getByText("2xx"));
		expect(screen.getByText("404")).toBeInTheDocument();
	});

	it("expandable cards show details on click", () => {
		renderWithProviders(<HttpStatusTool />);
		// Click on the 200 card to expand it
		const card200 = screen
			.getByText("200")
			.closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card200);
		expect(screen.getByText("Details")).toBeInTheDocument();
		expect(screen.getByText("Common Causes")).toBeInTheDocument();
		expect(screen.getByText("Client Action")).toBeInTheDocument();
	});

	it("418 I'm a Teapot exists", () => {
		renderWithProviders(<HttpStatusTool />);
		// Filter to see 418
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "418" } });
		expect(screen.getByText("418")).toBeInTheDocument();
		expect(screen.getByText("I'm a Teapot")).toBeInTheDocument();
	});

	it("429 Too Many Requests exists", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "429" } });
		expect(screen.getByText("429")).toBeInTheDocument();
		expect(screen.getByText("Too Many Requests")).toBeInTheDocument();
	});

	it("451 Unavailable For Legal Reasons exists", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "451" } });
		expect(screen.getByText("451")).toBeInTheDocument();
		expect(
			screen.getByText("Unavailable For Legal Reasons"),
		).toBeInTheDocument();
	});

	it("shows filtered count of codes", () => {
		renderWithProviders(<HttpStatusTool />);
		// Should show total count
		expect(screen.getByText(/\d+ codes/)).toBeInTheDocument();
	});

	it("filtered count updates after filtering", () => {
		renderWithProviders(<HttpStatusTool />);
		fireEvent.click(screen.getByText("1xx"));
		expect(screen.getByText("2 codes")).toBeInTheDocument();
	});

	it('shows "No status codes match" for non-matching search', () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "999" } });
		expect(screen.getByText(/no status codes match/i)).toBeInTheDocument();
	});

	it("related codes are shown in expanded card view", () => {
		renderWithProviders(<HttpStatusTool />);
		// Expand 404
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "404" } });
		const card = screen.getByText("404").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		expect(screen.getByText("Related Codes")).toBeInTheDocument();
	});

	it("favorite button toggles on click", () => {
		renderWithProviders(<HttpStatusTool />);
		const favButton = screen.getAllByLabelText("Add to favorites")[0];
		fireEvent.click(favButton);
		// After favoriting, label changes
		expect(
			screen.getAllByLabelText("Remove from favorites").length,
		).toBeGreaterThanOrEqual(1);
	});

	it("Clear button resets search and filters", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "404" } });
		fireEvent.click(screen.getByText("4xx"));

		// Click the Clear/X button
		const clearButton = screen.getByText("Clear").closest("button")!;
		fireEvent.click(clearButton);

		// Should see all codes again
		expect(screen.getByText("200")).toBeInTheDocument();
		expect(screen.getByText("500")).toBeInTheDocument();
	});

	// --- Unofficial codes ---

	it("unofficial code 420 Enhance Your Calm is present", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "420" } });
		expect(screen.getByText("420")).toBeInTheDocument();
		expect(screen.getByText("Enhance Your Calm")).toBeInTheDocument();
	});

	it("unofficial code 444 Connection Closed Without Response is present", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "444" } });
		expect(screen.getByText("444")).toBeInTheDocument();
		expect(
			screen.getByText("Connection Closed Without Response"),
		).toBeInTheDocument();
	});

	it("unofficial code 499 Client Closed Request is present", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "499" } });
		expect(screen.getByText("499")).toBeInTheDocument();
		expect(screen.getByText("Client Closed Request")).toBeInTheDocument();
	});

	it("Cloudflare codes 520-530 are present", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "520" } });
		expect(screen.getByText("520")).toBeInTheDocument();
		expect(screen.getByText("Unknown Error")).toBeInTheDocument();

		fireEvent.change(searchInput, { target: { value: "530" } });
		expect(screen.getByText("530")).toBeInTheDocument();
		expect(screen.getByText("Origin DNS Error")).toBeInTheDocument();
	});

	it("unofficial codes show 'unofficial' badge", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "420" } });
		expect(screen.getByText("unofficial")).toBeInTheDocument();
	});

	// --- Unofficial toggle ---

	it("unofficial toggle button is present", () => {
		renderWithProviders(<HttpStatusTool />);
		expect(screen.getByText("Unofficial")).toBeInTheDocument();
	});

	it("clicking unofficial toggle hides unofficial codes", () => {
		renderWithProviders(<HttpStatusTool />);
		// 420 should be present initially
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "420" } });
		expect(screen.getByText("420")).toBeInTheDocument();

		// Toggle unofficial off
		fireEvent.change(searchInput, { target: { value: "" } });
		fireEvent.click(screen.getByText("Unofficial"));

		// Now 420 should be gone
		fireEvent.change(searchInput, { target: { value: "420" } });
		expect(screen.queryByText("Enhance Your Calm")).not.toBeInTheDocument();
	});

	it("toggling unofficial back on shows unofficial codes again", () => {
		renderWithProviders(<HttpStatusTool />);
		// Turn off unofficial
		fireEvent.click(screen.getByText("Unofficial"));
		// Turn back on
		fireEvent.click(screen.getByText("Unofficial"));

		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "420" } });
		expect(screen.getByText("420")).toBeInTheDocument();
	});

	// --- Associated headers ---

	it("shows associated headers for 301 when expanded", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "301" } });
		const card = screen.getByText("301").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		expect(screen.getByText("Associated Headers")).toBeInTheDocument();
		expect(screen.getByText("Location")).toBeInTheDocument();
	});

	it("shows associated headers for 401 when expanded", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "401" } });
		const card = screen.getByText("401").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		expect(screen.getByText("WWW-Authenticate")).toBeInTheDocument();
	});

	it("shows Retry-After header for 429 when expanded", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "429" } });
		const card = screen.getByText("429").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		expect(screen.getByText("Retry-After")).toBeInTheDocument();
	});

	it("shows ETag and Last-Modified headers for 304 when expanded", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "304" } });
		const card = screen.getByText("304").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		expect(screen.getByText("ETag")).toBeInTheDocument();
		expect(screen.getByText("Last-Modified")).toBeInTheDocument();
	});

	it("shows Retry-After header for 503 when expanded", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "503" } });
		const card = screen.getByText("503").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		expect(screen.getByText("Retry-After")).toBeInTheDocument();
	});

	// --- Code examples ---

	it("shows example for 404 when expanded", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "404" } });
		const card = screen.getByText("404").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		expect(screen.getByText("Example")).toBeInTheDocument();
		expect(screen.getByText(/GET \/api\/users\/999/)).toBeInTheDocument();
	});

	it("shows example for 200 when expanded", () => {
		renderWithProviders(<HttpStatusTool />);
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "200" } });
		const card = screen.getByText("200").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		expect(screen.getByText("Example")).toBeInTheDocument();
	});

	// --- Table view toggle ---

	it("table view toggle button is present", () => {
		renderWithProviders(<HttpStatusTool />);
		expect(screen.getByText("Table")).toBeInTheDocument();
	});

	it("switching to table view shows a table with columns", () => {
		renderWithProviders(<HttpStatusTool />);
		fireEvent.click(screen.getByText("Table"));
		// Should have table headers
		expect(screen.getByText("Code")).toBeInTheDocument();
		expect(screen.getByText("Name")).toBeInTheDocument();
		expect(screen.getByText("Description")).toBeInTheDocument();
	});

	it("table view shows status code data", () => {
		renderWithProviders(<HttpStatusTool />);
		fireEvent.click(screen.getByText("Table"));
		expect(screen.getByText("200")).toBeInTheDocument();
		expect(screen.getByText("OK")).toBeInTheDocument();
		expect(screen.getByText("404")).toBeInTheDocument();
		expect(screen.getByText("Not Found")).toBeInTheDocument();
	});

	it("switching back to card view from table works", () => {
		renderWithProviders(<HttpStatusTool />);
		// Switch to table
		fireEvent.click(screen.getByText("Table"));
		expect(screen.getByText("Code")).toBeInTheDocument();

		// Switch back to cards
		fireEvent.click(screen.getByText("Cards"));
		// Card-specific elements should be back (expandable cards)
		expect(screen.queryByText("Code")).not.toBeInTheDocument();
	});

	it("table view respects search filter", () => {
		renderWithProviders(<HttpStatusTool />);
		fireEvent.click(screen.getByText("Table"));
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "404" } });
		expect(screen.getByText("404")).toBeInTheDocument();
		expect(screen.queryByText("200")).not.toBeInTheDocument();
	});

	it("table view respects family filter", () => {
		renderWithProviders(<HttpStatusTool />);
		fireEvent.click(screen.getByText("Table"));
		// Click the 2xx filter button (not the family badges in the table)
		const filterButtons = screen.getAllByText("2xx");
		const filterBtn = filterButtons.find(
			(el) => el.tagName.toLowerCase() === "button",
		)!;
		fireEvent.click(filterBtn);
		expect(screen.getByText("200")).toBeInTheDocument();
		expect(screen.queryByText("404")).not.toBeInTheDocument();
	});

	it("table view shows unofficial badge for unofficial codes", () => {
		renderWithProviders(<HttpStatusTool />);
		fireEvent.click(screen.getByText("Table"));
		const searchInput = screen.getByPlaceholderText(/search/i);
		fireEvent.change(searchInput, { target: { value: "520" } });
		expect(screen.getByText("unofficial")).toBeInTheDocument();
	});

	// --- Copy code button ---

	it("expanded card shows a 'Copy code' button", () => {
		renderWithProviders(<HttpStatusTool />);
		const card = screen.getByText("200").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		expect(screen.getByText("Copy code")).toBeInTheDocument();
	});

	it("clicking 'Copy code' calls clipboard with the status code number", async () => {
		const { copyToClipboard } = await import("@/lib/clipboard");
		renderWithProviders(<HttpStatusTool />);
		const card = screen.getByText("200").closest('[class*="cursor-pointer"]')!;
		fireEvent.click(card);
		const copyBtn = screen.getByText("Copy code").closest("button")!;
		fireEvent.click(copyBtn);
		expect(copyToClipboard).toHaveBeenCalledWith("200");
	});
});
