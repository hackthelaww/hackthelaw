"use client";

import { useEffect, useState } from "react";

/** Types `text` out one character at a time on mount, then leaves a blinking cursor. */
export function TypewriterText({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    let charIndex = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      charIndex++;
      setShown(text.slice(0, charIndex));
      if (charIndex < text.length) {
        timeoutId = setTimeout(tick, 45);
      }
    }

    timeoutId = setTimeout(tick, 45);
    return () => clearTimeout(timeoutId);
  }, [text]);

  return (
    <span className={className}>
      {shown}
      <span className="animate-pulse">▌</span>
    </span>
  );
}
