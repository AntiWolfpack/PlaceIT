import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Clock3, MapPin, Search, Star, UtensilsCrossed } from 'lucide-react';
import { getListVendorsQueryKey, useListVendors } from '@workspace/api-client-react';
import type { Vendor } from '@workspace/api-client-react';
import { imageFallback, vendorAccent } from '@/lib/placeit';

const categories = [
  { label: 'All spots', value: '' },
  { label: 'Kota', value: 'Kota' },
  { label: 'Shisanyama', value: 'Shisanyama' },
  { label: 'Home cooked', value: 'Home cooking' },
  { label: 'Bakery', value: 'Bakery' },
];

export default function Home() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [openNow, setOpenNow] = useState(false);
  const params = useMemo(() => ({ search: search || undefined, category: category || undefined, openNow: openNow || undefined }), [search, category, openNow]);
  const vendors = useListVendors(params, { query: { queryKey: getListVendorsQueryKey(params) } });
  const list = Array.isArray(vendors.data) ? vendors.data : [];
  return (
    <div>
      <section className="relative isolate overflow-hidden bg-secondary text-secondary-foreground">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <img src="/images/grill-hero.png" alt="" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-r from-secondary via-secondary/95 to-secondary/75" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-12 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:pb-20 lg:pt-20">
          <div className="relative z-10 max-w-2xl animate-rise-in">
            <p className="font-mono-app text-[11px] uppercase tracking-[.22em] text-accent">Local food, close to home</p>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[.96] tracking-[-.04em] sm:text-7xl">Your side of town, <span className="text-primary">on a plate.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-secondary-foreground/75">Find the kota, braai, bake and home-cooked comfort that makes your neighbourhood taste like yours. Order ahead. Collect with ease.</p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold"><span className="flex items-center gap-2 rounded-full bg-secondary-foreground/10 px-4 py-2"><MapPin size={15} /> Johannesburg & beyond</span><span className="rounded-full bg-accent px-4 py-2 text-accent-foreground">Collection first</span></div>
          </div>
          <div className="relative min-h-[250px] lg:min-h-[330px]">
            <div className="absolute right-3 top-2 h-56 w-56 rounded-[48%_52%_42%_58%] bg-primary/90 sm:right-16 sm:h-72 sm:w-72" />
            <div className="absolute right-12 top-12 z-10 rotate-3 rounded-[2rem] border-8 border-background/80 bg-[#e7a93e] p-5 shadow-2xl sm:right-28 sm:top-20">
              <div className="flex h-36 w-48 items-center justify-center rounded-[1.5rem] bg-[#db7952] sm:h-48 sm:w-64"><UtensilsCrossed size={70} className="text-[#f6d47c]" strokeWidth={1.3} /></div>
              <div className="mt-3 flex justify-between font-mono-app text-[10px] uppercase tracking-widest"><span>Made nearby</span><span>Collect warm</span></div>
            </div>
            <div className="absolute bottom-2 left-5 z-20 -rotate-6 rounded-2xl bg-accent px-4 py-3 font-display text-lg font-bold text-accent-foreground shadow-lg sm:left-0">Bap, spice, joy.</div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-24 pt-10 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">The neighbourhood board</p><h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">What are you craving?</h2></div>
          <label className="relative block w-full sm:max-w-xs"><Search size={17} className="absolute left-4 top-3.5 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search food or a spot" data-testid="input-search-vendors" className="h-11 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm outline-none ring-primary/20 transition focus:ring-4" /></label>
        </div>
         <div className="mb-8 flex gap-2 overflow-auto pb-1">{categories.map((item) => <button key={item.value || item.label} onClick={() => setCategory(item.value)} data-testid={`button-category-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition ${category === item.value ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-card hover:border-primary'}`}>{item.label}</button>)}<button onClick={() => setOpenNow(!openNow)} data-testid="button-open-now" className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition ${openNow ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>Open now</button></div>
        {vendors.isLoading ? <VendorSkeleton /> : vendors.isError ? <QueryError onRetry={() => vendors.refetch()} /> : list.length === 0 ? <EmptySearch clear={() => { setSearch(''); setCategory(''); }} /> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{list.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} />)}</div>}
      </section>
    </div>
  );
}

function VendorCard({ vendor }: { vendor: Vendor }) {
  return <Link href={`/store/${vendor.id}`} data-testid={`link-vendor-${vendor.id}`} className="group overflow-hidden rounded-[1.35rem] border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
    <div className="relative h-44 overflow-hidden" style={{ backgroundColor: vendorAccent(vendor) }}><img src={vendor.heroImageUrl || imageFallback(vendor.name)} alt="" className="h-full w-full object-cover mix-blend-multiply opacity-75 transition duration-500 group-hover:scale-105" /><div className="absolute left-4 top-4 flex gap-2">{vendor.isFeatured && <span className="rounded-full bg-accent px-2.5 py-1 font-mono-app text-[9px] uppercase tracking-wider text-accent-foreground">Neighbourhood pick</span>}</div><span className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold ${vendor.isOpen ? 'bg-card text-foreground' : 'bg-foreground/80 text-background'}`}>{vendor.isOpen ? 'Open' : 'Closed'}</span></div>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-xl font-bold">{vendor.name}</h3><p className="mt-1 text-xs text-muted-foreground">{vendor.category} · {vendor.neighborhood}</p></div><span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-bold"><Star size={12} fill="currentColor" className="text-primary" /> {vendor.rating.toFixed(1)}</span></div><p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">{vendor.description}</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock3 size={13} /> {vendor.pickupEtaMinutes} min prep</span><span className="flex items-center gap-1 font-bold text-primary">See menu <ArrowRight size={14} /></span></div></div>
  </Link>;
}

function VendorSkeleton() { return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-[365px] animate-pulse rounded-[1.35rem] bg-muted" />)}</div>; }
function QueryError({ onRetry }: { onRetry: () => void }) { return <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-10 text-center"><p className="font-display text-2xl font-bold">The board is taking a moment.</p><p className="mt-2 text-sm text-muted-foreground">We could not load nearby spots just now.</p><button onClick={onRetry} data-testid="button-retry-vendors" className="mt-5 rounded-full bg-secondary px-5 py-2.5 text-sm font-bold text-secondary-foreground">Try again</button></div>; }
function EmptySearch({ clear }: { clear: () => void }) { return <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent"><Search size={23} /></div><h3 className="mt-5 font-display text-2xl font-bold">No plates found there yet.</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Try a different craving or clear the filters to see the full neighbourhood board.</p><button onClick={clear} data-testid="button-clear-search" className="mt-5 rounded-full border border-border px-5 py-2.5 text-sm font-bold">Show all spots</button></div>; }