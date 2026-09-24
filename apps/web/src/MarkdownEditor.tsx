import { useEffect, useRef } from "react";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

export interface MarkdownEditorProps {
  readonly value: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
}

export function MarkdownEditor({
  value,
  label,
  onChange,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView>();
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const editor = new EditorView({
      doc: value,
      parent: host,
      extensions: [
        basicSetup,
        markdown(),
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
      editorRef.current = undefined;
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
