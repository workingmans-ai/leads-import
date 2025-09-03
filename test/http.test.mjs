import {
  jest,
  describe,
  test,
  beforeEach,
  beforeAll,
  afterAll,
} from "@jest/globals";
import { requestJSON } from "../src/http.mjs";

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("http module", () => {
  let mockFetch;

  beforeAll(() => {
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("requestJSON", () => {
    test("should successfully return JSON on 200 response", async () => {
      const expectedData = { id: 1, name: "test" };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(expectedData),
      });

      const result = await requestJSON("https://api.example.com/data");

      expect(result).toEqual(expectedData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        {}
      );
    });

    test("should pass through options to fetch", async () => {
      const expectedData = { success: true };
      const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "data" }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(expectedData),
      });

      await requestJSON("https://api.example.com/data", options);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        options
      );
    });

    test("should throw error on 4xx client errors (non-429)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue("Not Found"),
      });

      await expect(
        requestJSON("https://api.example.com/notfound")
      ).rejects.toThrow("HTTP 404: Not Found");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should throw error on 400 bad request", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue("Bad Request"),
      });

      await expect(requestJSON("https://api.example.com/bad")).rejects.toThrow(
        "HTTP 400: Bad Request"
      );
    });

    test("should retry on 429 rate limit and eventually succeed", async () => {
      const expectedData = { success: true };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: jest.fn().mockResolvedValue("Rate Limited"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: jest.fn().mockResolvedValue("Rate Limited"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue(expectedData),
        });

      const result = await requestJSON(
        "https://api.example.com/data",
        {},
        {
          retries: 5,
          baseDelayMs: 10, // Use small delay for faster tests
        }
      );

      expect(result).toEqual(expectedData);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test("should retry on 500 server errors and eventually succeed", async () => {
      const expectedData = { success: true };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue("Internal Server Error"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue(expectedData),
        });

      const result = await requestJSON(
        "https://api.example.com/data",
        {},
        {
          retries: 5,
          baseDelayMs: 10,
        }
      );

      expect(result).toEqual(expectedData);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("should retry on 503 service unavailable", async () => {
      const expectedData = { success: true };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: jest.fn().mockResolvedValue("Service Unavailable"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue(expectedData),
        });

      const result = await requestJSON(
        "https://api.example.com/data",
        {},
        {
          retries: 5,
          baseDelayMs: 10,
        }
      );

      expect(result).toEqual(expectedData);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("should exhaust retries and throw error on persistent 429", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue("Rate Limited"),
      });

      await expect(
        requestJSON(
          "https://api.example.com/data",
          {},
          {
            retries: 2,
            baseDelayMs: 10,
          }
        )
      ).rejects.toThrow("HTTP 429 after 2 retries: Rate Limited");

      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test("should exhaust retries and throw error on persistent 500", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue("Internal Server Error"),
      });

      await expect(
        requestJSON(
          "https://api.example.com/data",
          {},
          {
            retries: 3,
            baseDelayMs: 10,
          }
        )
      ).rejects.toThrow("HTTP 500 after 3 retries: Internal Server Error");

      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    test("should handle empty response text gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockRejectedValue(new Error("No body")),
      });

      await expect(
        requestJSON("https://api.example.com/notfound")
      ).rejects.toThrow("HTTP 404: ");
    });

    test("should use default retry configuration", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue("Server Error"),
      });

      await expect(
        requestJSON("https://api.example.com/data", {}, { baseDelayMs: 1 })
      ).rejects.toThrow("HTTP 500 after 5 retries: Server Error");

      expect(mockFetch).toHaveBeenCalledTimes(6); // Initial + 5 retries (default)
    });

    test("should respect custom retry configuration", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue("Server Error"),
      });

      await expect(
        requestJSON("https://api.example.com/data", {}, { retries: 1 })
      ).rejects.toThrow("HTTP 500 after 1 retries: Server Error");

      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    test("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(requestJSON("https://api.example.com/data")).rejects.toThrow(
        "Network error"
      );
    });

    test("should handle JSON parsing errors", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error("Invalid JSON")),
      });

      await expect(requestJSON("https://api.example.com/data")).rejects.toThrow(
        "Invalid JSON"
      );
    });

    test("should handle different 5xx errors", async () => {
      const testCases = [502, 504, 507, 520];

      for (const statusCode of testCases) {
        mockFetch.mockClear();
        mockFetch.mockResolvedValue({
          ok: false,
          status: statusCode,
          text: jest.fn().mockResolvedValue(`Error ${statusCode}`),
        });

        await expect(
          requestJSON(
            "https://api.example.com/data",
            {},
            { retries: 1, baseDelayMs: 1 }
          )
        ).rejects.toThrow(
          `HTTP ${statusCode} after 1 retries: Error ${statusCode}`
        );

        expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
      }
    });

    test("should not retry on successful response after initial failure", async () => {
      const expectedData = { recovered: true };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue("Server Error"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue(expectedData),
        });

      const result = await requestJSON(
        "https://api.example.com/data",
        {},
        {
          retries: 5,
          baseDelayMs: 10,
        }
      );

      expect(result).toEqual(expectedData);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Stop after success
    });
  });
});
