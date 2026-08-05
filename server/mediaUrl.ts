import cloudinary from "./cloudinary";
import type { Media } from "@shared/schema";

// Real, time-limited expiring signed URLs require Cloudinary's "Token-based
// authentication" add-on to be enabled on the account (Settings > Security)
// and a separate Auth Token Key generated there — distinct from the normal
// API secret. Set CLOUDINARY_AUTH_TOKEN_KEY to enable that. Without it, we
// still upload as 'authenticated' delivery type and sign the URL, which
// means the asset is NOT reachable via a guessed/plain URL — the signature
// must match — it just won't also expire after N minutes. That's a real,
// meaningful access-control improvement over the previous fully-public
// delivery even without the add-on.
const AUTH_TOKEN_KEY = process.env.CLOUDINARY_AUTH_TOKEN_KEY;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour, only relevant when AUTH_TOKEN_KEY is set

function buildSignedUrl(publicId: string, resourceType: string, extra: Record<string, any> = {}): string {
  const options: Record<string, any> = {
    type: "authenticated",
    resource_type: resourceType,
    secure: true,
    sign_url: true,
    ...extra,
  };

  if (AUTH_TOKEN_KEY) {
    options.auth_token = {
      key: AUTH_TOKEN_KEY,
      duration: SIGNED_URL_TTL_SECONDS,
    };
  }

  return cloudinary.url(publicId, options);
}

/**
 * Given a media row from the DB, return a copy with `path` replaced by a
 * freshly-generated signed delivery URL (and, for videos, a signed
 * `thumbnailPath`). Rows uploaded before signed delivery was added have no
 * `cloudinaryPublicId` and are returned unchanged — they're still on
 * Cloudinary's plain public delivery type, so the stored path already works.
 */
export function signMediaUrl<T extends Pick<Media, "path" | "cloudinaryPublicId" | "cloudinaryResourceType" | "type">>(
  item: T
): T & { thumbnailPath?: string } {
  if (!item.cloudinaryPublicId || !item.cloudinaryResourceType) {
    return item;
  }

  const path = buildSignedUrl(item.cloudinaryPublicId, item.cloudinaryResourceType);

  if (item.cloudinaryResourceType === "video") {
    const thumbnailPath = buildSignedUrl(item.cloudinaryPublicId, "video", {
      format: "jpg",
      transformation: [{ start_offset: "0", width: 400, height: 400, crop: "fill" }],
    });
    return { ...item, path, thumbnailPath };
  }

  return { ...item, path };
}

export function signMediaUrls<T extends Pick<Media, "path" | "cloudinaryPublicId" | "cloudinaryResourceType" | "type">>(
  items: T[]
): (T & { thumbnailPath?: string })[] {
  return items.map(signMediaUrl);
}
