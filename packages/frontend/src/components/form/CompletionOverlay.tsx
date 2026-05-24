'use client';

import { useEffect, useState } from 'react';

interface Props {
  ownerFirstName?: string;
  companyName?: string | null;
  websiteUrl?: string | null;
  supportEmail?: string | null;
}

export function CompletionOverlay({ ownerFirstName, companyName, websiteUrl, supportEmail }: Props) {
  const [visible, setVisible] = useState(false);

  // Fade in on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const heading = ownerFirstName ? `Thank you, ${ownerFirstName}!` : 'Application Complete!';
  const returnLabel = companyName ? `Return to ${companyName}` : 'Return to site';

  return (
    <div
      aria-live="polite"
      aria-label="Application complete"
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-500 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ background: 'rgba(2, 8, 23, 0.88)', backdropFilter: 'blur(6px)' }}
    >
      <div className="surface-panel-soft w-full max-w-lg border border-emerald-400/20 bg-slate-950/95 p-8 shadow-[0_32px_100px_rgba(2,12,27,0.80),0_0_0_1px_rgba(52,211,153,0.08)] sm:p-10">

        {/* Check icon */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_40px_rgba(52,211,153,0.15)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-10 w-10 text-emerald-300">
              <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Headline */}
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
          Application submitted
        </p>
        <h2 className="mb-4 text-center text-3xl font-bold text-white">{heading}</h2>

        {/* Body copy */}
        <p className="mb-2 text-center text-sm leading-7 text-slate-300">
          We received your signed application and bank statements.
          A funding specialist will review your file and reach out to you shortly.
        </p>
        <p className="mb-8 text-center text-sm leading-7 text-slate-400">
          You may safely close this window or return to your site below.
          {supportEmail && (
            <>
              {' '}Questions? Email us at{' '}
              <a href={`mailto:${supportEmail}`} className="text-cyan-300 underline hover:text-cyan-200">
                {supportEmail}
              </a>
              .
            </>
          )}
        </p>

        {/* CTA */}
        {websiteUrl ? (
          <a
            href={websiteUrl}
            className="block w-full rounded-xl bg-emerald-500 px-6 py-3.5 text-center text-sm font-semibold text-white shadow-[0_4px_24px_rgba(52,211,153,0.25)] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
          >
            {returnLabel} →
          </a>
        ) : (
          <p className="text-center text-xs text-slate-500">You may now close this tab.</p>
        )}
      </div>
    </div>
  );
}
