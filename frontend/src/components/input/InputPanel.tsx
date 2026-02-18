"use client";

import { useState, useCallback, useRef } from "react";
import { Link, Upload, Youtube, Film, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useQueueContext } from "@/components/providers/QueueProvider";
import { submitUrl, uploadFile } from "@/lib/api";
import { PLATFORM_PATTERNS, SUPPORTED_VIDEO_EXTENSIONS, MAX_FILE_SIZE_BYTES } from "@framereader/shared";
import type { Platform } from "@framereader/shared";

function detectPlatform(url: string): Platform {
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    if (patterns.some((p) => p.test(url))) {
      return platform as Platform;
    }
  }
  return "unknown";
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function PlatformIcon({ platform }: { platform: Platform }) {
  switch (platform) {
    case "youtube":
      return <Youtube className="h-4 w-4 text-red-500" />;
    default:
      return <Film className="h-4 w-4 text-primary" />;
  }
}

export function InputPanel() {
  const { addJob } = useQueueContext();
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const platform = url.trim() ? detectPlatform(url.trim()) : null;
  const urlValid = url.trim() ? isValidUrl(url.trim()) : null;

  const handleSubmitUrl = useCallback(async () => {
    if (!url.trim() || !urlValid) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitUrl(url.trim());
      addJob({
        jobId: result.jobId,
        videoUrl: url.trim(),
        platform: platform || "unknown",
        status: result.status,
        title: null,
        copied: false,
      });
      setUrl("");
      toast.success("Video added to queue");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to submit video URL";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [url, urlValid, platform, addJob]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (
        !SUPPORTED_VIDEO_EXTENSIONS.includes(
          ext as (typeof SUPPORTED_VIDEO_EXTENSIONS)[number]
        )
      ) {
        setError("This file type is not supported. Try MP4, MOV, or WebM.");
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(
          "This file is over 2GB. Try a shorter video or a more compressed format."
        );
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        const result = await uploadFile(file, setUploadProgress);
        addJob({
          jobId: result.jobId,
          videoUrl: null,
          platform: "upload",
          status: result.status,
          title: file.name,
          copied: false,
        });
        setShowUpload(false);
        toast.success("Video uploaded and added to queue");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to upload video";
        setError(message);
        toast.error(message);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [addJob]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        {/* URL Input */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            {platform && platform !== "unknown" ? (
              <PlatformIcon platform={platform} />
            ) : (
              <Link className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <Input
            type="url"
            placeholder="Paste a YouTube, TikTok, Instagram, or Vimeo URL..."
            className="h-12 pl-10 pr-4"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmitUrl();
            }}
            disabled={isSubmitting || isUploading}
          />
        </div>

        {/* Validation error */}
        {url.trim() && urlValid === false && (
          <p className="text-xs text-destructive">
            This doesn&apos;t look like a valid URL
          </p>
        )}

        {/* Platform note for TikTok/Instagram */}
        {platform === "tiktok" && (
          <p className="text-xs text-muted-foreground">
            TikTok URLs sometimes have access issues. Upload fallback available
            if needed.
          </p>
        )}
        {platform === "instagram" && (
          <p className="text-xs text-muted-foreground">
            Instagram URLs sometimes have access issues. Upload fallback
            available if needed.
          </p>
        )}

        {/* Error display */}
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Submit button */}
        <Button
          className="w-full rounded-full"
          disabled={!url.trim() || !urlValid || isSubmitting || isUploading}
          onClick={handleSubmitUrl}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            "Generate Script"
          )}
        </Button>

        {/* Upload section */}
        {!showUpload ? (
          <button
            className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowUpload(true)}
          >
            <Upload className="h-3 w-3" />
            or upload a video file
          </button>
        ) : (
          <div
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop video here or{" "}
              <button
                className="text-primary underline"
                onClick={() => fileInputRef.current?.click()}
              >
                browse
              </button>
            </p>
            <p className="text-xs text-muted-foreground">
              MP4, MOV, WebM, AVI, MKV — max 2GB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            {isUploading && (
              <div className="w-full">
                <Progress value={uploadProgress} className="h-2" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Uploading... {uploadProgress}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* Supported platforms */}
        <p className="text-xs text-muted-foreground">
          Supports YouTube, TikTok, Instagram, Vimeo
        </p>
      </CardContent>
    </Card>
  );
}
