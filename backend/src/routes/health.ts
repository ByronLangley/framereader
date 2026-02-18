import { Router } from "express";
import { getActiveJobCount, getQueuedJobCount } from "../services/jobStore";

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
