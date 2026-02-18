import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  assemblyaiApiKey: process.env.ASSEMBLYAI_API_KEY || "",
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || "2", 10),
  maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || "20", 10),
  tempDir: process.env.TEMP_DIR || "./tmp",
};
