import type { StorageProvider } from "@mind-context/storage";

export type WorkspaceStarter = "blank" | "para";
export type TemplateLocale = "en" | "es";

export interface WorkspaceTemplateEntry {
  readonly type: "directory" | "markdown";
  readonly path: string;
  readonly content?: string;
}

export interface AppliedWorkspaceTemplate {
  readonly createdDirectories: number;
  readonly createdMarkdownFiles: number;
  readonly startNoteId?: string;
}

export function buildWorkspaceTemplate(
  starter: WorkspaceStarter,
  locale: TemplateLocale,
): readonly WorkspaceTemplateEntry[] {
  if (starter === "blank") return [];
  return locale === "es" ? spanishParaTemplate() : englishParaTemplate();
}

export async function applyWorkspaceTemplate(
  provider: StorageProvider,
  starter: WorkspaceStarter,
  locale: TemplateLocale,
): Promise<AppliedWorkspaceTemplate> {
  const entries = buildWorkspaceTemplate(starter, locale);
  if (entries.length === 0) {
    return { createdDirectories: 0, createdMarkdownFiles: 0 };
  }

  const directoryIds = new Map<string, string>();
  directoryIds.set("", provider.rootId);

  const directories = entries
    .filter((entry) => entry.type === "directory")
    .sort((left, right) => pathDepth(left.path) - pathDepth(right.path));

  for (const entry of directories) {
    const parent = parentPath(entry.path);
    const parentId = directoryIds.get(parent);
    if (!parentId) {
      throw new Error(`Template parent directory was not created: ${parent}`);
    }
    const metadata = await provider.createDirectory(
      parentId,
      baseName(entry.path),
    );
    directoryIds.set(entry.path, metadata.id);
  }

  let startNoteId: string | undefined;
  let createdMarkdownFiles = 0;

  for (const entry of entries.filter((item) => item.type === "markdown")) {
    const parent = parentPath(entry.path);
    const parentId = directoryIds.get(parent);
    if (!parentId) {
      throw new Error(`Template parent directory was not created: ${parent}`);
    }
    const metadata = await provider.createText(
      parentId,
      baseName(entry.path),
      entry.content ?? "",
    );
    createdMarkdownFiles += 1;
    if (parent === "" && isStartHerePath(entry.path, locale)) {
      startNoteId = metadata.id;
    }
  }

  return {
    createdDirectories: directories.length,
    createdMarkdownFiles,
    ...(startNoteId ? { startNoteId } : {}),
  };
}

function englishParaTemplate(): readonly WorkspaceTemplateEntry[] {
  return [
    directory("Projects"),
    directory("Areas"),
    directory("Resources"),
    directory("Archive"),
    markdown(
      "Start Here.md",
      `# Welcome to your Second Brain

This workspace starts with **PARA**, a simple way to organize knowledge by how actionable it is.

## Projects

Short-term efforts with a concrete outcome and a clear definition of done.

Examples:
- Launch MindContext MVP
- Plan a trip
- Prepare a proposal

[[Projects/README|How to use Projects]]

## Areas

Responsibilities or standards you want to maintain over time.

Examples:
- Health
- Finances
- Career
- Home

[[Areas/README|How to use Areas]]

## Resources

Topics, references and interests that may be useful now or later.

Examples:
- Software architecture
- Artificial intelligence
- Recipes
- Travel research

[[Resources/README|How to use Resources]]

## Archive

Inactive material: completed projects, former areas and resources you no longer need in active view.

[[Archive/README|How to use Archive]]

## A simple habit

1. Capture useful information without overthinking where it belongs.
2. Put active outcomes in **Projects**.
3. Put ongoing responsibilities in **Areas**.
4. Keep reference material in **Resources**.
5. Move inactive material to **Archive**.

The folders are only a starting point. Rename, move or remove anything that does not fit how you think.
`,
    ),
    markdown(
      "Projects/README.md",
      `# Projects

A project is a concrete outcome you are actively working toward and that can eventually be finished.

## Put something here when

- it requires more than one action;
- you are actively working on it;
- it has a concrete outcome;
- you can recognize when it is done.

## Examples

- Launch MindContext MVP
- Prepare a conference talk
- Plan a trip to Japan
- Move to a new apartment

## Suggested note structure

\`\`\`md
# Project name

## Outcome

What does done look like?

## Next actions

- [ ] ...

## Notes

...

## Related

- [[...]]
\`\`\`

When a project is complete or no longer active, move it to [[Archive/README|Archive]].
`,
    ),
    markdown(
      "Areas/README.md",
      `# Areas

An area is an ongoing responsibility or standard you want to maintain. Unlike a project, it usually has no finish line.

## Put something here when

- it matters continuously;
- you are responsible for maintaining a standard;
- there is no single final deliverable.

## Examples

- Health
- Personal finances
- Career development
- Home
- Relationships

## Useful questions

- What does "good enough" look like in this area?
- Which routines or standards do I want to maintain?
- Which active projects support this area?

Link related projects with ordinary Markdown or wikilinks, for example [[Projects/README|Projects]].
`,
    ),
    markdown(
      "Resources/README.md",
      `# Resources

Resources are topics, references and interests that may become useful in the future.

## Put something here when

- you want to learn about a topic;
- it is useful reference material;
- it supports several projects or areas;
- it is interesting but not currently actionable.

## Examples

- Distributed systems
- Design inspiration
- Travel research
- Books and papers
- Recipes

Prefer notes that capture your understanding, useful excerpts or links with context instead of collecting material without explanation.

If a resource becomes directly actionable, connect it to a note in [[Projects/README|Projects]] or [[Areas/README|Areas]].
`,
    ),
    markdown(
      "Archive/README.md",
      `# Archive

Archive stores material that is no longer active but may still be worth keeping.

## Move something here when

- a project is complete;
- an area is no longer your responsibility;
- a resource is no longer useful in active navigation;
- you want to reduce visual noise without deleting knowledge.

Archiving is not deletion. The Markdown remains searchable and linkable.

If something becomes relevant again, move it back to [[Projects/README|Projects]], [[Areas/README|Areas]] or [[Resources/README|Resources]].
`,
    ),
  ];
}

function spanishParaTemplate(): readonly WorkspaceTemplateEntry[] {
  return [
    directory("Proyectos"),
    directory("Áreas"),
    directory("Recursos"),
    directory("Archivo"),
    markdown(
      "Empieza aquí.md",
      `# Bienvenido a tu Second Brain

Este espacio comienza con **PARA**, una forma simple de organizar el conocimiento según qué tan accionable es.

## Proyectos

Esfuerzos de corto plazo con un resultado concreto y una definición clara de terminado.

Ejemplos:
- Lanzar el MVP de MindContext
- Planear un viaje
- Preparar una propuesta

[[Proyectos/README|Cómo usar Proyectos]]

## Áreas

Responsabilidades o estándares que quieres mantener a lo largo del tiempo.

Ejemplos:
- Salud
- Finanzas
- Carrera profesional
- Hogar

[[Áreas/README|Cómo usar Áreas]]

## Recursos

Temas, referencias e intereses que pueden ser útiles ahora o en el futuro.

Ejemplos:
- Arquitectura de software
- Inteligencia artificial
- Recetas
- Investigación de viajes

[[Recursos/README|Cómo usar Recursos]]

## Archivo

Material inactivo: proyectos terminados, áreas anteriores y recursos que ya no necesitas en la vista activa.

[[Archivo/README|Cómo usar Archivo]]

## Un hábito simple

1. Captura información útil sin pensar demasiado dónde debe ir.
2. Pon los resultados activos en **Proyectos**.
3. Pon las responsabilidades continuas en **Áreas**.
4. Guarda material de referencia en **Recursos**.
5. Mueve el material inactivo a **Archivo**.

Las carpetas son sólo un punto de partida. Renombra, mueve o elimina lo que no encaje con tu forma de pensar.
`,
    ),
    markdown(
      "Proyectos/README.md",
      `# Proyectos

Un proyecto es un resultado concreto en el que estás trabajando activamente y que eventualmente puede considerarse terminado.

## Pon algo aquí cuando

- requiere más de una acción;
- estás trabajando activamente en ello;
- tiene un resultado concreto;
- puedes reconocer cuándo está terminado.

## Ejemplos

- Lanzar el MVP de MindContext
- Preparar una charla
- Planear un viaje a Japón
- Mudarse a un nuevo apartamento

## Estructura sugerida para una nota

\`\`\`md
# Nombre del proyecto

## Resultado

¿Cómo sabrás que está terminado?

## Próximas acciones

- [ ] ...

## Notas

...

## Relacionado

- [[...]]
\`\`\`

Cuando un proyecto termine o deje de estar activo, muévelo a [[Archivo/README|Archivo]].
`,
    ),
    markdown(
      "Áreas/README.md",
      `# Áreas

Un área es una responsabilidad continua o un estándar que quieres mantener. A diferencia de un proyecto, normalmente no tiene una fecha de finalización.

## Pon algo aquí cuando

- importa de forma continua;
- eres responsable de mantener un estándar;
- no existe un único entregable final.

## Ejemplos

- Salud
- Finanzas personales
- Desarrollo profesional
- Hogar
- Relaciones

## Preguntas útiles

- ¿Cómo se ve un nivel suficientemente bueno en esta área?
- ¿Qué rutinas o estándares quiero mantener?
- ¿Qué proyectos activos apoyan esta área?

Relaciona los proyectos correspondientes con Markdown normal o wikilinks, por ejemplo [[Proyectos/README|Proyectos]].
`,
    ),
    markdown(
      "Recursos/README.md",
      `# Recursos

Los recursos son temas, referencias e intereses que pueden resultar útiles en el futuro.

## Pon algo aquí cuando

- quieres aprender sobre un tema;
- es material útil de referencia;
- apoya varios proyectos o áreas;
- te interesa, pero todavía no requiere una acción.

## Ejemplos

- Sistemas distribuidos
- Inspiración de diseño
- Investigación de viajes
- Libros y artículos
- Recetas

Intenta que las notas capturen tu comprensión, extractos útiles o enlaces con contexto, en lugar de acumular material sin explicación.

Si un recurso se vuelve directamente accionable, relaciónalo con una nota de [[Proyectos/README|Proyectos]] o [[Áreas/README|Áreas]].
`,
    ),
    markdown(
      "Archivo/README.md",
      `# Archivo

Archivo guarda material que ya no está activo pero que todavía puede valer la pena conservar.

## Mueve algo aquí cuando

- un proyecto terminó;
- un área dejó de ser tu responsabilidad;
- un recurso ya no es útil en la navegación activa;
- quieres reducir ruido visual sin borrar conocimiento.

Archivar no significa eliminar. El Markdown continúa siendo buscable y enlazable.

Si algo vuelve a ser relevante, muévelo de nuevo a [[Proyectos/README|Proyectos]], [[Áreas/README|Áreas]] o [[Recursos/README|Recursos]].
`,
    ),
  ];
}

function directory(path: string): WorkspaceTemplateEntry {
  return { type: "directory", path };
}

function markdown(path: string, content: string): WorkspaceTemplateEntry {
  return { type: "markdown", path, content };
}

function pathDepth(path: string): number {
  return path.split("/").length;
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

function baseName(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? path : path.slice(separator + 1);
}

function isStartHerePath(path: string, locale: TemplateLocale): boolean {
  return path === (locale === "es" ? "Empieza aquí.md" : "Start Here.md");
}
