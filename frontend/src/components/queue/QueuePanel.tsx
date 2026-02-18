"use client";

import { useState } from "react";
import {
  ListVideo,
  Clock,
  Loader2,
  CheckCircle,
  ClipboardCheck,
  AlertTriangle,
  X,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useQueueContext } from "@/components/providers/QueueProvider";
import { cancelJob } from "@/lib/api";
import { toast } from "sonner";
import type { QueueItem, JobStatus } from "@framereader/shared";

function StatusIcon({ status, copied }: { status: JobStatus; copied: boolean }) {
  switch (status) {
    case "queued":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "processing":
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "complete":
      return copied ? (
        <ClipboardCheck className="h-4 w-4 text-success/60" />
      ) : (
        <CheckCircle className="h-4 w-4 text-success" />
      );
    case "error":
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case "cancelled":
      return <X className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusLabel(status: JobStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Processing...";
    case "complete":
      return "Complete";
    case "error":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function borderColor(status: JobStatus, copied: boolean): string {
  switch (status) {
    case "processing":
      return "border-l-primary";
    case "complete":
      return copied ? "border-l-success/40" : "border-l-success";
    case "error":
      return "border-l-destructive";
    default:
      return "border-l-transparent";
  }
}

export function QueuePanel() {
  const { items, selectedJobId, removeJob, clearCompleted, selectJob } =
    useQueueContext();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const completedCount = items.filter(
    (q) => q.status === "complete" || q.status === "error" || q.status === "cancelled"
  ).length;

  const handleCancel = async (jobId: string) => {
    try {
      await cancelJob(jobId);
      removeJob(jobId);
      toast.success("Job cancelled");
    } catch {
      toast.error("Could not cancel this job");
    }
  };

  return (
    <>
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ListVideo className="h-4 w-4" />
              Queue
              {items.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {items.length}
                </Badge>
              )}
            </CardTitle>
            {completedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setClearDialogOpen(true)}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Clear done
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState
              icon={ListVideo}
              title="No videos yet"
              description="Paste a URL above to generate your first script."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <QueueItemCard
                  key={item.jobId}
                  item={item}
                  isSelected={item.jobId === selectedJobId}
                  onSelect={() => {
                    if (item.status === "complete") selectJob(item.jobId);
                  }}
                  onCancel={() => handleCancel(item.jobId)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="Clear completed scripts?"
        description="Make sure you've copied everything you need. This cannot be undone."
        confirmText="Clear"
        variant="destructive"
        onConfirm={clearCompleted}
      />
    </>
  );
}

function QueueItemCard({
  item,
  isSelected,
  onSelect,
  onCancel,
}: {
  item: QueueItem;
  isSelected: boolean;
  onSelect: () => void;
  onCancel: () => void;
}) {
  const isClickable = item.status === "complete";

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border-l-4 bg-card p-3 transition-colors ${borderColor(item.status, item.copied)} ${isClickable ? "cursor-pointer hover:bg-accent" : ""} ${isSelected ? "ring-1 ring-primary" : ""}`}
      onClick={isClickable ? onSelect : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <StatusIcon status={item.status} copied={item.copied} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.title || item.videoUrl || "Untitled video"}
        </p>
        <p className="text-xs text-muted-foreground">{statusLabel(item.status)}</p>
      </div>
      {item.status === "queued" && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          aria-label="Cancel job"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
