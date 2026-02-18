"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { FileText, Copy, Check, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQueueContext } from "@/components/providers/QueueProvider";
import { toast } from "sonner";

export function ScriptPanel() {
  const { selectedScript, selectedJobId, markCopied, updateScript } =
    useQueueContext();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when script changes
  useEffect(() => {
    setCopied(false);
    setEditing(false);
  }, [selectedJobId]);

  // Auto-resize textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editing]);

  const handleCopy = useCallback(async () => {
    if (!selectedScript) return;

    try {
      await navigator.clipboard.writeText(selectedScript);
      setCopied(true);
      if (selectedJobId) markCopied(selectedJobId);
      toast.success("Copied!");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [selectedScript, selectedJobId, markCopied]);

  // Keyboard shortcut: Cmd/Ctrl+Shift+C
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "C") {
        e.preventDefault();
        handleCopy();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCopy]);

  // Tab close warning for uncopied scripts
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      try {
        const raw = localStorage.getItem("fr_queue");
        if (raw) {
          const queue = JSON.parse(raw);
          const hasUncopied = queue.some(
            (q: { status: string; copied: boolean }) =>
              q.status === "complete" && !q.copied
          );
          if (hasUncopied) {
            e.preventDefault();
          }
        }
      } catch {
        // Don't block navigation on error
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleToggleEdit = useCallback(() => {
    setEditing((prev) => !prev);
  }, []);

  const handleScriptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateScript(e.target.value);
      // Auto-resize
      e.target.style.height = "auto";
      e.target.style.height = `${e.target.scrollHeight}px`;
    },
    [updateScript]
  );

  if (!selectedScript) {
    return (
      <div className="script-panel min-h-[400px] rounded-xl border border-border p-6 shadow-sm lg:min-h-[600px]">
        <EmptyState
          icon={FileText}
          title="Your screenplay will appear here"
          description="Submit a video URL to generate a professionally formatted script with dialogue, action descriptions, and timestamps."
        />
      </div>
    );
  }

  // Check for confidence flags
  const hasFlags = selectedScript.includes("[check this]");

  return (
    <div className="script-panel relative min-h-[400px] rounded-xl border border-border shadow-sm lg:min-h-[600px]">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-gray-200 bg-[#FAFAFA] px-6 py-3">
        <div className="text-sm font-medium text-gray-600">Screenplay</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-full border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            onClick={handleToggleEdit}
          >
            {editing ? (
              <>
                <Eye className="h-4 w-4" />
                View
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4" />
                Edit
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-full border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-600" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
                <kbd className="ml-1 hidden rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 sm:inline-block">
                  {typeof navigator !== "undefined" &&
                  navigator.platform?.includes("Mac")
                    ? "⌘"
                    : "Ctrl"}
                  +Shift+C
                </kbd>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Confidence flag notice */}
      {hasFlags && !editing && (
        <div className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Some parts of this script are highlighted for review — the AI was not
          fully confident about these sections.
        </div>
      )}

      {/* Script content */}
      <div className="p-6 pt-4 lg:px-8">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={selectedScript}
            onChange={handleScriptChange}
            className="w-full resize-none border-0 bg-transparent p-0 font-mono text-sm leading-relaxed text-[#1A1A2E] outline-none focus:ring-0"
            spellCheck={false}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-[#1A1A2E]">
            {renderScript(selectedScript)}
          </pre>
        )}
      </div>
    </div>
  );
}

function renderScript(script: string): React.ReactNode {
  // Split into lines and apply highlighting for [check this] markers
  const lines = script.split("\n");

  return lines.map((line, i) => {
    if (line.includes("[check this]")) {
      const parts = line.split("[check this]");
      return (
        <span key={i}>
          {parts.map((part, j) => (
            <span key={j}>
              {part}
              {j < parts.length - 1 && (
                <span className="rounded bg-amber-100 px-1 text-amber-700">
                  [check this]
                </span>
              )}
            </span>
          ))}
          {"\n"}
        </span>
      );
    }
    return <span key={i}>{line}{"\n"}</span>;
  });
}
