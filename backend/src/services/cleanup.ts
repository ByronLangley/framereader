import fs from "fs";
import path from "path";
import { TEMP_CLEANUP_INTERVAL_MS, JOB_EXPIRY_MS } from "@framereader/shared";
import { config } from "../config";
import { cleanExpiredJobs } from "./jobStore";
import { logger } from "../utils/logger";

function cleanTempFiles(): void {
  const tmpDir = config.tempDir;

  if (!fs.existsSync(tmpDir)) return;

  const now = Date.now();
  let cleaned = 0;

  try {
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      const filePath = path.join(tmpDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > JOB_EXPIRY_MS) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {
        // File may have been deleted by another process
      }
    }
  } catch {
    // tmpDir may not exist yet
  }

  if (cleaned > 0) {
    logger.info(`Cleaned ${cleaned} temp files`);
  }
}

export function startCleanupInterval(): NodeJS.Timeout {
  return setInterval(() => {
    cleanExpiredJobs();
    cleanTempFiles();
  }, TEMP_CLEANUP_INTERVAL_MS);
}
