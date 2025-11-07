import { getApiUrl } from "./api";

// Get JWT token from localStorage
function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

/**
 * Upload a file with proper authentication (JWT + session cookie)
 * Works on both desktop and mobile
 */
export async function uploadFile(
  file: File,
  albumId?: string
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  
  if (albumId) {
    formData.append('albumId', albumId);
  }

  const token = getToken();
  const headers: Record<string, string> = {};
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(getApiUrl('/api/upload'), {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include', // Include session cookie for backward compatibility
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorText}`);
  }

  return response.json();
}
