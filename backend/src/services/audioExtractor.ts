import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { logger } from "../utils/logger";
import { ProcessingError } from "../utils/errors";

interface AudioResult {
  audioPath: string;
  hasAudio: boolean;
  extractionError?: string;
}

export async function extractAudio(
  jobId: string,
  videoPath: string
): Promise<AudioResult> {
  const audioPath = path.join(config.tempDir, `${jobId}_audio.wav`);

  logger.info(`Extracting audio for job ${jobId} from ${videoPath}`);

  // Check if video has an audio stream
  const probeResult = await checkForAudioStream(videoPath);
  if (!probeResult.hasAudio) {
    logger.warn(`No audio stream found in ${videoPath} (probe error: ${probeResult.error || "none"})`);
    return { audioPath: "", hasAudio: false, extractionError: probeResult.error };
  }

  logger.info(`Audio stream detected: ${probeResult.codecName}, ${probeResult.sampleRate}Hz`);

  return new Promise((resolve) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .output(audioPath)
      .on("start", (cmd) => {
        logger.info(`ffmpeg audio extraction command: ${cmd}`);
      })
      .on("end", () => {
        const stats = fs.statSync(audioPath);
        logger.info(`Audio extracted: ${audioPath} (${(stats.size / 1024).toFixed(0)} KB)`);
        if (stats.size < 1000) {
          logger.warn(`Audio file suspiciously small (${stats.size} bytes), may be empty`);
        }
        resolve({ audioPath, hasAudio: true });
      })
      .on("error", (err) => {
        logger.error(`Audio extraction FAILED for job ${jobId}: ${err.message}`);
        // Still report hasAudio: true so pipeline knows audio EXISTS but extraction failed
        // This allows the orchestrator to report the error properly
        resolve({ audioPath: "", hasAudio: false, extractionError: err.message });
      })
      .run();
  });
}

interface ProbeResult {
  hasAudio: boolean;
  codecName?: string;
  sampleRate?: number;
  error?: string;
}

function checkForAudioStream(videoPath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logger.warn(`ffprobe failed for ${videoPath}: ${err.message}`);
        resolve({ hasAudio: false, error: err.message });
        return;
      }
      const audioStream = metadata.streams.find((s) => s.codec_type === "audio");
      if (audioStream) {
        resolve({
          hasAudio: true,
          codecName: audioStream.codec_name,
          sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : undefined,
        });
      } else {
        logger.warn(`No audio stream in metadata. Streams: ${metadata.streams.map((s) => s.codec_type).join(", ")}`);
        resolve({ hasAudio: false });
      }
    });
  });
}

export function cleanupAudio(jobId: string): void {
  const audioPath = path.join(config.tempDir, `${jobId}_audio.wav`);
  try {
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      logger.debug(`Cleaned up audio: ${audioPath}`);
    }
  } catch {
    // Non-critical
  }
}
