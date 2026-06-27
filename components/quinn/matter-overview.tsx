"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Citation } from "@/lib/chat/tools";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  streaming?: boolean;
}

// ---------------------------------------------------------------------------
// Quinn avatar — an inline SVG monogram so we don't need an image file
// ---------------------------------------------------------------------------

function QuinnAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-foreground"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.54}
        height={size * 0.54}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Stylised "Q" mark */}
        <path
          d="M8 1.5C4.41 1.5 1.5 4.41 1.5 8c0 3.59 2.91 6.5 6.5 6.5 1.48 0 2.84-.5 3.93-1.33l1.2 1.2a.75.75 0 1 0 1.06-1.06l-1.13-1.13A6.47 6.47 0 0 0 14.5 8c0-3.59-2.91-6.5-6.5-6.5Zm0 11.5A5 5 0 1 1 13 8a5 5 0 0 1-5 5Z"
          fill="currentColor"
          className="text-background"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User avatar — initials circle
// ---------------------------------------------------------------------------

function UserAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple inline markdown — handles **bold** and *italic*
// ---------------------------------------------------------------------------

function renderInlineMarkdown(text: string) {
  // Split on **bold** and *italic* markers
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// ---------------------------------------------------------------------------
// Message content renderer
// ---------------------------------------------------------------------------

function MessageContent({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="space-y-2 text-[14.5px] leading-[1.7] text-foreground/90">
      {content.split("\n").map((line, li, lines) => {
        const isLast = li === lines.length - 1;
        const isBullet = line.startsWith("• ") || line.startsWith("- ");
        const bulletChar = isBullet ? line[0] : null;
        const text = isBullet ? line.slice(2) : line;

        if (!text.trim() && !isBullet) {
          return <div key={li} className="h-1" />;
        }

        return (
          <div
            key={li}
            className={
              isBullet
                ? "flex gap-2.5 pl-1"
                : undefined
            }
          >
            {isBullet && (
              <span className="mt-[2px] text-muted-foreground/60 select-none">
                {bulletChar === "•" ? "•" : "—"}
              </span>
            )}
            <span>
              {renderInlineMarkdown(text)}
              {isLast && streaming && (
                <span className="ml-0.5 inline-block h-[18px] w-[2px] translate-y-[3px] animate-pulse bg-foreground/50" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Citation pills
// ---------------------------------------------------------------------------

function CitationPills({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  // Shorten long labels: "Matter — Type: Name" → just "Name"
  function shorten(label: string) {
    const parts = label.split(":");
    if (parts.length > 1) {
      const last = parts[parts.length - 1].trim();
      return last.length > 40 ? last.slice(0, 37) + "..." : last;
    }
    return label.length > 45 ? label.slice(0, 42) + "..." : label;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {citations.slice(0, 8).map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
          title={c.label}
        >
          {shorten(c.label)}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggestion prompts
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  "Did we already submit a letter of claim?",
  "Who drafted the formal complaint?",
  "What contradictions have been found?",
  "When was the last document uploaded?",
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MatterOverview({ matterId }: { matterId: string }) {
  const [name, setName] = useState("there");
  const [messages, setMessages] = useState<Message[]>([]);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [placeholder, setPlaceholder] = useState("");
  const started = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, asking]);

  // Fetch user name
  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        const firstName = session?.user.user_metadata?.first_name as string | undefined;
        if (firstName) setName(firstName);
        else if (session?.user.email) setName(session.user.email.split("@")[0]);
      });
  }, []);

  // Typewriter placeholder
  useEffect(() => {
    let questionIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      const current = SUGGESTIONS[questionIndex];
      if (!deleting) {
        charIndex++;
        setPlaceholder(current.slice(0, charIndex));
        if (charIndex === current.length) {
          deleting = true;
          timeoutId = setTimeout(tick, 2200);
          return;
        }
        timeoutId = setTimeout(tick, 30);
        return;
      }
      charIndex--;
      setPlaceholder(current.slice(0, charIndex));
      if (charIndex === 0) {
        deleting = false;
        questionIndex = (questionIndex + 1) % SUGGESTIONS.length;
        timeoutId = setTimeout(tick, 500);
        return;
      }
      timeoutId = setTimeout(tick, 18);
    }

    timeoutId = setTimeout(tick, 800);
    return () => clearTimeout(timeoutId);
  }, []);

  // Stream the initial overview
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let active = true;
    let networkDone = false;
    const queue: string[] = [];

    setMessages([{ role: "assistant", content: "", streaming: true }]);

    const revealInterval = setInterval(() => {
      if (queue.length > 0) {
        const ch = queue.shift()!;
        setMessages((prev) => {
          const next = [...prev];
          next[0] = { ...next[0], content: next[0].content + ch };
          return next;
        });
      } else if (networkDone) {
        clearInterval(revealInterval);
        setMessages((prev) => {
          const next = [...prev];
          next[0] = { ...next[0], streaming: false };
          return next;
        });
      }
    }, 40);

    async function run() {
      const res = await fetch(`/api/matters/${encodeURIComponent(matterId)}/overview`);
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (active) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "delta") queue.push(...event.text.split(""));
          else if (event.type === "fatal") throw new Error(event.message);
        }
      }
      networkDone = true;
    }

    run().catch((err) => {
      clearInterval(revealInterval);
      if (active) setOverviewError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      active = false;
      clearInterval(revealInterval);
    };
  }, [matterId]);

  // Ask a question
  async function ask(question: string) {
    if (!question.trim() || asking) return;
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setAsking(true);

    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, matterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, citations: data.citations },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Something went wrong: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setAsking(false);
      inputRef.current?.focus();
    }
  }

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  if (overviewError) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          Could not load overview: {overviewError}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-220px)] max-w-2xl flex-col">
      {/* Scrollable conversation area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-4">
        {/* Welcome header */}
        <div className="pb-2 pt-2">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Welcome back, {name}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Here&apos;s what&apos;s happened since your last visit.
          </p>
        </div>

        {/* Messages */}
        <div className="mt-4 space-y-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`group flex gap-3 rounded-2xl px-4 py-4 ${
                m.role === "assistant"
                  ? "bg-muted/40"
                  : ""
              }`}
            >
              {/* Avatar */}
              <div className="mt-0.5">
                {m.role === "assistant" ? (
                  <QuinnAvatar size={26} />
                ) : (
                  <UserAvatar name={name} size={26} />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-[12px] font-medium text-muted-foreground/70">
                  {m.role === "assistant" ? "Quinn" : "You"}
                </p>
                <MessageContent content={m.content} streaming={m.streaming} />
                {m.citations && <CitationPills citations={m.citations} />}
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {asking && (
            <div className="flex gap-3 rounded-2xl bg-muted/40 px-4 py-4">
              <div className="mt-0.5">
                <QuinnAvatar size={26} />
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-medium text-muted-foreground/70">Quinn</p>
                <div className="flex items-center gap-1 pl-1">
                  <span className="inline-block size-[5px] animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
                  <span className="inline-block size-[5px] animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
                  <span className="inline-block size-[5px] animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-border/50 pt-3 pb-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="relative flex items-end rounded-xl border border-border bg-background shadow-sm transition-shadow focus-within:shadow-md focus-within:border-foreground/20"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none bg-transparent py-3 pl-4 pr-12 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/50"
            style={{ maxHeight: 160 }}
          />
          <button
            type="submit"
            disabled={asking || !input.trim()}
            className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-lg bg-foreground text-background transition-all hover:opacity-90 disabled:opacity-20 disabled:hover:opacity-20"
          >
            {asking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/40">
          Quinn answers from your case data only — never general knowledge.
        </p>
      </div>
    </div>
  );
}
