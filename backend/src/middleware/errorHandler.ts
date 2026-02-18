import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn(`${err.name}: ${err.message}`, {
      code: err.code,
      statusCode: err.statusCode,
    });
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        userMessage: err.userMessage,
      },
    });
    return;
  }

  logger.error("Unhandled error", {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      userMessage: "Something went wrong. Please try again.",
    },
  });
}
