import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
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
import { logger } from "../lib/logger";
import {
  sendCustomerOrderEmail,
  sendCustomerOrderStatusEmail,
  sendVendorWhatsAppAlert,
} from "../lib/order-notifications";
import {
  decryptPickupCode,
  encryptPickupCode,
  generateOrderNumber,
  generatePickupCode,
  hashPickupCode,
  retryOrderNumberCollision,
} from "../lib/order-identifiers";

const router: IRouter = Router();
const PAYFAST_LIVE_URL = "https://www.payfast.co.za";
const PAYFAST_SANDBOX_URL = "https://sandbox.payfast.co.za";
const VENDOR_SPLIT_PERCENTAGE = 85;
type OrderCreationResult =
  | { ok: false; error: string; status: 400 | 404 | 409 }
  | { ok: true; id: string; publicToken: string };

type PayFastConfig = {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  processUrl: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};

function getPayFastConfig(): PayFastConfig | null {
  const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim();
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY?.trim();
  const passphrase = process.env.PAYFAST_PASSPHRASE?.trim();
  const returnUrl = process.env.PAYFAST_RETURN_URL?.trim();
  const cancelUrl = process.env.PAYFAST_CANCEL_URL?.trim();
  const notifyUrl = process.env.PAYFAST_NOTIFY_URL?.trim();
  if (!merchantId || !merchantKey || !passphrase || !returnUrl || !cancelUrl || !notifyUrl) {
    return null;
  }

  return {
    merchantId,
    merchantKey,
    passphrase,
    processUrl:
      process.env.PAYFAST_MODE?.trim().toLowerCase() === "sandbox"
        ? `${PAYFAST_SANDBOX_URL}/eng/process`
        : `${PAYFAST_LIVE_URL}/eng/process`,
    returnUrl,
    cancelUrl,
    notifyUrl,
  };
}

function encodePayFastValue(value: string): string {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function generatePayFastSignature(data: Record<string, string>, passphrase: string): string {
  const pairs = Object.entries(data)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${encodePayFastValue(value)}`);
  pairs.push(`passphrase=${encodePayFastValue(passphrase)}`);
  return createHash("md5").update(pairs.join("&")).digest("hex");
}

function withOrderId(url: string, orderId: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}orderId=${encodeURIComponent(orderId)}`;
}

function parseRandAmountToCents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(`${whole}${fraction.padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) ? cents : null;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function payFastCheckoutUrl(publicReference: string, vendorMerchantId: string | null): string | null {
  const config = getPayFastConfig();
  if (!config || !vendorMerchantId || !/^\d+$/.test(vendorMerchantId)) return null;
  return new URL(`/api/payfast/checkout/${encodeURIComponent(publicReference)}`, config.returnUrl).toString();
}

async function makeReceipt(orderId: string) {
  const [order] = await db.select().from(ordersTable).where(
    or(eq(ordersTable.publicToken, orderId), eq(ordersTable.orderNumber, orderId)),
  );
  if (!order) return null;

  const [vendor] = await db
    .select({
      name: vendorsTable.name,
      pickupAddress: vendorsTable.pickupAddress,
      payfastMerchantId: vendorsTable.payfastMerchantId,
      whatsappPhone: vendorsTable.whatsappPhone,
    })
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

  let pickupCode: string | null = null;
  if (order.pickupCodeEncrypted && order.paymentStatus === "paid") {
    const pickupCodeSecret = process.env.PICKUP_CODE_SECRET?.trim();
    if (!pickupCodeSecret) throw new Error("PICKUP_CODE_SECRET is required to retrieve the customer pickup code.");
    pickupCode = decryptPickupCode(order.pickupCodeEncrypted, pickupCodeSecret);
  }

  return {
    id: order.publicToken,
    orderNumber: order.orderNumber,
    pickupCode,
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
    checkoutUrl: order.checkoutUrl ?? payFastCheckoutUrl(order.publicToken, vendor.payfastMerchantId),
    createdAt: order.createdAt,
    whatsappPhone: vendor.whatsappPhone,
  };
}

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { vendorId, customerName, customerEmail, customerPhone, collectionNote, items } = parsed.data;
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
        customerEmail,
        customerPhone,
        collectionNote: collectionNote ?? null,
        orderTotalCents,
        bookingFeeCents,
        commissionRateBps: 1500,
        commissionAmountCents: bookingFeeCents,
        dueAtCollectionCents: 0,
        paymentStatus: "pending",
        orderStatus: "awaiting_payment",
        payfastPaymentId: null,
        payfastTransactionId: null,
        checkoutUrl: null,
      })
      .returning({ id: ordersTable.id, publicToken: ordersTable.publicToken });
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
    return { ok: true, id: order.id, publicToken: order.publicToken };
  });

  if (!createdId.ok) {
    res.status(createdId.status).json({ error: createdId.error });
    return;
  }

  const receipt = await makeReceipt(createdId.publicToken);
  if (!receipt) {
    res.status(500).json({ error: "Order was created but its receipt could not be loaded." });
    return;
  }
  res.status(201).json(CreateOrderResponse.parse(receipt));
});

router.get("/payfast/checkout/:publicReference", async (req, res): Promise<void> => {
  const config = getPayFastConfig();
  if (!config) {
    res.status(503).type("text/plain").send("PayFast is not configured.");
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.publicToken, req.params.publicReference));
  if (!order) {
    res.status(404).type("text/plain").send("Order not found.");
    return;
  }
  const [vendor] = await db
    .select({
      name: vendorsTable.name,
      payfastMerchantId: vendorsTable.payfastMerchantId,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, order.vendorId));
  if (!vendor?.payfastMerchantId) {
    res.status(503).type("text/plain").send("This vendor is not configured for PayFast split payments.");
    return;
  }
  if (order.paymentStatus === "paid") {
    res.redirect(withOrderId(config.returnUrl, order.publicToken));
    return;
  }

  const nameParts = order.customerName.trim().split(/\s+/);
  const firstName = nameParts.shift() ?? order.customerName;
  const lastName = nameParts.join(" ");
  const setup = JSON.stringify({
    split_payment: {
      merchant_id: Number(vendor.payfastMerchantId),
      percentage: VENDOR_SPLIT_PERCENTAGE,
    },
  });
  const cancelUrl = new URL(withOrderId(config.cancelUrl, order.publicToken));
  cancelUrl.searchParams.set("payment", "cancelled");
  const data: Record<string, string> = {
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    return_url: withOrderId(config.returnUrl, order.publicToken),
    cancel_url: cancelUrl.toString(),
    notify_url: config.notifyUrl,
    name_first: firstName,
    name_last: lastName,
    m_payment_id: order.publicToken,
    amount: (order.orderTotalCents / 100).toFixed(2),
    item_name: `PlaceIT order at ${vendor.name}`,
    item_description: `PlaceIT collection order`,
    setup,
  };
  const signature = generatePayFastSignature(data, config.passphrase);
  const inputs = [...Object.entries(data), ["signature", signature] as const]
    .map(([key, value]) => `<input type="hidden" name="${htmlEscape(key)}" value="${htmlEscape(value)}">`)
    .join("");

  res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Continue to PayFast</title></head>
  <body>
    <p>Redirecting securely to PayFast…</p>
    <form id="payfast-form" action="${htmlEscape(config.processUrl)}" method="post">${inputs}</form>
    <script>document.getElementById("payfast-form").submit();</script>
  </body>
</html>`);
});

router.post("/payfast/notify", async (req, res): Promise<void> => {
  const config = getPayFastConfig();
  if (!config) {
    res.status(503).type("text/plain").send("PayFast is not configured.");
    return;
  }

  const receivedBody = Object.fromEntries(
    Object.entries(req.body as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]),
  );
  const suppliedSignature = receivedBody.signature ?? "";
  const body = { ...receivedBody };
  delete body.signature;
  const expectedSignature = generatePayFastSignature(body, config.passphrase);
  const signaturesMatch =
    suppliedSignature.length === expectedSignature.length &&
    timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature));
  if (!signaturesMatch) {
    res.status(400).type("text/plain").send("Invalid signature.");
    return;
  }
  if (body.merchant_id !== config.merchantId) {
    res.status(400).type("text/plain").send("Invalid merchant.");
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.publicToken, body.m_payment_id));
  if (!order) {
    res.status(404).type("text/plain").send("Order not found.");
    return;
  }
  const amountCents = parseRandAmountToCents(body.amount_gross ?? "");
  if (amountCents === null || amountCents !== order.orderTotalCents) {
    res.status(400).type("text/plain").send("Invalid amount.");
    return;
  }

  const validationPayload = new URLSearchParams(receivedBody).toString();
  const validationUrl =
    (process.env.PAYFAST_MODE?.trim().toLowerCase() === "sandbox"
      ? PAYFAST_SANDBOX_URL
      : PAYFAST_LIVE_URL) + "/eng/query/validate";
  const validationResponse = await fetch(validationUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: validationPayload,
  });
  if (!validationResponse.ok || (await validationResponse.text()).trim() !== "VALID") {
    res.status(400).type("text/plain").send("PayFast validation failed.");
    return;
  }

  const paymentStatus = body.payment_status;
  if (paymentStatus === "COMPLETE") {
    if (order.paymentStatus !== "paid") {
      const pickupCodeSecret = process.env.PICKUP_CODE_SECRET?.trim();
      if (!pickupCodeSecret) {
        logger.error({ orderId: order.id }, "PICKUP_CODE_SECRET is not configured; PayFast payment could not be recorded");
        res.status(503).type("text/plain").send("Order payment confirmation is temporarily unavailable.");
        return;
      }
      const pickupCode = generatePickupCode();
      const encryptedPickupCode = encryptPickupCode(pickupCode, pickupCodeSecret);
      const updated = await retryOrderNumberCollision(async (orderNumber) => {
        const [confirmedOrder] = await db
          .update(ordersTable)
          .set({
            paymentStatus: "paid",
            orderStatus: "placed",
            orderNumber,
            pickupCodeHash: hashPickupCode(pickupCode),
            pickupCodeEncrypted: encryptedPickupCode,
            pickupCodeAttempts: 0,
            payfastPaymentId: body.m_payment_id,
            payfastTransactionId: body.pf_payment_id || null,
          })
          .where(and(eq(ordersTable.id, order.id), eq(ordersTable.paymentStatus, "pending")))
          .returning({ id: ordersTable.id, orderNumber: ordersTable.orderNumber });
        if (confirmedOrder) return { confirmed: true, orderNumber: confirmedOrder.orderNumber };

        const [currentOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
        if (currentOrder?.paymentStatus === "paid" && currentOrder.orderNumber) {
          return { confirmed: false, orderNumber: currentOrder.orderNumber };
        }
        throw new Error("Order was not eligible to be marked as paid.");
      });

      if (updated.confirmed) {
        const paidReceipt = await makeReceipt(order.publicToken);
        if (!paidReceipt?.orderNumber || !paidReceipt.pickupCode) {
          logger.error({ orderNumber: updated.orderNumber }, "Paid order receipt could not be loaded for notifications");
        } else {
          const notice = {
            orderNumber: paidReceipt.orderNumber,
            customerName: paidReceipt.customerName,
            customerEmail: order.customerEmail ?? "",
            vendorName: paidReceipt.vendorName,
            pickupAddress: paidReceipt.pickupAddress,
            pickupCode: paidReceipt.pickupCode,
            orderTotalCents: paidReceipt.orderTotalCents,
            orderStatus: paidReceipt.orderStatus,
            items: paidReceipt.items,
          };
          const notifications = [
            sendVendorWhatsAppAlert(paidReceipt.whatsappPhone, notice),
            ...(order.customerEmail ? [sendCustomerOrderEmail(notice)] : []),
          ];
          if (!order.customerEmail) logger.warn({ orderNumber: paidReceipt.orderNumber }, "Order email was skipped because this legacy order has no customer email");
          const notificationResults = await Promise.allSettled(notifications);
          for (const [index, result] of notificationResults.entries()) {
            if (result.status === "rejected") {
              logger.error(
                { err: result.reason, orderNumber: paidReceipt.orderNumber, channel: order.customerEmail ? (index === 0 ? "whatsapp" : "email") : "whatsapp" },
                "Order confirmation notification could not be sent",
              );
            }
          }
        }
      }
    }
  } else if (paymentStatus === "REFUNDED" && order.paymentStatus === "paid") {
    await db
      .update(ordersTable)
      .set({ paymentStatus: "refunded", orderStatus: "refunded" })
      .where(and(eq(ordersTable.id, order.id), eq(ordersTable.paymentStatus, "paid")));
    const refundReceipt = await makeReceipt(order.publicToken);
    if (refundReceipt?.orderNumber && order.customerEmail) {
      try {
        await sendCustomerOrderStatusEmail({
          orderNumber: refundReceipt.orderNumber,
          customerName: refundReceipt.customerName,
          customerEmail: order.customerEmail,
          vendorName: refundReceipt.vendorName,
          pickupAddress: refundReceipt.pickupAddress,
          orderTotalCents: refundReceipt.orderTotalCents,
          orderStatus: "refunded",
          items: refundReceipt.items,
        });
      } catch (error) {
        logger.error({ err: error, orderNumber: refundReceipt.orderNumber }, "Customer refund email could not be sent");
      }
    }
  } else if (
    (paymentStatus === "FAILED" || paymentStatus === "CANCELLED") &&
    order.paymentStatus !== "paid"
  ) {
    await db
      .update(ordersTable)
      .set({
        paymentStatus: "failed",
        payfastPaymentId: body.m_payment_id,
        payfastTransactionId: body.pf_payment_id || null,
      })
      .where(eq(ordersTable.id, order.id));
  }
  res.status(200).type("text/plain").send("OK");
});

router.get("/orders/:orderReference", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse({ orderReference: req.params.orderReference });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const receipt = await makeReceipt(params.data.orderReference);
  if (!receipt) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(GetOrderResponse.parse(receipt));
});

export default router;