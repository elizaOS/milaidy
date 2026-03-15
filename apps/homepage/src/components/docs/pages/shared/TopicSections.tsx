import ReactMarkdown from "react-markdown";

type TopicSectionsProps = {
  content: string;
};

export function TopicSections({ content }: TopicSectionsProps) {
  const normalizedContent = content.replace(/^\s*# .*\n+/, "");

  return (
    <article className="prose prose-invert prose-lg max-w-none">
      <ReactMarkdown>{normalizedContent}</ReactMarkdown>
    </article>
  );
}
