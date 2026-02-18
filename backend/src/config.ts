import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

// Write YouTube cookies from env var to file on startup
const COOKIES_PATH = path.join(process.env.TEMP_DIR || "./tmp", "youtube_cookies.txt");
if (process.env.YOUTUBE_COOKIES_BASE64) {
  try {
    const dir = path.dirname(COOKIES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(COOKIES_PATH, Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, "base64").toString("utf-8"));
    console.log(`YouTube cookies written to ${COOKIES_PATH}`);
  } catch (err) {
    console.error(`Failed to write YouTube cookies: ${err}`);
  }
}

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  assemblyaiApiKey: process.env.ASSEMBLYAI_API_KEY || "",
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || "2", 10),
  maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || "20", 10),
  tempDir: process.env.TEMP_DIR || "./tmp",
  youtubeCookiesPath: fs.existsSync(COOKIES_PATH) ? COOKIES_PATH : null,
};
