export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "mindcontext.theme";

export function readThemePreference(): ThemePreference {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

export function applyThemePreference(preference: ThemePreference): void {
  window.localStorage.setItem(STORAGE_KEY, preference);
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePreference = preference;
}

export function initializeTheme(): ThemePreference {
  const preference = readThemePreference();
  applyThemePreference(preference);
  return preference;
}
