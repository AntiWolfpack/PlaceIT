import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, Clock3, MapPin, Plus, ShoppingBag, Star, X } from 'lucide-react';
import { getGetVendorQueryKey, useGetVendor } from '@workspace/api-client-react';
import type { MenuItem, Vendor } from '@workspace/api-client-react';
import { imageFallback, formatRand } from '@/lib/placeit';
import { useCart } from '@/components/placeit-shell';

export default function Store() {
  const { vendorId = '' } = useParams<{ vendorId: string }>();
  const query = useGetVendor(vendorId, { query: { enabled: !!vendorId, queryKey: getGetVendorQueryKey(vendorId) } });
  if (query.isLoading) return <div className="mx-auto max-w-7xl px-5 py-10"><div className="h-72 animate-pulse rounded-[2rem] bg-muted" /><div className="mt-8 h-80 animate-pulse rounded-3xl bg-muted" /></div>;
  if (query.isError || !query.data) return <div className="mx-auto max-w-xl px-5 py-24 text-center"><p className="font-display text-3xl font-bold">This spot is off the map.</p><p className="mt-2 text-muted-foreground">We could not find that vendor.</p><Link href="/" className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-back-discover">Back to discover</Link></div>;
  const { vendor, menuItems } = query.data;
  return <StoreContent vendor={vendor} menuItems={menuItems} />;
}

function StoreContent({ vendor, menuItems }: { vendor: Vendor; menuItems: MenuItem[] }) {
  const { addItem, replaceWith, count } = useCart();
  const [conflictItem, setConflictItem] = useState<MenuItem | null>(null);
  const [added, setAdded] = useState('');
  const categories = [...new Set(menuItems.map((item) => item.category))];
  const handleAdd = (item: MenuItem) => { if (addItem(item, vendor) === 'conflict') setConflictItem(item); else { setAdded(item.id); window.setTimeout(() => setAdded(''), 900); } };
  return <div className="mx-auto max-w-7xl px-5 pb-24 pt-6 lg:px-8">
    <Link href="/" data-testid="link-back-home" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Back to spots</Link>
    <section className="relative overflow-hidden rounded-[2rem] bg-secondary text-secondary-foreground">
      <div className="absolute inset-0 opacity-30"><img src={vendor.heroImageUrl || imageFallback(vendor.name)} alt="" className="h-full w-full object-cover" /></div>
      <div className="relative grid min-h-[300px] items-end gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_auto]"><div><div className="mb-4 flex flex-wrap gap-2"><span className="rounded-full bg-accent px-3 py-1 font-mono-app text-[10px] uppercase tracking-wider text-accent-foreground">{vendor.category}</span><span className="rounded-full bg-secondary-foreground/10 px-3 py-1 text-xs">{vendor.isOpen ? 'Open for orders' : 'Currently closed'}</span></div><h1 className="font-display text-4xl font-bold tracking-tight sm:text-6xl">{vendor.name}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-secondary-foreground/75">{vendor.description}</p></div><div className="rounded-2xl bg-background/10 p-4 backdrop-blur-sm"><p className="flex items-center gap-2 text-sm"><MapPin size={15} />{vendor.pickupAddress}</p><p className="mt-2 flex items-center gap-2 text-sm"><Clock3 size={15} />Usually ready in {vendor.pickupEtaMinutes} min</p><p className="mt-2 flex items-center gap-2 text-sm"><Star size={15} fill="currentColor" />{vendor.rating.toFixed(1)} from {vendor.ratingCount} locals</p></div></div>
    </section>
    <div className="mt-10 flex items-end justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">Made to order</p><h2 className="mt-2 font-display text-3xl font-bold">Choose your plate</h2></div><span className="hidden text-sm text-muted-foreground sm:block">{menuItems.length} things on the menu</span></div>
    {menuItems.length === 0 ? <div className="mt-8 rounded-3xl bg-card p-12 text-center"><p className="font-display text-2xl font-bold">Menu coming together.</p><p className="mt-2 text-sm text-muted-foreground">Check back soon for something delicious.</p></div> : <div className="mt-7 space-y-10">{categories.map((category) => <section key={category}><h3 className="mb-3 font-mono-app text-xs uppercase tracking-[.2em] text-muted-foreground">{category}</h3><div className="grid gap-3 lg:grid-cols-2">{menuItems.filter((item) => item.category === category).map((item) => <MenuRow key={item.id} item={item} onAdd={handleAdd} added={added === item.id} />)}</div></section>)}</div>}
    {count > 0 && <Link href="/checkout" data-testid="link-sticky-checkout" className="fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-primary px-6 py-3.5 font-bold text-primary-foreground shadow-xl transition hover:-translate-y-1"><ShoppingBag size={18} /> View basket <ArrowLeft size={15} className="rotate-180" /></Link>}
    {conflictItem && <VendorConflict item={conflictItem} vendor={vendor} onClose={() => setConflictItem(null)} onReplace={() => { replaceWith(conflictItem, vendor); setConflictItem(null); }} />}
  </div>;
}

function MenuRow({ item, onAdd, added }: { item: MenuItem; onAdd: (item: MenuItem) => void; added: boolean }) {
  return <article className={`flex gap-4 rounded-2xl border bg-card p-3 transition ${item.isAvailable ? 'border-border hover:border-primary/50' : 'border-border opacity-55'}`} data-testid={`card-menu-item-${item.id}`}>
    <div className="hidden size-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:block">{item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1 py-1"><div className="flex items-start justify-between gap-3"><div><h4 className="font-display text-lg font-bold">{item.name}</h4>{item.isPopular && <span className="font-mono-app text-[9px] uppercase tracking-widest text-primary">Local favourite</span>}</div><span className="whitespace-nowrap text-sm font-bold">{formatRand(item.priceCents)}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p><button onClick={() => onAdd(item)} disabled={!item.isAvailable} data-testid={`button-add-${item.id}`} className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${item.isAvailable ? 'bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground' : 'cursor-not-allowed bg-muted text-muted-foreground'}`}>{item.isAvailable ? <>{added ? 'Added' : 'Add'} <Plus size={14} /></> : 'Sold out'}</button></div>
  </article>;
}

function VendorConflict({ item, vendor, onClose, onReplace }: { item: MenuItem; vendor: Vendor; onClose: () => void; onReplace: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-5" onClick={onClose}><div className="w-full max-w-md rounded-3xl bg-card p-7 shadow-2xl animate-rise-in" onClick={(event) => event.stopPropagation()}><div className="flex justify-between"><div className="grid size-12 place-items-center rounded-2xl bg-accent"><ShoppingBag size={21} /></div><button onClick={onClose} data-testid="button-close-conflict" aria-label="Close dialog"><X size={19} /></button></div><h2 className="mt-5 font-display text-2xl font-bold">Keep one local spot per basket</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Your basket already has food from another vendor. Keep it, or start a fresh basket with {vendor.name}?</p><div className="mt-6 rounded-2xl bg-muted p-4"><p className="text-xs text-muted-foreground">You are adding</p><p className="mt-1 font-bold">{item.name}</p></div><div className="mt-6 grid gap-2 sm:grid-cols-2"><button onClick={onClose} data-testid="button-keep-current-cart" className="rounded-full border border-border px-4 py-3 text-sm font-bold">Keep current cart</button><button onClick={onReplace} data-testid="button-start-new-cart" className="rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Start new cart</button></div></div></div>;
}