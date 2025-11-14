import { createContext } from "react";

export type Theme = "dark" | "light" | "system";

export type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export const defaultThemeState: ThemeProviderState = {
  theme: "system",
  setTheme: () => undefined,
};

export const ThemeProviderContext = createContext<ThemeProviderState>(defaultThemeState);

