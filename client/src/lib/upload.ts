import { getApiUrl } from "./api";

/**
 * Compress and resize image before upload for faster mobile uploads
 * Skips compression for files > 100MB
 * Handles HEIC/HEIF photos from iPhone and includes device fallback timeouts
 */
async function compressImage(file: File): Promise<File> {
  // Check if file is HEIC/HEIF photo from iPhone camera roll
  const filename = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();
  const isHeic = filename.endsWith('.heic') || filename.endsWith('.heif') || fileType.includes('heic') || fileType.includes('heif');

  // Skip non-images, HEIC images (browser canvas can't decode HEIC natively), small files or very large files
  if (!fileType.startsWith('image/') || isHeic || file.size < 500 * 1024 || file.size > 100 * 1024 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    // 3-second safety fallback timeout for mobile devices (e.g. iPhone 7 Plus)
    const timeoutTimer = setTimeout(() => {
      resolve(file);
    }, 3000);

    const reader = new FileReader();
    
    reader.onerror = () => {
      clearTimeout(timeoutTimer);
      resolve(file);
    };

    reader.onload = (e) => {
      const img = new Image();
      
      img.onerror = () => {
        clearTimeout(timeoutTimer);
        resolve(file);
      };

      img.onload = () => {
        clearTimeout(timeoutTimer);
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Preserve Ultra HD / 4K resolution up to 3840px
          const maxSize = 3840;
          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(file);

          ctx.drawImage(img, 0, 0, width, height);

          // Retain 98% Ultra HD quality
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            0.98
          );
        } catch {
          resolve(file);
        }
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Turn a failed upload response into a message a human can act on. The
 * server's JSON `message` is the source of truth when it's present; the
 * status-code mappings below add context for the codes that historically
 * meant very different things but were all shown as a bare "403 Forbidden".
 */
function describeUploadError(status: number, bodyText: string): string {
  let serverMessage = "";
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed.message === "string" && parsed.message) {
      serverMessage = parsed.message;
    }
  } catch {
    // Non-JSON body (e.g. an HTML error page from a proxy) — fall through.
  }

  const fallback = `Upload failed (error code ${status})`;
  if (status === 401) {
    return "Your session expired. Please log in again and try the upload.";
  }
  if (status === 403) {
    // Distinguish the two real 403s so the user knows which one hit.
    if (serverMessage.includes("albums you own")) {
      return "This album belongs to a different account. Log out, log back in, and make sure you're uploading to an album from THIS account.";
    }
    return serverMessage || "You aren't allowed to upload to this album.";
  }
  if (status === 404) {
    return serverMessage || "That album no longer exists (it may have been deleted). Go back to your albums and pick a different one.";
  }
  if (status === 413) {
    return "That file is too large to upload.";
  }
  if (status === 502) {
    // Cloudinary (the storage backend) rejected it — surface its reason.
    return serverMessage || "The photo/video storage is temporarily unavailable. Please try again in a moment.";
  }
  if (status >= 500) {
    return serverMessage || "The server hit a problem while uploading. Please try again.";
  }
  return serverMessage || fallback;
}

/**
 * Upload a file with proper authentication (Bearer Token & session cookie)
 * Works reliably on all desktop & mobile browsers (including iPhone 7 Plus)
 */
export async function uploadFile(
  file: File,
  albumId?: string,
  onProgress?: (percent: number) => void
): Promise<any> {
  const fileToUpload = await compressImage(file);
  
  const formData = new FormData();
  formData.append('file', fileToUpload);
  
  if (albumId) {
    formData.append('albumId', albumId);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve(xhr.responseText);
        }
      } else {
        reject(new Error(describeUploadError(xhr.status, xhr.responseText)));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'));
    });

    xhr.open('POST', getApiUrl('/api/upload'));

    const token = localStorage.getItem("auth_token");
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.withCredentials = true;
    xhr.send(formData);
  });
}
