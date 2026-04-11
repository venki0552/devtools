import { createRootRoute, Outlet } from "@tanstack/react-router";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export const Route = createRootRoute({
	component: RootLayout,
});

function RootLayout() {
	return (
		<HelmetProvider>
			<ThemeProvider>
				<div className='flex h-screen'>
					<Sidebar />
					<div className='flex flex-1 flex-col lg:ml-60'>
						<TopBar />
						<main className='flex-1 overflow-y-auto'>
							<Outlet />
						</main>
					</div>
				</div>
			</ThemeProvider>
		</HelmetProvider>
	);
}
