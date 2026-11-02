import { Project, parseDatapack, collectObjectiveIds, collectStorageIds } from "../mc/datapack";
import { VersionProfile, getVersion } from "../mc/version";
import { World } from "../mc/world";
import { parseAdvancementFiles, type AdvancementDefinition } from "../mc/advancements";
import { createEntity, entityPos } from "../mc/entities";
import type { EntityData } from "../mc/entities";
import {
  executeCommandLine,
  makeContext,
  ReturnSignal,
} from "../mc/commands/context";
import type { CommandContext, Runtime } from "../mc/commands/context";
import { CommandError } from "../mc/cursor";
import { COMMANDS, ENTITY_BY_ID } from "../mc/data";
import { Tag } from "../mc/nbt";
import {
  canonicalId,
  collectPredicateConditionTypes,
  collectPredicateReferences,
  findPredicateCycles,
  isSupportedPredicateCondition,
  parsePredicateFiles,
  type PredicateDefinition,
} from "../mc/predicates";

export type LintSeverity = "error" | "warning" | "info" | "hint";

export interface LintEdit {
  path: string;
  from: number;
  to: number;
  text: string;
}

export interface LintQuickFix {
  title: string;
  action:
    | "edit"
    | "create-objective"
    | "create-function"
    | "fix-pack-meta"
    | "migrate-folders";
  edits?: LintEdit[];
  payload?: Record<string, string>;
}

export interface Diagnostic {
  id: string;
  source: "cmdlib";
  path: string;
  severity: LintSeverity;
  code: string;
  message: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  from: number;
  to: number;
  quickFix?: LintQuickFix[];
}

export interface LintReport {
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
  infos: number;
  filesLinted: number;
  durationMs: number;
  versionId: string;
}

export interface LintOptions {
  version?: VersionProfile;
  /** Only execute these paths; project-wide scans still run. */
  onlyPaths?: string[];
  /**
   * Additional file maps whose `scoreboard objectives add` declarations should
   * seed the lint world. Used for sibling packs in the same project: Minecraft
   * loads all packs together, so an objective may be declared in another pack.
   */
  objectiveSources?: Record<string, string>[];
  /** Other packs in the same workspace whose functions, tags and predicates are visible. */
  contextSources?: Record<string, string>[];
}

const lintRuntime: Runtime = {
  world: null as unknown as World,
  runFunction() {
    return { result: 1, success: true };
  },
  tick() {
    // Linting never advances the world.
  },
  grantAdvancement() {
    return false;
  },
  revokeAdvancement() {
    return false;
  },
};

const LINT_MAX_MS = 3_000;
const LINT_MAX_FILES = 2_000;
const LINT_MAX_COMMANDS = 200_000;
const LINT_MAX_DIAGNOSTICS = 5_000;

export function lintProject(project: Project, options: LintOptions = {}): LintReport {
  const started = performance.now();
  const version = options.version ?? getVersion(project.versionId);
  const parsed = parseDatapack(project.files, version);
  const diagnostics: Diagnostic[] = [];
  let truncated = false;
  const report = (d: Omit<Diagnostic, "id" | "source">) => {
    if (diagnostics.length >= LINT_MAX_DIAGNOSTICS) {
      truncated = true;
      return;
    }
    diagnostics.push({
      ...d,
      id: `${d.path}:${d.line}:${d.column}:${d.code}`,
      source: "cmdlib",
    });
  };

  for (const error of parsed.errors) {
    const content = project.files[error.path] ?? "";
    report({
      path: error.path,
      severity: "error",
      code: error.code ?? "invalid-folder",
      message: error.message,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: Math.max(1, content.split(/\r?\n/)[0]?.length ?? 1),
      from: 0,
      to: Math.max(1, content.split(/\r?\n/)[0]?.length ?? 1),
      quickFix:
        error.code === "invalid-folder"
          ? [
              {
                title: `Migrate to ${version.id}`,
                action: "migrate-folders",
              },
            ]
          : undefined,
    });
  }

  lintPackMeta(project, version, report);

  const world = new World({ version, seedPlayer: true, playerName: "Dev" });
  const contextSources = options.contextSources ?? options.objectiveSources ?? [];
  const sharedFunctions = new Map(parsed.functions.map((fn) => [fn.id, fn]));
  const sharedTags = new Map(parsed.tags.map((tag) => [tag.id, tag]));
  const parsedPredicates = parsePredicateFiles(project.files);
  const sharedPredicates = new Map(parsedPredicates.predicates);
  for (const source of contextSources) {
    const sibling = parseDatapack(source, version);
    for (const fn of sibling.functions) sharedFunctions.set(fn.id, fn);
    for (const tag of sibling.tags) sharedTags.set(tag.id, tag);
    const siblingPredicates = parsePredicateFiles(source);
    for (const predicate of siblingPredicates.predicates.values()) {
      sharedPredicates.set(predicate.id, predicate);
    }
  }
  const parsedAdvancements = parseAdvancementFiles(project.files);
  const sharedAdvancements = new Map<string, AdvancementDefinition>(
    parsedAdvancements.advancements,
  );
  for (const source of contextSources) {
    for (const [id, advancement] of parseAdvancementFiles(source).advancements) {
      sharedAdvancements.set(id, advancement);
    }
  }
  world.setFunctions([...sharedFunctions.values()]);
  world.setFunctionTags([...sharedTags.values()]);
  world.setPredicates(sharedPredicates);
  world.setAdvancements(sharedAdvancements);
  for (const error of parsedPredicates.errors) {
    reportPredicateFileIssue(project, error.path, error.message, error.code, "error", report);
  }
  for (const error of parsedAdvancements.errors) {
    const content = project.files[error.path] ?? "";
    report({
      path: error.path,
      severity: "error",
      code: "invalid-advancement",
      message: error.message,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: Math.max(1, content.split(/\r?\n/)[0]?.length ?? 1),
      from: 0,
      to: Math.max(1, content.length),
    });
  }
  for (const advancement of parsedAdvancements.advancements.values()) {
    if (advancement.rewards.function && !world.getFunction(advancement.rewards.function)) {
      const content = project.files[advancement.path] ?? "";
      report({
        path: advancement.path,
        severity: "error",
        code: "unknown-function",
        message: `Advancement reward function '${advancement.rewards.function}' does not exist.`,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: Math.max(1, content.split(/\r?\n/)[0]?.length ?? 1),
        from: 0,
        to: Math.max(1, content.length),
      });
    }
  }
  lintPredicates(project, parsedPredicates.predicates, report);
  lintRuntime.world = world;

  const declaredObjectives = new Map<string, { criterion: string; displayName?: string }>();
  const declarationSources = [project.files, ...contextSources];
  for (const source of declarationSources) {
    for (const content of Object.values(source)) {
      const regex = /scoreboard[ \t]+objectives[ \t]+add[ \t]+(\S+)[ \t]+(\S+)(?:[ \t]+([^\r\n]+))?/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content))) {
        declaredObjectives.set(match[1], {
          criterion: match[2],
          displayName: match[3]?.trim(),
        });
      }
    }
  }
  for (const [name, info] of declaredObjectives) {
    if (world.objectives.has(name)) continue;
    try {
      world.addObjective(
        name,
        info.criterion,
        info.displayName
          ? Tag.string(info.displayName)
          : Tag.compound({ text: Tag.string(name) }),
      );
    } catch {
      // A duplicate declaration is reported by the file that owns it.
    }
  }
  for (const storageId of collectStorageIds(project.files)) {
    world.storage(storageId, true);
  }
  seedSummonedEntities(project, world);

  const player = world.player()!;
  const onlyPaths = options.onlyPaths ? new Set(options.onlyPaths) : null;
  let filesLinted = 0;
  let commandsLinted = 0;

  outer: for (const fn of parsed.functions) {
    if (onlyPaths && !onlyPaths.has(fn.path)) continue;
    if (filesLinted >= LINT_MAX_FILES) {
      truncated = true;
      break;
    }
    if (performance.now() - started > LINT_MAX_MS) {
      truncated = true;
      break;
    }
    filesLinted++;
    const content = project.files[fn.path] ?? "";
    const lines = content.split(/\r?\n/);
    const lineStarts = computeLineStarts(content);
    let stopped = false;

    if (fn.hasMacroLines && !version.macros) {
      report({
        path: fn.path,
        severity: "error",
        code: "macros-not-supported",
        message: `Function macros require Minecraft 1.20.2 or newer; this pack targets ${version.id}.`,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: Math.max(1, lines[0]?.length ?? 1),
        from: 0,
        to: Math.max(1, lines[0]?.length ?? 1),
      });
    }
    for (let lineIndex = 0; lineIndex < lines.length && !stopped; lineIndex++) {
      if (commandsLinted >= LINT_MAX_COMMANDS || performance.now() - started > LINT_MAX_MS) {
        truncated = true;
        break outer;
      }
      const raw = lines[lineIndex];
      const trimmed = raw.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
      commandsLinted++;
      const leading = raw.length - raw.trimStart().length;
      const lineStart = lineStarts[lineIndex] + leading;
      const isMacro = trimmed.startsWith("$");

      let prepared = trimmed;
      if (isMacro) {
        const macroBody = trimmed.slice(1);
        if (!version.macros) {
          // Already reported above; still lint the line as if expanded.
        }
        const bad = checkMacroSyntax(macroBody);
        if (bad) {
          reportAt(fn.path, report, lineStart, bad, "macro-syntax", "error");
        }
        prepared = macroBody.replace(/\$\(([^)]*)\)/g, "1");
      }

      const ctx = makeContext(world, lintRuntime, player, {
        quiet: true,
        lint: true,
      });
      try {
        executeCommandLine(prepared, ctx);
      } catch (error) {
        if (error instanceof ReturnSignal) {
          stopped = true;
          continue;
        }
        if (error instanceof CommandError) {
          const index = Math.min(error.index ?? 0, prepared.length);
          const from = lineStart + index;
          const to = Math.min(from + Math.max(1, prepared.length - index), lineStart + raw.trimEnd().length);
          const severity: LintSeverity =
            error.code === "unsupported-command" ? "warning" : "error";
          report({
            path: fn.path,
            severity,
            code: error.code,
            message: error.message,
            line: lineIndex + 1,
            column: leading + index + 1,
            endLine: lineIndex + 1,
            endColumn: leading + index + Math.max(1, prepared.length - index) + 1,
            from,
            to,
            quickFix: quickFixFor(error, fn.path, version),
          });
          continue;
        }
        report({
          path: fn.path,
          severity: "error",
          code: "internal",
          message: (error as Error).message,
          line: lineIndex + 1,
          column: leading + 1,
          endLine: lineIndex + 1,
          endColumn: leading + raw.length + 1,
          from: lineStart,
          to: lineStart + trimmed.length,
        });
      }
    }
  }

  if (truncated) {
    const firstPath =
      parsed.functions[0]?.path ??
      Object.keys(project.files)[0] ??
      "pack.mcmeta";
    report({
      path: firstPath,
      severity: "warning",
      code: "lint-truncated",
      message: `Project is too large to lint completely in one pass; stopped after ${filesLinted} function file(s) and ${commandsLinted} command(s). The rest of the project remains editable.`,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
      from: 0,
      to: 0,
    });
  } else {
    lintFunctionTags(project, parsed, version, report);
    lintVersionFeatures(project, version, onlyPaths, report);
    lintUnusedFunctions(project, parsed, version, report);
    lintObjectives(world, project, report);
    lintEntitySelectors(project, report);
  }

  const unique = dedupe(diagnostics).sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.line - b.line ||
      a.column - b.column ||
      a.code.localeCompare(b.code),
  );

  const errors = unique.filter((d) => d.severity === "error").length;
  const warnings = unique.filter((d) => d.severity === "warning").length;
  const infos = unique.filter((d) => d.severity === "info" || d.severity === "hint").length;
  return {
    diagnostics: unique,
    errors,
    warnings,
    infos,
    filesLinted,
    durationMs: Math.round(performance.now() - started),
    versionId: version.id,
  };
}

/* ----------------------------- pack metadata ----------------------------- */

function lintPackMeta(
  project: Project,
  version: VersionProfile,
  report: (d: Omit<Diagnostic, "id" | "source">) => void,
): void {
  const content = project.files["pack.mcmeta"];
  if (content === undefined) {
    report({
      path: "pack.mcmeta",
      severity: "error",
      code: "missing-pack-mcmeta",
      message: "A datapack needs a pack.mcmeta file at its root.",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
      from: 0,
      to: 0,
      quickFix: [{ title: `Create pack.mcmeta for ${version.id}`, action: "fix-pack-meta" }],
    });
    return;
  }
  let parsed: { pack?: Record<string, unknown> };
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    report({
      path: "pack.mcmeta",
      severity: "error",
      code: "invalid-json",
      message: `pack.mcmeta is not valid JSON: ${(error as Error).message}`,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: content.split(/\r?\n/)[0]?.length ?? 1,
      from: 0,
      to: content.length,
      quickFix: [{ title: `Rewrite pack.mcmeta for ${version.id}`, action: "fix-pack-meta" }],
    });
    return;
  }
  if (!parsed.pack || typeof parsed.pack !== "object") {
    report({
      path: "pack.mcmeta",
      severity: "error",
      code: "missing-pack-object",
      message: "pack.mcmeta must contain a 'pack' object.",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
      from: 0,
      to: content.length,
      quickFix: [{ title: `Rewrite pack.mcmeta for ${version.id}`, action: "fix-pack-meta" }],
    });
    return;
  }
  const pack = parsed.pack;
  if (pack.description === undefined) {
    report({
      path: "pack.mcmeta",
      severity: "warning",
      code: "missing-description",
      message: "Add a pack description so the pack list explains what this is.",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
      from: 0,
      to: 0,
      quickFix: [{ title: `Rewrite pack.mcmeta for ${version.id}`, action: "fix-pack-meta" }],
    });
  }
  const line = findLine(content, version.packMeta === "legacy" ? "pack_format" : "min_format");
  if (version.packMeta === "legacy") {
    if (pack.pack_format !== version.packFormat[0]) {
      report({
        path: "pack.mcmeta",
        severity: "warning",
        code: "pack-format-mismatch",
        message: `This pack targets ${version.id}, whose data pack format is ${version.packFormat[0]}. Found ${String(pack.pack_format ?? "no pack_format")}.`,
        line,
        column: 1,
        endLine: line,
        endColumn: 1,
        from: offsetOfLine(content, line),
        to: offsetOfLine(content, line),
        quickFix: [{ title: `Set pack format to ${version.packFormat[0]}`, action: "fix-pack-meta" }],
      });
    }
  } else {
    const min = normalizeFormat(pack.min_format);
    const max = normalizeFormat(pack.max_format);
    const expected = version.packFormat;
    if (!min || !max) {
      report({
        path: "pack.mcmeta",
        severity: "error",
        code: "missing-minmax-format",
        message: `${version.id} requires min_format and max_format (${expected[0]}.${expected[1]}), not pack_format.`,
        line,
        column: 1,
        endLine: line,
        endColumn: 1,
        from: offsetOfLine(content, line),
        to: offsetOfLine(content, line),
        quickFix: [{ title: `Rewrite pack.mcmeta for ${version.id}`, action: "fix-pack-meta" }],
      });
    } else if (min[0] !== expected[0] || max[0] !== expected[0]) {
      report({
        path: "pack.mcmeta",
        severity: "warning",
        code: "pack-format-mismatch",
        message: `This pack targets ${version.id} (format ${expected[0]}.${expected[1]}), but declares min_format ${min.join(".")} and max_format ${max.join(".")}.`,
        line,
        column: 1,
        endLine: line,
        endColumn: 1,
        from: offsetOfLine(content, line),
        to: offsetOfLine(content, line),
        quickFix: [{ title: `Set format to ${expected[0]}.${expected[1]}`, action: "fix-pack-meta" }],
      });
    }
  }
}

function normalizeFormat(value: unknown): [number, number] | null {
  if (typeof value === "number") return [value, 0];
  if (Array.isArray(value) && typeof value[0] === "number") {
    return [value[0], typeof value[1] === "number" ? value[1] : 0];
  }
  return null;
}

/* ----------------------------- predicates ------------------------------- */

function lintPredicates(
  project: Project,
  predicates: Map<string, PredicateDefinition>,
  report: (d: Omit<Diagnostic, "id" | "source">) => void,
): void {
  for (const definition of predicates.values()) {
    const reportedTypes = new Set<string>();
    for (const type of collectPredicateConditionTypes(definition.data)) {
      if (isSupportedPredicateCondition(type) || reportedTypes.has(type)) continue;
      reportedTypes.add(type);
      reportPredicateFileIssue(
        project,
        definition.path,
        `Predicate condition '${type}' is not simulated by cmdlib and will evaluate to false.`,
        "unsupported-predicate-condition",
        "warning",
        report,
      );
    }

    const reportedRefs = new Set<string>();
    for (const reference of collectPredicateReferences(definition.data)) {
      const canonical = canonicalId(reference);
      if (reportedRefs.has(canonical)) continue;
      reportedRefs.add(canonical);
      if (!isValidPredicateReference(canonical)) {
        reportPredicateFileIssue(
          project,
          definition.path,
          `Invalid predicate reference '${reference}'. Use a lower-case resource location.`,
          "invalid-predicate-reference",
          "error",
          report,
        );
        continue;
      }
      if (!predicates.has(canonical)) {
        reportPredicateFileIssue(
          project,
          definition.path,
          `Predicate '${definition.id}' references unknown predicate '${canonical}'.`,
          "unknown-predicate",
          "error",
          report,
        );
      }
    }
  }

  const reportedCycles = new Set<string>();
  for (const cycle of findPredicateCycles(predicates)) {
    for (const id of cycle.slice(0, -1)) {
      if (reportedCycles.has(id)) continue;
      reportedCycles.add(id);
      const definition = predicates.get(id);
      if (!definition) continue;
      reportPredicateFileIssue(
        project,
        definition.path,
        `Predicate '${id}' includes itself, directly or indirectly.`,
        "predicate-cycle",
        "error",
        report,
      );
    }
  }
}

function isValidPredicateReference(id: string): boolean {
  const [namespace, path, ...rest] = id.split(":");
  if (rest.length > 0 || !namespace || !path) return false;
  return (
    /^[a-z0-9_.-]+$/.test(namespace) &&
    /^[a-z0-9_./-]+$/.test(path) &&
    !path.startsWith("/") &&
    !path.endsWith("/") &&
    !path.includes("//")
  );
}

function reportPredicateFileIssue(
  project: Project,
  path: string,
  message: string,
  code: string,
  severity: LintSeverity,
  report: (d: Omit<Diagnostic, "id" | "source">) => void,
): void {
  const content = project.files[path] ?? "";
  const firstLine = content.split(/\r?\n/)[0] ?? "";
  report({
    path,
    severity,
    code,
    message,
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: Math.max(1, firstLine.length),
    from: 0,
    to: Math.max(1, content.length),
  });
}

/* ------------------------------- tag checks ------------------------------ */

function lintFunctionTags(
  project: Project,
  parsed: ReturnType<typeof parseDatapack>,
  version: VersionProfile,
  report: (d: Omit<Diagnostic, "id" | "source">) => void,
): void {
  const functions = new Set(parsed.functions.map((f) => f.id));
  const tags = new Map(parsed.tags.map((t) => [t.id, t]));
  // Function tags alone own function existence checks. Item/block/entity_type/
  // fluid/game_event tags were parsed for validity but must not mark functions
  // as used or require a function target.
  const functionEntries = new Map(
    parsed.allTags.filter((tag) => tag.kind === "function").map((tag) => [tag.id, tag.entries]),
  );
  for (const tag of parsed.tags) {
    const content = project.files[tag.path ?? ""] ?? "";
    const lines = content.split(/\r?\n/);
    const entries =
      functionEntries.get(tag.id) ??
      tag.values.map((value) => ({
        ok: true as const,
        raw: value,
        id: value.startsWith("#") ? value.slice(1) : value,
        namespace: "",
        path: "",
        reference: value.startsWith("#"),
        required: true,
      }));
    for (const entry of entries) {
      // Optional entries are allowed to be absent at runtime.
      if (!entry.required) continue;
      const target = entry.id;
      if (entry.reference) {
        if (!tags.has(target)) {
          report({
            path: tag.path ?? "",
            severity: "error",
            code: "unknown-function-tag",
            message: `Tag references unknown function tag '${target}'.`,
            line: 1,
            column: 1,
            endLine: lines.length,
            endColumn: 1,
            from: 0,
            to: content.length,
          });
        }
      } else if (!functions.has(target)) {
        report({
          path: tag.path ?? "",
          severity: "error",
          code: "unknown-function",
          message: `Tag references unknown function '${target}'.`,
          line: 1,
          column: 1,
          endLine: lines.length,
          endColumn: 1,
          from: 0,
          to: content.length,
          quickFix: [
            {
              title: `Create function ${target}`,
              action: "create-function",
              payload: { id: target },
            },
          ],
        });
      }
    }
  }

  // Tag cycles: a tag that eventually includes itself never finishes loading.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const tag = tags.get(id);
    if (tag) {
      for (const value of tag.values) {
        if (value.startsWith("#") && walk(value.slice(1))) return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const tag of parsed.tags) {
    if (!walk(tag.id)) continue;
    const content = project.files[tag.path ?? ""] ?? "";
    report({
      path: tag.path ?? "",
      severity: "error",
      code: "tag-cycle",
      message: `Function tag '${tag.id}' includes itself, directly or indirectly.`,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: content.split(/\r?\n/)[0]?.length ?? 1,
      from: 0,
      to: content.length,
    });
  }
  void version;
}

/* ---------------------------- version features --------------------------- */

function lintVersionFeatures(
  project: Project,
  version: VersionProfile,
  onlyPaths: Set<string> | null,
  report: (d: Omit<Diagnostic, "id" | "source">) => void,
): void {
  const is263 = version.id === "26.3";
  for (const [path, content] of Object.entries(project.files)) {
    if (onlyPaths && !onlyPaths.has(path)) continue;
    if (!path.endsWith(".mcfunction")) continue;
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const command = trimmed.replace(/^\$/, "").split(/\s+/)[0].toLowerCase();
      const spec = COMMANDS[command];
      if (spec?.since === "26.3" && !is263) {
        report({
          path,
          severity: "warning",
          code: "command-version",
          message: `/${command} arrived in 26.3 and will not parse in ${version.id}.`,
          line: index + 1,
          column: 1,
          endLine: index + 1,
          endColumn: command.length + 1,
          from: offsetOfLine(content, index + 1),
          to: offsetOfLine(content, index + 1) + command.length,
        });
      }
      if (!version.returnCommand && /^return\b/.test(trimmed)) {
        report({
          path,
          severity: "warning",
          code: "return-version",
          message: `The /return command requires 1.20.2; this pack targets ${version.id}.`,
          line: index + 1,
          column: 1,
          endLine: index + 1,
          endColumn: 7,
          from: offsetOfLine(content, index + 1),
          to: offsetOfLine(content, index + 1) + 6,
        });
      }
      if (!is263 && /^execute\s+(?:if|unless)\s+(?:items|slots)\b/.test(trimmed)) {
        report({
          path,
          severity: "warning",
          code: "execute-items-version",
          message: `execute if items/slots arrived in 26.3 and is not valid in ${version.id}.`,
          line: index + 1,
          column: 1,
          endLine: index + 1,
          endColumn: line.length,
          from: offsetOfLine(content, index + 1),
          to: offsetOfLine(content, index + 1) + line.length,
        });
      }
    });
  }
}

/* ----------------------------- unused helpers ---------------------------- */

function lintUnusedFunctions(
  project: Project,
  parsed: ReturnType<typeof parseDatapack>,
  version: VersionProfile,
  report: (d: Omit<Diagnostic, "id" | "source">) => void,
): void {
  const used = new Set<string>();
  for (const fn of parsed.tags) {
    if (fn.id === "minecraft:load" || fn.id === "minecraft:tick" || fn.id === "cmdlib:load") {
      for (const value of fn.values) {
        used.add(value.startsWith("#") ? value.slice(1) : value);
      }
    }
  }
  for (const content of Object.values(project.files)) {
    const regex = /(?:^|\s)function\s+(#[a-z0-9_.-]+:[a-z0-9_./-]+|[a-z0-9_.-]+:[a-z0-9_./-]+)/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      used.add(match[1].replace(/^#/, ""));
    }
  }
  for (const fn of parsed.functions) {
    if (used.has(fn.id)) continue;
    if (fn.id.endsWith(":load") || fn.id.endsWith(":demo")) continue;
    const content = project.files[fn.path] ?? "";
    report({
      path: fn.path,
      severity: "info",
      code: "unused-function",
      message: `Function ${fn.id} is never called by this pack and is not in a load or tick tag.`,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
      from: 0,
      to: Math.min(content.length, 1),
    });
  }
  void version;
}

function lintObjectives(
  world: World,
  project: Project,
  report: (d: Omit<Diagnostic, "id" | "source">) => void,
): void {
  const displayed = new Set<string>();
  const read = new Set<string>();
  for (const content of Object.values(project.files)) {
    const setdisplay = /scoreboard\s+objectives\s+setdisplay\s+\S+\s+([A-Za-z0-9_.+-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = setdisplay.exec(content))) displayed.add(match[1]);
    const readRegex = /scoreboard\s+players\s+get\s+\S+\s+([A-Za-z0-9_.+-]+)|\bif\s+score\s+\S+\s+([A-Za-z0-9_.+-]+)/g;
    while ((match = readRegex.exec(content))) {
      if (match[1]) read.add(match[1]);
      if (match[2]) read.add(match[2]);
    }
  }
  for (const [name, objective] of world.objectives) {
    if (displayed.has(name) || read.has(name)) continue;
    if (objective.criterion === "trigger") continue;
    // Find the declaring file for a useful location.
    for (const [path, content] of Object.entries(project.files)) {
      if (!content.includes(`objectives add ${name} `)) continue;
      const line = findLine(content, `objectives add ${name} `);
      report({
        path,
        severity: "info",
        code: "undisplayed-objective",
        message: `Objective '${name}' is never displayed and never read. Keep it if it is internal state.`,
        line,
        column: 1,
        endLine: line,
        endColumn: 1,
        from: offsetOfLine(content, line),
        to: offsetOfLine(content, line),
      });
      break;
    }
  }
}

function lintEntitySelectors(
  project: Project,
  report: (d: Omit<Diagnostic, "id" | "source">) => void,
): void {
  for (const [path, content] of Object.entries(project.files)) {
    if (!path.endsWith(".mcfunction")) continue;
    const regex = /type=(!?)([a-z0-9_]+(?::[a-z0-9_./-]+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      const id = match[2].replace(/^minecraft:/, "");
      if (ENTITY_BY_ID.has(id)) continue;
      const line = offsetToLine(content, match.index);
      report({
        path,
        severity: "warning",
        code: "unknown-entity-type",
        message: `Unknown entity type '${match[2]}' in a selector.`,
        line,
        column: match.index - offsetOfLine(content, line) + 1,
        endLine: line,
        endColumn: match.index - offsetOfLine(content, line) + match[0].length + 1,
        from: match.index,
        to: match.index + match[0].length,
      });
    }
  }
}

function seedSummonedEntities(project: Project, world: World): void {
  const types = new Set<string>();
  for (const content of Object.values(project.files)) {
    const regex = /\bsummon\s+([a-z0-9_]+(?::[a-z0-9_./-]+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) types.add(match[1]);
  }
  for (const type of types) {
    const entity = createEntity(type, { x: 0, y: 64, z: 0 }, null);
    entity.nbt.value.Tags = Tag.list([Tag.string("lint")], "string");
    world.addEntity(entity);
  }
}

/* -------------------------------- helpers -------------------------------- */

function quickFixFor(
  error: CommandError,
  path: string,
  version: VersionProfile,
): LintQuickFix[] | undefined {
  if (error.code === "unknown-objective") {
    const name = /Unknown objective '([^']+)'/.exec(error.message)?.[1];
    if (name) {
      return [
        {
          title: `Create objective '${name}'`,
          action: "create-objective",
          payload: { name },
        },
      ];
    }
  }
  if (error.code === "unknown-function") {
    const id = /Unknown function '([^']+)'/.exec(error.message)?.[1];
    if (id) {
      return [
        {
          title: `Create function ${id}`,
          action: "create-function",
          payload: { id },
        },
      ];
    }
  }
  if (error.code === "invalid-folder") {
    return [{ title: `Migrate to ${version.id}`, action: "migrate-folders" }];
  }
  void path;
  return undefined;
}

function checkMacroSyntax(body: string): string | null {
  let i = 0;
  while (i < body.length) {
    if (body.startsWith("$$(", i)) {
      i += 3;
      continue;
    }
    if (body.startsWith("$(", i)) {
      const close = body.indexOf(")", i + 2);
      if (close === -1) return "Unclosed macro interpolation. Add a closing ')'.";
      const key = body.slice(i + 2, close);
      if (!/^[A-Za-z0-9_.+-]+$/.test(key)) {
        return `Invalid macro key '${key}'.`;
      }
      i = close + 1;
      continue;
    }
    i++;
  }
  return null;
}

function reportAt(
  path: string,
  report: (d: Omit<Diagnostic, "id" | "source">) => void,
  from: number,
  message: string,
  code: string,
  severity: LintSeverity,
): void {
  report({
    path,
    severity,
    code,
    message,
    line: 1,
    column: from + 1,
    endLine: 1,
    endColumn: from + 1,
    from,
    to: from + 1,
  });
}

export function computeLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

export function offsetToLine(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

export function offsetOfLine(content: string, line: number): number {
  const starts = computeLineStarts(content);
  return starts[Math.max(0, Math.min(starts.length - 1, line - 1))];
}

export function findLine(content: string, needle: string): number {
  const index = content.indexOf(needle);
  if (index === -1) return 1;
  return offsetToLine(content, index);
}

function dedupe(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    const key = `${d.path}:${d.line}:${d.column}:${d.code}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------- LSP export ------------------------------ */

const SEVERITY_MAP: Record<LintSeverity, number> = {
  error: 1,
  warning: 2,
  info: 3,
  hint: 4,
};

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: number;
  code: string;
  source: string;
  message: string;
  data?: { quickFix?: LintQuickFix[] };
}

/** Spyglass/LSP-compatible diagnostics for copy-paste into another tool. */
export function toLspDiagnostics(diagnostics: Diagnostic[]): LspDiagnostic[] {
  return diagnostics.map((d) => ({
    range: {
      start: { line: d.line - 1, character: Math.max(0, d.column - 1) },
      end: { line: d.endLine - 1, character: Math.max(0, d.endColumn - 1) },
    },
    severity: SEVERITY_MAP[d.severity],
    code: d.code,
    source: "cmdlib",
    message: d.message,
    data: d.quickFix ? { quickFix: d.quickFix } : undefined,
  }));
}

export const LINT_CODES: Record<string, string> = {
  "unknown-command": "Command name is not in the 26.3 command tree.",
  "unsupported-command": "Recognised command, but cmdlib does not simulate it yet.",
  "unknown-objective": "The objective has not been declared in this pack.",
  "unknown-function": "No function with that resource location exists in the pack.",
  "macro-required": "A function with $ lines must be called with arguments.",
  "macro-argument": "A call site is missing a macro argument used by the function.",
  "pack-format-mismatch": "pack.mcmeta targets a different game version.",
  "invalid-folder": "Folder names changed in 1.21 (functions → function, tags/items → tags/item).",
  "invalid-tag-id": "A tag file's namespace or path is not a valid resource location.",
  "invalid-tag-json": "A tag file is not valid JSON (or is not a JSON object).",
  "missing-tag-values": "A tag file does not contain a 'values' array.",
  "invalid-tag-value": "A tag value is not a valid id/reference or object entry.",
  "unused-function": "The function is not referenced by a tag or another function.",
  "undisplayed-objective": "The objective is declared but not displayed or read.",
  "tag-cycle": "A function tag includes itself.",
  "invalid-predicate-id": "A predicate file's namespace or path is not a valid resource location.",
  "invalid-predicate-json": "A predicate file is not valid JSON (or has a non-object condition).",
  "missing-condition": "A predicate file does not contain a 'condition' field.",
  "invalid-predicate-reference": "A predicate reference is not a valid resource location.",
  "unknown-predicate": "No predicate with that resource location exists in the pack.",
  "predicate-cycle": "A predicate references itself, directly or indirectly.",
  "unsupported-predicate-condition": "The predicate condition type is not simulated and evaluates to false.",
  "lint-truncated": "The project is very large; linting stopped early to keep the editor responsive.",
  "lint-failed": "The linter hit an unexpected error; the editor remains usable.",
};
