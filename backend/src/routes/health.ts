import { Router } from "express";
import { execSync } from "child_process";
import { getActiveJobCount, getQueuedJobCount } from "../services/jobStore";
import { config } from "../config";

const startTime = Date.now();

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    activeJobs: getActiveJobCount(),
    queuedJobs: getQueuedJobCount(),
  });
});

healthRouter.get("/diag", (_req, res) => {
  const check = (cmd: string): string => {
    try {
      return execSync(cmd, { timeout: 5000 }).toString().trim();
    } catch (err) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  res.json({
    ytdlp: check("yt-dlp --version"),
    ffmpeg: check("ffmpeg -version 2>&1 | head -1"),
    ffprobe: check("ffprobe -version 2>&1 | head -1"),
    tmpDir: check("ls -la /app/backend/tmp/ 2>&1 | head -10"),
    nodeVersion: process.version,
    platform: process.platform,
    apiKeys: {
      anthropic: config.anthropicApiKey ? `set (${config.anthropicApiKey.length} chars)` : "MISSING",
      assemblyai: config.assemblyaiApiKey ? `set (${config.assemblyaiApiKey.length} chars)` : "MISSING",
      youtubeCookies: config.youtubeCookiesPath ? "set" : "not configured",
    },
  });
});
