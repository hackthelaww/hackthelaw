"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TypewriterText } from "@/components/quinn/typewriter-text";
import { cn } from "@/lib/utils";

const SCROLL_THRESHOLD = 32;

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300",
        scrolled ? "border-border bg-white" : "border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto grid h-16 w-full max-w-5xl grid-cols-3 items-center px-10">
        <Link
          href="/"
          className={cn(
            "text-base font-semibold tracking-tight transition-colors duration-300",
            scrolled ? "text-foreground" : "text-white"
          )}
        >
          Quinn
        </Link>
        <TypewriterText
          text="Supervise human-AI teams"
          className={cn(
            "justify-self-center font-mono text-sm transition-colors duration-300",
            scrolled ? "text-foreground" : "text-white"
          )}
        />
        <nav className="flex items-center justify-self-end gap-6">
          <Link
            href="/login"
            className={cn(
              "text-sm transition-colors duration-300",
              scrolled ? "text-black" : "text-white"
            )}
          >
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
