// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.snapvault.test/shared/tok123" }
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(PublicAlbum))
  );
}

// Public gallery screen: distinct loading / revoked / network / empty
// states, no credentials sent, and stale contents hidden once access is
// revoked on revalidation.

vi.mock("wouter", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useRoute: () => [true, { token: "tok123" }],
    useLocation: () => ["/shared/tok123", vi.fn()],
  };
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import PublicAlbum from "../PublicAlbum";

function jsonResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const albumBody = { name: "Holiday 2024", description: "Sunsets", itemCount: 2 };
const mediaBody = [
  { id: "m1", filename: "sunset.jpg", type: "image/jpeg", path: "https://cdn/signed/1", thumbnailPath: undefined },
  { id: "m2", filename: "waves.mp4", type: "video/mp4", path: "https://cdn/signed/2", thumbnailPath: "https://cdn/signed/2.jpg" },
];

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function stubByUrl(routes: Record<string, any>) {
  fetchMock.mockImplementation(async (url: string) => {
    for (const [fragment, value] of Object.entries(routes)) {
      if (url.includes(fragment)) {
        if (typeof value === "function") return value;
        return value;
      }
    }
    throw new Error("unexpected fetch: " + url);
  });
}

describe("PublicAlbum", () => {
  it("shows a loading state, then the read-only gallery with signed media", async () => {
    stubByUrl({
      "/media": jsonResponse(mediaBody),
      "/api/public/albums/": jsonResponse(albumBody),
    });

    renderPage();

    expect(screen.getByTestId("public-album-loading")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Holiday 2024")).toBeTruthy();
    });
    // The media query starts once the album resolves; wait for the grid.
    await waitFor(() => {
      expect(screen.getByAltText("sunset.jpg")).toBeTruthy();
    });
    expect(document.body.textContent).toMatch(/2\s*items/);
    // Anonymous: no credentials ever attached to any call.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    fetchMock.mock.calls.forEach((c: any[]) => {
      expect(c[1]?.credentials).toBe("omit");
      expect(c[1]?.headers?.Authorization).toBeUndefined();
    });
  });

  it("shows the REVOKED state (not 'empty') when the link is dead, and hides stale contents", async () => {
    // First load succeeds so the gallery renders…
    stubByUrl({
      "/media": jsonResponse(mediaBody),
      "/api/public/albums/": jsonResponse(albumBody),
    });
    renderPage();
    await waitFor(() => expect(screen.getByAltText("sunset.jpg")).toBeTruthy());

    // …then the owner stops sharing: every revalidation now gets 404.
    stubByUrl({
      "/media": jsonResponse({ message: "no longer available" }, 404),
      "/api/public/albums/": jsonResponse({ message: "no longer available" }, 404),
    });

    // Trigger the focus-revalidation path.
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("visibilitychange"));
    await waitFor(
      () => {
        if (!screen.queryByTestId("public-album-revoked")) throw new Error("pending");
      },
      { timeout: 4000 }
    );
    // Stale gallery contents must NOT remain rendered.
    expect(screen.queryByAltText("sunset.jpg")).toBeNull();
    expect(screen.getByText(/turned off sharing/i)).toBeTruthy();
  });

  it("shows the revoked state for a link that was never live", async () => {
    stubByUrl({ "/api/public/albums/": jsonResponse({ message: "gone" }, 404) });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("public-album-revoked")).toBeTruthy());
  });

  it("distinguishes a NETWORK failure from revocation and offers retry", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("public-album-network")).toBeTruthy());
    expect(screen.getByText(/network problem/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("shows the empty state for a live album with no media", async () => {
    stubByUrl({
      "/media": jsonResponse([]),
      "/api/public/albums/": jsonResponse({ name: "Empty", description: null, itemCount: 0 }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("public-album-empty")).toBeTruthy());
  });
});
