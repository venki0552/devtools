import { Moon, Sun, Github } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface TopBarProps {
	title?: string;
}

export function TopBar({ title = "DevTools" }: TopBarProps) {
	const { theme, toggleTheme } = useTheme();

	return (
		<header className='flex h-12 items-center justify-between border-b border-border bg-panel px-4'>
			<h1 className='text-sm font-semibold truncate'>{title}</h1>
			<div className='flex items-center gap-2'>
				<a
					href='https://github.com/venki0552/devtools'
					target='_blank'
					rel='noopener noreferrer'
					className='flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-foreground transition-colors'
					aria-label='GitHub repository'
				>
					<Github className='h-4 w-4' />
				</a>
				<button
					onClick={toggleTheme}
					className='flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-foreground transition-colors'
					aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
				>
					{theme === "dark" ? (
						<Sun className='h-4 w-4' />
					) : (
						<Moon className='h-4 w-4' />
					)}
				</button>
			</div>
		</header>
	);
}
