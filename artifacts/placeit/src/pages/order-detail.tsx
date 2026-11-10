import { Link, useParams } from 'wouter';
import { ArrowLeft, Check, CircleAlert, Clock3, CreditCard, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { getGetOrderQueryKey, useGetOrder } from '@workspace/api-client-react';
import type { OrderReceipt } from '@workspace/api-client-react';
import { formatDate, formatRand, paymentLabel, statusLabel } from '@/lib/placeit';

export default function OrderDetail() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const query = useGetOrder(orderId, {
    query: {
      enabled: !!orderId,
      queryKey: getGetOrderQueryKey(orderId),
      refetchInterval: 15000,
    },
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <div className="h-10 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-8 h-[500px] animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <CircleAlert className="mx-auto text-destructive" size={36} />
        <h1 className="mt-5 font-display text-3xl font-bold">Receipt unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">We could not retrieve this order. Try again or return to your orders.</p>
        <button onClick={() => query.refetch()} data-testid="button-retry-order" className="mt-6 rounded-full bg-secondary px-5 py-3 text-sm font-bold text-secondary-foreground">Try again</button>
      </div>
    );
  }

  const receipt = query.data;
  const paid = receipt.paymentStatus === 'paid';
  const pendingPayment = receipt.paymentStatus === 'pending';
  const paymentCancelled = new URLSearchParams(window.location.search).get('payment') === 'cancelled';
  const vendorShareCents = receipt.orderTotalCents - receipt.bookingFeeCents;

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-8 lg:px-8">
      <Link href="/orders" data-testid="link-back-orders" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <ArrowLeft size={16} /> My orders
      </Link>
      <div className="mt-8 overflow-hidden rounded-[2rem] border border-border bg-card">
        <div className="bg-secondary p-7 text-secondary-foreground sm:p-10">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-accent">Collection receipt</p>
              <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{receipt.vendorName}</h1>
              <p className="mt-2 flex items-center gap-2 text-sm text-secondary-foreground/75">
                <MapPin size={15} />{receipt.pickupAddress}
              </p>
            </div>
            <StatusPill status={receipt.orderStatus} />
          </div>
          <p className="mt-8 font-mono-app text-[10px] uppercase tracking-wider text-secondary-foreground/60">{receipt.orderNumber ? `Order ${receipt.orderNumber}` : 'Order number issued after payment confirmation'}</p>
        </div>

        <div className="p-7 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-6">
            <div>
              <p className="text-xs text-muted-foreground">Placed {formatDate(receipt.createdAt)}</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-bold">
                <CreditCard size={16} className={paid ? 'text-primary' : 'text-muted-foreground'} />
                {paymentLabel(receipt.paymentStatus)}
              </p>
            </div>
          </div>

          {paid && (
            <div className="my-6 flex gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm" role="status" data-testid="status-payment-confirmed">
              <Check className="mt-0.5 shrink-0 text-primary" size={18} />
              <div>
                <p className="font-bold">Payment confirmed</p>
                <p className="mt-1 leading-6 text-muted-foreground">PayFast has verified your payment. Your order is confirmed and ready for the vendor to prepare.</p>
              </div>
            </div>
          )}

          {receipt.orderNumber && receipt.pickupCode && paid && (
            <div className="my-6 rounded-2xl border border-primary/30 bg-accent/30 p-5 text-center" data-testid="pickup-code">
              <p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-muted-foreground">Your collection pickup code</p>
              <p className="mt-2 font-mono-app text-4xl font-bold tracking-[.3em] text-primary">{receipt.pickupCode}</p>
              <p className="mt-2 text-sm text-muted-foreground">Show this code to the kitchen when collecting order {receipt.orderNumber}.</p>
            </div>
          )}

          {pendingPayment && receipt.checkoutUrl && (
            <div className="my-6 flex gap-3 rounded-2xl border border-accent bg-accent/30 p-4 text-sm">
              <ShieldCheck className="mt-0.5 shrink-0" size={18} />
              <div>
                <p className="font-bold">{paymentCancelled ? 'Payment not completed' : 'Finish your secure card payment'}</p>
                <p className="mt-1 leading-6 text-muted-foreground">
                  {paymentCancelled
                    ? 'Your order is still awaiting payment. Continue to PayFast to try again.'
                    : 'On PayFast, enter your card details and approve any security request from your bank in its app or using the verification method it provides. Return here afterward; this receipt will update when PayFast confirms your payment.'}
                </p>
                <a
                  href={receipt.checkoutUrl}
                  data-testid="link-payfast-checkout"
                  className="mt-3 inline-flex rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
                >
                  {paymentCancelled ? 'Try payment again' : 'Continue to secure payment'}
                </a>
              </div>
            </div>
          )}

          {pendingPayment && !receipt.checkoutUrl && (
            <div className="my-6 flex gap-3 rounded-2xl border border-accent bg-accent/30 p-4 text-sm" role="status">
              <Clock3 className="mt-0.5 shrink-0" size={18} />
              <div>
                <p className="font-bold">Secure payment is not available yet</p>
                <p className="mt-1 leading-6 text-muted-foreground">This vendor or the PayFast account is not fully configured, so there is no card-payment link yet. Your order has not been paid. Please contact support or try again later.</p>
                <button onClick={() => query.refetch()} data-testid="button-refresh-payment" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                  <RefreshCw size={13} /> Check payment availability
                </button>
              </div>
            </div>
          )}

          {receipt.paymentStatus === 'failed' && (
            <div className="my-6 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-bold">Payment was not completed</p>
              <p className="mt-1">Your order is not confirmed. Check your bank app or card verification, then try again.</p>
              {receipt.checkoutUrl && (
                <a href={receipt.checkoutUrl} data-testid="link-retry-payfast-checkout" className="mt-3 inline-flex rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground">
                  Try payment again
                </a>
              )}
            </div>
          )}

          {pendingPayment && (
            <p className="mb-6 text-xs leading-5 text-muted-foreground" role="status" data-testid="status-payment-verification">
              We check for PayFast confirmation automatically. Keep this page open or refresh after approving the request in your bank app. Do not pay again if your bank shows the card payment as completed; allow confirmation to arrive first.
            </p>
          )}

          <div className="my-7 space-y-4">
            {receipt.items.map((item) => (
              <div key={item.productId} className="flex justify-between gap-4 text-sm">
                <span><b>{item.quantity} ×</b> {item.productName}</span>
                <span className="font-bold">{formatRand(item.lineTotalCents)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-border pt-5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{paid ? 'Paid online via PayFast' : 'Total to pay online'}</span>
              <span className="font-bold">{formatRand(receipt.orderTotalCents)}</span>
            </div>
            {paid && (
              <div className="flex justify-between rounded-2xl bg-accent/50 p-4">
                <span className="font-bold">Vendor share via PayFast</span>
                <span className="font-display text-xl font-bold">{formatRand(vendorShareCents)}</span>
              </div>
            )}
          </div>

          <div className="mt-8 flex gap-3 rounded-2xl bg-muted p-4 text-sm">
            <Check className="mt-0.5 shrink-0 text-primary" size={18} />
            <p className="leading-6 text-muted-foreground">Show this receipt when you arrive. Your order is collection-only; <b className="text-foreground">Delivery Coming Soon.</b></p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: OrderReceipt['orderStatus'] }) {
  return (
    <span data-testid="status-order" className="flex items-center gap-2 rounded-full bg-background/10 px-3 py-2 text-xs font-bold">
      <span className="size-2 rounded-full bg-accent" />{statusLabel(status)}
    </span>
  );
}
