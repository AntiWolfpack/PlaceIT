import type { MenuItem, OrderReceipt, Vendor } from '@workspace/api-client-react';

export const formatRand = (cents: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

export const statusLabel = (status: OrderReceipt['orderStatus']) =>
  ({
    awaiting_payment: 'Awaiting payment',
    placed: 'Order received',
    accepted: 'Accepted by kitchen',
    preparing: 'Being prepared',
    ready: 'Ready for collection',
    completed: 'Collected',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  })[status] ?? status;

export const paymentLabel = (status: OrderReceipt['paymentStatus']) =>
  ({
    pending: 'PayFast payment pending',
    paid: 'Paid via PayFast',
    failed: 'PayFast payment failed',
    refunded: 'Refunded',
  })[status] ?? status;

export const imageFallback = (seed: string) => {
  const palettes = [
    ['#f07a59', '#f6d47c', '#19343a'],
    ['#d09a26', '#f4c95d', '#19343a'],
    ['#2c858e', '#e8bb70', '#19343a'],
    ['#bb5e72', '#f0c66a', '#19343a'],
  ];
  const palette = palettes[seed.length % palettes.length]!;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 540">
      <rect width="900" height="540" fill="${palette[0]}"/>
      <circle cx="720" cy="120" r="230" fill="${palette[1]}" opacity=".9"/>
      <circle cx="180" cy="510" r="270" fill="${palette[2]}" opacity=".14"/>
      <rect x="235" y="112" width="430" height="300" rx="54" fill="${palette[1]}" transform="rotate(-7 450 262)"/>
      <rect x="270" y="145" width="360" height="235" rx="38" fill="${palette[0]}" transform="rotate(-7 450 262)"/>
      <path d="M392 210c-28 33-28 72 0 105m116-105c28 33 28 72 0 105M450 196v134m-70-67h140" fill="none" stroke="${palette[1]}" stroke-width="15" stroke-linecap="round"/>
    </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export type CartLine = {
  productId: string;
  name: string;
  description: string;
  unitPriceCents: number;
  quantity: number;
  imageUrl: string | null;
};

export type CartState = {
  vendorId: string;
  vendorName: string;
  pickupAddress: string;
  lines: CartLine[];
};

export const readCart = (): CartState | null => {
  try {
    const raw = localStorage.getItem('placeit-cart');
    return raw ? (JSON.parse(raw) as CartState) : null;
  } catch {
    return null;
  }
};

export const saveCart = (cart: CartState | null) => {
  if (cart) localStorage.setItem('placeit-cart', JSON.stringify(cart));
  else localStorage.removeItem('placeit-cart');
};

export const readReceiptIds = (): string[] => {
  try {
    const raw = localStorage.getItem('placeit-receipt-ids');
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

export const saveReceiptId = (id: string) => {
  const ids = readReceiptIds();
  if (!ids.includes(id)) localStorage.setItem('placeit-receipt-ids', JSON.stringify([id, ...ids]));
};

export const vendorAccent = (vendor: Vendor) => {
  const colors = ['#f07a59', '#d0a93f', '#2c858e', '#bb5e72'];
  return colors[vendor.name.length % colors.length];
};

export type AddItemResult = 'added' | 'conflict';

export const lineFromItem = (item: MenuItem): CartLine => ({
  productId: item.id,
  name: item.name,
  description: item.description,
  unitPriceCents: item.priceCents,
  quantity: 1,
  imageUrl: item.imageUrl,
});