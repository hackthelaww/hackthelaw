"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { Citation } from "@/lib/chat/tools";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  streaming?: boolean;
}

const SUGGESTIONS = [
  "Did we already submit a letter of claim?",
  "Who drafted the formal complaint?",
];

export function MatterOverview({ matterId }: { matterId: string }) {
  const [name, setName] = useState("there");
  const [messages, setMessages] = useState<Message[]>([]);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [placeholder, setPlaceholder] = useState("");
  const started = useRef(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        const firstName = session?.user.user_metadata?.first_name as string | undefined;
        if (firstName) setName(firstName);
        else if (session?.user.email) setName(session.user.email.split("@")[0]);
      });
  }, []);

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
          timeoutId = setTimeout(tick, 1800);
          return;
        }
        timeoutId = setTimeout(tick, 35);
        return;
      }

      charIndex--;
      setPlaceholder(current.slice(0, charIndex));
      if (charIndex === 0) {
        deleting = false;
        questionIndex = (questionIndex + 1) % SUGGESTIONS.length;
        timeoutId = setTimeout(tick, 400);
        return;
      }
      timeoutId = setTimeout(tick, 20);
    }

    timeoutId = setTimeout(tick, 35);
    return () => clearTimeout(timeoutId);
  }, []);

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
    }, 45);

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
          if (event.type === "delta") {
            queue.push(...event.text.split(""));
          } else if (event.type === "fatal") {
            throw new Error(event.message);
          }
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

  async function ask(question: string) {
    if (!question.trim() || asking) return;
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setAsking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer, citations: data.citations }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setAsking(false);
    }
  }

  if (overviewError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Could not draft an overview: {overviewError}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="pb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome back, {name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what&apos;s happened since your last visit.
        </p>
      </div>

      <div className="flex flex-col divide-y">
        {messages.map((m, i) => (
          <div key={i} className="py-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {m.role === "user" ? "You" : "Quinn"}
            </p>
            <div className="mt-2 space-y-1 text-sm leading-relaxed text-foreground">
              {m.content.split("\n").map((line, li, lines) => {
                const isLast = li === lines.length - 1;
                const isBullet = line.startsWith("• ");
                const text = isBullet ? line.slice(2) : line;
                return (
                  <div key={li} className={isBullet ? "flex gap-2" : undefined}>
                    {isBullet && <span className="text-base font-bold leading-relaxed">•</span>}
                    <span className="whitespace-pre-wrap">
                      {text}
                      {isLast && m.streaming && (
                        <span className="ml-0.5 inline-block w-1.5 animate-pulse bg-foreground/60">&nbsp;</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.citations.slice(0, 6).map((c) => (
                  <Badge key={c.id} variant="outline" className="text-[10px]">
                    {c.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}

        {asking && (
          <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Querying the graph...
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-0 mt-4 flex items-center gap-2 rounded-full border bg-background py-1.5 pl-4 pr-1.5 shadow-sm"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={asking || !input.trim()}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
        >
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}
