import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { logger } from "../utils/logger";
import { ProcessingError } from "../utils/errors";

interface AudioResult {
  audioPath: string;
  hasAudio: boolean;
}

export async function extractAudio(
  jobId: string,
  videoPath: string
): Promise<AudioResult> {
  const audioPath = path.join(config.tempDir, `${jobId}_audio.wav`);

  logger.info(`Extracting audio for job ${jobId} from ${videoPath}`);

  // Check if video has an audio stream
  const hasAudio = await checkForAudioStream(videoPath);
  if (!hasAudio) {
    logger.info(`No audio stream found in ${videoPath}`);
    return { audioPath: "", hasAudio: false };
  }

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .output(audioPath)
      .on("start", (cmd) => {
        logger.debug(`ffmpeg audio extraction command: ${cmd}`);
      })
      .on("end", () => {
        logger.info(`Audio extracted: ${audioPath}`);
        resolve({ audioPath, hasAudio: true });
      })
      .on("error", (err) => {
        logger.error(`Audio extraction failed for job ${jobId}`, { error: err.message });
        // Don't throw — audio failure is non-fatal
        resolve({ audioPath: "", hasAudio: false });
      })
      .run();
  });
}

function checkForAudioStream(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logger.warn(`ffprobe failed: ${err.message}`);
        resolve(false);
        return;
      }
      const hasAudio = metadata.streams.some((s) => s.codec_type === "audio");
      resolve(hasAudio);
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
