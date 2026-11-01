import type { Metadata } from "next";
import Link from "next/link";
import styles from "./credits.module.css";
import { asset } from "@/lib/base-path";

export const metadata: Metadata = {
  title: "Credits & licenses",
  description:
    "Every dependency, linter reference and asset license behind cmdlib. A commercial-use audit with no GPL or non-commercial-only code bundled.",
};

const LINTERS = [
  {
    name: "Spyglass",
    href: "https://github.com/SpyglassMC/Spyglass",
    license: "MIT",
    commercial: "Permitted with attribution",
    role: "Reference implementation for mcfunction diagnostics, selector semantics and command data. cmdlib's rules are independently written; no Spyglass source is bundled.",
    bundled: "No code bundled",
  },
  {
    name: "mclint",
    href: "https://www.npmjs.com/package/mclint",
    license: "ISC",
    commercial: "Permitted with attribution",
    role: "Cross-check for lint rule vocabulary and the expectations of datapack authors. No mclint code is bundled.",
    bundled: "No code bundled",
  },
  {
    name: "Minecraft Wiki",
    href: "https://minecraft.wiki/",
    license: "CC BY-NC-SA 3.0 (wiki text)",
    commercial: "Facts only; no wiki text or assets are reproduced",
    role: "Factual reference for command syntax, NBT keys, version history and pack formats. Command behaviour is implemented from the public game specification; cmdlib does not copy wiki prose.",
    bundled: "No text or images bundled",
  },
  {
    name: "scroll-craft",
    href: "https://github.com/nateherkai/scroll-craft",
    license: "MIT",
    commercial: "Permitted with attribution",
    role: "Design and animation workflow reference for the landing page: scroll-as-timeline, layered depth, feeling curve, and verification discipline. No scroll-craft engine code is bundled.",
    bundled: "No code bundled",
  },
];

const DEPENDENCIES = [
  ["Next.js", "MIT", "Static site framework, routing, build"],
  ["React / React DOM", "MIT", "UI runtime"],
  ["dockview / dockview-core / dockview-react", "MIT", "Dockable window layout, floating and edge groups"],
  ["CodeMirror 6 (@codemirror/*)", "MIT", "Editor, language support, autocomplete, lint UI"],
  ["@lezer/highlight", "MIT", "Syntax highlighting tags"],
  ["@codemirror/lang-json", "MIT", "JSON language support for pack.mcmeta and tags"],
  ["fflate", "MIT", "ZIP export and import"],
  ["zustand", "MIT", "Workbench state"],
  ["Bricolage Grotesque", "SIL OFL 1.1", "Display and body typeface (self-hosted)"],
  ["JetBrains Mono", "SIL OFL 1.1", "Code and interface monospace (self-hosted)"],
];

const AUDIT = [
  ["Spyglass", "MIT", "Yes", "No", "Semantics reference, credited"],
  ["mclint", "ISC", "Yes", "No", "Semantics reference, credited"],
  ["Minecraft Wiki", "CC BY-NC-SA 3.0", "No (NC)", "No", "Facts referenced; no content copied"],
  ["dockview", "MIT", "Yes", "Yes", "Dock layout, notices included"],
  ["CodeMirror", "MIT", "Yes", "Yes", "Editor, notices included"],
  ["fflate", "MIT", "Yes", "Yes", "ZIP, notices included"],
  ["zustand", "MIT", "Yes", "Yes", "State, notices included"],
  ["Next.js / React", "MIT", "Yes", "Yes", "Framework, notices included"],
  ["Bricolage Grotesque", "OFL 1.1", "Yes", "Yes", "Font, OFL included"],
  ["JetBrains Mono", "OFL 1.1", "Yes", "Yes", "Font, OFL included"],
];

export default function CreditsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <img src={asset("/art/mark.svg")} alt="" width={26} height={26} />
            <span>cmdlib</span>
            <em>credits</em>
          </Link>
          <nav>
            <Link href="/">Home</Link>
            <Link href="/editor/">Editor</Link>
            <a href="#audit">Audit</a>
          </nav>
        </div>
      </header>

      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">Licenses & credits</span>
          <h1 className={`display ${styles.title}`}>
            The receipts.
          </h1>
          <p className={styles.lede}>
            cmdlib is intended to be a paid product. That makes every borrowed
            idea, every dependency and every font a commercial decision, not a
            footnote. This page is the audit: what is used, under which license,
            and whether it can ship in paid software.
          </p>
          <div className={styles.heroMeta}>
            <span><b>Last reviewed</b> 1 November 2026</span>
            <span><b>Bundled runtime deps</b> 17 direct</span>
            <span><b>GPL / AGPL / SSPL</b> none</span>
            <span><b>Non-commercial assets</b> none</span>
          </div>
        </div>
      </section>

      <section className={`container ${styles.summary}`} aria-label="License policy summary">
        <article>
          <span className={styles.num}>01</span>
          <h2>Commercial use first</h2>
          <p>
            A dependency only ships if its license permits commercial use with
            attribution. MIT, ISC and OFL do. GPL, AGPL, SSPL and
            non-commercial-only assets do not, so they are not bundled.
          </p>
        </article>
        <article>
          <span className={styles.num}>02</span>
          <h2>The linter is ours</h2>
          <p>
            cmdlib&apos;s lint engine is original TypeScript that shares the
            runtime&apos;s parser. Spyglass and mclint are credited as semantic
            references; neither codebase is vendored or copied.
          </p>
        </article>
        <article>
          <span className={styles.num}>03</span>
          <h2>No Minecraft assets</h2>
          <p>
            The hero art, logo, OG image and UI are original. No textures,
            sounds, models, fonts or wiki prose from Minecraft or the Minecraft
            Wiki are redistributed.
          </p>
        </article>
      </section>

      <section className={`container ${styles.section}`} id="linters">
        <div className={styles.sectionHead}>
          <span className="eyebrow">Standing on shoulders</span>
          <h2 className="display">Linting, and the tools before it.</h2>
          <p>
            The goal is not to invent new lint conventions. It is to be
            interoperable with the tools datapack authors already know, while
            keeping the implementation independent and license-clean.
          </p>
        </div>

        <div className={styles.cards}>
          {LINTERS.map((item) => (
            <article key={item.name} className={styles.card}>
              <div className={styles.cardTop}>
                <h3>
                  <a href={item.href} target="_blank" rel="noreferrer">{item.name} ↗</a>
                </h3>
                <span className={styles.license}>{item.license}</span>
              </div>
              <p className={styles.commercial}>{item.commercial}</p>
              <p>{item.role}</p>
              <span className={styles.bundled}>{item.bundled}</span>
            </article>
          ))}
        </div>

        <div className={styles.callout}>
          <span className={styles.calloutMark}>§</span>
          <div>
            <h3>How &ldquo;compatible&rdquo; is defined here</h3>
            <p>
              cmdlib parses mcfunction with the same 26.3 grammar it executes,
              reports spans and rule codes, and can export diagnostics as
              LSP-compatible JSON (severity, range, code, message, quick fixes).
              That output can be fed to editors and tooling that speak the
              Language Server Protocol. It does not embed Spyglass or mclint at
              runtime, which keeps the paid product free of copyleft obligations
              while still crediting the projects that established the
              conventions.
            </p>
          </div>
        </div>
      </section>

      <section className={`container ${styles.section}`} id="dependencies">
        <div className={styles.sectionHead}>
          <span className="eyebrow">Bundled dependencies</span>
          <h2 className="display">Everything that ships.</h2>
          <p>
            These packages and fonts are part of the static site your browser
            downloads. Full license texts are in the{" "}
            <a href={asset("/THIRD_PARTY_NOTICES.txt")}>third-party notices</a>. Build-only
            tools (sharp, playwright-core) are not shipped to visitors.
          </p>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Package / asset</th>
                <th>License</th>
                <th>Used for</th>
              </tr>
            </thead>
            <tbody>
              {DEPENDENCIES.map(([name, license, use]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td><span className={styles.tag}>{license}</span></td>
                  <td>{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`container ${styles.section}`} id="audit">
        <div className={styles.sectionHead}>
          <span className="eyebrow">Commercial-use audit</span>
          <h2 className="display">Can it ship in paid software?</h2>
          <p>
            The question this table answers is intentionally narrow: may this be
            redistributed inside a paid, closed-source product? Attribution
            obligations are listed separately and satisfied by this page and the
            notices file.
          </p>
        </div>
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.auditTable}`}>
            <thead>
              <tr>
                <th>Project</th>
                <th>License</th>
                <th>Paid use</th>
                <th>Bundled</th>
                <th>How it is used</th>
              </tr>
            </thead>
            <tbody>
              {AUDIT.map(([name, license, paid, bundled, use]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td><span className={styles.tag}>{license}</span></td>
                  <td className={paid.startsWith("Yes") ? styles.yes : styles.no}>{paid}</td>
                  <td className={bundled === "Yes" ? styles.yes : styles.no}>{bundled}</td>
                  <td>{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.policy}>
          Policy: if a tool&apos;s license is incompatible with a paid product, it
          is not used — not even as a copied constant or a bundled data file.
          Facts about game behaviour and the public command grammar are not
          copyrightable and are implemented independently; wiki prose, textures,
          sounds and other creative assets are never copied.
        </p>
      </section>

      <section className={`container ${styles.section}`} id="minecraft">
        <div className={styles.minecraft}>
          <h2 className="display">Minecraft.</h2>
          <p>
            cmdlib is an independent tool for building Minecraft: Java Edition
            datapacks. It is not affiliated with, endorsed by, or sponsored by
            Mojang Studios or Microsoft. Minecraft is a trademark of Mojang
            Synergies AB. References to game versions, pack formats and command
            names are nominative and descriptive.
          </p>
          <p>
            The runtime is a deliberately limited reimplementation for
            authoring and preview. It is not a Minecraft server or client, and
            it does not contain Minecraft code or assets.
          </p>
          <a className={styles.noticeLink} href={asset("/THIRD_PARTY_NOTICES.txt")}>
            Read the full third-party notices ↓
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className="container">
          <div>
            <img src={asset("/art/mark.svg")} alt="" width={32} height={32} />
            <span>cmdlib</span>
            <span className={styles.footerNote}>A datapack IDE that runs in the tab.</span>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/">Landing</Link>
            <Link href="/editor/">Editor</Link>
            <a href="#audit">Audit</a>
            <a href={asset("/THIRD_PARTY_NOTICES.txt")}>Notices</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
