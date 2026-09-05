// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.snapvault.test/reset-password?token=tok_good" }
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";

// Reset-password screen: up-front link validation with distinct
// expired/invalid/missing states, a new-link action, and confirmation
// mismatch checking before submit.

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, apiRequest: mocks.apiRequest };
});

vi.mock("wouter", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useLocation: () => ["/reset-password", mocks.setLocation],
  };
});

vi.mock("@/hooks/use-toast", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

import ResetPassword from "../ResetPassword";

function setUrl(url: string) {
  // The component reads window.location.search once on mount.
  window.history.replaceState({}, "", url);
}

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.setLocation.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ResetPassword", () => {
  it("checks the link on load and shows the form when valid", async () => {
    setUrl("/reset-password?token=tok_good");
    mocks.apiRequest.mockResolvedValue({ valid: true });
    render(createElement(ResetPassword));

    await waitFor(() => {
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/reset-password/validate?token=tok_good")
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Create new password")).toBeTruthy();
    });
    expect(screen.queryByTestId("reset-request-new-link")).toBeNull();
  });

  it("shows an EXPIRED state with a request-new-link action", async () => {
    setUrl("/reset-password?token=tok_dead");
    mocks.apiRequest.mockResolvedValue({ valid: false, reason: "expired" });
    render(createElement(ResetPassword));

    await waitFor(() => {
      expect(screen.getByTestId("reset-link-expired")).toBeTruthy();
    });
    expect(screen.getByText(/expire after 1 hour/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId("reset-request-new-link"));
    expect(mocks.setLocation).toHaveBeenCalledWith("/forgot-password");
  });

  it("shows an INVALID/already-used state separately from expired", async () => {
    setUrl("/reset-password?token=tok_used");
    mocks.apiRequest.mockResolvedValue({ valid: false, reason: "invalid" });
    render(createElement(ResetPassword));

    await waitFor(() => {
      expect(screen.getByTestId("reset-link-invalid")).toBeTruthy();
    });
    expect(document.body.textContent).toMatch(/already used/i);
  });

  it("shows a missing-token state when opened without a token", async () => {
    setUrl("/reset-password");
    render(createElement(ResetPassword));
    await waitFor(() => {
      expect(screen.getByTestId("reset-link-missing")).toBeTruthy();
    });
    // No validate call was possible; no form either.
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("New Password")).toBeNull();
  });

  it("flags non-matching confirmation passwords client-side", async () => {
    setUrl("/reset-password?token=tok_good");
    mocks.apiRequest.mockResolvedValue({ valid: true });
    render(createElement(ResetPassword));

    await waitFor(() => {
      expect(screen.getByText("Create new password")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "password-one-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "password-two-2" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("reset-password-mismatch")).toBeTruthy();
    });

    // Submitting mismatches never reaches the API.
    fireEvent.submit(screen.getByRole("button", { name: /reset password/i }).closest("form")!);
    const resetCalls = mocks.apiRequest.mock.calls.filter(
      (c: any[]) => String(c[0]).includes("/api/auth/reset-password") && !String(c[0]).includes("validate")
    );
    expect(resetCalls).toHaveLength(0);
  });

  it("submits the token + new password and reflects the server's expired reason", async () => {
    setUrl("/reset-password?token=tok_late");
    mocks.apiRequest
      .mockResolvedValueOnce({ valid: true }) // validate
      .mockResolvedValueOnce(new Error("This reset link has expired. Please request a new one."));
    // ^ apiRequest rejects on !res.ok by throwing; simulate by rejecting:
    mocks.apiRequest.mockReset();
    mocks.apiRequest
      .mockResolvedValueOnce({ valid: true })
      .mockRejectedValueOnce(Object.assign(new Error("This reset link has expired. Please request a new one.")));

    render(createElement(ResetPassword));
    await waitFor(() => {
      expect(screen.getByText("Create new password")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "new-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByTestId("reset-link-expired")).toBeTruthy();
    });
  });
});
