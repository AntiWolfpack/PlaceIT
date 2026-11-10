type OrderLine = {
  productName: string;
  quantity: number;
  lineTotalCents: number;
};

type CustomerOrderNotice = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  vendorName: string;
  pickupAddress: string;
  pickupCode: string;
  orderTotalCents: number;
  orderStatus: string;
  items: OrderLine[];
};

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const formatRand = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);

export async function sendCustomerOrderEmail(order: CustomerOrderNotice): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured to send customer receipts.");

  const itemList = order.items
    .map((item) => `<li>${item.quantity} × ${escapeHtml(item.productName)} — ${formatRand(item.lineTotalCents)}</li>`)
    .join("");
  const subject = `PlaceIT order ${order.orderNumber}: ${order.orderStatus}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [order.customerEmail],
      subject,
      html: `<main style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#19343a">
        <h1>Order ${escapeHtml(order.orderNumber)}</h1>
        <p>Hello ${escapeHtml(order.customerName.split(/\s+/)[0] ?? order.customerName)},</p>
        <p>Your order at <strong>${escapeHtml(order.vendorName)}</strong> is ${escapeHtml(order.orderStatus)}.</p>
        <ul>${itemList}</ul>
        <p><strong>Total paid:</strong> ${formatRand(order.orderTotalCents)}</p>
        <p><strong>Pickup code:</strong> <span style="font-size:24px;letter-spacing:5px">${escapeHtml(order.pickupCode)}</span></p>
        <p>Collect from ${escapeHtml(order.pickupAddress)}. Show the pickup code to the vendor.</p>
      </main>`,
    }),
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Resend rejected the email (${response.status}): ${responseText.slice(0, 500)}`);
  }
}

export async function sendVendorWhatsAppAlert(
  phone: string | null,
  order: CustomerOrderNotice,
): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = process.env.WHATSAPP_ORDER_TEMPLATE?.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || "v23.0";
  if (!phone) throw new Error("Vendor WhatsApp phone number is not configured.");
  if (!accessToken || !phoneNumberId || !templateName) {
    throw new Error("WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_ORDER_TEMPLATE must be configured.");
  }

  const firstName = order.customerName.trim().split(/\s+/)[0] ?? order.customerName;
  const summary = order.items.map((item) => `${item.quantity} x ${item.productName}`).join(", ");
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/\D/g, ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE?.trim() || "en" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: order.orderNumber },
            { type: "text", text: firstName },
            { type: "text", text: summary.slice(0, 900) },
            { type: "text", text: formatRand(order.orderTotalCents) },
          ],
        }],
      },
    }),
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`WhatsApp Cloud API rejected the alert (${response.status}): ${responseText.slice(0, 500)}`);
  }
}

export async function sendCustomerOrderStatusEmail(
  order: Omit<CustomerOrderNotice, "pickupCode">,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured to send order updates.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [order.customerEmail],
      subject: `PlaceIT order ${order.orderNumber}: ${order.orderStatus}`,
      html: `<main style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#19343a">
        <h1>Order ${escapeHtml(order.orderNumber)} update</h1>
        <p>Your order at <strong>${escapeHtml(order.vendorName)}</strong> is now <strong>${escapeHtml(order.orderStatus)}</strong>.</p>
        <p>Total: ${formatRand(order.orderTotalCents)}</p>
        <p>Pickup from ${escapeHtml(order.pickupAddress)}.</p>
      </main>`,
    }),
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Resend rejected the order update (${response.status}): ${responseText.slice(0, 500)}`);
  }
}
