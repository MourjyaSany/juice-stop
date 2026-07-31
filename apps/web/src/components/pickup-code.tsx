'use client';

import { useEffect, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { GlassPanel } from '@/components/system';
import { SPRING } from '@/components/motion-provider';

/**
 * Takeaway collection code and QR.
 *
 * The `qrcode` library is **dynamically imported** so ~20 kB of encoder never reaches anyone who
 * only ever orders delivery — which will be most people. It loads on the one screen that needs it.
 *
 * The written code is deliberately at least as prominent as the QR: scanners fail, screens crack,
 * and a customer who can read four characters aloud is never blocked at the counter.
 */
export function PickupCode({
  token,
  orderNumber,
  ready,
}: {
  token: string;
  orderNumber: string;
  ready: boolean;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const QR = await import('qrcode');
        // Encode the order number alongside the token so counter staff can look the order up even
        // if the token alone is ambiguous.
        const payload = JSON.stringify({ t: token, o: orderNumber });
        const out = await QR.toString(payload, {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 1,
          color: { dark: '#0B0B0F', light: '#FFFFFF' },
        });
        if (!cancelled) setSvg(out);
      } catch {
        // A missing QR must not break collection — the written code still works.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, orderNumber]);

  return (
    <m.div
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.smooth}
    >
      <GlassPanel weight="strong" radius={22} className="overflow-hidden p-5">
        <div className="text-center">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            Collection code
          </p>
          <p
            className="tabular mt-2 font-mono text-[2.5rem] font-bold leading-none tracking-[0.12em]"
            style={{
              background: 'linear-gradient(115deg, #FF8A3D, #FF3D81 50%, #C084FC)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {token}
          </p>
        </div>

        {/* White plate: a QR on a dark surface is unreliable under a counter scanner. */}
        <div className="mt-5 flex justify-center">
          {svg !== null ? (
            <m.div
              initial={reduced ? false : { scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING.bouncy}
              className="rounded-[16px] bg-white p-3"
              style={{ boxShadow: '0 10px 30px -12px rgb(0 0 0 / 0.8)' }}
              // The library returns a complete, self-contained SVG document it generated itself
              // from our own token — no user input reaches this string.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : failed ? (
            <p className="py-6 text-center text-xs text-[var(--color-text-tertiary)]">
              QR unavailable — read the code above to the counter instead.
            </p>
          ) : (
            <div className="skeleton h-[168px] w-[168px] rounded-[16px]" />
          )}
        </div>

        <p
          className="mt-4 rounded-[12px] px-3.5 py-2.5 text-center text-xs leading-relaxed"
          style={{
            background: ready ? 'rgb(34 197 94 / 0.14)' : 'rgb(255 107 26 / 0.12)',
            color: ready ? 'var(--color-success)' : 'var(--color-orange-500)',
          }}
        >
          {ready
            ? 'Ready now — show this at the counter.'
            : 'Hold on to this. We’ll tell you the moment it’s ready.'}
        </p>
      </GlassPanel>
    </m.div>
  );
}
