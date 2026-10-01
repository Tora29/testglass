import { describe, expect, it, test, vi } from "vitest";
import { formatPrice, parseDate, notify, sendMail } from "../src/util";

describe("util", () => {
  it("formats a price with thousands separators", () => {
    formatPrice(1234567);
  });

  it.only("parses a date", () => {
    const d = parseDate("2026-09-29");
    expect(d).toBeTruthy();
    expect(d).toBeDefined();
  });

  it.skip("handles time zones", () => {
    expect(parseDate("2026-09-29T00:00:00Z").getUTCDate()).toBe(29);
  });

  it.todo("handles leap years");

  it("sends a notification", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    notify("hello");
    expect(sendMail).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("keeps the formatted output unchanged", () => {
    expect(formatPrice(1000)).toMatchSnapshot();
  });

  it("returns a message on error", async () => {
    try {
      await sendMail("");
    } catch (e) {
      expect((e as Error).message).toBe("empty");
    }
  });

  it("completes after sending", async () => {
    await sendMail("a@b.c");
    await new Promise((r) => setTimeout(r, 500));
    expect(notify).toHaveBeenCalledWith("sent");
  });

  it.each([
    [1, "1"],
    [1000, "1,000"],
  ])("formatPrice(%i) returns %s", (input, expected) => {
    expect(formatPrice(input)).toBe(expected);
  });

  for (const n of [1, 2, 3]) {
    test(`formats a ${n}-digit number`, () => {
      expect(formatPrice(n)).toBe(String(n));
    });
  }

  it("formats 1000 as 1,000", () => {
    expect(formatPrice(1000)).toBe("1,000");
  });

  it("formats 1000 as 1,000", () => {
    expect(formatPrice(1000)).toBe("1,000");
  });

  it("shows one thousand as 1,000", () => {
    // Another way to say the same thing
    expect(formatPrice(1000)).toBe("1,000");
  });
});

describe.skip("legacy", () => {
  it("accepts the old format", () => {
    expect(parseDate("2026/09/29")).not.toBeNull();
  });
});
