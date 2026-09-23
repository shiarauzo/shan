"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const LETTERS = ["s", "h", "a", "n"] as const;
const HOP_MS = 560;

type SplashProps = {
  onDone: () => void;
};

function Splash({ onDone }: SplashProps) {
  const wordRef = useRef<HTMLParagraphElement>(null);
  const ballRef = useRef<HTMLSpanElement>(null);
  const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const word = wordRef.current;
    const ball = ballRef.current;
    if (!word || !ball) return;

    let frame = 0;
    let start = 0;
    let cancelled = false;
    let leaveTimer = 0;

    const place = (index: number, t: number) => {
      const letters = letterRefs.current.filter((node): node is HTMLSpanElement => node !== null);
      const current = letters[index];
      const next = letters[Math.min(index + 1, letters.length - 1)];
      if (!current || !next) return;

      const wordBox = word.getBoundingClientRect();
      const from = current.getBoundingClientRect();
      const to = next.getBoundingClientRect();
      const x = from.left + from.width / 2 + (to.left + to.width / 2 - (from.left + from.width / 2)) * t;
      const arc = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
      const y = from.top - arc * (from.height * 0.42);
      const impact = t < 0.1 || t > 0.9;
      const scaleX = impact ? 1.28 : 1;
      const scaleY = impact ? 0.72 : 1;
      ball.style.transform = `translate(${x - wordBox.left}px, ${y - wordBox.top}px) translate(-50%, -100%) scale(${scaleX}, ${scaleY})`;
    };

    const finish = () => {
      if (cancelled) return;
      place(LETTERS.length - 1, 1);
      leaveTimer = window.setTimeout(() => setLeaving(true), 220);
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    place(0, 0);
    setReady(true);

    if (reduced) {
      leaveTimer = window.setTimeout(() => setLeaving(true), 700);
    } else {
      const total = LETTERS.length * HOP_MS;
      const tick = (now: number) => {
        if (cancelled) return;
        if (!start) start = now;
        const elapsed = now - start;
        if (elapsed >= total) {
          finish();
          return;
        }
        const index = Math.min(LETTERS.length - 1, Math.floor(elapsed / HOP_MS));
        place(index, (elapsed % HOP_MS) / HOP_MS);
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(leaveTimer);
    };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onDone, 280);
    return () => window.clearTimeout(timer);
  }, [leaving, onDone]);

  const splash = (
    <div
      className={`fixed inset-0 grid place-items-center bg-[#f3f0e8] transition-opacity duration-300 ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}
      style={{ zIndex: 2147483647 }}
      role="status"
      aria-label="shan"
    >
      <p
        ref={wordRef}
        className="relative font-sans text-[clamp(4.75rem,18vw,9.5rem)] leading-none font-medium tracking-[-0.05em] text-[#161616]"
        translate="no"
      >
        {LETTERS.map((letter, index) => (
          <span
            key={letter}
            ref={(node) => {
              letterRefs.current[index] = node;
            }}
            className="inline-block px-[0.03em]"
          >
            {letter}
          </span>
        ))}
        <span
          ref={ballRef}
          aria-hidden="true"
          className={`absolute top-0 left-0 size-[0.16em] rounded-full bg-[#161616] ${ready ? "opacity-100" : "opacity-0"}`}
        />
      </p>
    </div>
  );

  if (!mounted) return splash;
  return createPortal(splash, document.body);
}

export function SplashGate({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);

  return (
    <>
      {visible ? <Splash onDone={() => setVisible(false)} /> : null}
      <div inert={visible ? true : undefined}>{children}</div>
    </>
  );
}
