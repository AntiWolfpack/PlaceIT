import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, CircleUserRound, MapPin, ShoppingBag, Store, X } from 'lucide-react';
import type { MenuItem, Vendor } from '@workspace/api-client-react';
import { AddItemResult, CartState, formatRand, lineFromItem, readCart, saveCart } from '@/lib/placeit';

type CartContextValue = {
  cart: CartState | null;
  count: number;
  totalCents: number;
  addItem: (item: MenuItem, vendor: Vendor) => AddItemResult;
  replaceWith: (item: MenuItem, vendor: Vendor) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider');
  return value;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState | null>(() => readCart());
  useEffect(() => saveCart(cart), [cart]);
  const value = useMemo<CartContextValue>(() => {
    const totalCents = cart?.lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0) ?? 0;
    const count = cart?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
    const addItem = (item: MenuItem, vendor: Vendor): AddItemResult => {
      if (cart && cart.vendorId !== vendor.id) return 'conflict';
      const next: CartState = cart ?? {
        vendorId: vendor.id,
        vendorName: vendor.name,
        pickupAddress: vendor.pickupAddress,
        lines: [],
      };
      const existing = next.lines.find((line) => line.productId === item.id);
      const lines = existing
        ? next.lines.map((line) => (line.productId === item.id ? { ...line, quantity: Math.min(20, line.quantity + 1) } : line))
        : [...next.lines, lineFromItem(item)];
      setCart({ ...next, lines });
      return 'added';
    };
    const replaceWith = (item: MenuItem, vendor: Vendor) => {
      setCart({
        vendorId: vendor.id,
        vendorName: vendor.name,
        pickupAddress: vendor.pickupAddress,
        lines: [lineFromItem(item)],
      });
    };
    const updateQuantity = (productId: string, quantity: number) => {
      if (!cart) return;
      const lines = quantity <= 0
        ? cart.lines.filter((line) => line.productId !== productId)
        : cart.lines.map((line) => line.productId === productId ? { ...line, quantity: Math.min(20, quantity) } : line);
      setCart(lines.length ? { ...cart, lines } : null);
    };
    return { cart, count, totalCents, addItem, replaceWith, updateQuantity, clearCart: () => setCart(null) };
  }, [cart]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-home">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[3px_3px_0_hsl(var(--secondary))]">
        <Store size={19} strokeWidth={2.5} />
      </span>
      <span className="font-display text-xl font-bold tracking-tight">place<span className="text-primary">it</span></span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { count, totalCents } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const nav = [
    { href: '/', label: 'Discover', icon: MapPin },
    { href: '/orders', label: 'My orders', icon: ShoppingBag },
    { href: '/profile', label: 'Profile', icon: CircleUserRound },
  ];
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${location === href ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                <Icon size={15} className="mr-1.5 inline" />{label}
              </Link>
            ))}
          </nav>
          <button type="button" onClick={() => setCartOpen(true)} data-testid="button-open-cart"
            className="group flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-bold shadow-sm transition hover:-translate-y-0.5">
            <ShoppingBag size={17} />
            <span className="hidden sm:inline">{count ? `${count} item${count === 1 ? '' : 's'}` : 'Your cart'}</span>
            {count > 0 && <span className="grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">{count}</span>}
          </button>
        </div>
        <nav className="flex border-t border-border/60 px-3 py-2 md:hidden">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} data-testid={`link-mobile-${label.toLowerCase().replace(' ', '-')}`}
              className={`flex flex-1 items-center justify-center gap-1 py-1.5 text-xs font-bold ${location === href ? 'text-primary' : 'text-muted-foreground'}`}>
              <Icon size={15} />{label}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
    </div>
  );
}

function CartDrawer({ onClose }: { onClose: () => void }) {
  const { cart, totalCents, updateQuantity, clearCart } = useCart();
  return (
    <div className="fixed inset-0 z-50 bg-foreground/30" onClick={onClose}>
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-card shadow-2xl animate-rise-in" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border p-6">
          <div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">Current basket</p><h2 className="mt-1 font-display text-2xl font-bold">{cart?.vendorName ?? 'Nothing here yet'}</h2></div>
          <button onClick={onClose} data-testid="button-close-cart" aria-label="Close cart" className="rounded-full p-2 hover:bg-muted"><X size={20} /></button>
        </div>
        {cart ? (
          <>
            <div className="flex-1 space-y-2 overflow-auto p-6">
              <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={13} />Collection only · {cart.pickupAddress}</p>
              {cart.lines.map((line) => (
                <div key={line.productId} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 p-3" data-testid={`cart-line-${line.productId}`}>
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{line.name}</p><p className="text-xs text-muted-foreground">{formatRand(line.unitPriceCents)}</p></div>
                  <div className="flex items-center gap-2"><button onClick={() => updateQuantity(line.productId, line.quantity - 1)} data-testid={`button-decrease-${line.productId}`} className="grid size-7 place-items-center rounded-full bg-card font-bold">−</button><span className="w-4 text-center text-sm font-bold">{line.quantity}</span><button onClick={() => updateQuantity(line.productId, line.quantity + 1)} data-testid={`button-increase-${line.productId}`} className="grid size-7 place-items-center rounded-full bg-card font-bold">+</button></div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-6">
              <div className="mb-4 flex justify-between font-bold"><span>Estimated total</span><span data-testid="text-cart-total">{formatRand(totalCents)}</span></div>
              <Link href="/checkout" onClick={onClose} data-testid="link-cart-checkout" className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 font-bold text-primary-foreground transition hover:brightness-95">Checkout <ArrowRight size={17} /></Link>
              <button onClick={() => { clearCart(); onClose(); }} data-testid="button-clear-cart" className="mt-3 w-full py-2 text-xs font-bold text-muted-foreground hover:text-destructive">Clear basket</button>
            </div>
          </>
        ) : <div className="grid flex-1 place-items-center p-8 text-center"><div><div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-accent"><ShoppingBag size={25} /></div><p className="font-display text-xl font-bold">Your basket is waiting</p><p className="mt-2 text-sm text-muted-foreground">Add a plate from a local favourite and collect it fresh.</p></div></div>}
      </aside>
    </div>
  );
}
