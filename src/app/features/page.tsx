import type { Metadata } from "next";
import Link from "next/link";
import styles from "./features.module.css";
import { asset } from "@/lib/base-path";

export const metadata: Metadata = {
  title: "Supported features",
  description:
    "The current cmdlib feature surface: datapack versions, runtime commands, NBT, execute, scoreboards, predicates, linting, projects and console tooling.",
};

const WORKBENCH = [
  ["Dockable workbench", "Explorer, code, console, preview, scoreboard and timeline panels. Float, maximize, close and reset them."],
  ["Code editor", "CodeMirror with syntax highlighting, tabs, multi-file editing and context-aware completion."],
  ["Projects", "Group several packs into one workspace, switch packs, import projects and export the whole project."],
  ["World preview", "Inspect entities, positions, NBT, effects and inventories. Right-drag to rotate, scroll to zoom."],
  ["Console", "Tab completion, history and log-level filters for errors, warnings, chat, data, commands and system messages."],
  ["Timeline", "Play, pause, freeze, step, change tick rate and speed. Load tags, tick tags and scheduled functions are simulated."],
  ["Search all", "Ctrl/Cmd + Shift + F searches every file with regex and case options, plus replace all. Ctrl/Cmd + P opens the file palette."],
];

const PACKS = [
  ["Versions", "Minecraft 1.13 through 26.3, including pack-format and folder-layout migrations."],
  ["Pack metadata", "Generate and update pack.mcmeta for legacy and modern versions."],
  ["Functions", "Namespaced .mcfunction files, macros, function tags and load/tick tags."],
  ["Non-function tags", "Item, block, entity type, fluid and game event tags."],
  ["Predicates", "Datapack predicates with references, cycles and common condition types."],
  ["Advancements", "Criteria, display data, rewards and a dockable Advancements panel. Tick and inventory triggers run rewards automatically."],
  ["Items & components", "Item IDs, 1.20.5+ components, stack counts, player slots, ender chests and item modifiers, with a dockable Inventory panel and right-click Use/Equip/book actions."],
  ["Imports", "Local ZIP projects, GitHub repositories, nested packs and multi-pack archives."],
  ["Large archives", "Up to 50,000 datapack files or 128 MB expanded; non-datapack assets are skipped before decompression."],
  ["Explorer scaling", "Folders page 300 rows at a time so huge packs remain responsive."],
];

const COMMANDS = [
  ["/execute", "as, at, anchored, positioned, align, rotated, facing, in, if/unless, store and run."],
  ["/data", "get, merge and modify (set, merge, append, prepend, insert, remove; value, from, string)."],
  ["/scoreboard", "objectives, players, operations, display slots, trigger objectives and enable."],
  ["/function", "Direct calls, function tags, inline macro arguments and with storage/entity/block."],
  ["/return", "Integer values, fail and run <command>."],
  ["/schedule", "Schedule function, append/replace and clear."],
  ["/reload", "Reload functions, tags and predicates."],
  ["/summon", "Curated entity types, NBT, UUIDs and display entities."],
  ["/tag", "Add, remove and list entity tags."],
  ["/tp, /teleport", "Position, rotation, facing, local coordinates and entity destinations."],
  ["/kill", "Remove selected entities."],
  ["/setblock", "Place a basic block with replace/destroy/keep modes."],
  ["/forceload", "add, remove and query; simulated as a no-op."],
  ["/say, /tellraw, /me, /title", "Chat, text components, titles, subtitles, actionbars and timings."],
  ["/gamemode", "survival, creative, adventure and spectator."],
  ["/give, /clear", "Player inventory stacks and clearing."],
  ["/effect", "Give and clear effects on any entity."],
  ["/spectate", "Make a player spectate an entity."],
  ["/trigger", "Bare add-one, add <value> and set <value>, with enabled-trigger completion."],
  ["/random", "value, roll and reset with integer ranges and optional sequences."],
  ["/tick", "freeze, unfreeze, rate, step, sprint and query, integrated with the timeline."],
  ["/advancement", "grant and revoke with only/everything modes and criteria completion."],
  ["/item", "replace and modify items in mainhand, offhand, armor, hotbar, inventory and enderchest slots."],
  ["/damage", "reduce player or entity health."],
];

const EXECUTE = [
  "as", "at", "anchored", "positioned", "align", "rotated", "facing", "in",
  "if entity", "if score", "if block", "if data", "if dimension",
  "if predicate", "if function", "if items entity", "if loaded",
  "unless", "store result", "store success", "run",
];

const NBT = [
  ["SNBT", "Parse and print compounds, lists, strings, numbers and typed arrays."],
  ["Paths", "Keys, quoted keys, indexes, wildcards, compound filters and negative indexes."],
  ["String slices", "Negative start/end indexes and numeric-to-string conversion."],
  ["UUIDs", "Int-array UUIDs, canonical and abbreviated UUID entity targets."],
  ["Execute store", "Write results into scores, storage, entity NBT and block NBT."],
  ["Display matrices", "Matrix-form display transformations with translation/scale normalized by homogeneous w."],
  ["Dates and numbers", "Signed 32-bit scores, clamped values and numeric result semantics."],
  ["Predicates", "all_of, any_of, inverted, reference, entity_properties, entity_present, location_check, score, entity_scores, random_chance, random_chance_with_looting, time_check, weather_check and value_check."],
];

const TOOLS = [
  ["Linting", "Unknown commands, objectives, functions, tags, predicates and paths; unused functions; macro and folder errors. Bounded for large projects."],
  ["Autocomplete", "Commands, selectors, objectives, functions, tags, storage, NBT, coordinates, blocks, items, entities and predicates."],
  ["Console completion", "Command names, arguments, NBT paths and enabled trigger objectives."],
  ["Command palette", "Ctrl/Cmd + K for file paths, function IDs like cmdlib:stats, panels and actions."],
  ["Keybindings", "Custom reload, run, preferences and palette bindings."],
  ["Log filters", "Show or hide errors, warnings, chat/tellraw, data, command echoes and system messages."],
];

const NOT_SIMULATED = [
  "datapack", "help", "time", "weather", "gamerule", "fill", "clone",
  "particle", "playsound", "bossbar", "xp", "attribute",
  "loot", "compute", "posteffect", "dialog", "version",
  "list", "seed",
];

const LIMITS = [
  ["Command coverage", "Commands outside the supported list produce a warning and continue. They do not halt a function."],
  ["26.3 conditions", "/execute if slots is not simulated yet; /execute if items entity is."],
  ["Number providers", "/data modify … compute is not simulated yet."],
  ["World model", "No mob AI, collision, physics, pathfinding or full block rendering."],
  ["Chunks", "/forceload does not load real chunk data; it is a simulation no-op."],
  ["Media", "Sounds and particles are not rendered."],
  ["Rendering", "The preview is an entity schematic, not a Minecraft client."],
  ["Linting budget", "Linting stops after 2,000 function files, 200,000 commands or 3 seconds and reports lint-truncated."],
];

export default function FeaturesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <img src={asset("/art/mark.svg")} alt="" width={26} height={26} />
            <span>cmdlib</span>
            <em>features</em>
          </Link>
          <nav>
            <Link href="/">Home</Link>
            <Link href="/editor/">Editor</Link>
            <Link href="/projects/">Projects</Link>
            <Link href="/credits/">Credits</Link>
          </nav>
          <Link className={styles.headerCta} href="/editor/">Open editor →</Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">Supported features</span>
          <h1 className={`display ${styles.title}`}>What works.</h1>
          <p className={styles.lede}>
            cmdlib is a datapack IDE with a real command simulator, NBT engine,
            scoreboard runtime and linter. This is the current surface — the
            commands, formats and tooling you can rely on today.
          </p>
          <div className={styles.heroMeta}>
            <span><b>Versions</b> 1.13 – 26.3</span>
            <span><b>Runtime commands</b> 28</span>
            <span><b>Predicates</b> 12 condition types</span>
            <span><b>Tests</b> 168 passing</span>
            <span><b>Runtime</b> static · local-only</span>
          </div>
        </div>
      </section>

      <nav className={styles.jump} aria-label="Feature sections">
        <a href="#workbench">Workbench</a>
        <a href="#datapacks">Datapacks</a>
        <a href="#commands">Commands</a>
        <a href="#nbt">NBT &amp; data</a>
        <a href="#tooling">Tooling</a>
        <a href="#limits">Limits</a>
      </nav>

      <section className={styles.section} id="workbench">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>01 / Workbench</span>
            <h2>The editor around the pack.</h2>
          </div>
          <p>Everything is client-side. Projects live in the browser, and the simulator runs the same functions you would run in game.</p>
        </div>
        <div className={styles.grid}>
          {WORKBENCH.map(([title, body]) => (
            <article className={styles.card} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="datapacks">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>02 / Datapacks</span>
            <h2>Formats and versions.</h2>
          </div>
          <p>Version-aware folders, pack metadata, macros, tags, predicates and multi-pack projects.</p>
        </div>
        <div className={styles.grid}>
          {PACKS.map(([title, body]) => (
            <article className={styles.card} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="commands">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>03 / Runtime</span>
            <h2>Commands that execute.</h2>
          </div>
          <p>Supported commands simulate state, feedback and return values. Unsupported commands warn and continue.</p>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Command</th><th>Coverage</th></tr>
            </thead>
            <tbody>
              {COMMANDS.map(([command, coverage]) => (
                <tr key={command}><td>{command}</td><td>{coverage}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.twoCol}>
          <div>
            <h3 className={styles.eyebrow} style={{ marginBottom: 10 }}>/execute clauses</h3>
            <div className={styles.list}>
              {EXECUTE.map((item) => <span className={`${styles.pill} ${styles.pillSupported}`} key={item}>{item}</span>)}
            </div>
          </div>
          <div>
            <h3 className={styles.eyebrow} style={{ marginBottom: 10 }}>Not simulated</h3>
            <div className={styles.list}>
              {NOT_SIMULATED.map((item) => <span className={`${styles.pill} ${styles.pillUnsupported}`} key={item}>{item}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="nbt">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>04 / NBT &amp; data</span>
            <h2>The data layer.</h2>
          </div>
          <p>Storage, entity NBT, block NBT and the path vocabulary datapacks use in practice.</p>
        </div>
        <div className={styles.grid}>
          {NBT.map(([title, body]) => (
            <article className={styles.card} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="tooling">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>05 / Tooling</span>
            <h2>Feedback while you type.</h2>
          </div>
          <p>Linting, completion and navigation are built into the editor and console.</p>
        </div>
        <div className={styles.grid}>
          {TOOLS.map(([title, body]) => (
            <article className={styles.card} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="limits">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>06 / Limits</span>
            <h2>What it is not.</h2>
          </div>
          <p>cmdlib is a focused simulator, not a Minecraft client or server. These are the deliberate boundaries.</p>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Area</th><th>Boundary</th></tr>
            </thead>
            <tbody>
              {LIMITS.map(([area, body]) => (
                <tr key={area}><td>{area}</td><td>{body}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.callout}>
          <h3>Unsupported commands are warnings, not crashes.</h3>
          <p>
            A function that calls an unsupported command logs a warning and
            continues to the next line. Failed commands inside functions also
            continue silently, matching vanilla function execution. The linter
            still reports syntax and structural problems before you run.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>cmdlib · supported features · 26.3</span>
        <span>
          <Link href="/editor/">Open editor</Link> · <Link href="/credits/">Credits</Link> ·{" "}
          <a href="https://github.com/Gameboy612/cmdlib" target="_blank" rel="noreferrer">GitHub</a>
        </span>
      </footer>
    </main>
  );
}
