function getApiBaseUrl(): string {
  // Use explicitly configured URL if available (set VITE_API_BASE_URL on Vercel for preview envs)
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // For local development
  if (!import.meta.env.PROD) {
    return "http://127.0.0.1:8787";
  }

  return "https://energy-dislocation-engine-production.tj-hillman.workers.dev";
}

export const apiBaseUrl = getApiBaseUrl();
