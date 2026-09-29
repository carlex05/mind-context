export function BrandMark({
  size = 32,
  className,
}: {
  readonly size?: number;
  readonly className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={Math.round(size * 0.76)}
      viewBox="0 0 64 48"
      fill="none"
      aria-hidden="true"
    >
      <path d="M7 37 18 11l14 20L46 9l11 28-25-6" stroke="var(--mc-deep-blue)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m18 11 14 20L46 9" stroke="var(--mc-context-blue)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="37" r="5" fill="#AEB9FF" />
      <circle cx="18" cy="11" r="5.5" fill="var(--mc-context-blue)" />
      <circle cx="32" cy="31" r="6" fill="var(--mc-deep-blue)" />
      <circle cx="46" cy="9" r="5.5" fill="var(--mc-focus-amber)" />
      <circle cx="57" cy="37" r="5" fill="#AEB9FF" />
    </svg>
  );
}

export function BrandLockup({ className = "" }: { readonly className?: string }) {
  return (
    <div
      className={["brand-lockup", className].filter(Boolean).join(" ")}
      role="img"
      aria-label="MindContext — Constellation"
    >
      <BrandMark size={34} />
      <span className="brand-wordmark">MindContext</span>
      <span className="brand-divider" aria-hidden="true">—</span>
      <span className="brand-edition">Constellation</span>
    </div>
  );
}
