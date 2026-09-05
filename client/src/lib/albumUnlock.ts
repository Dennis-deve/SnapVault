// Client-side helper for the per-album "unlock token" issued by
// POST /api/albums/:id/unlock-session after a correct Magic PIN.
//
// This token is what actually lets the server return a locked album's
// contents (see assertAlbumReadable in server/routes.ts) — the PIN dialog
// alone no longer decides access. We keep the token in sessionStorage
// (not localStorage) so it's automatically cleared when the tab/browser is
// closed, and it's short-lived (15 minutes) regardless.

const prefix = "album-unlock:";

export function getAlbumUnlockToken(albumId: string): string | null {
  try {
    return sessionStorage.getItem(prefix + albumId);
  } catch {
    return null;
  }
}

export function setAlbumUnlockToken(albumId: string, token: string): void {
  try {
    sessionStorage.setItem(prefix + albumId, token);
  } catch {
    // sessionStorage unavailable (e.g. private browsing) — non-fatal, the
    // user will just be asked for the PIN again on the next request.
  }
}

export function clearAlbumUnlockToken(albumId: string): void {
  try {
    sessionStorage.removeItem(prefix + albumId);
  } catch {
    // ignore
  }
}

/**
 * Drop every album-unlock token in this tab. Called when the signed-in
 * account changes (logout / login as someone else): unlock tokens are
 * scoped to a user+album pair server-side and are useless — worse,
 * confusing — for a different account, so they must not survive the switch.
 */
export function clearAllAlbumUnlockTokens(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // sessionStorage unavailable — nothing to clear.
  }
}
