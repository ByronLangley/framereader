import express from "express";
import cors from "cors";
import { config } from "./config";
import { logger } from "./utils/logger";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { processRouter } from "./routes/process";
import { uploadRouter } from "./routes/upload";
import { statusRouter } from "./routes/status";
import { scriptRouter } from "./routes/script";
import { jobRouter } from "./routes/job";
import { startCleanupInterval } from "./services/cleanup";
import { getActiveJobCount, getQueuedJobCount } from "./services/jobStore";
import { setProcessCallback } from "./services/queueManager";
import { processJob } from "./services/pipelineOrchestrator";

const app = express();

// Middleware
app.use(
  cors({
    origin: config.frontendUrl,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);

// Routes
app.use("/api/health", healthRouter);
app.use("/api/process", processRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/status", statusRouter);
app.use("/api/script", scriptRouter);
app.use("/api/job", jobRouter);

// Error handler (must be last)
app.use(errorHandler);

// Connect pipeline to queue
setProcessCallback((jobId) => {
  processJob(jobId).catch((err) => {
    logger.error(`Unhandled pipeline error for job ${jobId}`, { error: err });
  });
});

// Start cleanup interval
startCleanupInterval();

// Update health route with live counts
app.locals.getActiveJobCount = getActiveJobCount;
app.locals.getQueuedJobCount = getQueuedJobCount;

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  process.exit(0);
});

app.listen(config.port, () => {
  logger.info(`FrameReader backend running on port ${config.port}`);
  logger.info(`CORS origin: ${config.frontendUrl}`);
});

export default app;
