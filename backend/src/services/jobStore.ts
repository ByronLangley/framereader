import type { Job, JobStatus, StageStatus, Platform } from "@framereader/shared";
import { JOB_EXPIRY_MS } from "@framereader/shared";
import { logger } from "../utils/logger";
import crypto from "crypto";

const jobs = new Map<string, Job>();

export function createJob(
  platform: Platform,
  videoUrl: string | null,
  filePath: string | null
): Job {
  const jobId = crypto.randomUUID();
  const job: Job = {
    jobId,
    videoUrl,
    filePath,
    platform,
    status: "queued",
    stages: {
      download: filePath ? "skipped" : "pending",
      transcription: "pending",
      visual: "pending",
      assembly: "pending",
    },
    metadata: null,
    transcription: null,
    visualAnalysis: null,
    script: null,
    error: null,
    createdAt: Date.now(),
    completedAt: null,
  };

  jobs.set(jobId, job);
  logger.info(`Job created: ${jobId}`, { platform, videoUrl, filePath: !!filePath });
  return job;
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

export function updateJobStatus(jobId: string, status: JobStatus): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = status;
  if (status === "complete" || status === "error") {
    job.completedAt = Date.now();
  }
  logger.debug(`Job ${jobId} status → ${status}`);
}

export function updateJobStage(
  jobId: string,
  stage: keyof Job["stages"],
  stageStatus: StageStatus
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.stages[stage] = stageStatus;
  logger.debug(`Job ${jobId} stage ${stage} → ${stageStatus}`);
}

export function setJobMetadata(
  jobId: string,
  metadata: NonNullable<Job["metadata"]>
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.metadata = metadata;
}

export function setJobTranscription(
  jobId: string,
  transcription: NonNullable<Job["transcription"]>
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.transcription = transcription;
}

export function setJobVisualAnalysis(
  jobId: string,
  visualAnalysis: NonNullable<Job["visualAnalysis"]>
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.visualAnalysis = visualAnalysis;
}

export function setJobScript(jobId: string, script: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.script = script;
}

export function setJobError(
  jobId: string,
  error: NonNullable<Job["error"]>
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.error = error;
  job.status = "error";
  job.completedAt = Date.now();
}

export function deleteJob(jobId: string): boolean {
  return jobs.delete(jobId);
}

export function getActiveJobs(): Job[] {
  return Array.from(jobs.values()).filter((j) => j.status === "processing");
}

export function getQueuedJobs(): Job[] {
  return Array.from(jobs.values())
    .filter((j) => j.status === "queued")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getActiveJobCount(): number {
  return getActiveJobs().length;
}

export function getQueuedJobCount(): number {
  return getQueuedJobs().length;
}

export function getTotalJobCount(): number {
  return jobs.size;
}

export function cleanExpiredJobs(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [jobId, job] of jobs) {
    if (
      (job.status === "complete" || job.status === "error" || job.status === "cancelled") &&
      now - job.createdAt > JOB_EXPIRY_MS
    ) {
      jobs.delete(jobId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.info(`Cleaned ${cleaned} expired jobs`);
  }
  return cleaned;
}
