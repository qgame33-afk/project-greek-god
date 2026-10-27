"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

// Coach's answers (docs/DESIGN-V3-SIMPLE.md §4.8), plain sans body text: no raw HTML
// (react-markdown escapes it), no external links (the coach has no web access, so any URL would be
// invented), internal links allowed.

const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <span className="text-fg">{children}</span>,
  ul: ({ children }) => <ul className="mb-3 space-y-1.5 pl-5 last:mb-0 [list-style:disc] marker:text-fg-3">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 space-y-1.5 pl-5 last:mb-0 [list-style:decimal] marker:font-semibold marker:text-fg-3">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  h1: ({ children }) => <h3 className="t-row mb-1.5 mt-4 first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="t-row mb-1.5 mt-4 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="t-row mb-1.5 mt-4 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="t-row mb-1 mt-3 first:mt-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-ui-line pl-3 last:mb-0">{children}</blockquote>,
  code: ({ children }) => <code className="t-label rounded-md bg-card-3 px-1.5 py-0.5 text-fg">{children}</code>,
  pre: ({ children }) => <pre className="t-label mb-3 overflow-x-auto rounded-field bg-card-3 p-3 last:mb-0">{children}</pre>,
  hr: () => <hr className="my-4 border-0 border-t border-line" />,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto rounded-field border border-line last:mb-0">
      <table className="t-label w-full border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="t-cap border-b border-line bg-card-2 px-3 py-2 text-left">{children}</th>,
  td: ({ children }) => <td className="tabular-nums border-b border-line px-3 py-2 text-fg">{children}</td>,
  a: ({ href, children }) =>
    href && href.startsWith("/") && !href.startsWith("//") ? (
      <Link href={href} className="font-semibold text-fg underline decoration-ui-line underline-offset-4">
        {children}
      </Link>
    ) : (
      <span>{children}</span>
    ),
  img: () => null,
};

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="t-body [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
});
