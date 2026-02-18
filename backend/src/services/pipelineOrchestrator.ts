import fs from "fs";
import {
  getJob,
  updateJobStatus,
  updateJobStage,
  setJobMetadata,
  setJobTranscription,
  setJobVisualAnalysis,
  setJobScript,
  setJobError,
} from "./jobStore";
import { onJobComplete } from "./queueManager";
import { downloadVideo } from "./videoDownloader";
import { extractAudio, cleanupAudio } from "./audioExtractor";
import { sampleFrames, cleanupFrames } from "./frameSampler";
import { transcribeAudio } from "./transcriptionService";
import { analyzeFrames } from "./visionAnalyzer";
import { assembleScript, formatBasicScript } from "./scriptAssembler";
import { logger } from "../utils/logger";
import type { DialogueEntry, ActionEntry, Scene } from "@framereader/shared";

export async function processJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) {
    logger.error(`processJob: job ${jobId} not found`);
    return;
  }

  logger.info(`Starting pipeline for job ${jobId}`);

  try {
    // ========== STAGE 1: Download video ==========
    let videoPath = job.filePath;
    let title = "Untitled";
    let duration = 0;

    if (!videoPath && job.videoUrl) {
      updateJobStage(jobId, "download", "in_progress");
      try {
        const result = await downloadVideo(jobId, job.videoUrl);
        videoPath = result.filePath;
        title = result.title;
        duration = result.duration;
        updateJobStage(jobId, "download", "complete");
      } catch (err) {
        updateJobStage(jobId, "download", "error");
        throw err;
      }
    } else if (videoPath) {
      updateJobStage(jobId, "download", "skipped");
      // Get duration from file via ffprobe if we have a file upload
      try {
        const ffmpeg = await import("fluent-ffmpeg");
        duration = await new Promise<number>((resolve) => {
          ffmpeg.default.ffprobe(videoPath!, (err, metadata) => {
            if (err) resolve(0);
            else resolve(metadata.format.duration || 0);
          });
        });
      } catch {
        duration = 0;
      }
    }

    if (!videoPath) {
      throw new Error("No video path available");
    }

    setJobMetadata(jobId, {
      title,
      duration,
      sourceUrl: job.videoUrl,
    });

    // ========== STAGE 2: Extract audio + sample frames ==========
    updateJobStage(jobId, "transcription", "in_progress");
    updateJobStage(jobId, "visual", "in_progress");

    const [audioResult, frames] = await Promise.all([
      extractAudio(jobId, videoPath),
      sampleFrames(jobId, videoPath, duration),
    ]);

    // Delete video file immediately (per PRD)
    try {
      fs.unlinkSync(videoPath);
      logger.debug(`Deleted video file: ${videoPath}`);
    } catch {
      // Non-critical
    }

    // ========== STAGE 3: Transcribe + Analyze visuals (in parallel) ==========
    let dialogueEntries: DialogueEntry[] = [];
    let speakers: string[] = [];
    let actionEntries: ActionEntry[] = [];
    let characters: string[] = [];
    let scenes: Scene[] = [];
    let transcriptionFailed = false;
    let visualFailed = false;

    const transcriptionPromise = audioResult.hasAudio
      ? transcribeAudio(jobId, audioResult.audioPath)
          .then((result) => {
            dialogueEntries = result.dialogueEntries;
            speakers = result.speakers;
            updateJobStage(jobId, "transcription", "complete");
            cleanupAudio(jobId);
          })
          .catch((err) => {
            logger.error(`Transcription failed for job ${jobId}`, { error: err });
            transcriptionFailed = true;
            updateJobStage(jobId, "transcription", "error");
            cleanupAudio(jobId);
          })
      : Promise.resolve().then(() => {
          updateJobStage(jobId, "transcription", "skipped");
        });

    const visualPromise = frames.length > 0
      ? analyzeFrames(jobId, frames, title, duration)
          .then((result) => {
            actionEntries = result.actionEntries;
            characters = result.characters;
            scenes = result.scenes;
            updateJobStage(jobId, "visual", "complete");
            cleanupFrames(jobId);
          })
          .catch((err) => {
            logger.error(`Visual analysis failed for job ${jobId}`, { error: err });
            visualFailed = true;
            updateJobStage(jobId, "visual", "error");
            cleanupFrames(jobId);
          })
      : Promise.resolve().then(() => {
          updateJobStage(jobId, "visual", "skipped");
        });

    await Promise.all([transcriptionPromise, visualPromise]);

    // Check if we have anything to work with
    if (transcriptionFailed && visualFailed) {
      throw new Error("Both transcription and visual analysis failed");
    }

    setJobTranscription(jobId, { dialogueEntries, speakers });
    setJobVisualAnalysis(jobId, { actionEntries, characters, scenes });

    // ========== STAGE 4: Assemble script ==========
    updateJobStage(jobId, "assembly", "in_progress");

    let script: string;
    try {
      script = await assembleScript(jobId, {
        title,
        duration,
        sourceUrl: job.videoUrl || "File upload",
        platform: job.platform,
        dialogueEntries,
        actionEntries,
        speakers,
        characters,
        scenes,
        transcriptionFailed,
        visualFailed,
      });
    } catch (err) {
      logger.warn(`Script assembly via Claude failed, using basic formatter`, { error: err });
      script = formatBasicScript({
        title,
        duration,
        sourceUrl: job.videoUrl || "File upload",
        platform: job.platform,
        dialogueEntries,
        actionEntries,
        transcriptionFailed,
        visualFailed,
      });
    }

    setJobScript(jobId, script);
    updateJobStage(jobId, "assembly", "complete");
    updateJobStatus(jobId, "complete");

    logger.info(`Pipeline complete for job ${jobId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Pipeline failed for job ${jobId}: ${message}`);

    setJobError(jobId, {
      stage: "pipeline",
      message,
      userMessage: "Something went wrong while analyzing this video.",
    });

    // Cleanup any remaining temp files
    cleanupAudio(jobId);
    cleanupFrames(jobId);
  } finally {
    onJobComplete(jobId);
  }
}
