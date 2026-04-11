import {
	createContext,
	useContext,
	useEffect,
	useCallback,
	type ReactNode,
} from "react";
import { useLocalStorage } from "@/lib/use-local-storage";

type Theme = "dark" | "light";

interface ThemeContextValue {
	theme: Theme;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useLocalStorage<Theme>("devtools-theme", "dark");

	useEffect(() => {
		const root = document.documentElement;
		if (theme === "light") {
			root.classList.add("light");
		} else {
			root.classList.remove("light");
		}
	}, [theme]);

	const toggleTheme = useCallback(() => {
		setTheme((prev) => (prev === "dark" ? "light" : "dark"));
	}, [setTheme]);

	return <ThemeContext value={{ theme, toggleTheme }}>{children}</ThemeContext>;
}

export function useTheme() {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
	return ctx;
}
