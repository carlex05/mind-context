import { useEffect, useState } from "react";
import {
  BrandMark,
  KnowledgeLinkView,
  KnowledgePanelFrame,
  KnowledgeSectionView,
  WorkspaceIcon,
  WorkspaceRailView,
  WorkspaceSidebarFrame,
  WorkspaceTabBarView,
  WorkspaceViewHeader,
} from "@mind-context/workspace-ui";

import "./workspace-product-demo.css";

interface DemoLabels {
  readonly aria: string;
  readonly storageTitle: string;
  readonly storageBody: string;
  readonly localVault: string;
  readonly drive: string;
  readonly storageFootnote: string;
  readonly files: string;
  readonly home: string;
  readonly search: string;
  readonly graph: string;
  readonly editorHeading: string;
  readonly editorBefore: string;
  readonly editorAfter: string;
  readonly searchQuery: string;
  readonly resultOne: string;
  readonly resultTwo: string;
  readonly resultThree: string;
  readonly steps: readonly {
    readonly label: string;
    readonly body: string;
  }[];
}

export default function WorkspaceProductDemo({
  locale,
  labels: t,
}: {
  readonly locale: "en" | "es";
  readonly labels: DemoLabels;
}) {
  const isEs = locale === "es";
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    const timer = window.setInterval(
      () => setStep((current) => (current + 1) % 4),
      4500,
    );
    return () => window.clearInterval(timer);
  }, []);

  const activePanel = step === 2 ? "graph" : step === 3 ? "search" : "files";
  return (
    <div className="mc-demo" data-step={step} aria-label={t.aria}>
      <div className="mc-demo-frame">
        <section className="mc-preauth" aria-hidden={step !== 0}>
          <div className="mc-preauth-locale">{isEs ? "ES" : "EN"} ▾</div>
          <div className="mc-preauth-grid">
            <div className="mc-preauth-hero">
              <div className="mc-brand-lockup">
                <BrandMark size={30} />
                <strong>MindContext</strong>
                <span>— Constellation</span>
              </div>
              <span className="mc-eyebrow">
                {isEs
                  ? "PRIVACIDAD PRIMERO · MARKDOWN PRIMERO · TUS ARCHIVOS"
                  : "PRIVACY-FIRST · MARKDOWN-FIRST · YOUR OWN FILES"}
              </span>
              <h3>{t.storageTitle}</h3>
              <p>{t.storageBody}</p>
              <div className="mc-preauth-actions">
                <span className="mc-primary">{t.localVault}</span>
                <span className="mc-secondary">{t.drive}</span>
              </div>
              <small>✓ {t.storageFootnote}</small>
            </div>
            <aside className="mc-principles">
              <span className="mc-section-label">
                {isEs ? "CONSTRUIDO ALREDEDOR DE TUS DATOS" : "BUILT AROUND YOUR DATA"}
              </span>
              <ul>
                <li>{isEs ? "Tus notas siguen siendo Markdown plano." : "Your notes stay plain Markdown."}</li>
                <li>{isEs ? "Tus archivos viven en almacenamiento bajo tu control." : "Your files live in storage you control."}</li>
                <li>{isEs ? "Conexiones e índices se derivan localmente." : "Connections and indexes are derived locally."}</li>
                <li>{isEs ? "La IA local es una ruta de primera clase." : "Local AI is a first-class path."}</li>
              </ul>
            </aside>
          </div>
        </section>

        <section className="mc-workspace" aria-hidden={step === 0}>
          <WorkspaceRailView
            brand={<BrandMark size={28} />}
            items={[
              { id: "files", label: t.files, icon: "folder" },
              { id: "search", label: t.search, icon: "search" },
              { id: "graph", label: t.graph, icon: "graph" },
              { id: "tags", label: isEs ? "Etiquetas" : "Tags", icon: "tag" },
              { id: "settings", label: isEs ? "Ajustes" : "Settings", icon: "settings" },
            ]}
            activeId={activePanel}
          />

          <WorkspaceSidebarFrame
            title={activePanel === "graph" ? t.graph : activePanel === "search" ? t.search : t.files}
            actions={<span className="mc-sidebar-actions">{activePanel === "files" ? "＋　⌕　" : ""}‹</span>}
          >
            {activePanel === "files" ? <FilesDemo /> : null}
            {activePanel === "graph" ? <GraphDemo isEs={isEs} /> : null}
            {activePanel === "search" ? <SearchDemo isEs={isEs} labels={t} /> : null}
          </WorkspaceSidebarFrame>

          <section className="workspace-main mc-demo-main">
            <WorkspaceTabBarView
              tabs={[
                { id: "rag", title: "RAG.md", path: "Notes/RAG.md" },
                { id: "mindcontext", title: "MindContext.md", path: "Notes/MindContext.md" },
              ]}
              activeId="rag"
              homeLabel={t.home}
              newLabel={isEs ? "Nueva nota" : "New note"}
              closeLabel={(title) => isEs ? `Cerrar ${title}` : `Close ${title}`}
            />

            <WorkspaceViewHeader
              canBack={false}
              canForward={false}
              breadcrumb="My Second Brain / Notes / RAG"
              backLabel={isEs ? "Atrás" : "Back"}
              forwardLabel={isEs ? "Adelante" : "Forward"}
              drive={{
                state: "synced",
                storageLabel: "Drive",
                detail: isEs ? "Sincronizado" : "Synced",
                title: isEs ? "Estado de Google Drive" : "Google Drive status",
              }}
              note={{
                syncState: "synced",
                syncLabel: isEs ? "Sincronizado" : "Synced",
                viewIcon: "book",
                viewLabel: isEs ? "Vista de lectura" : "Reading view",
                contextLabel: isEs ? "Propiedades, enlaces y backlinks" : "Properties, links and backlinks",
                saveLabel: isEs ? "Guardar" : "Save",
                rightSidebarOpen: true,
                saveDisabled: true,
              }}
            />

            <section className="mc-demo-editor">
              <div className="mc-editor-document">
                <div className="mc-editor-title"># {t.editorHeading}</div>
                <p>{t.editorBefore} <mark>[[MindContext]]</mark> {t.editorAfter}</p>
                <p>
                  {isEs
                    ? "El contexto se mantiene cerca de los archivos, no atrapado dentro de la aplicación."
                    : "Context stays close to the files, rather than being trapped inside the application."}
                </p>
                <div className="mc-editor-list">- [[Project]]<br/>- [[Local AI]]<br/>- #ai #knowledge</div>
                <span className="mc-editor-caret" />
              </div>
              {step > 0 ? (
                <div className="mc-demo-coachmark">
                  <span>{String(step + 1).padStart(2, "0")}</span>
                  <strong>{t.steps[step]?.label}</strong>
                  <small>{t.steps[step]?.body}</small>
                </div>
              ) : null}
            </section>
          </section>

          <KnowledgePanelFrame
            label={isEs ? "Contexto" : "Context"}
            closeLabel={isEs ? "Cerrar contexto" : "Close context"}
          >
            <section className="mc-properties">
              <h3>{isEs ? "Propiedades" : "Properties"}</h3>
              <div className="mc-property-row"><span>{isEs ? "Etiquetas" : "Tags"}</span><div><b>#ai</b><b>#knowledge</b></div></div>
              <div className="mc-property-row"><span>Aliases</span><div className="mc-empty-input">{isEs ? "Añadir alias" : "Add alias"}</div></div>
            </section>
            <KnowledgeSectionView title={isEs ? "Enlaces" : "Links"}>
              <KnowledgeLinkView title="MindContext" subtitle="Notes/MindContext.md" />
              <KnowledgeLinkView title="Local AI" subtitle="Notes/Local AI.md" />
            </KnowledgeSectionView>
            <div className="mc-backlinks">
              <KnowledgeSectionView title="Backlinks">
                <KnowledgeLinkView title="Project" subtitle="Notes/Project.md" />
                <KnowledgeLinkView title="MindContext" subtitle="Notes/MindContext.md" />
              </KnowledgeSectionView>
            </div>
          </KnowledgePanelFrame>
        </section>
      </div>

      <ol className="mc-demo-stepper">
        {t.steps.map((demoStep, index) => (
          <li key={demoStep.label}>
            <button type="button" onClick={() => setStep(index)} aria-current={index === step ? "step" : undefined}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{demoStep.label}</strong>
              <small>{demoStep.body}</small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function FilesDemo() {
  return (
    <div className="file-tree mc-demo-tree">
      <div className="mc-tree-row folder"><span>⌄</span><strong>Notes</strong><i>⋯</i></div>
      <div className="mc-tree-row child active"><span></span><strong>RAG.md</strong><i>⋯</i></div>
      <div className="mc-tree-row child"><span></span><strong>MindContext.md</strong><i>⋯</i></div>
      <div className="mc-tree-row child"><span></span><strong>Project.md</strong><i>⋯</i></div>
      <div className="mc-tree-row folder"><span>›</span><strong>Resources</strong><i>⋯</i></div>
      <div className="mc-tree-row folder"><span>›</span><strong>Archive</strong><i>⋯</i></div>
    </div>
  );
}

function GraphDemo({ isEs }: { readonly isEs: boolean }) {
  return (
    <>
      <div className="local-graph-canvas mc-local-graph">
        <svg viewBox="0 0 250 230" aria-hidden="true">
          <g className="mc-graph-edges">
            <path d="M55 116 C85 75 115 82 137 108"/>
            <path d="M137 108 C171 74 197 80 215 101"/>
            <path d="M137 108 C166 145 192 157 215 174"/>
            <path d="M55 116 C91 153 111 144 137 108"/>
          </g>
          <g className="mc-graph-dots">
            <circle cx="55" cy="116" r="7"/><circle className="active" cx="137" cy="108" r="10"/>
            <circle cx="215" cy="101" r="7"/><circle cx="215" cy="174" r="7"/>
          </g>
          <g className="mc-graph-text">
            <text x="32" y="140">Project</text><text className="active" x="124" y="135">RAG</text>
            <text x="176" y="84">MindContext</text><text x="185" y="198">Local AI</text>
          </g>
        </svg>
      </div>
      <div className="mc-graph-meta">{isEs ? "3 notas conectadas" : "3 connected notes"}</div>
      <div className="mc-connection-row"><span>MindContext</span><small>{isEs ? "Ambas direcciones" : "Both directions"}</small></div>
      <div className="mc-connection-row"><span>Project</span><small>Backlink</small></div>
      <div className="mc-connection-row"><span>Local AI</span><small>{isEs ? "Saliente" : "Outgoing"}</small></div>
    </>
  );
}

function SearchDemo({ isEs, labels: t }: { readonly isEs: boolean; readonly labels: DemoLabels }) {
  return (
    <>
      <div className="search-input-wrap mc-search-input">
        <WorkspaceIcon name="search" />
        <strong>{t.searchQuery}</strong>
        <span>×</span>
      </div>
      <div className="search-results-meta">{isEs ? "3 resultados · híbrida" : "3 results · hybrid"}</div>
      <div className="mc-search-result selected"><strong>RAG</strong><small>{t.resultOne}</small><em>#ai　#knowledge</em></div>
      <div className="mc-search-result"><strong>MindContext</strong><small>{t.resultTwo}</small><em>#product</em></div>
      <div className="mc-search-result"><strong>Project</strong><small>{t.resultThree}</small><em>#planning</em></div>
    </>
  );
}
