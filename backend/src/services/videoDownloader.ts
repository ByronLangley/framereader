import YTDlpWrap from "yt-dlp-wrap";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { logger } from "../utils/logger";
import { ProcessingError } from "../utils/errors";
import { DOWNLOAD_TIMEOUT_MS } from "@framereader/shared";

interface DownloadResult {
  filePath: string;
  title: string;
  duration: number; // seconds
}

export async function downloadVideo(
  jobId: string,
  videoUrl: string
): Promise<DownloadResult> {
  const tmpDir = config.tempDir;
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const outputTemplate = path.join(tmpDir, `${jobId}_video.%(ext)s`);
  const ytDlp = new YTDlpWrap();

  logger.info(`Downloading video for job ${jobId}: ${videoUrl}`);

  // First, get metadata
  let metadata: { title: string; duration: number };
  try {
    const info = await ytDlp.getVideoInfo(videoUrl);
    metadata = {
      title: info.title || "Untitled",
      duration: info.duration || 0,
    };
    logger.info(`Video metadata: "${metadata.title}" (${metadata.duration}s)`);
  } catch (err) {
    logger.warn(`Could not fetch metadata for ${videoUrl}, continuing with download`, { error: err });
    metadata = { title: "Untitled", duration: 0 };
  }

  // Download video
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Download timed out"));
      }, DOWNLOAD_TIMEOUT_MS);

      const process = ytDlp.exec([
        videoUrl,
        "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]",
        "--merge-output-format", "mp4",
        "-o", outputTemplate,
        "--no-playlist",
        "--no-warnings",
      ]);

      let errorOutput = "";

      process.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      process.on("ytDlpEvent", (type: string, data: string) => {
        if (type === "error") {
          errorOutput += data;
        }
      });

      process.on("close", (code: number | null) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${errorOutput}`));
        }
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("timed out")) {
      throw new ProcessingError(
        "download",
        "Download timed out. Try again or upload the file directly.",
        message
      );
    }

    if (message.includes("Private") || message.includes("restricted")) {
      throw new ProcessingError(
        "download",
        "This video appears to be private or restricted. Try uploading the file directly.",
        message
      );
    }

    throw new ProcessingError(
      "download",
      "We couldn't access this video. This sometimes happens. Try uploading the file instead.",
      message
    );
  }

  // Find the downloaded file
  const files = fs.readdirSync(tmpDir);
  const videoFile = files.find(
    (f) => f.startsWith(`${jobId}_video`) && !f.endsWith(".part")
  );

  if (!videoFile) {
    throw new ProcessingError(
      "download",
      "Download appeared to succeed but no file was found. Try again.",
      "No video file found after download"
    );
  }

  const filePath = path.join(tmpDir, videoFile);
  logger.info(`Video downloaded: ${filePath}`);

  return {
    filePath,
    title: metadata.title,
    duration: metadata.duration,
  };
}
