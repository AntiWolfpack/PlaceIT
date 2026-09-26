import { eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetOrderParams,
  GetOrderResponse,
} from "@workspace/api-zod";
import {
  db,
  menuItemsTable,
  orderItemsTable,
  ordersTable,
  vendorsTable,
} from "@workspace/db";

const router: IRouter = Router();
type OrderCreationResult =
  | { ok: false; error: string; status: 400 | 404 | 409 }
  | { ok: true; id: string };

async function makeReceipt(orderId: string) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return null;

  const [vendor] = await db
    .select({ name: vendorsTable.name, pickupAddress: vendorsTable.pickupAddress })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, order.vendorId));
  if (!vendor) return null;

  const items = await db
    .select({
      productId: orderItemsTable.productId,
      productName: orderItemsTable.productName,
      quantity: orderItemsTable.quantity,
      unitPriceCents: orderItemsTable.unitPriceCents,
      lineTotalCents: orderItemsTable.lineTotalCents,
    })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, order.id));

  return {
    id: order.id,
    vendorId: order.vendorId,
    vendorName: vendor.name,
    pickupAddress: vendor.pickupAddress,
    customerName: order.customerName,
    items,
    orderTotalCents: order.orderTotalCents,
    bookingFeeCents: order.bookingFeeCents,
    commissionRateBps: order.commissionRateBps,
    commissionAmountCents: order.commissionAmountCents,
    dueAtCollectionCents: order.dueAtCollectionCents,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    checkoutUrl: order.checkoutUrl,
    createdAt: order.createdAt,
  };
}

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { vendorId, customerName, customerPhone, collectionNote, items } = parsed.data;
  const productIds = items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    res.status(400).json({ error: "Each menu item can only appear once in an order." });
    return;
  }

  const createdId: OrderCreationResult = await db.transaction(async (tx): Promise<OrderCreationResult> => {
    const [vendor] = await tx.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
    if (!vendor) return { ok: false, error: "Vendor not found", status: 404 };
    if (!vendor.isOpen) {
      return { ok: false, error: "This vendor is currently closed.", status: 409 };
    }

    const selectedItems = await tx
      .select()
      .from(menuItemsTable)
      .where(inArray(menuItemsTable.id, productIds));
    if (selectedItems.length !== productIds.length) {
      return {
        ok: false,
        error: "One or more menu items could not be found.",
        status: 404,
      };
    }

    const productsById = new Map(selectedItems.map((item) => [item.id, item]));
    const pricedLines: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
    }> = [];
    for (const requestedItem of items) {
      const product = productsById.get(requestedItem.productId);
      if (!product) {
        return {
          ok: false,
          error: "One or more menu items could not be found.",
          status: 404,
        };
      }
      if (product.vendorId !== vendor.id) {
        return {
          ok: false,
          error: "Every item in a cart must belong to the selected vendor.",
          status: 400,
        };
      }
      if (!product.isAvailable) {
        return {
          ok: false,
          error: `${product.name} is no longer available.`,
          status: 409,
        };
      }
      pricedLines.push({
        productId: product.id,
        productName: product.name,
        quantity: requestedItem.quantity,
        unitPriceCents: product.priceCents,
        lineTotalCents: product.priceCents * requestedItem.quantity,
      });
    }

    const totalBigInt = pricedLines.reduce(
      (total, line) => total + BigInt(line.lineTotalCents),
      0n,
    );
    if (totalBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { ok: false, error: "The order total is too high.", status: 400 };
    }

    const orderTotalCents = Number(totalBigInt);
    const bookingFeeCents = Number((totalBigInt * 1500n + 5000n) / 10000n);
    const dueAtCollectionCents = orderTotalCents - bookingFeeCents;
    const [order] = await tx
      .insert(ordersTable)
      .values({
        vendorId,
        customerName,
        customerPhone,
        collectionNote: collectionNote ?? null,
        orderTotalCents,
        bookingFeeCents,
        commissionRateBps: 1500,
        commissionAmountCents: bookingFeeCents,
        dueAtCollectionCents,
        paymentStatus: "pending",
        orderStatus: "awaiting_payment",
        checkoutUrl: null,
      })
      .returning({ id: ordersTable.id });
    if (!order) throw new Error("Order could not be created.");

    await tx.insert(orderItemsTable).values(
      pricedLines.map((line) => ({
        orderId: order.id,
        vendorId: vendor.id,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.lineTotalCents,
      })),
    );
    return { ok: true, id: order.id };
  });

  if (!createdId.ok) {
    res.status(createdId.status).json({ error: createdId.error });
    return;
  }

  const receipt = await makeReceipt(createdId.id);
  if (!receipt) {
    res.status(500).json({ error: "Order was created but its receipt could not be loaded." });
    return;
  }
  res.status(201).json(CreateOrderResponse.parse(receipt));
});

router.get("/orders/:orderId", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const receipt = await makeReceipt(params.data.orderId);
  if (!receipt) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(GetOrderResponse.parse(receipt));
});

export default router;