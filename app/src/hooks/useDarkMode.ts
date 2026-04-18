import { useEffect, useState } from "react";
import { usePrefersColorSchemeDark } from "./useMediaQuery";

type ColorScheme = "light" | "dark" | "system";

// Hook to manage dark mode with localStorage persistence
export function useDarkMode(): {
  isDarkMode: boolean;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleDarkMode: () => void;
} {
  const systemPrefersDark = usePrefersColorSchemeDark();
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => {
    // Check localStorage first
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("oil-shock:color-scheme");
      if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
      }
    }
    return "system";
  });

  // Determine if dark mode is active
  const isDarkMode =
    colorScheme === "dark" || (colorScheme === "system" && systemPrefersDark);

  // Apply to document
  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.style.colorScheme = "dark";
      html.classList.add("dark-mode");
    } else {
      html.style.colorScheme = "light";
      html.classList.remove("dark-mode");
    }
  }, [isDarkMode]);

  // Update color scheme
  const setColorScheme = (scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("oil-shock:color-scheme", scheme);
    }
  };

  // Toggle between light and dark
  const toggleDarkMode = () => {
    setColorScheme(isDarkMode ? "light" : "dark");
  };

  return {
    isDarkMode,
    colorScheme,
    setColorScheme,
    toggleDarkMode,
  };
}
