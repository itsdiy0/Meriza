"use client";

import { useCallback, useEffect, useState } from "react";
import { readSettings, writeSettings } from "@/lib/settings/store";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings/types";

export interface SettingsHandle {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

/**
 * Holds settings in state and mirrors them to storage.
 *
 * The first render uses defaults regardless of what is stored, because the
 * server has no localStorage and rendering the stored value directly would
 * mismatch on hydration. Stored values arrive on the effect immediately after,
 * which is one frame of the default layout on a hard refresh.
 */
export function useSettings(): SettingsHandle {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(readSettings());
  }, []);

  const set = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        writeSettings(next);
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    writeSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, set, reset };
}