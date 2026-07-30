'use client';

import { useEffect, useRef } from 'react';

/**
 * Ambient background for the trade hero: a drifting field of descending
 * step-ladders — the shape a quantity-break price curve makes, where the unit
 * cost drops a level each time the order size clears the next tier.
 *
 * Deliberately NOT the molecular particle network used on the retail site and
 * this site's auth gateways. That motif says "peptides"; this one says "your
 * price falls as volume rises", which is the whole proposition here and echoes
 * the tier ladder rendered beside it in the hero.
 *
 * Lifecycle discipline is borrowed from MolecularNetwork (skip under
 * prefers-reduced-motion, pause off-screen, defer the first frame to idle,
 * DPR-aware resize). Cost is far lower: a handful of short polylines per frame
 * rather than an O(n²) pairwise distance scan.
 */

interface Ladder {
  /** Y of the ladder's top-left corner, in CSS px. */
  y: number;
  /** Horizontal run of each tread. */
  stepW: number;
  /** Vertical drop at each riser. */
  stepH: number;
  /** Upward drift in px per second. */
  speed: number;
  alpha: number;
  lineWidth: number;
}

const LADDER_COUNT = 6;
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
// Ladders are seeded and re-seeded across a band taller than the canvas so
// they enter and leave through the CSS fade mask rather than popping.
const OVERSCAN = 260;

export function PriceLadder({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laddersRef = useRef<Ladder[]>([]);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Purely decorative — reduced-motion users get a plain black hero.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let w = 0;
    let h = 0;
    let running = true;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const makeLadder = (y: number): Ladder => {
      // Depth cue: shallower steps drift slower and sit fainter, so the field
      // reads as layered rather than one flat pattern.
      const depth = Math.random();
      return {
        y,
        stepW: 90 + Math.random() * 90,
        stepH: 16 + Math.random() * 22,
        speed: 4 + depth * 11,
        // Kept low deliberately: at the original 0.05–0.14 the treads cut
        // visibly through the headline and CTAs instead of sitting behind them.
        alpha: 0.03 + depth * 0.05,
        lineWidth: 0.7 + depth * 0.4,
      };
    };

    const initLadders = () => {
      const height = h || 600;
      laddersRef.current = Array.from({ length: LADDER_COUNT }, (_, i) =>
        // Spread the initial set evenly instead of randomly, so the very first
        // painted frame is already a balanced field.
        makeLadder(-OVERSCAN + ((height + OVERSCAN * 2) * i) / LADDER_COUNT)
      );
    };

    const draw = (timestamp: number) => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(draw);

      if (timestamp - lastFrameRef.current < FRAME_INTERVAL) return;
      const dt = Math.min((timestamp - lastFrameRef.current) / 1000, 0.1);
      lastFrameRef.current = timestamp;

      if (!ctx || !w || !h) return;
      ctx.clearRect(0, 0, w, h);

      const ladders = laddersRef.current;

      for (let i = 0; i < ladders.length; i++) {
        const l = ladders[i];
        l.y -= l.speed * dt;

        const treads = Math.ceil(w / l.stepW) + 1;
        const totalDrop = treads * l.stepH;

        // Fully clear of the top: re-seed at the bottom with new proportions so
        // the field never settles into a recognisable loop.
        if (l.y + totalDrop < -OVERSCAN) {
          ladders[i] = makeLadder(h + OVERSCAN);
          continue;
        }

        ctx.strokeStyle = `rgba(255, 255, 255, ${l.alpha})`;
        ctx.lineWidth = l.lineWidth;
        ctx.beginPath();
        ctx.moveTo(0, l.y);

        // Tread, then riser — a staircase descending to the right.
        let x = 0;
        let y = l.y;
        for (let s = 0; s < treads; s++) {
          x += l.stepW;
          ctx.lineTo(x, y);
          y += l.stepH;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
      cancelAnimationFrame(rafRef.current);
      if (running) {
        // Reset the clock so the first frame back doesn't integrate a dt
        // covering the entire time the hero spent scrolled out of view.
        lastFrameRef.current = performance.now();
        rafRef.current = requestAnimationFrame(draw);
      }
    });
    io.observe(canvas);

    const start = () => {
      resize();
      initLadders();
      lastFrameRef.current = performance.now();
      rafRef.current = requestAnimationFrame(draw);
    };

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(start, { timeout: 2000 });
    } else {
      timeoutId = setTimeout(start, 200);
    }

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      io.disconnect();
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
}
