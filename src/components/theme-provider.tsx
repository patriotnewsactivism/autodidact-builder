import React, { useEffect, useState } from "react";
import { ThemeProviderContext, defaultThemeState, type Theme } from "./theme-context";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

const isBrowser = typeof window !== "undefined";

const resolveStoredTheme = (storageKey: string, fallback: Theme) => {
  if (!isBrowser) {
    return fallback;
  }
  try {
    const stored = window.localStorage.getItem(storageKey) as Theme | null;
    return stored ?? fallback;
  } catch (error) {
    console.warn('Failed to load theme from storage:', error);
    return fallback;
  }
};

const getSystemTheme = (): Exclude<Theme, "system"> => {
  if (!isBrowser) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "ai-theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => resolveStoredTheme(storageKey, defaultTheme));

  useEffect(() => {
    if (!isBrowser) {
      return;
    }
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    const appliedTheme = theme === "system" ? getSystemTheme() : theme;
    root.classList.add(appliedTheme);
  }, [theme]);

  const setTheme = (next: Theme) => {
    if (isBrowser) {
      try {
        window.localStorage.setItem(storageKey, next);
      } catch (error) {
        console.warn('Failed to save theme to storage:', error);
      }
    }
    setThemeState(next);
  };

  const value = {
    theme,
    setTheme,
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
