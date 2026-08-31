# What changed, and how to push it

## 1. Large mobile video uploads (reliability fix)

**Before:** `multer.memoryStorage()` loaded an entire uploaded file into a
single in-memory `Buffer` before your server ever started sending it to
Cloudinary. A 100–200MB phone video means a 100–200MB buffer sitting in
Node's heap, and on a small hosting instance (Render/Railway free tiers)
that's often enough on its own to hit the memory ceiling — worse with more
than one upload happening at once. This is exactly the kind of upload
phones commonly produce, so it was a real, likely-to-be-hit failure mode,
not an edge case.

**Fix — stream to disk, then chunk-upload from disk:**
- `server/routes/shared.ts`: `multer` now uses `diskStorage` instead of
  `memoryStorage`. Bytes are written to a temp file (in the OS temp dir) as
  they arrive over the network, so server memory usage stays flat no matter
  how large the file is.
- `uploadToCloudinary()` now takes a file **path** instead of a `Buffer`.
  Videos are uploaded with Cloudinary's `upload_large`, which reads the file
  back off disk in bounded chunks (6MB at a time) and uploads chunk-by-chunk
  — this is Cloudinary's documented, recommended method for large/video
  assets, and it's also more resilient to flaky mobile connections than one
  giant request. Images (always small after client-side compression) still
  use a normal single-shot upload.
- The temp file is deleted once the upload settles — success or failure —
  and there's a defensive cleanup in the route handler too, so a temp file
  never gets orphaned on disk even if the request is rejected before
  reaching Cloudinary (e.g. an ownership check failing).

No client-side changes were needed for this — the browser still posts a
normal `multipart/form-data` request; the fix is entirely in how the server
handles what it receives.

*(Note: I deliberately did not add local video transcoding/compression,
e.g. via ffmpeg. That would add a new native binary dependency your hosting
provider would need to support, plus real CPU cost per upload on an already
small instance — trading a memory risk for a CPU/deployment risk. The
disk-streaming + chunked-upload approach above removes the memory problem
without that trade-off. Cloudinary's own `quality: 'auto:best'` /
`video_codec: 'auto'` settings, already in place, continue to optimize the
stored/delivered file.)*

## 2. Public sharing flow gap

**Before:** Sharing an album required it to be unlocked first, but nothing
stopped the reverse: locking an album that was **already** publicly shared.
The public read routes (`/api/public/albums/:shareToken` and
`.../media`) only ever checked `isPublic`, never `isLocked` — so a shared
album that got locked afterward kept serving its contents to anyone who had
the link, with no PIN required at all. The lock only affected the
authenticated `/api/albums/:id` routes, not the public ones.

**Fix:**
- `server/routes/albums.routes.ts`: locking an album (`POST
  /api/albums/:id/lock`) now also turns off its public sharing if it was on,
  the same way sharing already requires the album to be unlocked. The share
  token itself is kept (same convention as unsharing), so re-sharing after
  a later unlock reuses the same link instead of minting a new one.
- `server/routes/public.routes.ts`: both public read routes now also check
  `!album.isLocked` directly, as a defense-in-depth measure — so even if a
  future code path or a stale row ever violated the invariant above, a
  locked album still could not be served publicly.
- Added `server/__tests__/public-share-lock.test.ts`, which shares an
  album, confirms the public link works, locks the album, and asserts the
  same link now 404s.

## Files touched

```
server/routes/shared.ts                    (disk-based upload + chunked Cloudinary upload)
server/routes/media.routes.ts              (pass file path instead of buffer; cleanup)
server/routes/albums.routes.ts             (locking revokes public sharing)
server/routes/public.routes.ts             (defense-in-depth isLocked check)
server/__tests__/public-share-lock.test.ts (new regression test)
```

Nothing else was modified — no other routes, components, schemas, or
configs were touched, and the full existing test suite (`npx vitest run`)
plus a full TypeScript typecheck (`npx tsc --noEmit`) both pass.

---

## How to push these changes to your GitHub repo

You said this is your existing project, so the folder here does **not**
include a `.git` directory (it was working-copy files only). Pick whichever
of these matches your situation:

### A) You already have this project pushed to GitHub

1. Unzip this archive somewhere, then copy the changed files listed above
   into your existing local clone of the repo (overwriting the old
   versions), or just copy the whole folder over your working copy if
   you're not tracking anything else locally that isn't in this zip.
2. From inside your local repo:
   ```bash
   git status                 # confirm only the expected files show as changed
   git add server/routes/shared.ts server/routes/media.routes.ts \
           server/routes/albums.routes.ts server/routes/public.routes.ts \
           server/__tests__/public-share-lock.test.ts
   git commit -m "Fix in-memory video upload buffering and public-share/lock gap"
   git push origin main        # or whatever your default branch is called
   ```
3. If you deploy on Render/Railway/Vercel from GitHub, pushing to the
   connected branch will trigger a redeploy automatically — no other config
   changes are needed. If you deploy manually, redeploy as you normally
   would after this push.

### B) This is a fresh copy and you want to initialize a new repo

1. Unzip this archive.
2. From inside the unzipped folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit with reliability and sharing fixes"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
   (Create the empty repo on GitHub first if it doesn't exist yet, via
   github.com → New repository — don't initialize it with a README so
   there's no merge conflict on first push.)

### Before pushing either way

- Double check `.env` is **not** committed (it's already in `.gitignore`).
  Your Cloudinary/database secrets belong in your hosting provider's
  environment variable settings, not in the repo.
- Run the test suite locally once more if you want extra confidence:
  ```bash
  npm install
  npx vitest run
  npx tsc --noEmit
  ```
