import { LOCALSTORAGE_KEYS } from "@framereader/shared";
import type { QueueItem, StoredSettings } from "@framereader/shared";

// === Queue ===

export function getQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEYS.QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setQueue(items: QueueItem[]): void {
  try {
    localStorage.setItem(LOCALSTORAGE_KEYS.QUEUE, JSON.stringify(items));
  } catch (err) {
    console.warn("Failed to save queue to localStorage", err);
  }
}

export function addToQueue(item: QueueItem): void {
  const queue = getQueue();
  queue.push(item);
  setQueue(queue);
}

export function updateQueueItem(
  jobId: string,
  updates: Partial<QueueItem>
): void {
  const queue = getQueue();
  const index = queue.findIndex((q) => q.jobId === jobId);
  if (index !== -1) {
    queue[index] = { ...queue[index], ...updates };
    setQueue(queue);
  }
}

export function removeFromQueue(jobId: string): void {
  const queue = getQueue().filter((q) => q.jobId !== jobId);
  setQueue(queue);
}

export function clearCompletedFromQueue(): void {
  const queue = getQueue().filter(
    (q) => q.status !== "complete" && q.status !== "error" && q.status !== "cancelled"
  );
  setQueue(queue);
}

// === Scripts ===

export function getStoredScript(jobId: string): string | null {
  try {
    return localStorage.getItem(`${LOCALSTORAGE_KEYS.SCRIPT_PREFIX}${jobId}`);
  } catch {
    return null;
  }
}

export function saveScript(jobId: string, script: string): void {
  try {
    localStorage.setItem(`${LOCALSTORAGE_KEYS.SCRIPT_PREFIX}${jobId}`, script);
  } catch (err) {
    console.warn("Failed to save script to localStorage", err);
  }
}

// === Settings ===

export function getSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEYS.SETTINGS);
    return raw ? JSON.parse(raw) : { theme: "dark" };
  } catch {
    return { theme: "dark" };
  }
}

export function updateSettings(partial: Partial<StoredSettings>): void {
  try {
    const current = getSettings();
    localStorage.setItem(
      LOCALSTORAGE_KEYS.SETTINGS,
      JSON.stringify({ ...current, ...partial })
    );
  } catch {
    // Non-critical
  }
}

// === Storage check ===

export function getStorageUsagePercent(): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        total += localStorage.getItem(key)?.length || 0;
      }
    }
    // Approximate 5MB limit
    return (total / (5 * 1024 * 1024)) * 100;
  } catch {
    return 0;
  }
}

export function hasUncopiedScripts(): boolean {
  const queue = getQueue();
  return queue.some((q) => q.status === "complete" && !q.copied);
}
