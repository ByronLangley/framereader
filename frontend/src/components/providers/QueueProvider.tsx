"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQueue } from "@/hooks/useQueue";

type QueueContextType = ReturnType<typeof useQueue>;

const QueueContext = createContext<QueueContextType | null>(null);

export function QueueProvider({ children }: { children: ReactNode }) {
  const queue = useQueue();
  return (
    <QueueContext.Provider value={queue}>{children}</QueueContext.Provider>
  );
}

export function useQueueContext() {
  const ctx = useContext(QueueContext);
  if (!ctx) {
    throw new Error("useQueueContext must be used within QueueProvider");
  }
  return ctx;
}
