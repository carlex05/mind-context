import { BrandMark } from "@mind-context/workspace-ui";

export { BrandMark };

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
