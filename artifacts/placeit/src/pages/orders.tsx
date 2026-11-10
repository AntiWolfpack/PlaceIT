import { Link } from 'wouter';
import { ArrowRight, ClipboardList, MapPin } from 'lucide-react';
import { getGetOrderQueryKey, useGetOrder } from '@workspace/api-client-react';
import { readReceiptIds } from '@/lib/placeit';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

export default function Orders() {
  const [ids, setIds] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  useEffect(() => {
    setIds(readReceiptIds());
    const returnedOrderId = new URLSearchParams(window.location.search).get('orderId');
    if (returnedOrderId) {
      const cancelled = new URLSearchParams(window.location.search).get('payment') === 'cancelled';
      setLocation(`/orders/${encodeURIComponent(returnedOrderId)}${cancelled ? '?payment=cancelled' : ''}`);
    }
  }, [setLocation]);
  return <div className="mx-auto max-w-5xl px-5 pb-24 pt-10 lg:px-8"><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">Your collection history</p><h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Order history</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Your receipts are kept on this device. Open an order to see its live status and collection details.</p>
    {ids.length === 0 ? <div className="mt-10 rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent"><ClipboardList size={24} /></div><h2 className="mt-5 font-display text-2xl font-bold">No collection orders yet.</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">When you place an order, its private receipt will live here on this device.</p><Link href="/" data-testid="link-orders-empty-discover" className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Discover local food</Link></div> : <div className="mt-8 space-y-3">{ids.map((id) => <OrderHistoryLink key={id} publicReference={id} />)}</div>}
  </div>;
}

function OrderHistoryLink({ publicReference }: { publicReference: string }) {
  const query = useGetOrder(publicReference, {
    query: { queryKey: getGetOrderQueryKey(publicReference) },
  });
  const order = query.data;
  const title = order?.orderNumber ? `Order ${order.orderNumber}` : order ? 'Payment awaiting confirmation' : 'Collection order';
  return (
    <Link href={`/orders/${publicReference}`} data-testid="link-order-history" className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/50">
      <div className="flex items-start gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><MapPin size={18} /></div>
        <div>
          <p className="font-bold">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{order?.vendorName ?? 'Open to view your saved receipt'}</p>
          {order && <p className="mt-2 text-xs font-semibold text-primary">{order.orderStatus.replaceAll('_', ' ')}</p>}
        </div>
      </div>
      <ArrowRight size={18} className="text-primary" />
    </Link>
  );
}