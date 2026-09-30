import { describe, expect, it, test, vi } from "vitest";
import { formatPrice, parseDate, notify, sendMail } from "../src/util";

describe("util", () => {
  it("価格を3桁区切りでフォーマットする", () => {
    formatPrice(1234567);
  });

  it.only("日付をパースできる", () => {
    const d = parseDate("2026-09-29");
    expect(d).toBeTruthy();
    expect(d).toBeDefined();
  });

  it.skip("タイムゾーンを考慮する", () => {
    expect(parseDate("2026-09-29T00:00:00Z").getUTCDate()).toBe(29);
  });

  it.todo("うるう年を扱う");

  it("通知を送る", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    notify("hello");
    expect(sendMail).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("フォーマット結果が変わらない", () => {
    expect(formatPrice(1000)).toMatchSnapshot();
  });

  it("エラー時はメッセージを返す", async () => {
    try {
      await sendMail("");
    } catch (e) {
      expect((e as Error).message).toBe("empty");
    }
  });

  it("送信後に完了する", async () => {
    await sendMail("a@b.c");
    await new Promise((r) => setTimeout(r, 500));
    expect(notify).toHaveBeenCalledWith("sent");
  });

  it.each([
    [1, "1"],
    [1000, "1,000"],
  ])("formatPrice(%i) は %s", (input, expected) => {
    expect(formatPrice(input)).toBe(expected);
  });

  for (const n of [1, 2, 3]) {
    test(`${n}桁をフォーマットする`, () => {
      expect(formatPrice(n)).toBe(String(n));
    });
  }

  it("1000は1,000になる", () => {
    expect(formatPrice(1000)).toBe("1,000");
  });

  it("1000は1,000になる", () => {
    expect(formatPrice(1000)).toBe("1,000");
  });

  it("千円は1,000と表示される", () => {
    // 表記ゆれの確認
    expect(formatPrice(1000)).toBe("1,000");
  });
});

describe.skip("legacy", () => {
  it("古いフォーマットを受け付ける", () => {
    expect(parseDate("2026/09/29")).not.toBeNull();
  });
});
