"use client";

import { useEffect, useRef } from "react";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import type { TribeEvent } from "../lib/events";

const D2R = Math.PI / 180;
const STEP_LAT = 1.8; // lattice spacing in degrees
const STEP_LON = 3.6;
const GRATICULE = 15;
const colSin = new Float32Array(Math.round(360 / 3.6));
const colCos = new Float32Array(Math.round(360 / 3.6));
// The reference shows the whole world across one disc, so longitude is compressed:
// the sphere's visible half spans 360° of longitude. Spinning wraps continuously.
const LON_K = 0.5;
const START = { lon: 5, lat: 12 };
const SPIN = 14; // degrees of longitude per second while hovered

type Pt = { sinLat: number; cosLat: number; col: number; glyph: string; grat: boolean };

const COLS = Math.round(360 / STEP_LON);
const colLon = (c: number) => -180 + c * STEP_LON;

// Glyph per region, echoing the reference globe.
function glyphFor(lon: number, lat: number): string {
  if (lat < -60) return "=";
  if (lat > 36 && lon > -25 && lon < 45) return "*";
  if (lon < -30 && lat > 12) return "^";
  if (lon < -30) return "+";
  if (lon > -20 && lon < 52 && lat > -36 && lat < 37 && !(lon > 34 && lat > 13)) return "#";
  if ((lon >= 112 && lat < -10) || (lon >= 95 && lon <= 155 && lat <= 7 && lat >= -10) || (lon >= 155 && lat < 0)) return "%";
  return "@";
}

function buildLattice(): Promise<Pt[]> {
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

  const pts: Pt[] = [];
  for (let lat = -88; lat <= 88; lat += STEP_LAT) {
    const cosLat = Math.cos(lat * D2R);
    const skip = Math.max(1, Math.round(0.6 / Math.max(cosLat, 0.05)));
    const m = (lat + 90) % GRATICULE;
    const onParallel = m < STEP_LAT / 2 || GRATICULE - m < STEP_LAT / 2;
    for (let col = 0; col < COLS; col += skip) {
      const lon = colLon(col);
      const onMeridian = Math.abs(lon % GRATICULE) < STEP_LON / 2;
      pts.push({
        sinLat: Math.sin(lat * D2R),
        cosLat,
        col,
        glyph: isLand(lon, lat) ? glyphFor(lon, lat) : "",
        grat: onMeridian || onParallel,
      });
    }
  }
  return Promise.resolve(pts);
}

function project(lat: number, lon: number, lon0: number, lat0: number) {
  const phi = lat * D2R;
  const dl = ((((lon - lon0 + 540) % 360) - 180) * LON_K) * D2R;
  const p0 = lat0 * D2R;
  return {
    x: Math.cos(phi) * Math.sin(dl),
    y: Math.cos(p0) * Math.sin(phi) - Math.sin(p0) * Math.cos(phi) * Math.cos(dl),
    z: Math.sin(p0) * Math.sin(phi) + Math.cos(p0) * Math.cos(phi) * Math.cos(dl),
  };
}

export default function Globe({ events }: { events: TribeEvent[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const panel = wrap.parentElement!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let pts: Pt[] = [];
    let size = 0;
    let dpr = 1;
    const view = { ...START };
    let velocity = 0; // current spin, deg/s
    let hovering = false;
    let pinHover = false;
    let dragging = false;
    let dirty = true;
    let raf = 0;
    let last = performance.now();
    let alive = true;

    const resize = () => {
      size = wrap.clientWidth;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.height = Math.round(size * dpr);
      dirty = true;
    };

    const draw = () => {
      const R = size / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // frosted disc so the code texture reads as sitting behind the globe
      ctx.fillStyle = "rgba(243, 243, 243, 0.4)";
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.fill();
      const sl0 = Math.sin(view.lat * D2R);
      const cl0 = Math.cos(view.lat * D2R);
      for (let c = 0; c < COLS; c++) {
        const th = ((((colLon(c) - view.lon + 540) % 360) - 180) * LON_K) * D2R;
        colSin[c] = Math.sin(th);
        colCos[c] = Math.cos(th);
      }
      const glyphPx = size * 0.0165;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#1e1e1e";
      for (const p of pts) {
        const cosD = colCos[p.col];
        const sinD = colSin[p.col];
        const z = sl0 * p.sinLat + cl0 * p.cosLat * cosD;
        if (z <= 0.02) continue;
        const x = R + R * p.cosLat * sinD;
        const y = R - R * (cl0 * p.sinLat - sl0 * p.cosLat * cosD);
        const fall = Math.pow(z, 0.6);
        if (p.glyph) {
          ctx.globalAlpha = 0.42 * fall;
          ctx.font = `500 ${glyphPx * (0.55 + 0.45 * fall)}px ui-monospace, Menlo, Consolas, monospace`;
          ctx.fillText(p.glyph, x, y);
        } else {
          ctx.globalAlpha = (p.grat ? 0.34 : 0.14) * fall;
          const s = p.grat ? 1.6 : 1.1;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;

      events.forEach((ev, i) => {
        const el = pinRefs.current[i];
        if (!el) return;
        const q = project(ev.lat, ev.lon, view.lon, view.lat);
        const visible = q.z > 0.08;
        el.style.transform = `translate(${R + R * q.x}px, ${R - R * q.y}px)`;
        el.style.opacity = visible ? String(Math.min(1, (q.z - 0.08) * 6)) : "0";
        el.style.pointerEvents = visible ? "auto" : "none";
      });
    };

    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = hovering && !pinHover && !dragging ? SPIN : 0;
      velocity += (target - velocity) * Math.min(1, dt * 3);
      if (Math.abs(velocity) > 0.02) {
        view.lon = (view.lon + velocity * dt + 540) % 360 - 180;
        dirty = true;
      }
      if (dirty) {
        draw();
        dirty = false;
      }
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
      view.lat = Math.max(-60, Math.min(60, view.lat + (e.clientY - dragY) * k));
      dragX = e.clientX;
      dragY = e.clientY;
      velocity = 0;
      dirty = true;
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

    buildLattice().then((p) => {
      pts = p;
      dirty = true;
    });
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
