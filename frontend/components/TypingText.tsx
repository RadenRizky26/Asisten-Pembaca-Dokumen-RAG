import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";

interface TypingTextProps {
  text: string;
}

export default function TypingText({ text }: TypingTextProps) {
  return (
    <div className="animate-typing">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ node, ...props }) => <p className="mb-4 last:mb-0" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-bold text-[var(--color-ink)]" {...props} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
