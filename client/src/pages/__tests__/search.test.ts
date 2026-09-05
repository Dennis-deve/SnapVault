// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.snapvault.test/search" }
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Search screen wiring: server-side filters, cancellable debounced queries,
// pagination with Load more, errors-with-retry (not masquerading as "no
// results"), and recent searches.

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock("wouter", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useRoute: () => [true, { id: undefined }],
    useLocation: () => ["/search", mocks.setLocation],
  };
});

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, apiRequest: mocks.apiRequest };
});

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { email: "user@example.com" }, isLoading: false, logout: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

// Keep the screen light: stub the heavy chrome so the query/state wiring
// under test stays the focus.
vi.mock("@/components/Navbar", () => ({ Navbar: () => createElement("nav") }));
vi.mock("@/components/AppSidebar", () => ({ AppSidebar: () => createElement("aside") }));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => createElement("div") }));
vi.mock("@/components/Footer", () => ({ Footer: () => createElement("footer") }));
vi.mock("@/components/MediaViewer", () => ({ MediaViewer: () => createElement("div") }));
vi.mock("@/components/SearchBar", () => ({
  SearchBar: ({ value, onChange }: any) =>
    createElement("input", {
      "data-testid": "search-input",
      value,
      onChange: (e: any) => onChange(e.target.value),
    }),
}));
vi.mock("@/components/EmptyState", () => ({
  EmptyState: ({ title, description }: any) =>
    createElement("div", { "data-testid": "empty-state" }, `${title} — ${description}`),
}));
vi.mock("@/components/MediaGrid", () => ({
  MediaGrid: ({ items }: any) =>
    createElement(
      "div",
      { "data-testid": "media-grid" },
      items.map((i: any) => createElement("p", { key: i.id }, i.filename))
    ),
}));

import Search from "../Search";

function renderSearch() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // The real app client registers a default fetch-based queryFn
        // (getQueryFn); mirror that so queries without an explicit queryFn
        // (recent searches) resolve through the stubbed window.fetch.
        queryFn: ({ queryKey }: { queryKey: unknown[] }) =>
          fetch(String(queryKey[0])).then((res: Response) => res.json()),
      },
    },
  });
  return render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(Search))
  );
}

function typeQuery(text: string) {
  fireEvent.change(screen.getByTestId("search-input"), { target: { value: text } });
}

beforeEach(() => {
  mocks.apiRequest.mockReset();
  localStorage.setItem("auth_token", "test-token");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("Search", () => {
  it("sends the debounced text query with pagination params and cancellable signal", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 24, hasMore: false });
      renderSearch();

      typeQuery("sunset");
      expect(mocks.apiRequest).not.toHaveBeenCalled(); // still debouncing

      await vi.advanceTimersByTimeAsync(400);
      const searchCalls = mocks.apiRequest.mock.calls.filter((c: any[]) =>
        String(c[0]).includes("/api/media/search")
      );
      expect(searchCalls).toHaveLength(1);

      const [url, init] = searchCalls[0];
      expect(String(url)).toContain("/api/media/search?");
      expect(decodeURIComponent(String(url))).toContain("q=sunset");
      expect(decodeURIComponent(String(url))).toContain("page=1");
      expect(String(url)).toContain("limit=24");
      // Cancellable request: a fetch signal must be threaded through.
      expect((init as any)?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies the images/videos/favorites filters without any text query", async () => {
    mocks.apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 24, hasMore: false });
    renderSearch();

    fireEvent.click(screen.getByTestId("filter-images"));
    await waitFor(() => {
      expect(mocks.apiRequest).toHaveBeenCalled();
    });
    expect(decodeURIComponent(String(mocks.apiRequest.mock.calls[0][0]))).toContain("type=image");
    expect(decodeURIComponent(String(mocks.apiRequest.mock.calls[0][0]))).not.toContain("q=");

    mocks.apiRequest.mockClear();
    fireEvent.click(screen.getByTestId("filter-favorites"));
    await waitFor(() => {
      expect(mocks.apiRequest).toHaveBeenCalled();
    });
    expect(decodeURIComponent(String(mocks.apiRequest.mock.calls[0][0]))).toContain("favorite=true");
  });

  it("renders results with a total count and offers Load more while pages remain", async () => {
    let page = 1;
    mocks.apiRequest.mockImplementation(async (url: string) => {
      const requested = new URL(String(url), "https://x").searchParams.get("page");
      page = Number(requested ?? 1);
      const items = [
        {
          id: `m${page}`,
          filename: page === 1 ? "sunset.jpg" : "sunset-2.jpg",
          type: "image/jpeg",
          path: "p",
          isFavorite: 0,
          createdAt: new Date().toISOString(),
        },
      ];
      return { items, total: 2, page, limit: 1, hasMore: page < 2 };
    });

    renderSearch();
    typeQuery("sunset");
    await waitFor(() => {
      expect(screen.getByText("sunset.jpg")).toBeTruthy();
    });
    expect(screen.getByTestId("search-results-count").textContent).toContain("2");

    fireEvent.click(screen.getByTestId("search-load-more"));
    await waitFor(() => {
      expect(screen.getByText("sunset-2.jpg")).toBeTruthy();
    });
    // Both pages' items stay visible.
    expect(screen.getByText("sunset.jpg")).toBeTruthy();
  });

  it("shows an error with a retry action instead of pretending there are no results", async () => {
    const emptyPage = { items: [], total: 0, page: 1, limit: 24, hasMore: false };
    mocks.apiRequest
      .mockResolvedValue(emptyPage)
      .mockRejectedValueOnce(new Error("Network error while searching"));

    renderSearch();
    typeQuery("query");
    await waitFor(() => {
      expect(screen.getByTestId("search-error")).toBeTruthy();
    });
    expect(screen.getByText(/Network error while searching/i)).toBeTruthy();
    // Distinguishable from "no results".
    expect(screen.queryByTestId("empty-state")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeTruthy();
    });
  });

  it("cancels the previous debounced request when the query changes quickly", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const abortedSignals: boolean[] = [];
      mocks.apiRequest.mockImplementation(async (_url: string, init?: any) => {
        // First ("bea") request hangs until aborted — exactly the situation
        // where cancelling the stale request matters.
        if (String(_url).includes("q=bea&") || String(_url).includes("q=bea")) {
          if (!String(_url).includes("q=beach")) {
            return new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                abortedSignals.push(true);
                reject(new DOMException("Aborted", "AbortError"));
              });
            });
          }
        }
        return { items: [], total: 0, page: 1, limit: 24, hasMore: false };
      });

      renderSearch();
      typeQuery("bea");
      await vi.advanceTimersByTimeAsync(350);
      typeQuery("beach");
      await vi.advanceTimersByTimeAsync(400);

      expect(abortedSignals.length).toBeGreaterThanOrEqual(1);
      // Only the final query is live…
      const urls = mocks.apiRequest.mock.calls.map((c: any[]) => String(c[0]));
      expect(urls.some((u) => decodeURIComponent(u).includes("q=beach"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows recent searches when idle (no query typed)", async () => {
    // The recent-searches query has no explicit queryFn — it goes through the
    // QueryClient default, which is fetch-based. Stub window.fetch for it.
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "r1", query: "sunset 2024" },
        { id: "r2", query: "dog%beach" },
      ],
    });
    vi.stubGlobal("fetch", fetchStub);
    // Any debounced text search triggered by clicking a recent entry returns
    // a well-shaped empty page.
    mocks.apiRequest.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 24,
      hasMore: false,
    });
    renderSearch();

    await waitFor(() => {
      expect(screen.getByText("sunset 2024")).toBeTruthy();
    });
    expect(screen.getByText("dog%beach")).toBeTruthy();

    // Clicking a recent search fills the box.
    fireEvent.click(screen.getByText("sunset 2024"));
    expect((screen.getByTestId("search-input") as HTMLInputElement).value).toBe("sunset 2024");
    vi.unstubAllGlobals();
  });
});
