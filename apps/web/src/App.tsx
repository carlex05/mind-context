import { PRODUCT_PRINCIPLES } from "@mind-context/core";

export function App() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">MindContext / MVP foundation</span>
        <h1>Your files. Your knowledge. Private by default.</h1>
        <p className="lede">
          A browser-first knowledge workspace whose canonical state is plain
          Markdown in storage controlled by the user.
        </p>
      </section>

      <section className="workspace" aria-label="Architecture foundation">
        <aside>
          <h2>Workspace</h2>
          <p>Google Drive adapter comes in Slice 1.</p>
        </aside>

        <article>
          <h2>Architecture principles</h2>
          <ul>
            {PRODUCT_PRINCIPLES.map((principle) => (
              <li key={principle}>{principle}</li>
            ))}
          </ul>
        </article>

        <aside>
          <h2>Privacy boundary</h2>
          <p>
            Core editing, indexing and retrieval must not transmit private
            knowledge to MindContext-controlled services.
          </p>
        </aside>
      </section>
    </main>
  );
}
