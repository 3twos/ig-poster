"use client";

export function ChatThinking() {
  return (
    <div className="flex items-center gap-2 px-4 py-3" role="status" aria-label="AI is thinking">
      <div className="flex items-center gap-1">
        <span
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-orange-400"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-orange-400"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-orange-400"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-xs text-slate-400">Thinking...</span>
    </div>
  );
}
