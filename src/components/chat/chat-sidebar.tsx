"use client";

import { Loader2, MessageSquare, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChatConversationSummary } from "@/lib/chat-types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Sidebar content (shared between desktop and mobile)
// ---------------------------------------------------------------------------

type SidebarContentProps = {
  conversations: ChatConversationSummary[];
  activeId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onItemSelect?: () => void; // for closing mobile drawer
};

function SidebarContent({
  conversations,
  activeId,
  isLoading,
  onSelect,
  onNew,
  onDelete,
  onItemSelect,
}: SidebarContentProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleNew = async () => {
    setIsCreating(true);
    try {
      onNew();
      onItemSelect?.();
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    onItemSelect?.();
  };

  const handleDelete = () => {
    if (deleteId) {
      onDelete(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <>
      {/* New chat button */}
      <div className="border-b border-white/10 p-3">
        <Button
          onClick={() => void handleNew()}
          disabled={isCreating}
          className="w-full"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New chat
        </Button>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2" role="list" aria-label="Conversations">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5 rounded-lg p-2.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              ))
            : conversations.map((conv) => (
                <div key={conv.id} className="group relative" role="listitem">
                  <button
                    type="button"
                    onClick={() => handleSelect(conv.id)}
                    className={cn(
                      "w-full rounded-lg p-2.5 text-left transition",
                      "hover:bg-white/5",
                      activeId === conv.id &&
                        "border border-orange-400/30 bg-orange-400/10",
                      activeId !== conv.id && "border border-transparent",
                    )}
                    aria-current={activeId === conv.id ? "true" : undefined}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-white">
                          {conv.title}
                        </p>
                        {conv.preview && (
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {conv.preview}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-slate-600">
                          {relativeTime(conv.updatedAt)} · {conv.messageCount} msgs
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Context menu */}
                  <div className="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          aria-label="Conversation options"
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setDeleteId(conv.id)}
                          className="text-red-400"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}

          {!isLoading && conversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              No conversations yet
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This conversation and all its messages will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop sidebar
// ---------------------------------------------------------------------------

type ChatSidebarProps = SidebarContentProps & {
  isMobileOpen: boolean;
  onMobileClose: () => void;
};

export function ChatSidebar({
  isMobileOpen,
  onMobileClose,
  ...contentProps
}: ChatSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] lg:flex"
        aria-label="Chat conversations"
      >
        <SidebarContent {...contentProps} />
      </aside>

      {/* Mobile sidebar (Sheet drawer) */}
      <Sheet open={isMobileOpen} onOpenChange={onMobileClose}>
        <SheetContent side="left" className="w-3/4 max-w-xs p-0">
          <SheetHeader className="border-b border-white/10 px-4 py-3">
            <SheetTitle className="text-sm">Conversations</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <SidebarContent {...contentProps} onItemSelect={onMobileClose} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
