'use client';

import { useEffect, useRef } from 'react';

/**
 * Ambient background for the trade hero.
 *
 * The geometry is a quantity-break curve: staircases where the unit price
 * drops a level each time order size clears the next tier. Deliberately not
 * the molecular particle network used by the retail site and this site's auth
 * gateways — that motif says "peptides", this one says "your price falls as
 * volume rises".
 *
 * The first version just drifted those lines upward, which read as dead: one
 * uniform direction, no events, nothing for the eye to catch. Now the lines
 * are near-static scaffolding and the life comes from pulses that travel down
 * each staircase — order volume moving down the ladder — each with a fading
 * trail and a bright head, spawning on independent staggered timers so the
 * rhythm never looks mechanical. A pointer-driven parallax offset gives the
 * field depth on top of that.
 *
 * Lifecycle discipline is borrowed from MolecularNetwork: skipped entirely
 * under prefers-reduced-motion, paused off-screen, first frame deferred to
 * idle, DPR-aware resize.
 */

interface Pulse {
  /** Distance travelled along the ladder's path, in px. */
  d: number;
  speed: number;
  /** Trail length in px. */
  trail: number;
  /** 0..1 — a few pulses per cycle burn brighter than the rest. */
  intensity: number;
}

interface Ladder {
  y: number;
  stepW: number;
  stepH: number;
  /** Scaffolding opacity. */
  alpha: number;
  lineWidth: number;
  /** 0 (far) .. 1 (near) — drives parallax amount and pulse brightness. */
  depth: number;
  pulses: Pulse[];
  /** Seconds until the next pulse spawns on this ladder. */
  nextSpawn: number;
}

const LADDER_COUNT = 7;
const PARALLAX_PX = 26;
// Pointer offset is eased toward its target rather than snapped, so moving the
// cursor glides the field instead of jerking it.
const PARALLAX_EASE = 0.06;

export function PriceLadder({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laddersRef = useRef<Ladder[]>([]);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);
  const pointerRef = useRef({ tx: 0, ty: 0, x: 0, y: 0 });

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

    const makePulse = (ladder: Ladder): Pulse => {
      const hot = Math.random() < 0.28;
      return {
        d: 0,
        // Near ladders run faster, reinforcing the depth read.
        speed: (150 + Math.random() * 190) * (0.55 + ladder.depth * 0.75),
        trail: 90 + Math.random() * 150,
        intensity: hot ? 0.85 + Math.random() * 0.15 : 0.3 + Math.random() * 0.3,
      };
    };

    const makeLadder = (y: number): Ladder => {
      const depth = Math.random();
      return {
        y,
        stepW: 88 + Math.random() * 96,
        stepH: 15 + Math.random() * 24,
        // Scaffolding stays very faint: it frames the pulses, it isn't the
        // point. Anything brighter competes with the headline over it.
        alpha: 0.022 + depth * 0.03,
        lineWidth: 0.7 + depth * 0.4,
        depth,
        pulses: [],
        // Stagger first spawns so they don't all fire on frame one.
        nextSpawn: Math.random() * 3.5,
      };
    };

    const initLadders = () => {
      const height = h || 600;
      laddersRef.current = Array.from({ length: LADDER_COUNT }, (_, i) =>
        makeLadder(-80 + ((height + 160) * i) / LADDER_COUNT)
      );
    };

    /** Maps a distance along a ladder's staircase path to a point. */
    const pointAt = (l: Ladder, d: number) => {
      const per = l.stepW + l.stepH;
      const idx = Math.floor(d / per);
      const rem = d - idx * per;
      const baseX = idx * l.stepW;
      const baseY = l.y + idx * l.stepH;
      // Tread first (horizontal), then riser (vertical down to the next tier).
      return rem <= l.stepW
        ? { x: baseX + rem, y: baseY }
        : { x: baseX + l.stepW, y: baseY + (rem - l.stepW) };
    };

    const draw = (timestamp: number) => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(draw);

      const dt = Math.min((timestamp - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = timestamp;
      if (!ctx || !w || !h) return;

      const p = pointerRef.current;
      p.x += (p.tx - p.x) * PARALLAX_EASE;
      p.y += (p.ty - p.y) * PARALLAX_EASE;

      ctx.clearRect(0, 0, w, h);

      for (const l of laddersRef.current) {
        const treads = Math.ceil(w / l.stepW) + 1;
        const pathLen = treads * (l.stepW + l.stepH);

        // Near ladders shift further than far ones — that difference is the
        // whole depth illusion.
        const ox = p.x * PARALLAX_PX * (0.25 + l.depth);
        const oy = p.y * PARALLAX_PX * 0.4 * (0.25 + l.depth);

        ctx.save();
        ctx.translate(ox, oy);

        // Scaffolding.
        ctx.strokeStyle = `rgba(255,255,255,${l.alpha})`;
        ctx.lineWidth = l.lineWidth;
        ctx.beginPath();
        ctx.moveTo(0, l.y);
        let x = 0;
        let y = l.y;
        for (let s = 0; s < treads; s++) {
          x += l.stepW;
          ctx.lineTo(x, y);
          y += l.stepH;
          ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Pulses.
        l.nextSpawn -= dt;
        if (l.nextSpawn <= 0) {
          l.pulses.push(makePulse(l));
          l.nextSpawn = 1.6 + Math.random() * 4.5;
        }

        ctx.lineCap = 'round';
        for (let i = l.pulses.length - 1; i >= 0; i--) {
          const pulse = l.pulses[i];
          pulse.d += pulse.speed * dt;
          if (pulse.d - pulse.trail > pathLen) {
            l.pulses.splice(i, 1);
            continue;
          }

          // Drawn as a chain of short segments with rising alpha rather than a
          // canvas gradient: the path bends at every riser, and a linear
          // gradient can't follow a corner.
          const SEGMENTS = 14;
          for (let s = 0; s < SEGMENTS; s++) {
            const d0 = pulse.d - (pulse.trail * (s + 1)) / SEGMENTS;
            const d1 = pulse.d - (pulse.trail * s) / SEGMENTS;
            if (d1 < 0 || d0 > pathLen) continue;

            const a = pointAt(l, Math.max(0, Math.min(d0, pathLen)));
            const b = pointAt(l, Math.max(0, Math.min(d1, pathLen)));
            // Quadratic falloff reads as a comet rather than a dash.
            const t = 1 - s / SEGMENTS;
            ctx.strokeStyle = `rgba(255,255,255,${t * t * 0.5 * pulse.intensity})`;
            ctx.lineWidth = 0.8 + t * 1.5 * (0.5 + l.depth * 0.5);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }

          // Bright head, only while still on the path.
          if (pulse.d <= pathLen) {
            const head = pointAt(l, pulse.d);
            ctx.shadowBlur = 12 * pulse.intensity;
            ctx.shadowColor = `rgba(255,255,255,${0.5 * pulse.intensity})`;
            ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.4 * pulse.intensity})`;
            ctx.beginPath();
            ctx.arc(head.x, head.y, 1.5 + pulse.intensity * 1.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }

        ctx.restore();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      // Normalised to -1..1 around the section's centre.
      pointerRef.current.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
      cancelAnimationFrame(rafRef.current);
      if (running) {
        // Reset the clock so the frame after returning doesn't integrate a dt
        // covering however long the hero spent scrolled away.
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

    // Listened on window, not the canvas: the canvas is pointer-events-none so
    // the hero's own links stay clickable, which means it never sees events.
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
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
