import { render, type RenderOptions } from "@testing-library/react";
import {
	RouterProvider,
	createRouter,
	createRootRoute,
	createRoute,
	createMemoryHistory,
} from "@tanstack/react-router";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import type { ReactElement, ReactNode } from "react";

interface WrapperProps {
	children: ReactNode;
}

function createTestRouter(component: () => ReactElement, path = "/") {
	const rootRoute = createRootRoute({
		component: ({ children }: { children?: ReactNode }) => (
			<HelmetProvider>
				<ThemeProvider>{children}</ThemeProvider>
			</HelmetProvider>
		),
	});

	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path,
		component,
	});

	const routeTree = rootRoute.addChildren([indexRoute]);
	const memoryHistory = createMemoryHistory({ initialEntries: [path] });

	return createRouter({ routeTree, history: memoryHistory });
}

export function renderWithProviders(
	ui: ReactElement,
	options?: Omit<RenderOptions, "wrapper">,
) {
	function Wrapper({ children }: WrapperProps) {
		return (
			<HelmetProvider>
				<ThemeProvider>{children}</ThemeProvider>
			</HelmetProvider>
		);
	}
	return render(ui, { wrapper: Wrapper, ...options });
}

export function renderRoute(component: () => ReactElement, path = "/") {
	const router = createTestRouter(component, path);
	return render(<RouterProvider router={router} />);
}

export { render };
