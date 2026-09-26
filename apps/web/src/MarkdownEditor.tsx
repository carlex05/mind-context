import { useEffect, useRef } from "react";
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

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
  readonly onChange: (value: string) => void;
}

export function MarkdownEditor({
  value,
  label,
  linkTargets = [],
  tags = [],
  onChange,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const linkTargetsRef = useRef(linkTargets);
  const tagsRef = useRef(tags);
  const completionSourceRef = useRef(
    (context: CompletionContext): CompletionResult | null =>
      createKnowledgeCompletionSource(
        linkTargetsRef.current,
        tagsRef.current,
      )(context),
  );

  onChangeRef.current = onChange;
  linkTargetsRef.current = linkTargets;
  tagsRef.current = tags;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const editor = new EditorView({
      doc: value,
      parent: host,
      extensions: [
        basicSetup,
        markdown(),
        autocompletion({
          override: [completionSourceRef.current],
          activateOnTyping: true,
        }),
        keymap.of(markdownKeymap),
        EditorView.lineWrapping,
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

  return <div className="markdown-editor" ref={hostRef} />;
}

function createKnowledgeCompletionSource(
  linkTargets: readonly EditorLinkTarget[],
  tags: readonly string[],
) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.state.sliceDoc(
      context.state.doc.lineAt(context.pos).from,
      context.pos,
    );

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
