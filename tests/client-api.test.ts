import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ClientError, errorText } from "../src/web/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("browser API request recovery", () => {
  it("stops waiting on an unresponsive write without automatically retrying it", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const pending = api(
      "/bookings",
      "POST",
      { startsAt: 123 },
      "same-operation",
    );
    const outcome = expect(pending).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await outcome;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({
      "Idempotency-Key": "same-operation",
    });
    expect(errorText(new ClientError("REQUEST_TIMEOUT"), "zh-TW")).toContain(
      "操作可能已完成",
    );
  });

  it("cleans up the timeout after success and preserves the server error code", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: { id: "booking-1" } }))
      .mockResolvedValueOnce(
        Response.json({ error: { code: "SLOT_UNAVAILABLE" } }, { status: 409 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(api("/bookings", "POST", {})).resolves.toEqual({
      id: "booking-1",
    });
    await expect(api("/bookings", "POST", {})).rejects.toMatchObject({
      code: "SLOT_UNAVAILABLE",
    });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
  });

  it("does not describe a database outage as an email setup error", () => {
    expect(
      errorText(new ClientError("SERVICE_UNAVAILABLE"), "zh-TW"),
    ).not.toContain("寄信");
  });
});
