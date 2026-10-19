"use client";

import { useEffect, useState } from "react";
import Globe from "./Globe";
import { EVENTS, STATS } from "../lib/events";

const SECTIONS = [
  { slug: "leaders", label: "Leaders", blurb: "Placeholder: the people shaping software quality around the world." },
  { slug: "knowledge", label: "Knowledge", blurb: "Placeholder: talks, guides and community learning." },
  { slug: "products", label: "products", blurb: "Placeholder: tools and products from the tribe." },
];

// Preloader timeline (ms). Durations live in styles/hero.css (--t-move, --t-reveal).
const HOLD = 1200;
const READY = HOLD + 1500 + 1300;

export default function Hero() {
  const [phase, setPhase] = useState<"intro" | "move" | "ready">("intro");
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("ready");
      return;
    }
    const a = setTimeout(() => setPhase("move"), HOLD);
    const b = setTimeout(() => setPhase("ready"), READY);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  const section = SECTIONS.find((s) => s.slug === active);

  return (
    <div className="page" data-phase={phase}>
      <div className="preloader" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/assets/logo.svg" alt="The Test Tribe" />

      <header className="header" />

      <main className="stage">
        <section className="intro">
          <h1 className="intro__title">
            Global Software
            <br />
            Quality Ecosystem
          </h1>
          <nav className="intro__nav" aria-label="Sections">
            {SECTIONS.map((s) => (
              <a
                key={s.slug}
                href={`#${s.slug}`}
                className="intro__link"
                onClick={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(s.slug)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(s.slug)}
                onBlur={() => setActive(null)}
              >
                /{s.label}
              </a>
            ))}
          </nav>
        </section>

        <section className="panel">
          <div className="texture" aria-hidden="true">
            <div className="texture__track">
              {[0, 1, 2].map((i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src="/assets/code-texture.svg" alt="" className="texture__tile" draggable={false} />
              ))}
            </div>
          </div>

          <Globe events={EVENTS} />

          <ul className="legend">
            {STATS.map((s) => (
              <li key={s.label} className="legend__item">
                <span className={`legend__dot${s.accent ? " legend__dot--accent" : ""}`} />
                {s.value} {s.label}
              </li>
            ))}
          </ul>

          <div className={`overlay${section ? " overlay--on" : ""}`} aria-hidden={!section}>
            <p className="overlay__kicker">/{section?.slug}</p>
            <p className="overlay__body">{section?.blurb}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
