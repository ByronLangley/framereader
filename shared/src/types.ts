// === Job Lifecycle ===

export type Platform = "youtube" | "tiktok" | "instagram" | "vimeo" | "upload" | "unknown";

export type JobStatus = "queued" | "processing" | "complete" | "error" | "cancelled";

export type StageStatus = "pending" | "in_progress" | "complete" | "skipped" | "error";

export interface Job {
  jobId: string;
  videoUrl: string | null;
  filePath: string | null;
  platform: Platform;
  status: JobStatus;
  stages: {
    download: StageStatus;
    transcription: StageStatus;
    visual: StageStatus;
    assembly: StageStatus;
  };
  metadata: {
    title: string | null;
    duration: number | null;
    sourceUrl: string | null;
  } | null;
  transcription: {
    dialogueEntries: DialogueEntry[];
    speakers: string[];
  } | null;
  visualAnalysis: {
    actionEntries: ActionEntry[];
    characters: string[];
    scenes: Scene[];
  } | null;
  script: string | null;
  error: {
    stage: string;
    message: string;
    userMessage: string;
  } | null;
  createdAt: number;
  completedAt: number | null;
}

export interface DialogueEntry {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface ActionEntry {
  timestamp: number;
  action: string;
  characters: string[];
  onScreenText: string | null;
  significantProps: string[] | null;
  cameraNotes: string | null;
  confidence: "high" | "uncertain";
}

export interface Scene {
  sceneNumber: number;
  startTime: number;
  endTime: number;
  heading: string;
  description: string;
}

// === API Request/Response ===

export interface ProcessRequest {
  videoUrl: string;
  platform: Platform;
}

export interface ProcessResponse {
  jobId: string;
  status: JobStatus;
}

export interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  stages: {
    download: StageStatus;
    transcription: StageStatus;
    visual: StageStatus;
    assembly: StageStatus;
  };
  metadata: {
    title: string | null;
    duration: number | null;
    platform: Platform;
  } | null;
  estimatedTimeRemaining: number | null;
}

export interface ScriptResponse {
  jobId: string;
  script: string;
  metadata: {
    title: string | null;
    duration: number | null;
    platform: Platform;
    processedAt: string;
  };
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    userMessage: string;
  };
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  activeJobs: number;
  queuedJobs: number;
}

// === localStorage Types (Frontend) ===

export interface QueueItem {
  jobId: string;
  videoUrl: string | null;
  platform: Platform;
  status: JobStatus;
  title: string | null;
  copied: boolean;
}

export interface StoredSettings {
  theme: "dark" | "light" | "system";
}
