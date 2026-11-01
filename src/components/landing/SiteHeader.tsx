"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./landing.module.css";
import { asset } from "@/lib/base-path";

const NAV = [
  { href: "#loop", label: "The loop" },
  { href: "#run", label: "Live demo" },
  { href: "#workbench", label: "Workbench" },
  { href: "#versions", label: "Versions" },
  { href: "#lint", label: "Linting" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 24);
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(height > 0 ? Math.min(1, window.scrollY / height) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="cmdlib home">
          <img src={asset("/art/mark.svg")} alt="" width={28} height={28} />
          <span className={styles.wordmark}>cmdlib</span>
          <span className={styles.versionTag}>26.3</span>
        </Link>

        <nav className={styles.nav} aria-label="Sections">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link className={styles.creditsLink} href="/projects/">
            Projects
          </Link>
          <a className={styles.creditsLink} href={asset("/credits/")}>
            Credits
          </a>
          <Link className="button button--small" href="/editor/">
            Open editor
          </Link>
        </div>
      </div>
      <div className={styles.scrollProgress} aria-hidden>
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
    </header>
  );
}
