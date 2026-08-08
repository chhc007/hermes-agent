import { cn } from "@/lib/utils";
import type { TodoItem } from "@/lib/chat-event-stream";

/**
 * Agent todo panel — renders the todo list the agent maintains via its todo
 * tool (mirrored from `tool.start.todos` frames). Same glyphs/tone as the TUI
 * todo panel (`ui-tui/src/components/todoPanel.tsx`).
 */
export function TodoPanel({ todos, className }: { todos: TodoItem[]; className?: string }) {
  if (!todos.length) return null;

  const done = todos.filter((t) => t.status === "completed").length;

  return (
    <div
      className={cn(
        "shrink-0 rounded-md border border-border/60 bg-secondary/20 p-2",
        className,
      )}
    >
      <div className="mb-1 flex items-center justify-between px-0.5 text-[11px] text-text-tertiary">
        <span>📋 Todos</span>
        <span className="font-mono tabular-nums">
          {done}/{todos.length}
        </span>
      </div>
      <ul className="space-y-0.5">
        {todos.map((todo, i) => (
          <li key={todo.id ?? i} className="flex items-start gap-1.5 px-0.5 text-xs leading-snug">
            <span className="mt-0.5 shrink-0">
              {todo.status === "completed" ? (
                <span className="text-success">✓</span>
              ) : todo.status === "cancelled" ? (
                <span className="text-text-tertiary">✕</span>
              ) : todo.status === "in_progress" ? (
                <span className="text-warning">◐</span>
              ) : (
                <span className="text-text-tertiary">○</span>
              )}
            </span>
            <span
              className={cn(
                todo.status === "completed" && "text-text-tertiary line-through",
                todo.status === "in_progress" && "text-midground",
              )}
            >
              {todo.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
