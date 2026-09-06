import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings/types";

const KEY = "meriza.settings.v1";

/**
 * Reads stored settings, keeping only fields whose type still matches the
 * current shape. A field that was removed, renamed, or written by an older
 * build falls back to its default rather than failing the whole read, so a
 * stale blob degrades one setting at a time.
 *
 * The key carries a version so a change too large to reconcile this way can
 * start clean instead of migrating.
 */
export function readSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  let stored: unknown;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }

  if (typeof stored !== "object" || stored === null) return DEFAULT_SETTINGS;
  const found = stored as Record<string, unknown>;

  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = found[key];
    if (value === null || typeof value === typeof DEFAULT_SETTINGS[key]) {
      Object.assign(settings, { [key]: value });
    }
  }
  return settings;
}

export function writeSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private browsing or a full quota. Settings stay in memory for the
    // session, which is worse than persisting but better than crashing.
  }
}