"use client";

import { Film } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Film className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold tracking-tight">FrameReader</span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
