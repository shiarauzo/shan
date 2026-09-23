"use client";

import { type PointerEvent, type ReactNode, useCallback, useRef } from "react";

const SWEEP_CLASS = "cta-sweep";

/**
 * The "See the card" pill. On pointer press the pill sweeps to the right and
 * settles back, echoing the swipe drawn on it. Keyboard activation is left
 * untouched, and prefers-reduced-motion swaps the sweep for a color-only cue
 * (handled in globals.css).
 */
export function SeeCardLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  const sweep = useCallback((event: PointerEvent<HTMLAnchorElement>) => {
    if (event.button !== 0) return;
    const node = ref.current;
    if (!node) return;

    // Restart the animation even when a press lands mid-sweep.
    node.classList.remove(SWEEP_CLASS);
    void node.offsetWidth;
    node.classList.add(SWEEP_CLASS);
  }, []);

  const release = useCallback(() => {
    ref.current?.classList.remove(SWEEP_CLASS);
  }, []);

  return (
    <a
      ref={ref}
      href={href}
      onPointerDown={sweep}
      onAnimationEnd={release}
      className="inline-flex h-10 items-center rounded-full bg-[#161616] px-4 text-sm text-[#f3f0e8] transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[#161616]/85 focus-visible:ring-2 focus-visible:ring-[#161616] focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.96]"
    >
      {children}
    </a>
  );
}
