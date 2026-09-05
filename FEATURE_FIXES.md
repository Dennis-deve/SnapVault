# Feature Fixes — Changelog and Deployment Notes

This document describes the behavioral fixes and hardening applied in this
revision, and the deployment steps required to activate them. Everything here
is implemented and covered by tests (14 test files / 116 tests, all passing);
items marked **not yet verified** still need a live-environment check after
deploy.

---

## 1. Secure, expiring, single-use password-reset links

**Before:** reset tokens were stored in plaintext and links never expired or
invalidated — a leaked link worked forever, and reusing a used link was
ambiguous.

**Now:**

- Reset tokens are stored **hashed (SHA-256) at rest**; the raw token exists
  only in the emailed link and is never logged.
- Links **expire after 1 hour** and are **single-use**: consumption happens in
  a DB transaction, so a link can never be replayed even under concurrent
  requests.
- Requesting a **new link invalidates the previous one** for the account.
- Changing the password **bumps the account's credential version**, which
  invalidates all existing login JWTs for that account (other sessions are
  also purged server-side).
- Reset links point at the **frontend** (`CLIENT_URL`/`FRONTEND_URL`), not the
  API, and work in both monolithic and split deployments.
- The email includes both an **HTML and a plain-text** part.
- When email is not configured, the API answers honestly with **503** instead
  of pretending a mail was sent (no enumeration signal either way).

**Client:** `ForgotPassword` / `ResetPassword` pages distinguish *expired*,
*invalid/already used*, and *missing* token states, with a direct path to
request a new link.

## 2. Public read-only album galleries with signed thumbnails

**Before:** shared links kept working after an album was locked or unshared,
and API-vs-SPA routing could shadow the `/shared/:token` page.

**Now:**

- Serving a shared album checks, in order: the token exists, the album is not
  locked, sharing is still enabled on the album, the owner still exists, and
  the owner's **account-wide sharing preference** is on. Every failure returns
  an **identical 404** — no information leak about which gate failed.
- **Revocation is permanent:** unsharing, locking, or turning the account-wide
  preference off clears the token. Re-enabling sharing generates a **new**
  token — old links never come back to life. An existing token is reused only
  when it is still active.
- Thumbnails are served via **signed URLs** (no public asset guessing).
- Album and media responses are sent with **`Cache-Control: no-store`**, so a
  revoked link leaves nothing in browser or proxy caches.
- The page renders distinct states: **revoked**, **empty album**, and
  **network error with retry** (a network failure is never misreported as
  "revoked").
- The API does **not** intercept `/shared/:token`: the SPA route wins on
  monolithic deployments (Render rewrite handles it in production — see
  deployment steps).

## 3. Upload reliability

**Before:** every file upload was an independent best-effort XHR; lost
responses duplicated files, progress hit 100% before the server finished, and
one slow file blocked the rest.

**Now:**

- A **shared upload queue** processes at most **2 files concurrently**
  (**1 when the user has data-saver enabled**), with per-file status,
  **cancel**, and **retry** controls in the upload progress list.
- Retry is **transient-errors-only** (network loss, 408/425/429/5xx) with
  **bounded attempts (≤3)** and backoff (429 honors `Retry-After`); permanent
  HTTP errors fail fast and are surfaced as such.
- Uploads carry a **stable client-generated upload ID**, which the server uses
  directly as the media primary key: if the upload succeeded but the response
  was lost, re-uploading the same file **deduplicates** instead of creating a
  second media row. **No new columns or migrations.**
- Cloudinary uploads are **namespaced** (`cloudmediavault/<userId>/<uploadId>`)
  with `overwrite: false` — an existing identical public ID is treated as
  *reuse*, not failure. Legacy clients without an upload ID get unique
  filenames as before; malformed upload IDs are ignored.
- Large files use **disk storage (Multer) and 6 MB chunked upload** to
  Cloudinary.
- Upload progress **caps below 100% until both Cloudinary and the DB confirm**,
  then jumps to 100% on success.
- The stored media record uses **Cloudinary's reported bytes, MIME type, and
  format/extension** — not client guesses.

## 4. Safe compression

**Before:** blanket transformations could upscale, flatten transparent PNGs,
or silently change dimensions/type; some UI copy implied "restoration"/"HD"
enhancement that didn't happen.

**Now:**

- In the browser: still images are transcoded to **WebP only when the source
  is a supported static JPEG/PNG**, **dimensions are preserved**, **no
  upscaling** occurs, **transparent PNGs are never flattened**, and the
  compressed result is used **only if it saves ≥5%**; otherwise the original
  bytes are uploaded. Bounded decode/work time with fallback to the original.
- On Cloudinary: **content-aware quality optimization**, and videos are
  delivered as **H.264/MP4** — with **no forced resize or frame-rate change**,
  and **animated containers stay animated**.
- **No restoration/HD claims** anywhere in the UI — copy describes only real
  optimization.
- Hard cap of **200 MB** per upload.

## 5. Search

**Before:** search was (at best) a naive client-side filter; recent searches
were stored raw and matched with wildcards.

**Now:**

- **Literal, case-insensitive** matching against filename, media type, album
  name and description, and dates (`YYYY-MM-DD` or year/month prefix such as
  `2024` / `2024-03`).
- **Multi-word queries are AND-ed** across fields.
- **Type and favorite filters work with or without a text query.**
- Results are **paginated, newest-first with a deterministic tie-breaker**,
  via an infinite query with "Load more".
- **Locked, orphaned, and other users' media are excluded** — only media the
  caller can actually see is searchable.
- Typing is **debounced** and in-flight requests are **cancelled** when the
  query changes.
- **Errors are shown as errors with a retry action** — never rendered as
  "no results".
- **Recent searches** are deduplicated per account, stored and matched
  **without `%`/`_` wildcards** (LIKE escapes are applied server-side).

## 6. Footer

The footer now shows **SnapVault only**. The "DESTECH SOLUTIONS" credit and
`tel:+233544216532` link have been removed.

---

## Rate limiting note

Auth-sensitive endpoints (login, signup, change-password, change-email,
forgot-password, album unlock) keep the strict **5 requests / 15 minutes**
limiter. The general `/api` ceiling was raised from 100 to **1000 requests /
15 minutes per IP**: ordinary usage (media lists, album opens, favorites,
debounced search) legitimately makes many API calls per minute, and search is
additionally debounced and cancellable client-side.

---

## Rollout effects (expected, not bugs)

- **All users will be signed out once** after deploy: pre-credential-version
  JWTs are rejected, forcing a fresh login.
- **Old password-reset links stop working.** Anyone mid-reset simply requests
  a new link.

## Deployment checklist

No DB migrations and no secret renames are required; existing environment
variables keep working. Deploy the API and the frontend **from the same
revision**.

1. **Email (required for password reset):**
   - Verify a sender domain in **Resend** and set `FROM_EMAIL` to a verified
     address (`onboarding@resend.dev` is sandbox-only and will not deliver in
     production). Set `RESEND_API_KEY`.
   - Without email config the API returns 503 on forgot-password (honest
     failure) — reset stays disabled until this is done.
2. **URLs:**
   - Set `CLIENT_URL` (or `FRONTEND_URL`) on the API to the public frontend
     origin, so reset links open the app, not the API.
   - Set `VITE_API_URL` on the frontend build when the API lives on a
     different origin.
3. **Render SPA rewrite (monolithic deployments):** add a Rewrite rule
   `/*` → `/index.html` so the `/shared/:token` and reset pages resolve to the
     SPA instead of 404ing at the CDN edge.
4. **Deploy API + frontend at the same revision**, then run a **real
   password-reset email test** end-to-end (request → receive → open → reset →
   login with the new password).

**Not yet verified (needs the live deploy):** real email delivery via Resend,
Cloudinary upload/transformation performance in production, and the Render
rewrite behavior.
