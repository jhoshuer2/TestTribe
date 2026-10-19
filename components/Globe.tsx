"use client";

import { useEffect, useRef } from "react";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import type { TribeEvent } from "../lib/events";

const D2R = Math.PI / 180;
const STEP = 1.7; // dot spacing in degrees (equal-area lattice)
const START = { lon: 55, lat: 32 };
const SPIN = 14; // degrees of longitude per second while hovered
const ARCS: [number, number][] = [
  [0, 2],
  [1, 3],
];

// Brand colours as RGB triples (tokens.css: --color-vermillion et al.)
const VERM = [247, 110, 81];
const VERM_LIGHT = [255, 168, 142];
const CREAM = [255, 233, 224];

// Major hubs that get a soft glow, like the lit clusters in the reference.
const HUBS: [number, number][] = [
  [51.5, -0.1], [48.9, 2.3], [52.5, 13.4], [41, 29], [55.7, 37.6], [30, 31.2], [25.2, 55.3],
  [28.6, 77.2], [19.1, 72.9], [13, 77.6], [23.8, 90.4], [1.35, 103.8], [39.9, 116.4], [31.2, 121.5],
  [35.7, 139.7], [37.6, 127], [-1.3, 36.8], [6.5, 3.4], [-26.2, 28], [40.7, -74], [34, -118.2],
  [19.4, -99.1], [-23.5, -46.6], [-33.9, 151.2],
];

type Dot = { x: number; y: number; z: number; shade: number; tw: number };

function buildDots(): Dot[] {
  const W = 1440;
  const H = 720;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  const topo = land110 as unknown as Parameters<typeof feature>[0];
  const land = feature(topo, (land110 as any).objects.land);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  geoPath(projection, ctx)(land as any);
  ctx.fill();
  const data = ctx.getImageData(0, 0, W, H).data;
  const isLand = (lon: number, lat: number) => {
    const x = Math.min(W - 1, Math.max(0, Math.round(((lon + 180) / 360) * W)));
    const y = Math.min(H - 1, Math.max(0, Math.round(((90 - lat) / 180) * H)));
    return data[(y * W + x) * 4 + 3] > 128;
  };

  const dots: Dot[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let lat = -80; lat <= 84; lat += STEP) {
    const cosLat = Math.cos(lat * D2R);
    const n = Math.max(1, Math.round(360 * cosLat / STEP));
    for (let i = 0; i < n; i++) {
      const lon = -180 + ((i + (Math.round(lat / STEP) % 2) * 0.5) / n) * 360;
      if (!isLand(lon, lat)) continue;
      dots.push({
        x: cosLat * Math.sin(lon * D2R),
        y: Math.sin(lat * D2R),
        z: cosLat * Math.cos(lon * D2R),
        shade: 0.45 + rnd() * 0.55,
        tw: rnd() * Math.PI * 2,
      });
    }
  }
  return dots;
}

const vec = (lat: number, lon: number): [number, number, number] => [
  Math.cos(lat * D2R) * Math.sin(lon * D2R),
  Math.sin(lat * D2R),
  Math.cos(lat * D2R) * Math.cos(lon * D2R),
];

export default function Globe({ events }: { events: TribeEvent[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const panel = wrap.parentElement!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let dots: Dot[] = [];
    let size = 0;
    let dpr = 1;
    const view = { ...START };
    let velocity = 0;
    let hovering = false;
    let pinHover = false;
    let dragging = false;
    let raf = 0;
    let last = performance.now();
    let alive = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const eventVecs = events.map((e) => vec(e.lat, e.lon));
    const hubVecs = HUBS.map(([la, lo]) => vec(la, lo));

    const resize = () => {
      size = wrap.clientWidth;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.height = Math.round(size * dpr);
    };

    // rotate a world-space unit vector into view space (x right, y up, z towards viewer)
    let cosL = 1, sinL = 0, cosT = 1, sinT = 0;
    const toView = (v: [number, number, number]): [number, number, number] => {
      const X = v[0] * cosL - v[2] * sinL;
      const Z = v[0] * sinL + v[2] * cosL;
      return [X, cosT * v[1] - sinT * Z, sinT * v[1] + cosT * Z];
    };

    const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    const draw = (t: number) => {
      const C = size / 2;
      const R = size * 0.46; // sphere radius; the margin leaves room for the outer bloom
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      cosL = Math.cos(view.lon * D2R);
      sinL = Math.sin(view.lon * D2R);
      cosT = Math.cos(view.lat * D2R);
      sinT = Math.sin(view.lat * D2R);

      // soft outer bloom
      let g = ctx.createRadialGradient(C, C, R * 0.97, C, C, R * 1.09);
      g.addColorStop(0, rgba(VERM, 0.62));
      g.addColorStop(0.35, rgba(VERM, 0.24));
      g.addColorStop(1, rgba(VERM, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(C, C, R * 1.09, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(C, C, R, 0, Math.PI * 2);
      ctx.clip();

      // sphere body
      g = ctx.createRadialGradient(C, C - R * 0.38, 0, C, C, R);
      g.addColorStop(0, "#26191a");
      g.addColorStop(0.55, "#170f0f");
      g.addColorStop(1, "#0e0808");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      // dot-matrix land
      for (const d of dots) {
        const X = d.x * cosL - d.z * sinL;
        const Z0 = d.x * sinL + d.z * cosL;
        const z = sinT * d.y + cosT * Z0;
        if (z <= 0.02) continue;
        const y = cosT * d.y - sinT * Z0;
        const tw = 0.85 + 0.15 * Math.sin(t * 0.0015 + d.tw);
        const k = Math.pow(z, 0.55);
        const col = [
          VERM_LIGHT[0] + (CREAM[0] - VERM_LIGHT[0]) * z,
          VERM_LIGHT[1] + (CREAM[1] - VERM_LIGHT[1]) * z,
          VERM_LIGHT[2] + (CREAM[2] - VERM_LIGHT[2]) * z,
        ].map(Math.round);
        ctx.fillStyle = rgba(col, Math.min(0.95, 1.0 * d.shade * k * tw));
        ctx.beginPath();
        ctx.arc(C + R * X, C - R * y, Math.max(0.6, size * 0.0031 * (0.35 + 0.65 * z)), 0, Math.PI * 2);
        ctx.fill();
      }

      // glowing hubs
      ctx.globalCompositeOperation = "lighter";
      hubVecs.forEach((v, i) => {
        const [x, y, z] = toView(v);
        if (z <= 0.1) return;
        const pulse = 0.65 + 0.35 * Math.sin(t * 0.0018 + i * 1.7);
        const r = R * 0.05 * (0.5 + 0.5 * z);
        const hg = ctx.createRadialGradient(C + R * x, C - R * y, 0, C + R * x, C - R * y, r);
        hg.addColorStop(0, rgba(VERM_LIGHT, 0.55 * pulse * z));
        hg.addColorStop(1, rgba(VERM, 0));
        ctx.fillStyle = hg;
        ctx.fillRect(C + R * x - r, C - R * y - r, r * 2, r * 2);
      });

      // arcs between event pins with a travelling head
      ARCS.forEach(([a, b], ai) => {
        const A = eventVecs[a];
        const B = eventVecs[b];
        if (!A || !B) return;
        const dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
        const om = Math.acos(dot);
        const so = Math.sin(om) || 1;
        const N = 48;
        const head = ((t * 0.00012 + ai * 0.5) % 1) * 1.3;
        let prev: [number, number, number] | null = null;
        for (let i = 0; i <= N; i++) {
          const s = i / N;
          const w1 = Math.sin((1 - s) * om) / so;
          const w2 = Math.sin(s * om) / so;
          const lift = 1 + 0.16 * Math.sin(Math.PI * s);
          const p = toView([
            (A[0] * w1 + B[0] * w2) * lift,
            (A[1] * w1 + B[1] * w2) * lift,
            (A[2] * w1 + B[2] * w2) * lift,
          ]);
          if (prev && p[2] > 0.05 && prev[2] > 0.05) {
            const trail = Math.max(0, 1 - (head - s) / 0.35);
            const near = s <= head ? trail : 0;
            ctx.strokeStyle = rgba(VERM_LIGHT, 0.18 + 0.75 * near);
            ctx.lineWidth = size * (0.0012 + 0.0016 * near);
            ctx.beginPath();
            ctx.moveTo(C + R * prev[0], C - R * prev[1]);
            ctx.lineTo(C + R * p[0], C - R * p[1]);
            ctx.stroke();
          }
          prev = p;
        }
        const hs = Math.min(1, head);
        const w1 = Math.sin((1 - hs) * om) / so;
        const w2 = Math.sin(hs * om) / so;
        const lift = 1 + 0.16 * Math.sin(Math.PI * hs);
        const hp = toView([
          (A[0] * w1 + B[0] * w2) * lift,
          (A[1] * w1 + B[1] * w2) * lift,
          (A[2] * w1 + B[2] * w2) * lift,
        ]);
        if (head <= 1 && hp[2] > 0.05) {
          const r = R * 0.03;
          const hg = ctx.createRadialGradient(C + R * hp[0], C - R * hp[1], 0, C + R * hp[0], C - R * hp[1], r);
          hg.addColorStop(0, "rgba(255,240,232,0.95)");
          hg.addColorStop(0.3, rgba(VERM_LIGHT, 0.6));
          hg.addColorStop(1, rgba(VERM, 0));
          ctx.fillStyle = hg;
          ctx.fillRect(C + R * hp[0] - r, C - R * hp[1] - r, r * 2, r * 2);
        }
      });
      ctx.globalCompositeOperation = "source-over";

      // fresnel rim: wide inner glow + bright edge line
      g = ctx.createRadialGradient(C, C, R * 0.66, C, C, R);
      g.addColorStop(0, rgba(VERM, 0));
      g.addColorStop(0.5, rgba(VERM, 0.3));
      g.addColorStop(0.82, rgba(VERM, 0.82));
      g.addColorStop(0.965, rgba(VERM_LIGHT, 0.95));
      g.addColorStop(1, "rgba(255,238,230,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      // brighter on the upper-left, like the key light in the reference
      g = ctx.createRadialGradient(C - R * 0.45, C - R * 0.75, 0, C - R * 0.45, C - R * 0.75, R * 0.9);
      g.addColorStop(0, "rgba(255,200,180,0.22)");
      g.addColorStop(1, "rgba(255,200,180,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      events.forEach((ev, i) => {
        const el = pinRefs.current[i];
        if (!el) return;
        const [x, y, z] = toView(eventVecs[i]);
        const visible = z > 0.08;
        el.style.transform = `translate(${C + R * x}px, ${C - R * y}px)`;
        el.style.opacity = visible ? String(Math.min(1, (z - 0.08) * 6)) : "0";
        el.style.pointerEvents = visible ? "auto" : "none";
      });
    };

    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = hovering && !pinHover && !dragging ? SPIN : 0;
      velocity += (target - velocity) * Math.min(1, dt * 3);
      if (Math.abs(velocity) > 0.02) view.lon = ((view.lon + velocity * dt + 540) % 360) - 180;
      draw(reduced ? 0 : now);
      raf = requestAnimationFrame(tick);
    };

    const onEnter = () => (hovering = true);
    const onLeave = () => (hovering = false);
    let dragX = 0;
    let dragY = 0;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(".pin")) return;
      dragging = true;
      dragX = e.clientX;
      dragY = e.clientY;
      panel.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const k = 180 / size;
      view.lon = ((view.lon - (e.clientX - dragX) * k + 540) % 360) - 180;
      view.lat = Math.max(-60, Math.min(70, view.lat + (e.clientY - dragY) * k));
      dragX = e.clientX;
      dragY = e.clientY;
      velocity = 0;
    };
    const onUp = () => (dragging = false);

    const pinEnter = () => (pinHover = true);
    const pinLeave = () => (pinHover = false);
    const pinEls = pinRefs.current.filter(Boolean) as HTMLDivElement[];
    pinEls.forEach((el) => {
      el.addEventListener("pointerenter", pinEnter);
      el.addEventListener("pointerleave", pinLeave);
    });

    panel.addEventListener("pointerenter", onEnter);
    panel.addEventListener("pointerleave", onLeave);
    panel.addEventListener("pointerdown", onDown);
    panel.addEventListener("pointermove", onMove);
    panel.addEventListener("pointerup", onUp);
    panel.addEventListener("pointercancel", onUp);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    dots = buildDots();
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      panel.removeEventListener("pointerenter", onEnter);
      panel.removeEventListener("pointerleave", onLeave);
      panel.removeEventListener("pointerdown", onDown);
      panel.removeEventListener("pointermove", onMove);
      panel.removeEventListener("pointerup", onUp);
      panel.removeEventListener("pointercancel", onUp);
      pinEls.forEach((el) => {
        el.removeEventListener("pointerenter", pinEnter);
        el.removeEventListener("pointerleave", pinLeave);
      });
    };
  }, [events]);

  return (
    <div className="globe" ref={wrapRef}>
      <canvas ref={canvasRef} className="globe__canvas" />
      {events.map((ev, i) => (
        <div
          key={ev.id}
          className="pin"
          ref={(el) => {
            pinRefs.current[i] = el;
          }}
          onPointerEnter={(e) => {
            // keep the card inside the panel when a pin sits near an edge
            const panel = e.currentTarget.closest(".panel") as HTMLElement;
            const card = e.currentTarget.querySelector<HTMLElement>(".pin__card")!;
            const pr = panel.getBoundingClientRect();
            const cr = e.currentTarget.getBoundingClientRect();
            const half = card.offsetWidth / 2;
            const cx = cr.left + cr.width / 2;
            const shift = Math.max(pr.left + 12 - (cx - half), Math.min(0, pr.right - 12 - (cx + half)));
            card.style.setProperty("--shift", `${shift}px`);
          }}
        >
          <span className="pin__dot" />
          <div className="pin__card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ev.image} alt="" className="pin__img" />
            <p className="pin__name">{ev.name}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
