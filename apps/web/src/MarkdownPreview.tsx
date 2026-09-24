import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownPreview({
  content,
}: {
  readonly content: string;
}) {
  return (
    <article className="markdown-preview" aria-label="Reading view">
      <Markdown remarkPlugins={[remarkGfm]}>
        {stripFrontmatter(content)}
      </Markdown>
    </article>
  );
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}
