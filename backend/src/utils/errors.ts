export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public userMessage: string,
    message?: string
  ) {
    super(message || userMessage);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(userMessage: string, message?: string) {
    super(400, "VALIDATION_ERROR", userMessage, message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(userMessage: string, message?: string) {
    super(404, "NOT_FOUND", userMessage, message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(userMessage: string, message?: string) {
    super(409, "CONFLICT", userMessage, message);
    this.name = "ConflictError";
  }
}

export class QueueFullError extends AppError {
  constructor() {
    super(
      503,
      "QUEUE_FULL",
      "Queue is full (20 videos max). Wait for some to finish before adding more."
    );
    this.name = "QueueFullError";
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(
      429,
      "RATE_LIMITED",
      "You've submitted a lot of videos recently. Please wait a few minutes before submitting more."
    );
    this.name = "RateLimitError";
  }
}

export class ProcessingError extends AppError {
  constructor(stage: string, userMessage: string, message?: string) {
    super(500, `PROCESSING_ERROR_${stage.toUpperCase()}`, userMessage, message);
    this.name = "ProcessingError";
  }
}
