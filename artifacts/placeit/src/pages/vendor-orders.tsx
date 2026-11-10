import { FormEvent, useCallback, useEffect, useState } from "react";
import { LogOut, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { formatDate, formatRand } from "@/lib/placeit";
import { getVendorAccessToken, signInVendor, signOutVendor } from "@/lib/vendor-auth";

type VendorOrder = {
  id: string;
  orderNumber: string;
  vendorName: string;
  customerName: string;
  customerPhone: string;
  collectionNote: string | null;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  orderTotalCents: number;
  paymentStatus: string;
  orderStatus: string;
  createdAt: string;
};

async function vendorApi(path: string, options: RequestInit = {}) {
  const token = await getVendorAccessToken();
  if (!token) throw new Error("Your vendor session expired. Sign in again.");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status}).`;
    if (response.status === 401) signOutVendor();
    throw new Error(message);
  }
  return payload;
}

export default function VendorOrders() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [search, setSearch] = useState("");
  const [pickupCodes, setPickupCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadOrders = useCallback(async () => {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    const result = await vendorApi(`/vendor/orders${query}`);
    if (!Array.isArray(result)) throw new Error("The vendor order response was not a list.");
    setOrders(result as VendorOrder[]);
    setAuthenticated(true);
    setError("");
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    void getVendorAccessToken().then((token) => {
      if (!token || cancelled) return;
      void loadOrders().catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load vendor orders.");
        setAuthenticated(false);
      });
    });
    return () => { cancelled = true; };
  }, [loadOrders]);

  useEffect(() => {
    if (!authenticated) return;
    const interval = window.setInterval(() => {
      void loadOrders().catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not refresh vendor orders.");
      });
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [authenticated, loadOrders]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInVendor(email.trim(), password);
      setPassword("");
      setAuthenticated(true);
      await loadOrders();
    } catch (loginError) {
      signOutVendor();
      setAuthenticated(false);
      setError(loginError instanceof Error ? loginError.message : "Vendor sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (orderNumber: string, status: "accepted" | "preparing" | "ready") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await vendorApi(`/vendor/orders/${encodeURIComponent(orderNumber)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadOrders();
      setNotice(`Order ${orderNumber} updated: ${status}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the order.");
    } finally {
      setBusy(false);
    }
  };

  const completeOrder = async (orderNumber: string) => {
    const pickupCode = pickupCodes[orderNumber] ?? "";
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await vendorApi(`/vendor/orders/${encodeURIComponent(orderNumber)}/complete`, {
        method: "POST",
        body: JSON.stringify({ pickupCode }),
      });
      setPickupCodes((current) => ({ ...current, [orderNumber]: "" }));
      await loadOrders();
      setNotice(`Order ${orderNumber} pickup verified and completed.`);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Pickup-code verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    signOutVendor();
    setAuthenticated(false);
    setOrders([]);
    setNotice("");
    setError("");
  };

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-10 lg:px-8">
      <p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">PlaceIT for kitchens</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">Vendor orders</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Paid orders appear here automatically. Accept each order, update its preparation status, then verify the customer&apos;s pickup code at handover.</p>
        </div>
        {authenticated && <button onClick={signOut} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold"><LogOut size={15} /> Sign out</button>}
      </div>

      {!authenticated ? (
        <form onSubmit={submitLogin} className="mx-auto mt-10 max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3"><ShieldCheck className="text-primary" size={22} /><h2 className="font-display text-2xl font-bold">Vendor sign-in</h2></div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in with the Supabase account linked to your kitchen.</p>
          <label className="mt-6 block text-sm font-bold">Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 font-normal outline-none focus:ring-4 focus:ring-primary/15" /></label>
          <label className="mt-4 block text-sm font-bold">Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 font-normal outline-none focus:ring-4 focus:ring-primary/15" /></label>
          {error && <p className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive" role="alert">{error}</p>}
          <button disabled={busy} className="mt-6 w-full rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-60">{busy ? "Signing in…" : "Sign in to orders"}</button>
        </form>
      ) : (
        <>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <label className="relative block w-full sm:max-w-sm"><Search size={17} className="absolute left-4 top-3.5 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order number (PIT-…)" className="h-11 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm outline-none focus:ring-4 focus:ring-primary/15" /></label>
            <button onClick={() => void loadOrders()} className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold"><RefreshCw size={15} /> Refresh</button>
          </div>
          {orders.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center"><h2 className="font-display text-2xl font-bold">{search ? "No matching orders" : "No paid orders yet"}</h2><p className="mt-2 text-sm text-muted-foreground">New paid orders will show here and arrive as WhatsApp alerts.</p></div>
          ) : (
            <div className="mt-8 space-y-4">
              {orders.map((order) => (
                <article key={order.orderNumber} className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7" data-testid={`vendor-order-${order.orderNumber}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-mono-app text-xs font-bold uppercase tracking-[.15em] text-primary">{order.orderNumber}</p>
                      <h2 className="mt-2 font-display text-2xl font-bold">{order.customerName}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{order.customerPhone} · {formatDate(order.createdAt)}</p>
                    </div>
                    <span className="rounded-full bg-accent/50 px-3 py-1.5 text-xs font-bold capitalize">{order.orderStatus}</span>
                  </div>
                  <div className="my-5 space-y-2 border-y border-border py-4 text-sm">
                    {order.items.map((item) => <div key={item.productId} className="flex justify-between gap-3"><span><b>{item.quantity} ×</b> {item.productName}</span><span className="font-bold">{formatRand(item.lineTotalCents)}</span></div>)}
                    <div className="flex justify-between border-t border-border pt-3 font-bold"><span>Paid total</span><span>{formatRand(order.orderTotalCents)}</span></div>
                  </div>
                  {order.collectionNote && <p className="mb-4 rounded-xl bg-muted p-3 text-sm"><b>Customer note:</b> {order.collectionNote}</p>}
                  {order.orderStatus === "placed" && <button disabled={busy} onClick={() => void updateStatus(order.orderNumber, "accepted")} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">Accept order</button>}
                  {order.orderStatus === "accepted" && <button disabled={busy} onClick={() => void updateStatus(order.orderNumber, "preparing")} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">Start preparing</button>}
                  {order.orderStatus === "preparing" && <button disabled={busy} onClick={() => void updateStatus(order.orderNumber, "ready")} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">Mark ready</button>}
                  {order.orderStatus === "ready" && <div className="flex flex-wrap items-end gap-3"><label className="block text-sm font-bold">Customer pickup code<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pickupCodes[order.orderNumber] ?? ""} onChange={(event) => setPickupCodes((current) => ({ ...current, [order.orderNumber]: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="4 digits" className="mt-2 h-11 w-32 rounded-xl border border-input bg-background px-3 font-mono-app text-lg tracking-[.25em] outline-none focus:ring-4 focus:ring-primary/15" /></label><button disabled={busy || (pickupCodes[order.orderNumber] ?? "").length !== 4} onClick={() => void completeOrder(order.orderNumber)} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">Verify &amp; complete</button></div>}
                  {order.orderStatus === "completed" && <p className="text-sm font-bold text-primary">Pickup verified and completed.</p>}
                  {order.orderStatus === "refunded" && <p className="text-sm font-bold text-destructive">This order was refunded.</p>}
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {error && authenticated && <p className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive" role="alert">{error}</p>}
      {notice && <p className="mt-5 rounded-xl bg-primary/10 px-4 py-3 text-sm font-bold text-primary" role="status">{notice}</p>}
    </div>
  );
}
