"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

// Assistant answers: 15/1.55 Manrope, no raw HTML (react-markdown escapes it), no external
// links (the coach has no web access, so any URL would be invented), internal links allowed.

const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-fg">{children}</strong>,
  em: ({ children }) => <em className="text-fg">{children}</em>,
  ul: ({ children }) => <ul className="mb-3 space-y-1.5 pl-5 last:mb-0 [list-style:disc] marker:text-gold-600">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 space-y-1.5 pl-5 last:mb-0 [list-style:decimal] marker:font-semibold marker:text-fg-3">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  h1: ({ children }) => <h3 className="mb-1.5 mt-4 text-[16px] font-bold text-fg first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1.5 mt-4 text-[16px] font-bold text-fg first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-[15px] font-bold text-fg first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-3 text-[15px] font-bold text-fg first:mt-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-line-gold pl-3 text-fg-2 last:mb-0">{children}</blockquote>,
  code: ({ children }) => <code className="rounded-[6px] bg-s3 px-1.5 py-0.5 text-[13px] text-fg">{children}</code>,
  pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-[12px] bg-s3 p-3 text-[13px] last:mb-0">{children}</pre>,
  hr: () => <hr className="my-4 border-0 border-t border-line-hair" />,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto rounded-[12px] border border-line last:mb-0">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line bg-s2 px-3 py-2 text-left font-bold text-fg-2">{children}</th>,
  td: ({ children }) => <td className="num border-b border-line-hair px-3 py-2 text-[14px] text-fg">{children}</td>,
  a: ({ href, children }) =>
    href && href.startsWith("/") && !href.startsWith("//") ? (
      <Link href={href} className="font-semibold text-gold-300 underline decoration-gold-700 underline-offset-2 hover:text-gold-200">
        {children}
      </Link>
    ) : (
      <span>{children}</span>
    ),
  img: () => null,
};

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[15px] leading-[1.55] text-fg [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
});
