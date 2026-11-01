import { World } from "./world";
import type { EntityData } from "./entities";
import type { NbtTag } from "./nbt";
import { CommandError, Cursor } from "./cursor";
import { executeCommandLine, makeContext, ReturnSignal } from "./commands/context";
import type { CommandContext, CommandResult, Runtime } from "./commands/context";
import { parseDatapack, type Project } from "./datapack";
import { getVersion, type VersionProfile } from "./version";
import { macroValueToString } from "./commands/function";
import { HANDLERS } from "./commands";

export interface RunOutcome extends CommandResult {
  ok: boolean;
  error?: string;
}

export interface SimulatorOptions {
  project: Project;
  /** Seed a player at the origin. */
  player?: boolean;
}

/**
 * Owns one live world and the datapack functions loaded into it.
 *
 * The simulator is deliberately not a game loop. Entities do not have AI and
 * nothing ticks unless a command runs. That constraint is what makes the
 * preview deterministic, and it is why `cmdlib` can run entirely in a tab.
 */
export class Simulator implements Runtime {
  project: Project;
  version: VersionProfile;
  world: World;
  revision = 0;
  private listeners = new Set<() => void>();
  private detachWorld: (() => void) | null = null;
  private loading = false;
  private tagStack = new Set<string>();

  constructor(options: SimulatorOptions) {
    this.project = options.project;
    this.version = getVersion(options.project.versionId);
    this.world = new World({
      version: this.version,
      seedPlayer: options.player !== false,
    });
    this.attachWorld();
    this.syncFunctions();
  }

  private attachWorld(): void {
    this.detachWorld?.();
    this.detachWorld = this.world.subscribe(() => this.touch());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): number => this.revision;

  touch(): void {
    this.revision++;
    for (const listener of this.listeners) listener();
  }

  dispose(): void {
    this.detachWorld?.();
    this.listeners.clear();
  }

  setProject(project: Project): void {
    const versionChanged = project.versionId !== this.project.versionId;
    this.project = project;
    if (versionChanged) {
      this.version = getVersion(project.versionId);
      this.reset({ runLoad: false });
      return;
    }
    this.syncFunctions();
    this.touch();
  }

  /** Re-read functions and tags without destroying world state. */
  syncFunctions(): void {
    const parsed = parseDatapack(this.project.files, this.version);
    this.world.setFunctions(parsed.functions);
    this.world.setFunctionTags(parsed.tags);
  }

  /** Build a new world, load the pack, and run its load tags. */
  reset(options: { runLoad?: boolean } = {}): void {
    this.detachWorld?.();
    this.world = new World({
      version: this.version,
      seedPlayer: true,
    });
    this.attachWorld();
    this.syncFunctions();
    this.world.log(
      "system",
      `Simulation reset · Minecraft ${this.version.id} · pack format ${this.version.packFormat.join(".")}`,
    );
    if (options.runLoad !== false) {
      this.loading = true;
      try {
        this.runLoadTags();
      } finally {
        this.loading = false;
      }
    }
    this.world.touch();
  }

  runLoadTags(): number {
    let ran = 0;
    const tags = ["minecraft:load", "cmdlib:load"];
    for (const tag of tags) {
      if (!this.world.getFunctionTag(tag)) continue;
      try {
        this.runFunction(`#${tag}`, null, this.baseContext());
        ran++;
      } catch (error) {
        this.world.log("error", this.formatError(error));
      }
    }
    if (ran === 0) {
      this.world.log(
        "info",
        "No load tag found. Add data/minecraft/tags/function/load.json to run setup automatically.",
      );
    }
    return ran;
  }

  private baseContext(quiet = false): CommandContext {
    const player = this.world.player() ?? null;
    return makeContext(this.world, this, player, { quiet, lint: false });
  }

  /** Run one console line. Errors are logged, not thrown. */
  runCommand(line: string, options: { quiet?: boolean } = {}): RunOutcome {
    this.world.resetCommandBudget();
    const ctx = this.baseContext(options.quiet ?? false);
    this.currentLine = line;
    try {
      const result = executeCommandLine(line, ctx);
      this.world.touch();
      return { ...result, ok: true };
    } catch (error) {
      if (error instanceof ReturnSignal) {
        this.world.touch();
        return { result: error.value, success: true, ok: true };
      }
      const message = this.formatError(error);
      this.world.log("error", message);
      this.world.touch();
      return { result: 0, success: false, ok: false, error: message };
    } finally {
      this.currentLine = undefined;
    }
  }

  /** Run a script of commands in one context (a function file, essentially). */
  runScript(source: string, options: { quiet?: boolean; macros?: Record<string, NbtTag> } = {}): RunOutcome {
    this.world.resetCommandBudget();
    const ctx = this.baseContext(options.quiet ?? false);
    ctx.macroArgs = options.macros;
    const lines = source.split(/\r?\n/);
    let last: { result: number; success: boolean } = { result: 0, success: true };
    try {
      for (let i = 0; i < lines.length; i++) {
        const prepared = this.prepareLine(lines[i], options.macros ?? null, "(console)", i + 1);
        if (prepared === null) continue;
        const result = executeCommandLine(prepared, ctx);
        last = result;
      }
      this.world.touch();
      return { ...last, ok: true };
    } catch (error) {
      if (error instanceof ReturnSignal) {
        this.world.touch();
        return { result: error.value, success: true, ok: true };
      }
      const message = this.formatError(error);
      this.world.log("error", message);
      this.world.touch();
      return { result: 0, success: false, ok: false, error: message };
    }
  }

  runFile(path: string): RunOutcome {
    const source = this.project.files[path];
    if (source === undefined) {
      const message = `File '${path}' does not exist in this project`;
      this.world.log("error", message);
      this.touch();
      return { result: 0, success: false, ok: false, error: message };
    }
    return this.runScript(source);
  }


  /** Runtime interface used by the /function command. */
  runFunction(
    id: string,
    args: Record<string, NbtTag> | null,
    parent: CommandContext,
  ): CommandResult {
    if (id.startsWith("#")) {
      return this.runFunctionTag(id.slice(1), args, parent);
    }
    const def = this.world.getFunction(id);
    if (!def) {
      throw new CommandError(`Unknown function '${id}'`, 0, "unknown-function");
    }
    if (def.hasMacroLines && (!args || Object.keys(args).length === 0)) {
      throw new CommandError(
        `Function '${id}' uses macros and must be called with arguments`,
        0,
        "macro-required",
      );
    }
    if (parent.depth > 64) {
      throw new CommandError(
        `Function recursion limit reached while calling '${id}'`,
        0,
        "recursion",
      );
    }
    const ctx: CommandContext = {
      ...parent,
      depth: parent.depth + 1,
      quiet: true,
      functionId: id,
      macroArgs: args ?? undefined,
    };
    let lastResult = 0;
    for (let i = 0; i < def.lines.length; i++) {
      const prepared = this.prepareLine(def.lines[i], args, id, i + 1);
      if (prepared === null) continue;
      try {
        const result = executeCommandLine(prepared, ctx);
        lastResult = result.result;
      } catch (error) {
        if (error instanceof ReturnSignal) {
          return { result: error.value, success: true };
        }
        if (error instanceof CommandError) {
          error.message = `${error.message} (function ${id}, line ${i + 1})`;
          throw error;
        }
        throw error;
      }
    }
    return { result: lastResult, success: true };
  }

  private runFunctionTag(
    id: string,
    args: Record<string, NbtTag> | null,
    parent: CommandContext,
  ): CommandResult {
    const tag = this.world.getFunctionTag(id);
    if (!tag) {
      throw new CommandError(`Unknown function tag '${id}'`, 0, "unknown-function-tag");
    }
    if (this.tagStack.has(id)) {
      throw new CommandError(
        `Function tag cycle detected at '${id}'`,
        0,
        "tag-cycle",
      );
    }
    this.tagStack.add(id);
    try {
      let result = 0;
      let success = true;
      for (const value of tag.values) {
        try {
          const branch = this.runFunction(value, args, parent);
          result += branch.result;
          success = success && branch.success;
        } catch (error) {
          if (error instanceof ReturnSignal) continue;
          throw error;
        }
      }
      return { result, success };
    } finally {
      this.tagStack.delete(id);
    }
  }

  /**
   * Expand a function line. Lines that begin with `$` are macro lines; `$$(`
   * escapes a literal `$(`. Values are stringified the way vanilla does.
   */
  prepareLine(
    raw: string,
    args: Record<string, NbtTag> | null,
    sourceLabel: string,
    lineNumber: number,
  ): string | null {
    const line = raw.replace(/\s+$/, "");
    if (line.trim().length === 0) return null;
    if (line.trimStart().startsWith("#")) return null;
    if (!line.startsWith("$")) return line;
    const body = line.slice(1);
    if (!args) {
      throw new CommandError(
        `Macro function requires arguments (${sourceLabel}, line ${lineNumber})`,
        0,
        "macro-required",
      );
    }
    let out = "";
    let i = 0;
    while (i < body.length) {
      if (body.startsWith("$$(", i)) {
        out += "$(";
        i += 3;
        continue;
      }
      if (body.startsWith("$(", i)) {
        const close = body.indexOf(")", i + 2);
        if (close === -1) {
          throw new CommandError(
            `Unclosed macro interpolation at line ${lineNumber}`,
            i,
            "macro-syntax",
          );
        }
        const key = body.slice(i + 2, close);
        const value = args[key];
        if (!value) {
          throw new CommandError(
            `Missing macro argument '${key}' (${sourceLabel}, line ${lineNumber})`,
            i,
            "macro-argument",
          );
        }
        const text = macroValueToString(value);
        if (text.includes("\n") || text.includes("\r")) {
          throw new CommandError(
            `Macro argument '${key}' contains a newline, which Minecraft forbids`,
            i,
            "macro-newline",
          );
        }
        out += text;
        i = close + 1;
        continue;
      }
      out += body[i];
      i++;
    }
    return out;
  }

  formatError(error: unknown): string {
    if (error instanceof CommandError) {
      const line = this.currentLine ?? "";
      return line
        ? `${error.message}  ·  ${line.trim()}`
        : error.message;
    }
    if (error instanceof ReturnSignal) return `return ${error.value}`;
    return (error as Error)?.message ?? String(error);
  }

  private currentLine?: string;

  /** Used by the console to check a command without committing it. */
  previewCommand(line: string): { ok: boolean; offset?: number; message?: string } {
    const ctx = this.baseContext(true);
    ctx.lint = true;
    try {
      const cursor = new Cursor(line.replace(/^\s*\//, ""));
      const name = cursor.readWord();
      if (!name) return { ok: true };
      if (!HANDLERS[name]) {
        return { ok: false, message: `Unknown command '${name}'`, offset: 0 };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: (error as Error).message,
        offset: (error as { index?: number }).index,
      };
    }
  }
}
