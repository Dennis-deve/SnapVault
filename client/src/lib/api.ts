/**
 * API Configuration
 * Handles API URL based on environment
 */

// Get API URL from environment variable or default to same origin
export const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Build full API URL
 * @param path - API path (e.g., '/api/albums')
 * @returns Full URL to API endpoint
 */
export function getApiUrl(path: string): string {
  // If path already starts with http, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // If API_URL is set, prepend it
  if (API_URL) {
    // Remove trailing slash from API_URL and leading slash from path
    const baseUrl = API_URL.replace(/\/$/, '');
    const apiPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${apiPath}`;
  }
  
  // Default: same origin (for monolithic deployment)
  return path;
}
