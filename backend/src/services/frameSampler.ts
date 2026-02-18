import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { logger } from "../utils/logger";
import {
  MAX_FRAMES,
  SCENE_DETECTION_THRESHOLD,
  FRAME_RESOLUTION,
  FRAME_QUALITY,
} from "@framereader/shared";

export interface FrameInfo {
  framePath: string;
  timestamp: number; // seconds
}

export async function sampleFrames(
  jobId: string,
  videoPath: string,
  duration: number
): Promise<FrameInfo[]> {
  const framesDir = path.join(config.tempDir, `${jobId}_frames`);
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

  logger.info(`Sampling frames for job ${jobId} (duration: ${duration}s)`);

  let frames: FrameInfo[];

  if (duration <= 30) {
    // Short videos: sample every 2 seconds
    frames = await sampleAtIntervals(jobId, videoPath, framesDir, 2, duration);
  } else {
    // Try scene detection first
    frames = await sampleBySceneDetection(jobId, videoPath, framesDir, duration);

    // Fallback: if too few frames, use interval sampling
    if (frames.length < 5) {
      logger.info(`Scene detection yielded only ${frames.length} frames, adding interval samples`);
      const intervalFrames = await sampleAtIntervals(
        jobId,
        videoPath,
        framesDir,
        10,
        duration
      );
      // Merge, removing duplicates within 2s
      frames = mergeFrames(frames, intervalFrames);
    }
  }

  // Cap at MAX_FRAMES
  if (frames.length > MAX_FRAMES) {
    const step = Math.ceil(frames.length / MAX_FRAMES);
    frames = frames.filter((_, i) => i % step === 0).slice(0, MAX_FRAMES);
  }

  logger.info(`Sampled ${frames.length} frames for job ${jobId}`);
  return frames;
}

async function sampleBySceneDetection(
  jobId: string,
  videoPath: string,
  framesDir: string,
  duration: number
): Promise<FrameInfo[]> {
  // Step 1: Detect scene change timestamps
  const timestamps = await detectSceneChanges(videoPath);
  logger.debug(`Scene detection found ${timestamps.length} changes`);

  // If too many, subsample
  let selectedTimestamps = timestamps;
  if (selectedTimestamps.length > MAX_FRAMES) {
    const step = Math.ceil(selectedTimestamps.length / MAX_FRAMES);
    selectedTimestamps = selectedTimestamps.filter((_, i) => i % step === 0);
  }

  // Step 2: Extract frames at those timestamps
  const frames: FrameInfo[] = [];
  for (let i = 0; i < selectedTimestamps.length; i++) {
    const ts = selectedTimestamps[i];
    const framePath = path.join(framesDir, `frame_${String(i).padStart(4, "0")}.jpg`);

    try {
      await extractFrameAt(videoPath, ts, framePath);
      frames.push({ framePath, timestamp: ts });
    } catch (err) {
      logger.warn(`Failed to extract frame at ${ts}s`, { error: err });
    }
  }

  return frames;
}

function detectSceneChanges(videoPath: string): Promise<number[]> {
  return new Promise((resolve) => {
    const timestamps: number[] = [];
    let output = "";

    ffmpeg(videoPath)
      .videoFilter(`select='gt(scene,${SCENE_DETECTION_THRESHOLD})',showinfo`)
      .outputOptions(["-vsync", "vfr"])
      .format("null")
      .output("-")
      .on("stderr", (line: string) => {
        output += line + "\n";
        // Parse showinfo output for pts_time
        const match = line.match(/pts_time:(\d+\.?\d*)/);
        if (match) {
          timestamps.push(parseFloat(match[1]));
        }
      })
      .on("end", () => {
        resolve(timestamps);
      })
      .on("error", () => {
        resolve(timestamps); // Return whatever we got
      })
      .run();
  });
}

async function sampleAtIntervals(
  jobId: string,
  videoPath: string,
  framesDir: string,
  intervalSeconds: number,
  duration: number
): Promise<FrameInfo[]> {
  const frames: FrameInfo[] = [];
  const count = Math.min(Math.floor(duration / intervalSeconds), MAX_FRAMES);

  for (let i = 0; i < count; i++) {
    const ts = i * intervalSeconds;
    const framePath = path.join(
      framesDir,
      `frame_interval_${String(i).padStart(4, "0")}.jpg`
    );

    try {
      await extractFrameAt(videoPath, ts, framePath);
      frames.push({ framePath, timestamp: ts });
    } catch (err) {
      logger.warn(`Failed to extract interval frame at ${ts}s`, { error: err });
    }
  }

  return frames;
}

function extractFrameAt(
  videoPath: string,
  timestamp: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .videoFilter(`scale=-1:${FRAME_RESOLUTION}`)
      .outputOptions([`-q:v`, String(Math.round((100 - FRAME_QUALITY) / 3.33))])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

function mergeFrames(
  sceneFrames: FrameInfo[],
  intervalFrames: FrameInfo[]
): FrameInfo[] {
  const merged = [...sceneFrames];

  for (const frame of intervalFrames) {
    const tooClose = merged.some(
      (existing) => Math.abs(existing.timestamp - frame.timestamp) < 2
    );
    if (!tooClose) {
      merged.push(frame);
    }
  }

  return merged.sort((a, b) => a.timestamp - b.timestamp);
}

export function cleanupFrames(jobId: string): void {
  const framesDir = path.join(config.tempDir, `${jobId}_frames`);
  try {
    if (fs.existsSync(framesDir)) {
      const files = fs.readdirSync(framesDir);
      for (const file of files) {
        fs.unlinkSync(path.join(framesDir, file));
      }
      fs.rmdirSync(framesDir);
      logger.debug(`Cleaned up frames: ${framesDir}`);
    }
  } catch {
    // Non-critical
  }
}
