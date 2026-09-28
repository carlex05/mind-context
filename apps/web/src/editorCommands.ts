import type { EditorView, KeyBinding } from "@codemirror/view";

export type MarkdownCommandGroup =
  | "heading"
  | "inline"
  | "block"
  | "insert"
  | "obsidian";

export type MarkdownCommandId =
  | "heading1"
  | "heading2"
  | "heading3"
  | "bold"
  | "italic"
  | "strikethrough"
  | "inlineCode"
  | "link"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "codeBlock"
  | "table"
  | "horizontalRule"
  | "wikilink"
  | "callout"
  | "mathBlock"
  | "mermaid";

export interface MarkdownCommandDefinition {
  readonly id: MarkdownCommandId;
  readonly labelKey: string;
  readonly icon: string;
  readonly group: MarkdownCommandGroup;
  readonly keywords: readonly string[];
  readonly toolbar: boolean;
  readonly slash: boolean;
  readonly shortcut?: string;
}

export interface MarkdownTransform {
  readonly changes: Array<{
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }>;
  readonly selection: {
    readonly anchor: number;
    readonly head?: number;
  };
}

export const markdownCommands: readonly MarkdownCommandDefinition[] = [
  {
    id: "heading1",
    labelKey: "editor.commands.heading1",
    icon: "H1",
    group: "heading",
    keywords: ["heading", "title", "h1"],
    toolbar: true,
    slash: true,
  },
  {
    id: "heading2",
    labelKey: "editor.commands.heading2",
    icon: "H2",
    group: "heading",
    keywords: ["heading", "subtitle", "h2"],
    toolbar: true,
    slash: true,
  },
  {
    id: "heading3",
    labelKey: "editor.commands.heading3",
    icon: "H3",
    group: "heading",
    keywords: ["heading", "subtitle", "h3"],
    toolbar: true,
    slash: true,
  },
  {
    id: "bold",
    labelKey: "editor.commands.bold",
    icon: "B",
    group: "inline",
    keywords: ["bold", "strong"],
    toolbar: true,
    slash: false,
    shortcut: "Ctrl/⌘ B",
  },
  {
    id: "italic",
    labelKey: "editor.commands.italic",
    icon: "I",
    group: "inline",
    keywords: ["italic", "emphasis"],
    toolbar: true,
    slash: false,
    shortcut: "Ctrl/⌘ I",
  },
  {
    id: "strikethrough",
    labelKey: "editor.commands.strikethrough",
    icon: "S",
    group: "inline",
    keywords: ["strike", "strikethrough"],
    toolbar: true,
    slash: false,
    shortcut: "Ctrl/⌘ ⇧ X",
  },
  {
    id: "inlineCode",
    labelKey: "editor.commands.inlineCode",
    icon: "<>",
    group: "inline",
    keywords: ["inline", "code"],
    toolbar: true,
    slash: false,
  },
  {
    id: "link",
    labelKey: "editor.commands.link",
    icon: "↗",
    group: "inline",
    keywords: ["link", "url"],
    toolbar: true,
    slash: false,
  },
  {
    id: "bulletList",
    labelKey: "editor.commands.bulletList",
    icon: "•",
    group: "block",
    keywords: ["bullet", "unordered", "list"],
    toolbar: true,
    slash: true,
  },
  {
    id: "orderedList",
    labelKey: "editor.commands.orderedList",
    icon: "1.",
    group: "block",
    keywords: ["ordered", "numbered", "list"],
    toolbar: true,
    slash: true,
  },
  {
    id: "taskList",
    labelKey: "editor.commands.taskList",
    icon: "☑",
    group: "block",
    keywords: ["task", "todo", "checklist"],
    toolbar: true,
    slash: true,
  },
  {
    id: "quote",
    labelKey: "editor.commands.quote",
    icon: "❞",
    group: "block",
    keywords: ["quote", "blockquote"],
    toolbar: true,
    slash: true,
  },
  {
    id: "codeBlock",
    labelKey: "editor.commands.codeBlock",
    icon: "</>",
    group: "insert",
    keywords: ["code", "fence", "block"],
    toolbar: true,
    slash: true,
  },
  {
    id: "table",
    labelKey: "editor.commands.table",
    icon: "▦",
    group: "insert",
    keywords: ["table", "grid", "columns", "rows"],
    toolbar: true,
    slash: true,
  },
  {
    id: "horizontalRule",
    labelKey: "editor.commands.horizontalRule",
    icon: "—",
    group: "insert",
    keywords: ["divider", "rule", "separator"],
    toolbar: false,
    slash: true,
  },
  {
    id: "wikilink",
    labelKey: "editor.commands.wikilink",
    icon: "[[]]",
    group: "obsidian",
    keywords: ["wiki", "wikilink", "note", "link"],
    toolbar: false,
    slash: true,
  },
  {
    id: "callout",
    labelKey: "editor.commands.callout",
    icon: "!",
    group: "obsidian",
    keywords: ["callout", "admonition", "note"],
    toolbar: false,
    slash: true,
  },
  {
    id: "mathBlock",
    labelKey: "editor.commands.mathBlock",
    icon: "∑",
    group: "obsidian",
    keywords: ["math", "latex", "equation"],
    toolbar: false,
    slash: true,
  },
  {
    id: "mermaid",
    labelKey: "editor.commands.mermaid",
    icon: "◇",
    group: "obsidian",
    keywords: ["mermaid", "diagram", "flowchart"],
    toolbar: false,
    slash: true,
  },
];

export const toolbarMarkdownCommands = markdownCommands.filter(
  (command) => command.toolbar,
);

export const slashMarkdownCommands = markdownCommands.filter(
  (command) => command.slash,
);

export const markdownCommandKeymap: readonly KeyBinding[] = [
  {
    key: "Mod-b",
    run: (view) => executeMarkdownCommand(view, "bold"),
  },
  {
    key: "Mod-i",
    run: (view) => executeMarkdownCommand(view, "italic"),
  },
  {
    key: "Mod-Shift-x",
    run: (view) => executeMarkdownCommand(view, "strikethrough"),
  },
];

export function executeMarkdownCommand(
  view: EditorView,
  id: MarkdownCommandId,
): boolean {
  const selection = view.state.selection.main;
  const transform = createMarkdownTransform(
    id,
    view.state.doc.toString(),
    selection.from,
    selection.to,
  );

  view.dispatch({
    changes: transform.changes,
    selection: transform.selection,
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

export function createMarkdownTransform(
  id: MarkdownCommandId,
  doc: string,
  from: number,
  to: number,
): MarkdownTransform {
  switch (id) {
    case "heading1":
      return prefixSelectedLines(doc, from, to, "heading", () => "# ");
    case "heading2":
      return prefixSelectedLines(doc, from, to, "heading", () => "## ");
    case "heading3":
      return prefixSelectedLines(doc, from, to, "heading", () => "### ");
    case "bold":
      return wrapSelection(doc, from, to, "**", "**");
    case "italic":
      return wrapSelection(doc, from, to, "*", "*");
    case "strikethrough":
      return wrapSelection(doc, from, to, "~~", "~~");
    case "inlineCode":
      return wrapSelection(doc, from, to, "`", "`");
    case "link":
      return linkSelection(doc, from, to);
    case "bulletList":
      return prefixSelectedLines(doc, from, to, "list", () => "- ");
    case "orderedList":
      return prefixSelectedLines(
        doc,
        from,
        to,
        "list",
        (index) => `${index + 1}. `,
      );
    case "taskList":
      return prefixSelectedLines(doc, from, to, "list", () => "- [ ] ");
    case "quote":
      return prefixSelectedLines(doc, from, to, "list", () => "> ");
    case "codeBlock":
      return fencedCodeBlock(doc, from, to);
    case "table":
      return insertTable(doc, from, to);
    case "horizontalRule":
      return insertStandaloneBlock(doc, from, to, "---");
    case "wikilink":
      return wrapSelection(doc, from, to, "[[", "]]");
    case "callout":
      return insertCallout(doc, from, to);
    case "mathBlock":
      return insertEditableBlock(doc, from, to, "$$\n\n$$", 3, 3);
    case "mermaid": {
      const block = "```mermaid\nflowchart LR\n  A --> B\n```";
      const bodyStart = block.indexOf("flowchart");
      const bodyEnd = block.lastIndexOf("\n```");
      return insertEditableBlock(doc, from, to, block, bodyStart, bodyEnd);
    }
  }
}

function wrapSelection(
  doc: string,
  from: number,
  to: number,
  open: string,
  close: string,
): MarkdownTransform {
  const selected = doc.slice(from, to);
  const insert = `${open}${selected}${close}`;
  const contentStart = from + open.length;

  return {
    changes: [{ from, to, insert }],
    selection:
      selected.length > 0
        ? {
            anchor: contentStart,
            head: contentStart + selected.length,
          }
        : { anchor: contentStart },
  };
}

function linkSelection(
  doc: string,
  from: number,
  to: number,
): MarkdownTransform {
  const selected = doc.slice(from, to);
  if (selected.length === 0) {
    return {
      changes: [{ from, to, insert: "[](https://)" }],
      selection: { anchor: from + 1 },
    };
  }

  const insert = `[${selected}](https://)`;
  const urlStart = from + selected.length + 3;
  return {
    changes: [{ from, to, insert }],
    selection: {
      anchor: urlStart,
      head: urlStart + "https://".length,
    },
  };
}

function prefixSelectedLines(
  doc: string,
  from: number,
  to: number,
  mode: "heading" | "list",
  marker: (index: number) => string,
): MarkdownTransform {
  const lineStart = doc.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const rangeEnd = to > from ? to - 1 : to;
  const nextBreak = doc.indexOf("\n", rangeEnd);
  const lineEnd = nextBreak === -1 ? doc.length : nextBreak;
  const original = doc.slice(lineStart, lineEnd);
  let index = 0;

  const insert = original
    .split("\n")
    .map((line) => {
      const indent = /^\s*/.exec(line)?.[0] ?? "";
      const raw = line.slice(indent.length);
      const body =
        mode === "heading"
          ? raw.replace(/^#{1,6}\s+/, "")
          : raw.replace(
              /^(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+|>\s?)/,
              "",
            );
      const prefix = marker(index);
      index += 1;
      return `${indent}${prefix}${body}`;
    })
    .join("\n");

  return {
    changes: [{ from: lineStart, to: lineEnd, insert }],
    selection:
      from === to
        ? { anchor: lineStart + insert.length }
        : {
            anchor: lineStart,
            head: lineStart + insert.length,
          },
  };
}

function fencedCodeBlock(
  doc: string,
  from: number,
  to: number,
): MarkdownTransform {
  const selected = doc.slice(from, to);
  const code = selected.length > 0 ? selected : "";
  const suffix = code.length === 0 || !code.endsWith("\n") ? "\n" : "";
  const block = "```\n" + code + suffix + "```";
  const bodyStart = 4;
  const bodyEnd = bodyStart + code.length;

  return insertEditableBlock(doc, from, to, block, bodyStart, bodyEnd);
}

function insertTable(
  doc: string,
  from: number,
  to: number,
): MarkdownTransform {
  const table = [
    "| Column 1 | Column 2 | Column 3 |",
    "| --- | --- | --- |",
    "|  |  |  |",
    "|  |  |  |",
  ].join("\n");
  const headerStart = table.indexOf("Column 1");

  return insertEditableBlock(
    doc,
    from,
    to,
    table,
    headerStart,
    headerStart + "Column 1".length,
  );
}

function insertCallout(
  doc: string,
  from: number,
  to: number,
): MarkdownTransform {
  const selected = doc.slice(from, to);
  const body =
    selected.length > 0
      ? selected
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")
      : "> ";
  const block = `> [!note]\n${body}`;
  const cursor = block.length;

  return insertEditableBlock(doc, from, to, block, cursor, cursor);
}

function insertStandaloneBlock(
  doc: string,
  from: number,
  to: number,
  block: string,
): MarkdownTransform {
  return insertEditableBlock(doc, from, to, block, block.length, block.length);
}

function insertEditableBlock(
  doc: string,
  from: number,
  to: number,
  block: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownTransform {
  const lead = from > 0 && doc[from - 1] !== "\n" ? "\n\n" : "";
  const tail = to < doc.length && doc[to] !== "\n" ? "\n\n" : "";
  const insert = `${lead}${block}${tail}`;
  const start = from + lead.length + selectionStart;
  const end = from + lead.length + selectionEnd;

  return {
    changes: [{ from, to, insert }],
    selection:
      end > start
        ? { anchor: start, head: end }
        : { anchor: start },
  };
}
