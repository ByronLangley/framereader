"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { QueueItem, JobStatus } from "@framereader/shared";
import {
  getQueue,
  setQueue,
  addToQueue,
  updateQueueItem,
  removeFromQueue,
  clearCompletedFromQueue,
  saveScript,
  getStoredScript,
} from "@/lib/storage";
import { getJobStatus, getScript, ApiError } from "@/lib/api";
import {
  POLLING_INTERVAL_MS,
  POLLING_SLOW_MS,
  POLLING_FAST_MS,
  POLLING_SLOWDOWN_AFTER_MS,
} from "@framereader/shared";

export function useQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollingStartRef = useRef<Map<string, number>>(new Map());

  // Load from localStorage on mount
  useEffect(() => {
    setItems(getQueue());
  }, []);

  // Sync state to localStorage whenever items change
  const syncItems = useCallback((newItems: QueueItem[]) => {
    setItems(newItems);
    setQueue(newItems);
  }, []);

  // Add a job to the queue
  const addJob = useCallback(
    (item: QueueItem) => {
      addToQueue(item);
      setItems((prev) => [...prev, item]);
      startPolling(item.jobId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Remove a job
  const removeJob = useCallback(
    (jobId: string) => {
      stopPolling(jobId);
      removeFromQueue(jobId);
      setItems((prev) => prev.filter((q) => q.jobId !== jobId));
      if (selectedJobId === jobId) {
        setSelectedJobId(null);
        setSelectedScript(null);
      }
    },
    [selectedJobId]
  );

  // Clear completed
  const clearCompleted = useCallback(() => {
    clearCompletedFromQueue();
    setItems((prev) =>
      prev.filter(
        (q) => q.status !== "complete" && q.status !== "error" && q.status !== "cancelled"
      )
    );
  }, []);

  // Mark as copied
  const markCopied = useCallback((jobId: string) => {
    updateQueueItem(jobId, { copied: true });
    setItems((prev) =>
      prev.map((q) => (q.jobId === jobId ? { ...q, copied: true } : q))
    );
  }, []);

  // Update the script content (for inline editing)
  const updateScript = useCallback(
    (newScript: string) => {
      setSelectedScript(newScript);
      if (selectedJobId) {
        saveScript(selectedJobId, newScript);
      }
    },
    [selectedJobId]
  );

  // Select a job and load its script
  const selectJob = useCallback(
    async (jobId: string) => {
      setSelectedJobId(jobId);

      // Try localStorage first
      const cached = getStoredScript(jobId);
      if (cached) {
        setSelectedScript(cached);
        return;
      }

      // Fetch from API
      try {
        const result = await getScript(jobId);
        setSelectedScript(result.script);
        saveScript(jobId, result.script);
      } catch {
        setSelectedScript(null);
      }
    },
    []
  );

  // Poll for status updates
  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const status = await getJobStatus(jobId);

        setItems((prev) => {
          const updated = prev.map((q) =>
            q.jobId === jobId
              ? {
                  ...q,
                  status: status.status as JobStatus,
                  title: status.metadata?.title || q.title,
                }
              : q
          );
          setQueue(updated);
          return updated;
        });

        // If complete or error, stop polling and fetch script
        if (status.status === "complete" || status.status === "error" || status.status === "cancelled") {
          stopPolling(jobId);

          if (status.status === "complete") {
            try {
              const scriptResult = await getScript(jobId);
              saveScript(jobId, scriptResult.script);
            } catch {
              // Script will be fetched when user clicks
            }
          }
        }
      } catch (err) {
        // If job not found (404), mark as error and stop polling
        if (err instanceof ApiError && err.status === 404) {
          stopPolling(jobId);
          setItems((prev) => {
            const updated = prev.map((q) =>
              q.jobId === jobId
                ? { ...q, status: "error" as JobStatus }
                : q
            );
            setQueue(updated);
            return updated;
          });
        }
        // Other errors: will retry on next poll
      }
    },
    []
  );

  const startPolling = useCallback(
    (jobId: string) => {
      if (pollingRef.current.has(jobId)) return;

      pollingStartRef.current.set(jobId, Date.now());

      const poll = () => {
        pollJob(jobId);

        const elapsed = Date.now() - (pollingStartRef.current.get(jobId) || Date.now());
        const interval =
          elapsed > POLLING_SLOWDOWN_AFTER_MS ? POLLING_SLOW_MS : POLLING_INTERVAL_MS;

        const timer = setTimeout(poll, interval);
        pollingRef.current.set(jobId, timer);
      };

      // Start immediately
      poll();
    },
    [pollJob]
  );

  const stopPolling = useCallback((jobId: string) => {
    const timer = pollingRef.current.get(jobId);
    if (timer) {
      clearTimeout(timer);
      pollingRef.current.delete(jobId);
      pollingStartRef.current.delete(jobId);
    }
  }, []);

  // On mount, start polling for any active jobs
  useEffect(() => {
    const queue = getQueue();
    for (const item of queue) {
      if (item.status === "queued" || item.status === "processing") {
        startPolling(item.jobId);
      }
    }

    return () => {
      // Cleanup all polls on unmount
      for (const [, timer] of pollingRef.current) {
        clearTimeout(timer);
      }
      pollingRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    items,
    selectedJobId,
    selectedScript,
    addJob,
    removeJob,
    clearCompleted,
    markCopied,
    selectJob,
    updateScript,
  };
}
