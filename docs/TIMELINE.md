# Timeline / tick runtime

The timeline runtime is intentionally small: one `tick()` call advances the
world by exactly one game tick, runs the `minecraft:tick` function tag, then
runs any `/schedule function` entries that are due. There is no background loop
inside the simulator; the Timeline panel owns the `setInterval`.

## Runtime API

### `Simulator.tick(): TickOutcome`

```ts
interface TickOutcome {
  tick: number;          // world tick after the increment (starts at 1)
  tickTagRan: boolean;   // a minecraft:tick tag existed and was invoked
  scheduledRan: number;  // due scheduled functions that were executed
  errors: string[];      // tick-tag / scheduled-function errors, already logged
  ok: boolean;           // errors.length === 0
}
```

Order: `world.tick += 1` → `#minecraft:tick` (all values, via the existing
cycle-safe `runFunctionTag`) → due schedules → `world.touch()`. The due list is
captured after the tag, so a tick function may call `/schedule` safely. Entries
queued by a due function itself wait for the next tick, avoiding same-tick
reschedule loops. Errors are logged and returned, never thrown.

### `ScheduledFunction`

Exported from `src/lib/mc/world.ts`:

```ts
interface ScheduledFunction {
  functionId: string;       // test:mark
  scheduledAtTick: number;  // world tick when queued
  dueTick: number;          // scheduledAtTick + delay
  sequence: number;         // monotonic insertion order
}
```

### State and mutation

`World` owns the queue:

- `world.scheduled: readonly ScheduledFunction[]` — read-only, sorted by
  `dueTick` then `sequence`.
- `world.scheduleFunction(id, delayTicks, mode = "replace")` — returns the new
  entry. `replace` clears existing entries for that id first; `append` keeps
  them.
- `world.clearSchedules(functionId?)` — removes one function's queue, or the
  whole queue when the id is omitted. Returns the number removed.
- `world.collectDueSchedules(currentTick = world.tick)` — atomically removes
  and returns entries with `dueTick <= currentTick`.

`Simulator` re-exports the useful surface:

- `sim.scheduled` (getter) — same read-only view.
- `sim.clearSchedules(functionId?)` — clears and `touch()`es for the panel.

A new `World` is created by `Simulator.reset()`, so schedules are cleared on
reset, version switch, and project change.

### `/schedule` command

```
/schedule function <id> <time> [append|replace]
/schedule clear <id>
```

`<time>` is an unsigned integer immediately followed by `t` (ticks), `s`
(seconds, 20 t/s) or `d` (days, 24000 t/d). Decimals, signs and unknown units
are rejected. The function id must exist in the loaded datapack. Errors and
successes are written to the console; inside functions feedback stays quiet.
`/reload` is unchanged.

Exports from `src/lib/mc/commands/schedule.ts` (also re-exported from
`src/lib/mc/commands/index.ts`):

- `scheduleHandler`
- `parseScheduleTime(raw): number | null`
- `TICKS_PER_SECOND = 20`
- `TICKS_PER_DAY = 24000`
- `SCHEDULE_USAGE`

Metadata lives in `COMMANDS.schedule` (`src/lib/mc/data.ts`) with
`supported: true` and a usage string.

## Timeline panel

`TimelinePanel` is exported (named and default) from
`src/components/editor/TimelinePanel.tsx`, with styles in
`src/components/editor/timeline.module.css`. It only imports `useWorkbench`
(for `sim`) and `useSimRevision` from the workbench store.

Controls: play/pause, step once, speed `0.5× / 1× / 2× / 4×` (10/20/40/80
TPS), current tick, playing indicator. While playing it uses
`setInterval(..., 1000 / (20 * speed))`, calls `sim.tick()`, pauses on unmount,
and rebuilds the interval whenever `sim`, `speed`, or `playing` changes. It
also lists scheduled functions grouped by id (due tick, remaining ticks, queue
count), offers per-row and clear-all buttons, and shows the
`minecraft:tick` value count.

## Integration checklist (main agent)

1. `src/components/editor/panel-meta.ts`: add `timeline: "Timeline"` to
   `PANEL_LABELS` and `"timeline"` to `PANEL_ORDER`.
2. `src/components/editor/DockWorkspace.tsx`: import
   `{ TimelinePanel } from "./TimelinePanel"` and register it as the component
   for the `timeline` panel id, alongside the other panel components.
3. Optional `Toolbar.tsx` / `MenuBar.tsx` shortcut: call `requestPanel("timeline")`
   or `setOpenPanels([...openPanels, "timeline"])` from the workbench store.
4. Nothing in `src/lib/state/workbench.ts` needs to change.

Those shell files are deliberately untouched by the timeline change.
