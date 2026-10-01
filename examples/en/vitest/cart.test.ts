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
    it("increases the total when an item is added", () => {
      cart.add({ id: "a", price: 100 }, 2);

      expect(cart.total).toBe(200);
      expect(cart.items).toHaveLength(1);
    });

    it("throws when the quantity is 0", () => {
      expect(() => cart.add({ id: "a", price: 100 }, 0)).toThrow("quantity must be positive");
    });
  });

  describe("checkout", () => {
    it("sends the items to the order API and returns the order ID", async () => {
      vi.mocked(api.createOrder).mockResolvedValue({ orderId: "o-1" });
      cart.add({ id: "a", price: 100 }, 1);

      const result = await cart.checkout();

      expect(api.createOrder).toHaveBeenCalledWith([{ id: "a", quantity: 1 }]);
      expect(result).toEqual({ orderId: "o-1" });
    });
  });
});
