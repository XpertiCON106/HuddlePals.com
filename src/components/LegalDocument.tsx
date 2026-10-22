import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CONTACT_EMAIL } from "../config";

const components: Components = {
  table({ children }) {
    return (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    );
  },
  a({ href, children }) {
    const external = !!href && /^https?:/.test(href);
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
};

export function LegalDocument({ markdown }: { markdown: string }) {
  const text = markdown.replaceAll("{{CONTACT_EMAIL}}", CONTACT_EMAIL);
  return (
    <article className="legal">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </article>
  );
}
