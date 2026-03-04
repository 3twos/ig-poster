"use client";

import { type ReactNode, useMemo } from "react";

import { ChatCodeBlock } from "@/components/chat/chat-code-block";

type ChatMarkdownProps = {
  content: string;
  isStreaming?: boolean;
};

// ---------------------------------------------------------------------------
// Lightweight streaming-safe markdown renderer
// ---------------------------------------------------------------------------

type Block =
  | { type: "paragraph"; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "code"; language: string; code: string }
  | { type: "blockquote"; content: string }
  | { type: "hr" }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

function parseBlocks(raw: string): Block[] {
  const lines = raw.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      i++; // skip closing ```
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Table (requires header + separator)
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\|?\s*[-:]+/.test(lines[i + 1])
    ) {
      const parseRow = (row: string) =>
        row
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);
      const headers = parseRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ""));
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (collect contiguous non-empty lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("> ") &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join("\n") });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Process inline patterns: bold, italic, strikethrough, code, links
  const regex =
    /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))|(~~(.+?)~~)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold
      nodes.push(
        <strong key={match.index} className="font-semibold text-white">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // Italic
      nodes.push(
        <em key={match.index} className="italic">
          {match[4]}
        </em>,
      );
    } else if (match[5]) {
      // Inline code
      nodes.push(
        <code
          key={match.index}
          className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-orange-300"
        >
          {match[6]}
        </code>,
      );
    } else if (match[7]) {
      // Link
      nodes.push(
        <a
          key={match.index}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-400 underline decoration-orange-400/40 underline-offset-2 hover:text-orange-300"
        >
          {match[8]}
        </a>,
      );
    } else if (match[10]) {
      // Strikethrough
      nodes.push(
        <s key={match.index} className="text-slate-500">
          {match[11]}
        </s>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

// ---------------------------------------------------------------------------
// Block renderer
// ---------------------------------------------------------------------------

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level}` as "h1" | "h2" | "h3");
      const sizes = { 1: "text-lg font-bold", 2: "text-base font-semibold", 3: "text-sm font-semibold" };
      return (
        <Tag key={index} className={`${sizes[block.level as 1 | 2 | 3]} mt-4 mb-2 text-white`}>
          {renderInline(block.content)}
        </Tag>
      );
    }

    case "code":
      return <ChatCodeBlock key={index} code={block.code} language={block.language} />;

    case "blockquote":
      return (
        <blockquote
          key={index}
          className="my-2 border-l-2 border-orange-400/50 pl-3 text-slate-300 italic"
        >
          {renderInline(block.content)}
        </blockquote>
      );

    case "hr":
      return <hr key={index} className="my-4 border-white/10" />;

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          key={index}
          className={`my-2 space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
        >
          {block.items.map((item, j) => (
            <li key={j} className="text-slate-200">
              {renderInline(item)}
            </li>
          ))}
        </Tag>
      );
    }

    case "table":
      return (
        <div key={index} className="my-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {block.headers.map((h, j) => (
                  <th key={j} className="px-3 py-1.5 text-left text-xs font-medium text-slate-300">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j} className="border-b border-white/5">
                  {row.map((cell, k) => (
                    <td key={k} className="px-3 py-1.5 text-slate-200">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "paragraph":
      return (
        <p key={index} className="my-2 leading-relaxed text-slate-200">
          {renderInline(block.content)}
        </p>
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatMarkdown({ content, isStreaming }: ChatMarkdownProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className="chat-markdown max-w-none text-sm">
      {blocks.map((block, i) => renderBlock(block, i))}
      {isStreaming && (
        <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-orange-400/70" />
      )}
    </div>
  );
}
