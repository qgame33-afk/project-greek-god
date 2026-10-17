"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

// The Oracle's answers in the Instrument face (docs/DESIGN-V2.md §3.9.2): no raw HTML
// (react-markdown escapes it), no external links (the coach has no web access, so any URL would be
// invented), internal links allowed.

const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ivory">{children}</strong>,
  em: ({ children }) => <em className="text-ivory">{children}</em>,
  ul: ({ children }) => <ul className="mb-3 space-y-1.5 pl-5 last:mb-0 [list-style:disc] marker:text-ash">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 space-y-1.5 pl-5 last:mb-0 [list-style:decimal] marker:font-semibold marker:text-ash">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  h1: ({ children }) => <h3 className="t-title-3 mb-1.5 mt-4 text-ivory first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="t-title-3 mb-1.5 mt-4 text-ivory first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="t-title-3 mb-1.5 mt-4 text-ivory first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="t-title-3 mb-1 mt-3 text-ivory first:mt-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-vein-3 pl-3 text-stone last:mb-0">{children}</blockquote>,
  code: ({ children }) => <code className="t-meta rounded-tag bg-m3 px-1.5 py-0.5 text-ivory">{children}</code>,
  pre: ({ children }) => <pre className="t-meta mb-3 overflow-x-auto rounded-field bg-m3 p-3 last:mb-0">{children}</pre>,
  hr: () => <hr className="my-4 border-0 border-t border-vein" />,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto rounded-field border border-vein-2 last:mb-0">
      <table className="t-callout w-full border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="t-eyebrow border-b border-vein-2 bg-m2 px-3 py-2 text-left">{children}</th>,
  td: ({ children }) => <td className="tnum border-b border-vein px-3 py-2 text-ivory">{children}</td>,
  a: ({ href, children }) =>
    href && href.startsWith("/") && !href.startsWith("//") ? (
      <Link href={href} className="font-semibold text-ivory underline decoration-ui-line underline-offset-4 hover:decoration-ivory">
        {children}
      </Link>
    ) : (
      <span>{children}</span>
    ),
  img: () => null,
};

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="t-body text-stone [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
});
