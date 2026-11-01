# cmdlib — design brief

> Self-authored under explicit creative delegation. The request said “Innovate
> and be creative”, supplied the product requirements, and pointed at
> [`scroll-craft`](https://github.com/nateherkai/scroll-craft) for animation
> guidance. This brief records the decisions the build is held to.

## 1. The product in one line

A datapack IDE that runs Minecraft in the tab, so the distance between an edit
and an answer is one keystroke instead of one world load.

## 2. Who it is for

Datapack authors who already know `mcfunction` and are tired of the launch /
reload / guess loop. Secondary: server developers evaluating a pack before
shipping it to players. They are technical, allergic to fake UI, and will judge
the product by whether the preview tells the truth.

## 3. Vibe

**Instrument, not toy.** A technical workstation with editorial confidence.
Obsidian, bone paper, ember. Monospace for facts, a warm grotesque for argument.
Minecraft is present as a world and a command grammar, not as green pixels and
diamond icons.

## 4. Page grammar

**Chaptered editorial with one live surface.** Not a continuous camera flight.
Sections are hard cuts between dark instrument panels and bone-paper chapters.
The live surface is the product itself, not a video.

## 5. Feeling curve

| # | Act | Feeling | What causes it |
|---|-----|---------|----------------|
| 1 | Hero | Curiosity | A world plate behind a floating editor; two-line promise; “scroll to execute” |
| 2 | The loop | Recognition | Paper, a hard cut, the five familiar steps of launch/reload/guess |
| 3 | Live runtime | Awe | Scroll becomes a tick; the actual engine executes and the world answers |
| 4 | Workbench | Competence | Windows pull apart and dock; the real layout is explained |
| 5 | Versions | Confidence | A pack format rail and capability table that treats versions as data |
| 6 | Linting | Trust | A real diagnostic report with codes, spans and LSP export |
| 7 | Close | Resolve | A live command prompt and one next action |

No two adjacent acts produce the same feeling. The quiet paper chapter before
the live one is deliberate; it buys the peak its contrast.

## 6. The peak

The peak is the **“Scroll is the tick”** section:

> “I scrolled, and the world actually ran the command.”

It gets the most scroll room (360vh), the only live engine on the page, and the
biggest state change: score 0 → 100, storage `boot` → `interpolated`, target
entity moved, macro expanded, title lands. The asset budget is the preview
itself. Nothing else on the page is allowed to compete with it.

## 7. Signature move

Scroll is not a progress bar. It is the tick loop. Each threshold executes a
real command through the same `Simulator` the editor uses. Scrolling back
resets the world, so the move can be replayed. On mobile and reduced motion the
same sequence is exposed as “Run next tick”, because the interaction must
degrade rather than disappear.

This exists only on this site and only because the product is a runtime.

## 8. Visual system

- **Ground:** `#08090b`, surfaces `#101419`, lines at 11% bone.
- **Paper:** `#efe9dd` with ink `#17140f` for the loop and close chapters.
- **Accent:** ember `#ff7a45` — command feedback, live state, the one thing to
  click. Secondary: patina `#79d9c6` for storage/data; gold `#e9c98f` for
  objectives.
- **Type:** Bricolage Grotesque (display and body) + JetBrains Mono (code,
  labels, facts). Two families, self-hosted, OFL.
- **Depth:** layered hero plates (sky, island, foreground), a floating editor
  window, a mini preview that breaks the window edge, grain, vignette.
- **No:** fake dashboards, invented statistics, gradient text, `01 / 06`
  counters, scroll-cue clichés, recycled Minecraft UI.

## 9. The live demo sequence

| Tick | Command | What the visitor sees |
|------|---------|-----------------------|
| 1 | `scoreboard players add @s progress 25` | Sidebar value changes |
| 2 | `data modify storage landing:state stage set value "mapped"` | Actionbar + storage state |
| 3 | `execute as @e[tag=target] at @s run data modify entity @s Pos …` | Target entity moves |
| 4 | `function landing:stamp {stage:"interpolated"}` | Macro expands into chat + subtitle |
| 5 | `title @s title {"text":"THE WORLD ANSWERED",…}` | Title lands, score reaches 100 |

The output strip reads the real command log. The “LIVE RUNTIME” badge is
earned: there is no video, no screenshot and no mocked state.

## 10. Assets

Generated in-repo by `scripts/generate-art.mjs`:

- `public/art/hero-sky.svg` — stars, radar rings, horizon.
- `public/art/hero-island.svg` — a floating 9×9 isometric island, pond,
  waterfall, trees, beacon, annotations.
- `public/art/hero-foreground.svg` — grass clusters and ridge silhouette.
- `public/mark.svg` / `public/icon.svg` — isometric cube + ember prompt.
- `public/og.svg` / `og.png` — 1200×630 social card.

No external image generation service, no Minecraft textures, no stock photos.

## 11. Verification

- Desktop 1440×900 and mobile 390×844 screenshots at every act.
- Scroll positions: hero, loop, live at 55% and 96%, workbench, versions,
  lint, close, footer.
- Editor: load, demo, console, command palette, problems panel, version switch,
  layout persistence, autocomplete, mobile run button.
- Reduced motion: the live sequence is manual, title labels do not collide,
  and reveal animations are disabled.
- Engine: 131 unit tests across NBT, paths, text, runtime, lint and completion.

## 12. Known limits / next acts

The first demo is deliberately narrow. The brief for the next pass:

- A richer entity model (inventory, attributes, poses) that is still honestly
  non-AI.
- Scheduled functions and tick tags, with a visible tick budget.
- A floating “world inspector” that can be docked next to the preview.
- A pack-template gallery, with each template version-gated.
