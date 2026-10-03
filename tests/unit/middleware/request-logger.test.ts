import { describe, it, expect, vi, afterEach } from "vitest";
import app from "../../../src/index.js";

const TEST_ENV = {
  DATABASE_URL: "postgres://invalid",
  API_KEY: "test-api-key",
  ENVIRONMENT: "staging",
};

afterEach(() => vi.restoreAllMocks());

// A request rejected by auth logs twice (the rejection, then "request
// completed") and never touches the database.
async function rejectedRequest(headers: Record<string, string> = {}) {
  const logSpy = vi.spyOn(console, "log");
  const errorSpy = vi.spyOn(console, "error");
  const res = await app.request("/v1/clients", { headers }, TEST_ENV);
  expect(res.status).toBe(401);
  const lines = [...errorSpy.mock.calls, ...logSpy.mock.calls].map(([line]) => JSON.parse(line as string));
  return { res, lines };
}

describe("request logger: trace and submission ids (SOL-46)", () => {
  it("puts the caller's trace and submission ids, and the environment, on every log line of the request", async () => {
    const { res, lines } = await rejectedRequest({ "X-Trace-Id": "trace-1", "X-Submission-Id": "sub-1" });

    expect(lines.map((l) => l.message)).toContain("request completed");
    for (const line of lines) {
      expect(line).toMatchObject({ environment: "staging", traceId: "trace-1", submissionId: "sub-1" });
      expect(line).not.toHaveProperty("requestId");
    }
    expect(res.headers.get("X-Trace-Id")).toBe("trace-1");
  });

  it("starts its own trace without one, but never makes up a submissionId", async () => {
    const { res, lines } = await rejectedRequest();

    const completed = lines.find((l) => l.message === "request completed");
    expect(completed.traceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(completed).not.toHaveProperty("submissionId");
    expect(res.headers.get("X-Trace-Id")).toBe(completed.traceId);
  });
});
