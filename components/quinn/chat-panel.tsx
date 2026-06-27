"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Loader2 } from "lucide-react";
import type { Citation } from "@/lib/chat/tools";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

const SUGGESTIONS = [
  "Which clauses rely on GDPR Article 28?",
  "What changed since yesterday?",
  "Which matters touch sub-processor obligations?",
];

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
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
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        onClick={() => setOpen(true)}
        variant="default"
        className="fixed bottom-6 right-6 z-40 rounded-full px-4 shadow-lg"
      >
        <MessageCircle className="size-4" />
        Ask Quinn
      </Button>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading text-lg">Ask Quinn</SheetTitle>
          <SheetDescription>Answers come from the case-memory graph, not the model&apos;s memory.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4">
          <div className="flex flex-col gap-3">
            {messages.length === 0 && (
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Try asking</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="block w-full border-b py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "self-end text-right" : "self-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "inline-block rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "inline-block rounded-md bg-muted px-3 py-2 text-sm"
                  }
                >
                  {m.content}
                </div>
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.citations.slice(0, 6).map((c) => (
                      <Badge key={c.id} variant="outline" className="text-[10px]">
                        {c.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Querying the graph...
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex w-full gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about clauses, provisions, or changes..."
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              Ask
            </Button>
          </form>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
