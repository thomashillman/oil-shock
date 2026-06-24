function getApiBaseUrl(): string {
  // Use explicitly configured URL when available
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // Keep local fallback in non-production builds
  if (!import.meta.env.PROD) {
    return "http://127.0.0.1:8787";
  }

  throw new Error(
    "Missing VITE_API_BASE_URL in production build. Set it for preview and production deployments.",
  );
}

export const apiBaseUrl = getApiBaseUrl();
