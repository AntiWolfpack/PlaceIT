import { and, asc, eq, ilike, inArray, lt, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  orderItemsTable,
  ordersTable,
  vendorsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { sendCustomerOrderStatusEmail } from "../lib/order-notifications";
import { getAuthenticatedVendorId, requireVendor } from "../lib/vendor-auth";
import { checkPickupCodeAttempt, MAX_PICKUP_CODE_ATTEMPTS } from "../lib/order-identifiers";

const router: IRouter = Router();
const orderNumberPattern = /^PIT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;
const vendorStatuses = ["accepted", "preparing", "ready"] as const;
type VendorStatus = typeof vendorStatuses[number];

function isVendorStatus(value: unknown): value is VendorStatus {
  return typeof value === "string" && vendorStatuses.includes(value as VendorStatus);
}

function routeOrderNumber(params: Record<string, string | string[]>) {
  const value = params.orderNumber;
  return Array.isArray(value) ? value[0] ?? "" : value;
}

async function vendorOrderDetails(vendorId: string, orderNumber: string) {
  const [row] = await db
    .select({
      order: ordersTable,
      vendorName: vendorsTable.name,
      pickupAddress: vendorsTable.pickupAddress,
    })
    .from(ordersTable)
    .innerJoin(vendorsTable, eq(vendorsTable.id, ordersTable.vendorId))
    .where(and(eq(ordersTable.vendorId, vendorId), eq(ordersTable.orderNumber, orderNumber)));
  if (!row) return null;

  const items = await db
    .select({
      productId: orderItemsTable.productId,
      productName: orderItemsTable.productName,
      quantity: orderItemsTable.quantity,
      unitPriceCents: orderItemsTable.unitPriceCents,
      lineTotalCents: orderItemsTable.lineTotalCents,
    })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, row.order.id))
    .orderBy(asc(orderItemsTable.productName));

  return {
    id: row.order.publicToken,
    vendorName: row.vendorName,
    pickupAddress: row.pickupAddress,
    customerName: row.order.customerName,
    customerPhone: row.order.customerPhone,
    collectionNote: row.order.collectionNote,
    items,
    orderTotalCents: row.order.orderTotalCents,
    orderNumber: row.order.orderNumber,
    pickupCode: null,
    paymentStatus: row.order.paymentStatus,
    orderStatus: row.order.orderStatus,
    createdAt: row.order.createdAt,
    internalOrderId: row.order.id,
    customerEmail: row.order.customerEmail,
    pickupCodeAttempts: row.order.pickupCodeAttempts,
    pickupCodeHash: row.order.pickupCodeHash,
  };
}

router.get("/vendor/orders", requireVendor, async (req, res): Promise<void> => {
  const vendorId = getAuthenticatedVendorId(res);
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 20) : "";
  if (req.query.search !== undefined && typeof req.query.search !== "string") {
    res.status(400).json({ error: "Search must be a single order number." });
    return;
  }
  if (search && !/^PIT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{0,5}$/i.test(search)) {
    res.status(400).json({ error: "Search by order number using the PIT- prefix." });
    return;
  }

  const rows = await db
    .select({ order: ordersTable })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.vendorId, vendorId),
      inArray(ordersTable.paymentStatus, ["paid", "refunded"]),
      search ? ilike(ordersTable.orderNumber, `${search}%`) : undefined,
    ))
    .orderBy(asc(ordersTable.orderStatus), asc(ordersTable.createdAt));

  const result = [];
  for (const { order } of rows) {
    const details = await vendorOrderDetails(vendorId, order.orderNumber ?? "");
    if (details) {
      const { internalOrderId: _internalOrderId, customerEmail: _customerEmail, pickupCodeAttempts: _attempts, pickupCodeHash: _hash, ...vendorOrder } = details;
      result.push(vendorOrder);
    }
  }
  res.json(result);
});

router.patch("/vendor/orders/:orderNumber/status", requireVendor, async (req, res): Promise<void> => {
  const vendorId = getAuthenticatedVendorId(res);
  const orderNumber = routeOrderNumber(req.params);
  const status: unknown = req.body?.status;
  if (!orderNumberPattern.test(orderNumber)) {
    res.status(400).json({ error: "Invalid order number." });
    return;
  }
  if (!isVendorStatus(status)) {
    res.status(400).json({ error: "Status must be accepted, preparing, or ready." });
    return;
  }

  const details = await vendorOrderDetails(vendorId, orderNumber);
  if (!details) {
    res.status(404).json({ error: "Order not found for this vendor." });
    return;
  }
  const allowedNext: Record<string, VendorStatus[]> = {
    placed: ["accepted"],
    accepted: ["preparing"],
    preparing: ["ready"],
  };
  if (!allowedNext[details.orderStatus]?.includes(status)) {
    res.status(409).json({ error: `Order cannot move from ${details.orderStatus} to ${status}.` });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ orderStatus: status })
    .where(and(
      eq(ordersTable.id, details.internalOrderId),
      eq(ordersTable.vendorId, vendorId),
      eq(ordersTable.orderStatus, details.orderStatus),
      eq(ordersTable.paymentStatus, "paid"),
    ))
    .returning({ orderNumber: ordersTable.orderNumber });
  if (!updated) {
    res.status(409).json({ error: "Order status changed. Refresh and try again." });
    return;
  }

  if (details.customerEmail) {
    try {
      await sendCustomerOrderStatusEmail({
        orderNumber,
        customerName: details.customerName,
        customerEmail: details.customerEmail,
        vendorName: details.vendorName,
        pickupAddress: details.pickupAddress,
        orderTotalCents: details.orderTotalCents,
        orderStatus: status,
        items: details.items,
      });
    } catch (error) {
      logger.error({ err: error, orderNumber, status }, "Customer order-status email could not be sent");
    }
  } else {
    logger.warn({ orderNumber, status }, "Customer order update email was skipped because the legacy order has no email");
  }

  const updatedDetails = await vendorOrderDetails(vendorId, orderNumber);
  if (!updatedDetails) {
    res.status(500).json({ error: "Order was updated but could not be reloaded." });
    return;
  }
  const { internalOrderId: _internalOrderId, customerEmail: _customerEmail, pickupCodeAttempts: _attempts, pickupCodeHash: _hash, ...vendorOrder } = updatedDetails;
  res.json(vendorOrder);
});

router.post("/vendor/orders/:orderNumber/complete", requireVendor, async (req, res): Promise<void> => {
  const vendorId = getAuthenticatedVendorId(res);
  const orderNumber = routeOrderNumber(req.params);
  const pickupCode: unknown = req.body?.pickupCode;
  if (!orderNumberPattern.test(orderNumber)) {
    res.status(400).json({ error: "Invalid order number." });
    return;
  }
  if (typeof pickupCode !== "string" || !/^\d{4}$/.test(pickupCode)) {
    res.status(400).json({ error: "Enter the four-digit pickup code." });
    return;
  }

  const details = await vendorOrderDetails(vendorId, orderNumber);
  if (!details) {
    res.status(404).json({ error: "Order not found for this vendor." });
    return;
  }
  if (details.orderStatus !== "ready") {
    res.status(409).json({ error: "Only ready orders can be completed at collection." });
    return;
  }
  if (!details.pickupCodeHash) {
    res.status(409).json({ error: "This order does not have a pickup code." });
    return;
  }
  if (details.pickupCodeAttempts >= MAX_PICKUP_CODE_ATTEMPTS) {
    res.status(423).json({ error: "Pickup-code verification is locked after five incorrect attempts." });
    return;
  }

  const verification = checkPickupCodeAttempt(pickupCode, details.pickupCodeHash, details.pickupCodeAttempts);
  if (verification.result !== "verified") {
    const [attempt] = await db
      .update(ordersTable)
      .set({ pickupCodeAttempts: sql`${ordersTable.pickupCodeAttempts} + 1` })
      .where(and(
        eq(ordersTable.id, details.internalOrderId),
        eq(ordersTable.vendorId, vendorId),
        eq(ordersTable.orderStatus, "ready"),
        lt(ordersTable.pickupCodeAttempts, MAX_PICKUP_CODE_ATTEMPTS),
      ))
      .returning({ pickupCodeAttempts: ordersTable.pickupCodeAttempts });
    if (!attempt || verification.result === "locked" || attempt.pickupCodeAttempts >= MAX_PICKUP_CODE_ATTEMPTS) {
      res.status(423).json({ error: "Pickup-code verification is locked after five incorrect attempts." });
      return;
    }
    res.status(401).json({
      error: "That pickup code is incorrect.",
      attemptsRemaining: verification.attemptsRemaining,
    });
    return;
  }

  const [completed] = await db
    .update(ordersTable)
    .set({ orderStatus: "completed" })
    .where(and(
      eq(ordersTable.id, details.internalOrderId),
      eq(ordersTable.vendorId, vendorId),
      eq(ordersTable.orderStatus, "ready"),
      lt(ordersTable.pickupCodeAttempts, MAX_PICKUP_CODE_ATTEMPTS),
    ))
    .returning({ orderNumber: ordersTable.orderNumber });
  if (!completed) {
    res.status(409).json({ error: "Order changed before collection could be completed. Refresh and try again." });
    return;
  }

  if (details.customerEmail) {
    try {
      await sendCustomerOrderStatusEmail({
        orderNumber,
        customerName: details.customerName,
        customerEmail: details.customerEmail,
        vendorName: details.vendorName,
        pickupAddress: details.pickupAddress,
        orderTotalCents: details.orderTotalCents,
        orderStatus: "completed",
        items: details.items,
      });
    } catch (error) {
      logger.error({ err: error, orderNumber }, "Customer completion email could not be sent");
    }
  } else {
    logger.warn({ orderNumber }, "Customer completion email was skipped because the legacy order has no email");
  }

  res.json({ orderNumber, orderStatus: "completed" });
});

export default router;
