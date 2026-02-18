import type {
  ProcessResponse,
  JobStatusResponse,
  ScriptResponse,
  HealthResponse,
  ErrorResponse,
} from "@framereader/shared";
import { API_ENDPOINTS } from "@framereader/shared";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public userMessage: string
  ) {
    super(userMessage);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorData: ErrorResponse | null = null;
    try {
      errorData = await res.json();
    } catch {
      // Response may not be JSON
    }

    throw new ApiError(
      res.status,
      errorData?.error?.code || "UNKNOWN",
      errorData?.error?.userMessage || `Request failed (${res.status})`
    );
  }

  return res.json();
}

export async function submitUrl(videoUrl: string): Promise<ProcessResponse> {
  return request<ProcessResponse>(API_ENDPOINTS.PROCESS, {
    method: "POST",
    body: JSON.stringify({ videoUrl }),
  });
}

export async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<ProcessResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("video", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(
            new ApiError(
              xhr.status,
              err?.error?.code || "UNKNOWN",
              err?.error?.userMessage || `Upload failed (${xhr.status})`
            )
          );
        } catch {
          reject(new ApiError(xhr.status, "UNKNOWN", `Upload failed (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new ApiError(0, "NETWORK_ERROR", "Could not connect to server. Check your connection and try again."));
    });

    xhr.open("POST", `${BASE_URL}${API_ENDPOINTS.UPLOAD}`);
    xhr.send(formData);
  });
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`${API_ENDPOINTS.STATUS}/${jobId}`);
}

export async function getScript(jobId: string): Promise<ScriptResponse> {
  return request<ScriptResponse>(`${API_ENDPOINTS.SCRIPT}/${jobId}`);
}

export async function cancelJob(jobId: string): Promise<void> {
  await request(`${API_ENDPOINTS.JOB}/${jobId}`, { method: "DELETE" });
}

export async function healthCheck(): Promise<HealthResponse> {
  return request<HealthResponse>(API_ENDPOINTS.HEALTH);
}

export { ApiError };
