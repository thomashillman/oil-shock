const FALLBACK_API_BASE_URL = "http://127.0.0.1:8787";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? FALLBACK_API_BASE_URL;
