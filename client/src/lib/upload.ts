import { getApiUrl } from "./api";

/**
 * Compress and resize image before upload for faster mobile uploads
 * Skips compression for files > 100MB (likely high-quality photos/videos)
 */
async function compressImage(file: File): Promise<File> {
  // Only compress images, not videos
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Skip if already small (< 500KB) or very large (> 100MB - likely needs full quality)
  if (file.size < 500 * 1024 || file.size > 100 * 1024 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Resize to max 1920px on longest side for mobile
        const maxSize = 1920;
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to 85% quality
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              console.log(`Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB`);
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.85
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a file with proper authentication (httpOnly session cookie)
 * Works on both desktop and mobile
 * Automatically compresses images for faster upload
 */
export async function uploadFile(
  file: File,
  albumId?: string,
  onProgress?: (percent: number) => void
): Promise<any> {
  // Compress image before upload for faster mobile performance
  const fileToUpload = await compressImage(file);
  
  const formData = new FormData();
  formData.append('file', fileToUpload);
  
  if (albumId) {
    formData.append('albumId', albumId);
  }

  // Use XMLHttpRequest for upload progress tracking
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
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
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

    xhr.withCredentials = true; // Include cookies (session-based auth)
    xhr.send(formData);
  });
}
