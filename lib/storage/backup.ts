import { exportAll } from "@/lib/storage/conversations";

/**
 * Downloads everything as JSON. Nothing is on a server, so this is the only
 * copy that survives clearing site data or moving to another machine, and it
 * is also the escape hatch for a schema change, since upgrading the store
 * wipes rather than migrates.
 */
export async function downloadBackup(): Promise<void> {
  const backup = await exportAll();
  const stamp = new Date().toISOString().slice(0, 10);

  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = `meriza-${stamp}.json`;
  link.click();

  URL.revokeObjectURL(url);
}