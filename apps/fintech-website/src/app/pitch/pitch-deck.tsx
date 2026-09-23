"use client";

import {
  cleanupPlan,
  parseMotionSpec,
  playMotion,
  readingPlan,
  sampleForModel,
  stopMotion,
  strokeIsUsable,
  strokePolyline,
  useStrokeCapture,
  type MotionSpec,
  type StrokePoint,
} from "shan/motion";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SLIDE_COUNT = 8;

// ─── constants ────────────────────────────────────────────────────────────────

// relative allows absolute-positioned source footnotes inside slides
// items-center centers all inline/text children; full-width visuals add self-stretch
const SLIDE_BASE =
  "pitch-enter relative flex min-h-dvh w-full flex-col items-center overflow-hidden bg-[#0a0a0a] px-[clamp(2rem,6vw,7rem)] py-[clamp(2rem,5vw,5rem)] text-[#f5f1eb]";

const sampleOrbit = Array.from({ length: 25 }, (_, i) => {
  const t = i / 24;
  const a = t * Math.PI * 2 - Math.PI / 2;
  return { x: 0.5 + Math.cos(a) * 0.2, y: 0.5 + Math.sin(a) * 0.28, t: t * 1_600 };
});

// ─── types ────────────────────────────────────────────────────────────────────

type DemoResult = { spec: MotionSpec; latencyMs: number; model: string; pointCount: number };
type MotionResponse =
  | { status: "reading"; spec: unknown; latencyMs?: number; model?: string }
  | { status: "waiting" | "error"; message?: string; latencyMs?: number };

// ─── hooks ────────────────────────────────────────────────────────────────────

/**
 * Animates 0 → target over durationMs using an ease-out cubic curve.
 * Restarts from 0 on each mount (re-enters slide = remount).
 * Respects prefers-reduced-motion: renders target immediately.
 * Cleans up RAF on unmount so no timers leak.
 */
function useCountUp(target: number, durationMs: number): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const reduced = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setCount(target);
      return () => { mounted = false; };
    }

    const start = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      if (!mounted) return;
      const t = Math.min((now - start) / durationMs, 1);
      // ease-out cubic: fast start, slow finish
      const eased = 1 - (1 - t) ** 3;
      const current = Math.round(eased * target);
      setCount(current);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setCount(target); // guarantee exact final value
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return count;
}

// ─── primitives ───────────────────────────────────────────────────────────────

function Slide({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <section aria-label={label} className={`${SLIDE_BASE} ${className}`}>
      {children}
    </section>
  );
}

/** Hero numeral — fills the visual field */
function HeroNum({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`pitch-hero-in text-center text-[clamp(5.5rem,22vw,19rem)] font-bold leading-[0.82] tracking-[-0.07em] tabular-nums text-[#f5f1eb] ${className}`}
    >
      {children}
    </p>
  );
}

/** Subtitle line below a HeroNum */
function HeroSub({ children }: { children: ReactNode }) {
  return (
    <p className="pitch-sub-in mt-[clamp(0.6rem,1.5vw,1.4rem)] max-w-[28ch] text-center text-[clamp(1.4rem,3.2vw,3.2rem)] font-medium leading-tight tracking-[-0.04em] text-balance text-[#f5f1eb]">
      {children}
    </p>
  );
}

/** Section heading — top of feature slides */
function Heading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={`pitch-hero-in text-center text-[clamp(2.8rem,7vw,7.5rem)] font-semibold leading-[0.9] tracking-[-0.065em] text-balance text-[#f5f1eb] ${className}`}
    >
      {children}
    </h1>
  );
}

// ─── VideoOpeningSlide ────────────────────────────────────────────────────────
// Slide 1: full-bleed video hero + count-up to 500,000.

function VideoOpeningSlide() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const count = useCountUp(500_000, 1_200);
  const isDone = count >= 500_000;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.pause();
    } else {
      video.play().catch(() => {/* autoplay blocked — poster shows */});
    }
  }, []);

  const formatted = isDone
    ? "500,000"
    : count.toLocaleString();

  return (
    <section
      aria-label="Opening: target market"
      className="pitch-enter relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-black"
    >
      {/* full-bleed video */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/pitch-hero-poster.jpg"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/pitch-hero.mp4" type="video/mp4" />
      </video>

      {/* uniform semi-transparent scrim for text legibility */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-black/40"
      />

      {/* centered metric — count-up */}
      <div className="relative z-10 flex flex-col items-center text-center px-[clamp(2rem,6vw,7rem)]">
        <p
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${formatted} designers already animate for the web`}
          className="pitch-hero-in text-[clamp(5rem,19vw,17rem)] font-bold leading-[0.82] tracking-[-0.07em] tabular-nums text-[#f5f1eb]"
        >
          {formatted}
        </p>
        <p className="pitch-sub-in mt-[clamp(0.6rem,1.5vw,1.2rem)] max-w-[22ch] text-[clamp(1.2rem,2.6vw,2.4rem)] font-medium leading-tight tracking-[-0.04em] text-[#f5f1eb]/80">
          designers already animate for the web.
        </p>
      </div>

      {/* source — explicit exception to no-footer rule */}
      <a
        href="https://www.lottielab.com/"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-[clamp(1rem,2.5vw,2rem)] z-10 font-mono text-[0.65rem] text-white/28 underline underline-offset-2 transition-colors hover:text-white/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/50"
      >
        Source: Lottielab — 500,000+ designers
      </a>
    </section>
  );
}

// ─── PromptSlide ──────────────────────────────────────────────────────────────
// Recreates the "Where should we begin?" chat-interface composition.
// Pure black background, centered content block, animated waveform bars.

function PromptSlide() {
  // Waveform bar animation params — each bar bobs at a slightly different phase
  const barConfigs = [
    { x: 0,    y: 3.5, height: 5,  delay: "0ms"   },
    { x: 3.7,  y: 1,   height: 10, delay: "180ms"  },
    { x: 7.3,  y: 3,   height: 6,  delay: "90ms"   },
    { x: 11,   y: 0,   height: 12, delay: "270ms"  },
    { x: 14.6, y: 3,   height: 6,  delay: "45ms"   },
  ];

  return (
    <section
      aria-label="Where should we begin"
      className="pitch-enter flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-black p-[clamp(2rem,6vw,7rem)]"
    >
      <div className="flex w-[min(44rem,88vw)] flex-col items-center gap-[clamp(1rem,2vw,1.6rem)]">

        {/* ── Heading ── */}
        <h1 className="pitch-hero-in text-center text-[clamp(1.25rem,2vw,1.65rem)] font-medium tracking-[-0.015em] text-white">
          Where should we begin?
        </h1>

        {/* ── Prompt bar ── */}
        <div
          className="pitch-sub-in flex h-12 w-full items-center gap-2.5 rounded-full bg-[#1e1e1e] px-[clamp(0.9rem,1.5vw,1.2rem)]"
          role="group"
          aria-label="Prompt bar (decorative)"
        >
          {/* Plus */}
          <span aria-hidden="true" className="shrink-0 text-white/50">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>

          {/* Placeholder */}
          <span className="flex-1 select-none text-[clamp(0.82rem,1.1vw,0.95rem)] text-white/30" aria-hidden="true">
            Ask anything
          </span>

          {/* Think pill */}
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center gap-[0.4em] rounded-full px-2 py-[0.28em] text-[clamp(0.7rem,0.9vw,0.78rem)] font-medium text-white/48"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9.5 4.5A3.5 3.5 0 0 0 6 8v.2A3.8 3.8 0 0 0 4 11.5 3.5 3.5 0 0 0 7.5 15H8v1.5A3.5 3.5 0 0 0 11.5 20V4.5Z" />
              <path d="M14.5 4.5A3.5 3.5 0 0 1 18 8v.2a3.8 3.8 0 0 1 2 3.3 3.5 3.5 0 0 1-3.5 3.5H16v1.5a3.5 3.5 0 0 1-3.5 3.5V4.5Z" />
              <path d="M8 9.5h3.5M12.5 13H16" />
            </svg>
            Think
          </span>

          {/* Mic */}
          <span aria-hidden="true" className="shrink-0 text-white/48">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8.5" y1="22" x2="15.5" y2="22" />
            </svg>
          </span>

          {/* Waveform action — hot-pink circle with animated bars */}
          <span
            aria-hidden="true"
            className="flex shrink-0 h-[clamp(2rem,3.2vw,2.6rem)] w-[clamp(2rem,3.2vw,2.6rem)] items-center justify-center rounded-full bg-[#e83fa8]"
          >
            <svg
              width="17"
              height="12"
              viewBox="0 0 17 12"
              fill="none"
              aria-hidden="true"
            >
              {barConfigs.map(({ x, y, height, delay }, i) => (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width="2.4"
                  height={height}
                  rx="1.2"
                  fill="white"
                  className="wave-bar"
                  style={{
                    transformOrigin: "center",
                    transformBox: "fill-box",
                    animation: `wave-bob 0.9s ease-in-out ${delay} infinite`,
                  }}
                />
              ))}
            </svg>
          </span>
        </div>

        {/* ── Action rows ── */}
        <div className="pitch-sub-in w-full space-y-[2px]" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center gap-[clamp(0.65rem,1.2vw,0.9rem)] rounded-xl px-3 py-[clamp(0.5rem,1vw,0.7rem)] text-[clamp(0.78rem,1.1vw,0.88rem)] text-white/40">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2.5" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5-4 4-2-2-5 5" />
            </svg>
            Create an image or sticker
          </div>
          <div className="flex items-center gap-[clamp(0.65rem,1.2vw,0.9rem)] rounded-xl px-3 py-[clamp(0.5rem,1vw,0.7rem)] text-[clamp(0.78rem,1.1vw,0.88rem)] text-white/40">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
            Write or edit
          </div>
        </div>

      </div>
    </section>
  );
}

// ─── MotionTimeSlide ─────────────────────────────────────────────────────────

function MotionTimeSlide() {
  const hours = useCountUp(6, 900);
  const isDone = hours >= 6;

  return (
    <Slide label="Motion complexity metric" className="justify-center">
      <p
        aria-live="polite"
        aria-atomic="true"
        className="pitch-hero-in text-center text-[clamp(5rem,20vw,18rem)] font-bold leading-[0.82] tracking-[-0.07em] tabular-nums text-[#f5f1eb]"
      >
        {hours}
        <span className={`transition-opacity duration-300 ${isDone ? "opacity-100" : "opacity-0"}`}>
          {" "}hours.
        </span>
      </p>
      {isDone ? (
        <HeroSub>To recreate one simple web animation.</HeroSub>
      ) : null}
      <a
        href="https://rive.app/blog/intercom-s-product-animation-evolution-embracing-rive"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-[clamp(1rem,2.5vw,2rem)] font-mono text-[0.65rem] text-white/28 underline underline-offset-2 transition-colors hover:text-white/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/50"
      >
        Source: Intercom × Rive case study
      </a>
    </Slide>
  );
}

// ─── DrawSlide ────────────────────────────────────────────────────────────────

function DrawSlide() {
  const targetRef = useRef<HTMLDivElement>(null);
  const [sample, setSample] = useState<StrokePoint[] | null>(null);
  const [status, setStatus] = useState("Draw a loop around the element, or load a sample.");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [busy, setBusy] = useState(false);

  const stroke = useStrokeCapture({
    enabled: !busy,
    onStart: () => {
      setSample(null);
      setResult(null);
      setStatus("Captured. Play it back literally, or read the intent.");
    },
  });

  const points = sample ?? stroke.points;
  const ready = strokeIsUsable(points);

  const clear = useCallback(() => {
    stopMotion(targetRef.current);
    stroke.clear();
    setSample(null);
    setResult(null);
    setStatus("Draw a loop around the element, or load a sample.");
  }, [stroke]);

  const useSample = useCallback(() => {
    stopMotion(targetRef.current);
    stroke.clear();
    setSample(sampleOrbit);
    setResult(null);
    setStatus("Sample loaded. Play it literally, then read the intent.");
  }, [stroke]);

  const playLiteral = useCallback(() => {
    if (!ready) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    playMotion(targetRef.current, cleanupPlan(points, reduced));
    setStatus(`Replaying ${points.length} path points exactly.`);
  }, [points, ready]);

  const readIntent = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setStatus("Qwen\u00a03\u00a030B is reading the intent\u2026");
    try {
      const res = await fetch("/api/motion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ points: sampleForModel(points) }),
      });
      const payload = (await res.json()) as MotionResponse;
      if (payload.status !== "reading") {
        setStatus(payload.message ?? "Token Factory did not return a motion.");
        return;
      }
      const spec = parseMotionSpec(payload.spec);
      if (!spec) { setStatus("Token Factory returned an invalid motion."); return; }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      playMotion(targetRef.current, readingPlan(spec, points, reduced));
      setResult({ spec, latencyMs: payload.latencyMs ?? 0, model: payload.model ?? "Qwen 3 30B", pointCount: sampleForModel(points).length });
      setStatus(spec.reading || `Read as ${spec.name}.`);
    } catch {
      setStatus("The model did not answer. The local path still works.");
    } finally {
      setBusy(false);
    }
  }, [busy, points, ready]);

  function keepSlideKeys(e: ReactKeyboardEvent) {
    if (e.key === " " || e.key.startsWith("Arrow")) e.stopPropagation();
  }

  return (
    <section
      aria-label="Feature: draw motion and read intent"
      className={`${SLIDE_BASE} gap-[clamp(1rem,2.5vw,2.5rem)]`}
    >
      {/* title — centered */}
      <h1 className="pitch-hero-in shrink-0 text-center text-[clamp(2rem,4.5vw,5rem)] font-semibold leading-[0.92] tracking-[-0.055em] text-[#f5f1eb]">
        Draw. The model names it.
      </h1>

      {/* canvas — grows to fill remaining height, self-stretch overrides items-center */}
      <div
        {...stroke.bindings}
        onKeyDown={keepSlideKeys}
        className="pitch-visual-in relative min-h-0 flex-1 self-stretch touch-none overflow-hidden rounded-[2rem] bg-[#111] select-none"
        aria-label="Draw a motion path around the selected element"
      >
        <div className="absolute inset-0 grid place-items-center">
          <div
            ref={targetRef}
            className="grid aspect-[4/5] w-[clamp(4.5rem,10vw,8rem)] place-items-center rounded-[1.5rem] bg-[#6d4aff] text-xs font-semibold tracking-[0.14em] text-[#f5f1eb] uppercase"
          >
            Element
          </div>
        </div>
        {points.length > 1 && (
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
            <polyline
              points={strokePolyline(points)}
              fill="none"
              stroke="#f5f1eb"
              strokeWidth="3.5"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0.65"
            />
          </svg>
        )}
      </div>

      {/* controls — compact bottom bar, centered */}
      <div className="pitch-sub-in shrink-0 flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: "200ms" }}>
        <button
          type="button"
          onClick={useSample}
          className="h-10 rounded-full bg-[#f5f1eb]/8 px-4 text-sm font-medium text-[#f5f1eb] transition-colors hover:bg-[#f5f1eb]/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d4aff] active:scale-[0.97]"
        >
          Sample orbit
        </button>
        <button
          type="button"
          onClick={playLiteral}
          disabled={!ready || busy}
          className="h-10 rounded-full bg-[#f5f1eb]/8 px-4 text-sm font-medium text-[#f5f1eb] transition-colors hover:bg-[#f5f1eb]/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d4aff] active:scale-[0.97] disabled:opacity-30"
        >
          Play literal
        </button>
        <button
          type="button"
          onClick={() => void readIntent()}
          disabled={!ready || busy}
          className="h-10 rounded-full bg-[#6d4aff] px-5 text-sm font-semibold text-[#f5f1eb] transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5f1eb] active:scale-[0.97] disabled:opacity-30"
        >
          {busy ? "Reading\u2026" : "Read with Token Factory"}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!ready && points.length === 0}
          className="h-10 rounded-full px-4 text-sm font-medium text-[#f5f1eb]/45 transition-colors hover:bg-[#f5f1eb]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d4aff] active:scale-[0.97] disabled:opacity-30"
        >
          Clear
        </button>

        {/* result / status */}
        {result ? (
          <p className="text-sm font-medium text-[#f5f1eb]">
            <span className="capitalize text-[#6d4aff]">{result.spec.name}</span>
            <span className="text-[#f5f1eb]/40"> · {result.latencyMs}\u202fms · {result.pointCount}\u202fpts</span>
          </p>
        ) : (
          <p aria-live="polite" className="max-w-[22ch] text-center text-sm text-[#f5f1eb]/40">
            {status}
          </p>
        )}
      </div>
    </section>
  );
}

// ─── PitchDeck ────────────────────────────────────────────────────────────────

export function PitchDeck() {
  const [slide, setSlide] = useState(0);
  const hasMounted = useRef(false);

  const goTo = useCallback((n: number) => setSlide(Math.min(SLIDE_COUNT - 1, Math.max(0, n))), []);

  useEffect(() => {
    document.body.classList.add("pitch-active");
    const h = Number.parseInt(window.location.hash.slice(1), 10);
    if (Number.isFinite(h)) goTo(h - 1);
    else window.history.replaceState(null, "", "#1");
    return () => document.body.classList.remove("pitch-active");
  }, [goTo]);

  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    window.history.replaceState(null, "", `#${slide + 1}`);
  }, [slide]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t instanceof HTMLButtonElement) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); goTo(slide + 1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); goTo(slide - 1); }
      else if (e.key === "Home") { e.preventDefault(); goTo(0); }
      else if (e.key === "End") { e.preventDefault(); goTo(SLIDE_COUNT - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, slide]);

  const content = useMemo(() => {
    switch (slide) {

      // ── 1. Video opening ────────────────────────────────────────────────────
      case 0:
        return <VideoOpeningSlide />;

      // ── 2. Prompt interface ─────────────────────────────────────────────────
      case 1:
        return <PromptSlide />;

      // ── 3. Motion complexity ────────────────────────────────────────────────
      case 2:
        return <MotionTimeSlide />;

      // ── 4. Meet Shan ────────────────────────────────────────────────────────
      case 3:
        return (
          <Slide label="Meet Shan" className="justify-center gap-[clamp(2rem,5vw,5rem)]">
            <Heading>Meet Shan.</Heading>
            <p className="pitch-sub-in max-w-[22ch] text-center text-[clamp(1.4rem,2.8vw,2.6rem)] font-medium leading-tight tracking-[-0.04em] text-balance text-[#f5f1eb]/70">
              Shan turns motion direction into production-ready web animation.
            </p>
          </Slide>
        );

      // ── 5. Feature 1: Select ────────────────────────────────────────────────
      case 4:
        return (
          <Slide label="Feature: select on the live page" className="justify-between">
            <Heading>Point at the page.</Heading>

            {/* hero mock — self-stretch fills full width despite items-center */}
            <div
              aria-hidden="true"
              className="pitch-visual-in relative flex-1 self-stretch overflow-hidden rounded-[2.5rem] bg-[#111] ring-1 ring-[#f5f1eb]/8 my-[clamp(1.5rem,3vw,3rem)]"
            >
              {/* mock page chrome */}
              <div className="absolute inset-x-0 top-0 flex h-10 items-center gap-2 border-b border-[#f5f1eb]/6 px-6">
                <div className="h-2.5 w-2.5 rounded-full bg-[#f5f1eb]/15" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#f5f1eb]/10" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#f5f1eb]/8" />
                <div className="ml-4 h-4 w-40 rounded-full bg-[#f5f1eb]/8" />
              </div>
              {/* mock page content */}
              <div className="absolute inset-0 top-10 flex items-center justify-center p-10">
                <div className="w-full max-w-lg space-y-5">
                  <div className="h-7 w-2/3 rounded-lg bg-[#f5f1eb]/10" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-[#f5f1eb]/6" />
                    <div className="h-4 w-5/6 rounded bg-[#f5f1eb]/6" />
                  </div>
                  {/* selected element */}
                  <div className="relative mt-4 inline-block">
                    <div className="h-[clamp(5rem,12vw,9rem)] w-[clamp(5rem,12vw,9rem)] rounded-[1.6rem] bg-[#6d4aff]" />
                    {/* selection ring — pulsing */}
                    <div
                      className="selection-ring pointer-events-none absolute inset-0 rounded-[1.6rem] ring-2 ring-[#6d4aff] ring-offset-[3px] ring-offset-[#111]"
                      style={{ animation: "selection-pulse 2s ease-in-out infinite" }}
                    />
                    {/* component label */}
                    <div className="absolute -top-8 left-0 flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-[#6d4aff]" />
                      <span className="font-mono text-xs text-[#6d4aff]">&lt;HeroCard&#8202;/&gt;</span>
                    </div>
                  </div>
                  <div className="space-y-2 pt-2">
                    <div className="h-4 w-4/5 rounded bg-[#f5f1eb]/5" />
                    <div className="h-4 w-3/5 rounded bg-[#f5f1eb]/5" />
                  </div>
                </div>
              </div>
            </div>

            <p className="pitch-sub-in text-center text-[clamp(0.9rem,1.4vw,1.2rem)] text-[#f5f1eb]/45">
              Click any rendered element. Shan finds it in the DOM.
            </p>
          </Slide>
        );

      // ── 6. Feature 2: Draw + model ───────────────────────────────────────────
      case 5:
        return <DrawSlide />;

      // ── 7. Feature 3: Source patch ───────────────────────────────────────────
      case 6:
        return (
          <Slide label="Feature: visual change becomes source change" className="justify-between">
            <Heading>Visual change. Source change.</Heading>

            {/* hero diff — self-stretch fills full width */}
            <div
              aria-hidden="true"
              className="pitch-visual-in flex-1 self-stretch overflow-hidden rounded-[2rem] bg-[#111] ring-1 ring-[#f5f1eb]/8 my-[clamp(1.5rem,3vw,3rem)]"
            >
              {/* editor chrome */}
              <div className="flex h-10 items-center border-b border-[#f5f1eb]/6 px-6">
                <span className="font-mono text-xs text-[#f5f1eb]/30">components/HeroCard.tsx</span>
              </div>
              {/* diff lines */}
              <div className="flex h-[calc(100%-2.5rem)] flex-col justify-center px-6 py-6 font-mono text-[clamp(0.85rem,1.5vw,1.25rem)] leading-[1.9]">
                <p className="text-[#f5f1eb]/25">{"  <div"}</p>
                <p className="-mx-6 bg-red-500/10 px-6 text-red-400/80">
                  {"−  className=\"block w-32 h-32\""}
                </p>
                <p className="-mx-6 bg-green-500/10 px-6 text-green-400/80">
                  {"+"}&nbsp;{"initial={{ opacity: 0, scale: 0.95 }}"}
                </p>
                <p className="-mx-6 bg-green-500/10 px-6 text-green-400/80">
                  {"+"}&nbsp;{"animate={{ opacity: 1, rotate: 360 }}"}
                </p>
                <p className="-mx-6 bg-green-500/10 px-6 text-green-400/80">
                  {"+"}&nbsp;{'transition={{ duration: 2.4, ease: "easeInOut" }}'}
                </p>
                <p className="text-[#f5f1eb]/25">{"  />"}</p>
              </div>
            </div>

            {/* keep / discard + narrative — centered */}
            <div className="pitch-sub-in flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6" style={{ animationDelay: "220ms" }}>
              <div className="flex gap-3">
                <div className="grid h-10 place-items-center rounded-full bg-[#6d4aff] px-6 text-sm font-semibold text-[#f5f1eb]">
                  Keep
                </div>
                <div className="grid h-10 place-items-center rounded-full bg-[#f5f1eb]/8 px-6 text-sm font-semibold text-[#f5f1eb]/45">
                  Discard
                </div>
              </div>
              <p className="text-center text-[clamp(0.85rem,1.3vw,1.1rem)] leading-snug text-[#f5f1eb]/38">
                Chat ends in a reply.{" "}
                This changes your file.
              </p>
            </div>
          </Slide>
        );

      // ── 8. Closing ───────────────────────────────────────────────────────────
      default:
        return (
          <section
            aria-label="Closing"
            className="pitch-enter flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-black px-[clamp(2rem,8vw,10rem)]"
          >
            <p className="pitch-hero-in max-w-[18ch] text-center text-[clamp(2.4rem,6.5vw,6.5rem)] font-semibold leading-[1.0] tracking-[-0.055em] text-balance text-[#f5f1eb]">
              What are you waiting for?{" "}
              Bring your app to life.
            </p>
          </section>
        );
    }
  }, [slide]);

  return (
    <main className="pitch-deck" aria-live="polite">
      {content}
    </main>
  );
}
