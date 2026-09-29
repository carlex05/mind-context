import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import {
  findMarkdownNavigationOffset,
  type MarkdownNavigationTarget,
} from "@mind-context/markdown";
import {
  executeMarkdownCommand,
  markdownCommandKeymap,
  markdownCommands,
  slashMarkdownCommands,
  toolbarMarkdownCommands,
  type MarkdownCommandId,
} from "./editorCommands";

export interface EditorLinkTarget {
  readonly path: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly headings: readonly string[];
}

export interface MarkdownEditorProps {
  readonly value: string;
  readonly label: string;
  readonly linkTargets?: readonly EditorLinkTarget[];
  readonly tags?: readonly string[];
  readonly navigationTarget?: MarkdownNavigationTarget | undefined;
  readonly navigationKey?: number | undefined;
  readonly onChange: (value: string) => void;
  readonly onAttachFiles?: (
    files: readonly File[],
    source: "drop" | "paste",
  ) => Promise<readonly string[]>;
}

type CommandLabels = Partial<Record<MarkdownCommandId, string>>;

export function MarkdownEditor({
  value,
  label,
  linkTargets = [],
  tags = [],
  navigationTarget,
  navigationKey = 0,
  onChange,
  onAttachFiles,
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onAttachFilesRef = useRef(onAttachFiles);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const linkTargetsRef = useRef(linkTargets);
  const tagsRef = useRef(tags);
  const commandLabelsRef = useRef<CommandLabels>({});
  const completionSourceRef = useRef(
    (context: CompletionContext): CompletionResult | null =>
      createKnowledgeCompletionSource(
        linkTargetsRef.current,
        tagsRef.current,
        commandLabelsRef.current,
      )(context),
  );

  onChangeRef.current = onChange;
  onAttachFilesRef.current = onAttachFiles;
  linkTargetsRef.current = linkTargets;
  tagsRef.current = tags;
  commandLabelsRef.current = Object.fromEntries(
    markdownCommands.map((command) => [
      command.id,
      String(t(command.labelKey)),
    ]),
  ) as CommandLabels;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const editor = new EditorView({
      doc: value,
      parent: host,
      extensions: [
        keymap.of([
          { key: "Enter", run: acceptCompletion },
          { key: "Tab", run: acceptCompletion },
          ...markdownCommandKeymap,
          ...markdownKeymap,
        ]),
        basicSetup,
        markdown(),
        autocompletion({
          override: [completionSourceRef.current],
          activateOnTyping: true,
          // Slash commands should be executable as soon as their menu is visible.
          interactionDelay: 0,
        }),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          dragenter(event) {
            if (!hasDraggedFiles(event.dataTransfer)) return false;
            event.preventDefault();
            setDraggingFiles(true);
            return true;
          },
          dragover(event) {
            if (!hasDraggedFiles(event.dataTransfer)) return false;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
            setDraggingFiles(true);
            return true;
          },
          dragleave(event, view) {
            const next = event.relatedTarget;
            if (next instanceof Node && view.dom.contains(next)) return false;
            setDraggingFiles(false);
            return false;
          },
          drop(event, view) {
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length === 0 || !onAttachFilesRef.current) return false;
            event.preventDefault();
            setDraggingFiles(false);
            const position =
              view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
              view.state.selection.main.head;
            void attachFilesAtPosition(
              view,
              files,
              "drop",
              position,
              position,
              onAttachFilesRef.current,
            );
            return true;
          },
          paste(event, view) {
            const files = Array.from(event.clipboardData?.files ?? []).filter(
              (file) => file.type.startsWith("image/"),
            );
            if (files.length === 0 || !onAttachFilesRef.current) return false;
            event.preventDefault();
            const selection = view.state.selection.main;
            void attachFilesAtPosition(
              view,
              files,
              "paste",
              selection.from,
              selection.to,
              onAttachFilesRef.current,
            );
            return true;
          },
        }),
        EditorView.contentAttributes.of({
          "aria-label": label,
          "aria-multiline": "true",
          role: "textbox",
          spellcheck: "true",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.contentDOM.setAttribute("aria-label", label);
  }, [label]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const currentValue = editor.state.doc.toString();
    if (currentValue === value) return;

    editor.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    });
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !navigationTarget) return;

    const content = editor.state.doc.toString();
    const offset = findMarkdownNavigationOffset(content, navigationTarget);
    if (offset === undefined) return;

    const position = Math.min(offset, editor.state.doc.length);
    editor.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: "center" }),
    });
    editor.focus();
  }, [
    navigationKey,
    navigationTarget?.heading,
    navigationTarget?.blockId,
  ]);

  const runCommand = (id: MarkdownCommandId) => {
    const editor = editorRef.current;
    if (!editor) return;
    executeMarkdownCommand(editor, id);
  };

  return (
    <div className="markdown-editor-shell">
      <div
        className="markdown-editor-toolbar"
        role="toolbar"
        aria-label={t("editor.toolbarAria")}
      >
        {toolbarMarkdownCommands.map((command) => {
          const commandLabel =
            commandLabelsRef.current[command.id] ?? command.id;
          const title = command.shortcut
            ? `${commandLabel} (${command.shortcut})`
            : commandLabel;

          return (
            <button
              key={command.id}
              type="button"
              className="markdown-command-button"
              data-command={command.id}
              data-group={command.group}
              aria-label={commandLabel}
              title={title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runCommand(command.id)}
            >
              <span aria-hidden="true">{command.icon}</span>
            </button>
          );
        })}
      </div>
      <div className="markdown-editor" ref={hostRef} />
      {draggingFiles ? (
        <div className="markdown-attachment-dropzone" aria-hidden="true">
          <span>{t("editor.dropAttachments")}</span>
        </div>
      ) : null}
    </div>
  );
}

function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  return Boolean(
    dataTransfer &&
      (dataTransfer.files.length > 0 ||
        Array.from(dataTransfer.types).includes("Files")),
  );
}

async function attachFilesAtPosition(
  view: EditorView,
  files: readonly File[],
  source: "drop" | "paste",
  requestedFrom: number,
  requestedTo: number,
  attachFiles: (
    files: readonly File[],
    source: "drop" | "paste",
  ) => Promise<readonly string[]>,
) {
  const references = await attachFiles(files, source);
  if (references.length === 0 || view.destroyed) return;

  const from = Math.min(requestedFrom, view.state.doc.length);
  const to = Math.min(Math.max(requestedTo, from), view.state.doc.length);
  const insert = references.join("\n");
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  });
  view.focus();
}

function createKnowledgeCompletionSource(
  linkTargets: readonly EditorLinkTarget[],
  tags: readonly string[],
  commandLabels: CommandLabels,
) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.state.sliceDoc(
      context.state.doc.lineAt(context.pos).from,
      context.pos,
    );

    const slashMatch = /^(\s*)\/([^\s/]*)$/u.exec(before);
    if (slashMatch) {
      const typed = slashMatch[2] ?? "";
      const slashFrom = context.pos - typed.length - 1;
      const normalized = typed.toLocaleLowerCase();
      const options: Completion[] = slashMarkdownCommands
        .filter((command) => {
          const label = commandLabels[command.id] ?? command.id;
          return [label, command.id, ...command.keywords].some((candidate) =>
            candidate.toLocaleLowerCase().includes(normalized),
          );
        })
        .map((command) => {
          const label = commandLabels[command.id] ?? command.id;
          return {
            label,
            type: "keyword",
            ...(command.shortcut ? { detail: command.shortcut } : {}),
            apply: (
              view: EditorView,
              _completion: Completion,
              _from: number,
              to: number,
            ) => {
              view.dispatch({
                changes: {
                  from: slashFrom,
                  to,
                  insert: "",
                },
                selection: { anchor: slashFrom },
              });
              executeMarkdownCommand(view, command.id);
            },
          };
        });

      return {
        from: context.pos - typed.length,
        options,
        filter: false,
      };
    }

    const linkMatch = /\[\[([^\]\n]*)$/.exec(before);
    if (linkMatch) {
      const typed = linkMatch[1] ?? "";
      const hashIndex = typed.indexOf("#");
      const from = context.pos - typed.length;

      if (hashIndex >= 0) {
        const targetText = typed.slice(0, hashIndex).trim();
        const headingText = typed.slice(hashIndex + 1).toLocaleLowerCase();
        const target = findTarget(linkTargets, targetText);
        if (!target) return { from, options: [] };

        const targetLabel = withoutMarkdownExtension(target.path);
        return {
          from,
          options: target.headings
            .filter((heading) =>
              heading.toLocaleLowerCase().includes(headingText),
            )
            .map((heading) => ({
              label: `${targetLabel}#${heading}`,
              detail: target.path,
              type: "text",
            })),
        };
      }

      const normalized = typed.toLocaleLowerCase();
      return {
        from,
        options: linkTargets
          .filter((target) =>
            [
              target.title,
              target.path,
              ...target.aliases,
            ].some((candidate) =>
              candidate.toLocaleLowerCase().includes(normalized),
            ),
          )
          .slice(0, 30)
          .map((target) => ({
            label: withoutMarkdownExtension(target.path),
            detail:
              target.aliases.length > 0
                ? `${target.title} · ${target.aliases.join(", ")}`
                : target.title,
            type: "text",
          })),
      };
    }

    const tagMatch = /(?:^|\s)#([\p{L}\p{N}_/-]*)$/u.exec(before);
    if (tagMatch) {
      const typed = tagMatch[1] ?? "";
      const from = context.pos - typed.length;
      const normalized = typed.toLocaleLowerCase();
      return {
        from,
        options: tags
          .filter((tag) => tag.toLocaleLowerCase().includes(normalized))
          .slice(0, 30)
          .map((tag) => ({
            label: tag,
            detail: "tag",
            type: "keyword",
          })),
      };
    }

    return null;
  };
}

function findTarget(
  targets: readonly EditorLinkTarget[],
  query: string,
): EditorLinkTarget | undefined {
  const normalized = query.toLocaleLowerCase();
  return targets.find((target) =>
    [
      target.title,
      target.path,
      withoutMarkdownExtension(target.path),
      ...target.aliases,
    ].some((candidate) => candidate.toLocaleLowerCase() === normalized),
  );
}

function withoutMarkdownExtension(path: string): string {
  return path.toLocaleLowerCase().endsWith(".md")
    ? path.slice(0, -3)
    : path;
}
