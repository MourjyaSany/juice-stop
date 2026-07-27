import Link from 'next/link';
import type { Metadata } from 'next';
import { BagIcon } from '@/components/icons';
import { Card, EmptyState } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Orders — Juice Stop',
};

export default function OrdersPage() {
  return (
    <main className="page-in relative min-h-dvh">
      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
        <h1 className="font-display text-3xl font-bold tracking-[-0.02em]">Orders</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          Your order history and live tracking.
        </p>

        <Card className="mt-6">
          <EmptyState
            icon={<BagIcon size={26} />}
            title="No orders yet"
            body="Once you place an order you'll be able to track it here, live, from kitchen to doorstep."
            action={
              <Link
                href="/menu"
                className="pressable sheen inline-flex h-11 items-center justify-center gap-2 rounded-[12px] px-5 font-display text-sm font-semibold text-white"
                style={{ background: 'var(--gradient-brand)', boxShadow: 'var(--glow-orange)' }}
              >
                Browse the menu
              </Link>
            }
          />
        </Card>
      </div>
    </main>
  );
}
