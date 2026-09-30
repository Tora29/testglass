import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cart } from "../src/cart";
import * as api from "../src/api";

vi.mock("../src/api");

describe("Cart", () => {
  let cart: Cart;

  beforeEach(() => {
    cart = new Cart();
  });

  describe("add", () => {
    it("商品を追加すると合計金額が増える", () => {
      cart.add({ id: "a", price: 100 }, 2);

      expect(cart.total).toBe(200);
      expect(cart.items).toHaveLength(1);
    });

    it("数量0を指定するとエラーになる", () => {
      expect(() => cart.add({ id: "a", price: 100 }, 0)).toThrow("quantity must be positive");
    });
  });

  describe("checkout", () => {
    it("注文APIに明細を送り、注文番号を返す", async () => {
      vi.mocked(api.createOrder).mockResolvedValue({ orderId: "o-1" });
      cart.add({ id: "a", price: 100 }, 1);

      const result = await cart.checkout();

      expect(api.createOrder).toHaveBeenCalledWith([{ id: "a", quantity: 1 }]);
      expect(result).toEqual({ orderId: "o-1" });
    });
  });
});
