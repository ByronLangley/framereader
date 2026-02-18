// Processing limits
export const MAX_CONCURRENT_JOBS = 2;
export const MAX_QUEUE_SIZE = 20;

// Timeouts & intervals
export const JOB_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
export const TEMP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const DOWNLOAD_TIMEOUT_MS = 120 * 1000; // 2 minutes
export const TRANSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const VISION_BATCH_TIMEOUT_MS = 60 * 1000; // 1 minute per batch
export const ASSEMBLY_TIMEOUT_MS = 60 * 1000; // 1 minute

// Video constraints
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
export const MAX_VIDEO_DURATION_MIN = 60;
export const WARN_DURATION_MIN = 15;

// Frame sampling
export const MAX_FRAMES = 40;
export const SCENE_DETECTION_THRESHOLD = 0.3;
export const VISION_BATCH_SIZE = 6;
export const FRAME_QUALITY = 80;
export const FRAME_RESOLUTION = 720;

// Polling
export const POLLING_INTERVAL_MS = 3000;
export const POLLING_SLOW_MS = 5000;
export const POLLING_FAST_MS = 2000;
export const POLLING_SLOWDOWN_AFTER_MS = 30 * 1000; // 30 seconds

// Rate limiting
export const PROCESS_RATE_LIMIT = 20; // per hour per IP
export const STATUS_RATE_LIMIT = 60; // per minute per IP

// localStorage keys
export const LOCALSTORAGE_KEYS = {
  QUEUE: "fr_queue",
  SCRIPT_PREFIX: "fr_script_",
  SETTINGS: "fr_settings",
} as const;

// API endpoints
export const API_ENDPOINTS = {
  PROCESS: "/api/process",
  UPLOAD: "/api/upload",
  STATUS: "/api/status",
  SCRIPT: "/api/script",
  JOB: "/api/job",
  HEALTH: "/api/health",
} as const;

// Supported video file extensions
export const SUPPORTED_VIDEO_EXTENSIONS = [
  ".mp4", ".mov", ".webm", ".avi", ".mkv", ".flv", ".m4v", ".wmv", ".3gp",
] as const;

// Supported platforms with URL patterns
export const PLATFORM_PATTERNS = {
  youtube: [/youtube\.com\/watch/, /youtu\.be\//, /youtube\.com\/shorts\//],
  tiktok: [/tiktok\.com\//, /vm\.tiktok\.com\//],
  instagram: [/instagram\.com\/reel\//, /instagram\.com\/p\//],
  vimeo: [/vimeo\.com\//],
} as const;
