"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

type ChatCodeBlockProps = {
  code: string;
  language?: string;
};

export function ChatCodeBlock({ code, language }: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [code]);

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-lg border border-white/10 bg-slate-950">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[11px] text-slate-400">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition",
            "text-slate-400 hover:bg-white/10 hover:text-white",
          )}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
        <code className="font-mono text-slate-200">{code}</code>
      </pre>
    </div>
  );
}
