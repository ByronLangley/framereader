import { config } from "../config";
import { logger } from "../utils/logger";
import {
  getJob,
  getActiveJobCount,
  getQueuedJobs,
  getQueuedJobCount,
  updateJobStatus,
} from "./jobStore";

type ProcessCallback = (jobId: string) => void;

let onProcessJob: ProcessCallback | null = null;

export function setProcessCallback(callback: ProcessCallback): void {
  onProcessJob = callback;
}

export function canEnqueue(): boolean {
  return getQueuedJobCount() + getActiveJobCount() < config.maxQueueSize;
}

export function tryStartNext(): void {
  if (getActiveJobCount() >= config.maxConcurrentJobs) {
    logger.debug(
      `Cannot start next job: ${getActiveJobCount()}/${config.maxConcurrentJobs} active`
    );
    return;
  }

  const queued = getQueuedJobs();
  if (queued.length === 0) {
    logger.debug("No queued jobs to start");
    return;
  }

  const next = queued[0];
  updateJobStatus(next.jobId, "processing");
  logger.info(`Starting job ${next.jobId} from queue`);

  if (onProcessJob) {
    onProcessJob(next.jobId);
  }
}

export function onJobComplete(jobId: string): void {
  logger.info(`Job ${jobId} completed, checking queue for next`);
  tryStartNext();
}

export function cancelJob(jobId: string): boolean {
  const job = getJob(jobId);
  if (!job) return false;

  if (job.status === "queued") {
    updateJobStatus(jobId, "cancelled");
    logger.info(`Job ${jobId} cancelled`);
    return true;
  }

  return false;
}

export function getQueuePosition(jobId: string): number {
  const queued = getQueuedJobs();
  const index = queued.findIndex((j) => j.jobId === jobId);
  return index === -1 ? -1 : index + 1;
}
