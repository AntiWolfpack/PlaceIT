import { FormEvent, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Check, CreditCard, MapPin, Minus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { getGetVendorQueryKey, getListVendorsQueryKey, useCreateOrder } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatRand, saveReceiptId } from '@/lib/placeit';
import { useCart } from '@/components/placeit-shell';

export default function Checkout() {
  const { cart, totalCents, updateQuantity } = useCart();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createOrder = useCreateOrder();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  if (!cart) return <EmptyCheckout />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Please enter your name so the vendor knows who to expect.');
    if (!/^(\+27|0)[6-8][0-9]{8}$/.test(phone.replace(/\s/g, ''))) return setError('Enter a valid South African mobile number, for example 082 123 4567.');
    createOrder.mutate({ data: { vendorId: cart.vendorId, customerName: name.trim(), customerPhone: phone.replace(/\s/g, ''), collectionNote: note.trim() || undefined, items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })) } }, {
      onSuccess: (receipt) => {
        saveReceiptId(receipt.id);
        queryClient.invalidateQueries({ queryKey: getGetVendorQueryKey(cart.vendorId) });
        queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
        setLocation(`/orders/${receipt.id}`);
      },
      onError: () => setError('We could not place that order. Check your details and try again.'),
    });
  };
  return <div className="mx-auto max-w-6xl px-5 pb-24 pt-8 lg:px-8">
    <Link href={`/store/${cart.vendorId}`} data-testid="link-back-store" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Back to {cart.vendorName}</Link>
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_390px]">
      <div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">One last thing</p><h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">Ready when you are.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Tell {cart.vendorName} who is collecting. We will keep your order details private and only use your number for this order.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div className="rounded-3xl border border-border bg-card p-5 sm:p-7"><h2 className="font-display text-xl font-bold">Collection details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Your name<input value={name} onChange={(event) => setName(event.target.value)} data-testid="input-customer-name" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 font-normal outline-none focus:ring-4 focus:ring-primary/15" placeholder="e.g. Thandi" /></label><label className="text-sm font-bold">South African mobile<input value={phone} onChange={(event) => setPhone(event.target.value)} data-testid="input-customer-phone" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 font-normal outline-none focus:ring-4 focus:ring-primary/15" placeholder="082 123 4567" inputMode="tel" /></label></div><label className="mt-4 block text-sm font-bold">Collection note <span className="font-normal text-muted-foreground">(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} data-testid="input-collection-note" maxLength={240} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:ring-4 focus:ring-primary/15" placeholder="Anything helpful for the handover?" /></label></div>
          <div className="rounded-3xl border border-border bg-accent/45 p-5 sm:p-7"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-secondary" size={20} /><div><h2 className="font-bold">How payment works</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">A 15% booking fee is paid online to confirm your order. The remaining amount is paid directly to {cart.vendorName} when you collect. No delivery in V1 — collection keeps it local.</p></div></div></div>
          {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive" data-testid="status-checkout-error">{error}</p>}
          <button type="submit" disabled={createOrder.isPending} data-testid="button-place-order" className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-4 font-bold text-primary-foreground transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60">{createOrder.isPending ? 'Creating your order…' : <>Continue to secure booking fee <CreditCard size={18} /></>}</button>
        </form>
      </div>
      <aside className="h-fit rounded-3xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-28"><div className="flex items-center justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">Your basket</p><h2 className="mt-1 font-display text-xl font-bold">{cart.vendorName}</h2></div><span className="rounded-full bg-muted px-2 py-1 text-xs font-bold">{cart.lines.length} line{cart.lines.length === 1 ? '' : 's'}</span></div><p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><MapPin size={14} className="mt-0.5 shrink-0" />{cart.pickupAddress}</p><div className="my-5 space-y-3 border-y border-border py-5">{cart.lines.map((line) => <div key={line.productId} className="flex items-start justify-between gap-3 text-sm"><div className="flex gap-2"><div className="flex items-center gap-1 rounded-full bg-muted p-1"><button type="button" onClick={() => updateQuantity(line.productId, line.quantity - 1)} data-testid={`button-checkout-decrease-${line.productId}`} className="grid size-5 place-items-center rounded-full"><Minus size={11} /></button><span className="w-4 text-center text-xs font-bold">{line.quantity}</span><button type="button" onClick={() => updateQuantity(line.productId, line.quantity + 1)} data-testid={`button-checkout-increase-${line.productId}`} className="grid size-5 place-items-center rounded-full"><Plus size={11} /></button></div><span className="font-bold">{line.name}</span></div><span className="whitespace-nowrap font-bold">{formatRand(line.unitPriceCents * line.quantity)}</span></div>)}</div><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Basket value</span><span className="font-bold">{formatRand(totalCents)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Online booking fee</span><span className="font-bold">15% · server confirmed</span></div><div className="flex justify-between border-t border-border pt-3"><span className="font-bold">Pay the vendor at collection</span><span className="font-display text-lg font-bold">Server confirmed</span></div></div><p className="mt-5 text-[11px] leading-5 text-muted-foreground">Your final order total, fee and collection balance are calculated and confirmed by the server. We never mark the fee as paid until the payment provider confirms it.</p></aside>
    </div>
  </div>;
}

function EmptyCheckout() {
  return <div className="mx-auto max-w-lg px-5 py-24 text-center"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-accent"><Trash2 size={24} /></div><h1 className="mt-5 font-display text-3xl font-bold">Your basket is empty.</h1><p className="mt-2 text-sm text-muted-foreground">Pick a local plate first, then come back here to book your collection.</p><Link href="/" data-testid="link-empty-checkout-home" className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Find a spot</Link></div>;
}