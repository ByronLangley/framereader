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

// yt-dlp args that help bypass YouTube bot detection on datacenter IPs
const YT_BYPASS_ARGS = [
  "--extractor-args", "youtube:player_client=web_creator",
  "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "--geo-bypass",
];

function getCookieArgs(): string[] {
  if (config.youtubeCookiesPath) {
    logger.info(`Using cookies file: ${config.youtubeCookiesPath}`);
    return ["--cookies", config.youtubeCookiesPath];
  }
  logger.warn("No YouTube cookies configured — downloads from datacenter IPs may be blocked by YouTube");
  return [];
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
  const cookieArgs = getCookieArgs();

  logger.info(`Downloading video for job ${jobId}: ${videoUrl}`);

  // First, get metadata
  let metadata: { title: string; duration: number };
  try {
    const info = await ytDlp.getVideoInfo([videoUrl, ...YT_BYPASS_ARGS, ...cookieArgs]);
    metadata = {
      title: info.title || "Untitled",
      duration: info.duration || 0,
    };
    logger.info(`Video metadata: "${metadata.title}" (${metadata.duration}s)`);
  } catch (err) {
    logger.warn(`Could not fetch metadata for ${videoUrl}, continuing with download`, { error: err });
    metadata = { title: "Untitled", duration: 0 };
  }

  // Format string with generous fallbacks — some player clients don't offer separate streams
  const FORMAT = "bestvideo[height<=720]+bestaudio/best[height<=720]/bestvideo+bestaudio/best";

  // Try download with different strategies
  const strategies = [
    {
      name: "web_creator client",
      args: [
        videoUrl,
        "-f", FORMAT,
        "--merge-output-format", "mp4",
        "-o", outputTemplate,
        "--no-playlist",
        ...YT_BYPASS_ARGS,
        ...cookieArgs,
      ],
    },
    {
      name: "mediaconnect client",
      args: [
        videoUrl,
        "-f", FORMAT,
        "--merge-output-format", "mp4",
        "-o", outputTemplate,
        "--no-playlist",
        "--extractor-args", "youtube:player_client=mediaconnect",
        "--geo-bypass",
        ...cookieArgs,
      ],
    },
    {
      name: "default client",
      args: [
        videoUrl,
        "-f", FORMAT,
        "--merge-output-format", "mp4",
        "-o", outputTemplate,
        "--no-playlist",
        "--geo-bypass",
        ...cookieArgs,
      ],
    },
  ];

  let lastError = "";

  for (const strategy of strategies) {
    logger.info(`Trying download strategy: ${strategy.name}`);

    // Clean up any partial files from previous attempt
    cleanupPartialFiles(tmpDir, jobId);

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Download timed out"));
        }, DOWNLOAD_TIMEOUT_MS);

        const process = ytDlp.exec(strategy.args);

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

      // If we get here, download succeeded
      logger.info(`Download succeeded with strategy: ${strategy.name}`);
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
      logger.warn(`Download strategy "${strategy.name}" failed: ${message}`);

      if (message.includes("timed out")) {
        // Don't retry on timeout
        break;
      }

      // Continue to next strategy
    }
  }

  // Find the downloaded file
  const files = fs.readdirSync(tmpDir);
  const videoFile = files.find(
    (f) => f.startsWith(`${jobId}_video`) && !f.endsWith(".part")
  );

  if (!videoFile) {
    if (lastError.includes("timed out")) {
      throw new ProcessingError(
        "download",
        "Download timed out. Try again or upload the file directly.",
        lastError
      );
    }

    if (lastError.includes("Private") || lastError.includes("restricted")) {
      throw new ProcessingError(
        "download",
        "This video appears to be private or restricted. Try uploading the file directly.",
        lastError
      );
    }

    if (lastError.includes("bot") || lastError.includes("Sign in")) {
      throw new ProcessingError(
        "download",
        "YouTube is blocking this download from our server. Please upload the video file directly instead.",
        lastError
      );
    }

    throw new ProcessingError(
      "download",
      "We couldn't download this video. Try uploading the file directly instead.",
      lastError
    );
  }

  const filePath = path.join(tmpDir, videoFile);
  const stats = fs.statSync(filePath);
  logger.info(`Video downloaded: ${filePath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  return {
    filePath,
    title: metadata.title,
    duration: metadata.duration,
  };
}

function cleanupPartialFiles(tmpDir: string, jobId: string): void {
  try {
    const files = fs.readdirSync(tmpDir);
    for (const f of files) {
      if (f.startsWith(`${jobId}_video`)) {
        fs.unlinkSync(path.join(tmpDir, f));
      }
    }
  } catch {
    // Non-critical
  }
}
