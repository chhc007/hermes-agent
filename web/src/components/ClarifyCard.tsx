/**
 * ClarifyCard — renders a pending clarify (multi-choice) request as a
 * selectable card: single-select radio list or multi-select checkbox list,
 * plus an "Other" free-text path. Submits via the JSON-RPC sidecar's
 * clarify.respond (single = label string, multi = JSON array of labels).
 */

import { HelpCircle, Loader2, Send } from "lucide-react";
import { useMemo, useState } from "react";

import type { ClarifyRequest } from "@/lib/chat-event-stream";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

interface ClarifyCardProps {
  clarify: ClarifyRequest;
  onAnswer: (requestId: string, answer: string) => Promise<boolean>;
}

export function ClarifyCard({ clarify, onAnswer }: ClarifyCardProps) {
  const { t } = useI18n();
  const choices = clarify.choices ?? [];
  const multi = clarify.multiSelect && choices.length > 1;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [other, setOther] = useState("");
  const [typingOther, setTypingOther] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (typingOther) return other.trim().length > 0;
    if (multi) return selected.size > 0;
    return selected.size === 1;
  }, [multi, other, selected, typingOther]);

  const toggle = (index: number) => {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (multi) {
        if (next.has(index)) next.delete(index);
        else next.add(index);
      } else {
        next.clear();
        next.add(index);
      }
      return next;
    });
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    let answer: string;
    if (typingOther) {
      answer = other.trim();
    } else if (multi) {
      answer = JSON.stringify(
        Array.from(selected)
          .sort((a, b) => a - b)
          .map((i) => choices[i]),
      );
    } else {
      answer = choices[Array.from(selected)[0]!] ?? "";
    }
    const ok = await onAnswer(clarify.requestId, answer);
    setSubmitting(false);
    if (!ok) setError("提交失败，请重试或稍后再试");
  };

  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20 px-3 py-2.5">
      <div className="mb-2 flex items-start gap-2">
        <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-resonant" />
        <span className="text-sm leading-relaxed text-foreground">{clarify.question}</span>
      </div>

      {!typingOther && choices.length > 0 && (
        <div className="space-y-1">
          {choices.map((choice, i) => (
            <label
              key={i}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5",
                "transition-colors hover:bg-secondary/60",
                selected.has(i) && "border-primary/60 bg-primary/10",
              )}
            >
              <input
                type={multi ? "checkbox" : "radio"}
                name="clarify-choice"
                checked={selected.has(i)}
                onChange={() => toggle(i)}
                className="size-3.5 accent-primary"
              />
              <span className="min-w-0 flex-1 text-sm text-foreground">{choice}</span>
            </label>
          ))}

          {!multi && (
            <button
              type="button"
              onClick={() => {
                setTypingOther(true);
                setSelected(new Set());
              }}
              className="w-full rounded-md border border-border/60 px-2.5 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-secondary/60"
            >
              Other (type your answer)
            </button>
          )}
        </div>
      )}

      {typingOther && (
        <input
          autoFocus
          value={other}
          onChange={(e) => {
            setOther(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={t.chat.answerPlaceholder}
          className="w-full rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-text-tertiary focus:border-primary/60"
        />
      )}

      {error && <div className="mt-2 text-xs text-destructive">{error}</div>}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-tertiary">
          {multi ? "多选（可勾选多个）" : "单选"}
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit || submitting}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
            "bg-primary text-primary-foreground transition-colors",
            "hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {submitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          提交
        </button>
      </div>
    </div>
  );
}
