import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

interface McfState {
  wordIndex: number;
}

const SUBCOMMANDS = new Set([
  "objectives", "players", "add", "remove", "list", "modify", "setdisplay",
  "set", "get", "reset", "operation", "display", "enable", "name", "numberformat",
  "get", "merge", "block", "entity", "storage", "value", "from", "string",
  "append", "prepend", "insert", "compute", "title", "subtitle", "actionbar",
  "times", "clear", "run", "as", "at", "positioned", "align", "rotated",
  "facing", "in", "if", "unless", "store", "result", "success", "load",
  "with", "tag", "say", "tellraw", "summon", "kill", "teleport", "tp",
  "scoreboard", "data", "execute", "function", "return", "setblock",
]);

/**
 * A hand-written mcfunction tokenizer. It is intentionally not a full parser:
 * the real parser lives in the runtime, and this only has to make the editor
 * readable. Semantic feedback (unknown objectives, bad paths) comes from the
 * linter, which shares the runtime's grammar.
 */
const mcfunctionParser = StreamLanguage.define<McfState>({
  name: "mcfunction",
  startState: () => ({ wordIndex: 0 }),
  token(stream, state) {
    if (stream.sol()) state.wordIndex = 0;
    if (stream.sol() && stream.match(/^\s*#.*/)) return "comment";
    if (stream.eatSpace()) return null;

    if (stream.match(/^\$\([^)]*\)?/)) return "macroName";
    if (stream.peek() === "@") {
      let depth = 0;
      while (!stream.eol()) {
        const ch = stream.next() ?? "";
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
        else if (/\s/.test(ch) && depth <= 0) {
          stream.backUp(1);
          break;
        }
      }
      return "selector";
    }
    if (stream.peek() === '"' || stream.peek() === "'") {
      const quote = stream.next();
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === "\\") stream.next();
        else if (ch === quote) break;
      }
      return "string";
    }
    if (stream.match(/^[~^][+-]?(?:\d+\.?\d*|\.\d+)?/)) return "number";
    if (stream.match(/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[bBsSlLfFdD]?/)) return "number";
    if (stream.match(/^[a-zA-Z0-9_.-]+:[a-z0-9_./-]+/)) {
      state.wordIndex++;
      return "typeName";
    }
    if (stream.match(/^(?:\+=|-=|\*=|\/=|%=|><|<=|>=|=|<|>)/)) return "operator";
    if (stream.match(/^[{}[\]()]/)) return "bracket";
    if (stream.match(/^[:,]/)) return "punctuation";
    if (stream.match(/^[A-Za-z0-9_.+-]+/)) {
      const word = stream.current();
      const isFirst = state.wordIndex === 0;
      state.wordIndex++;
      if (isFirst) return "keyword";
      if (stream.peek() === ":") return "propertyName";
      if (word === "true" || word === "false") return "bool";
      if (SUBCOMMANDS.has(word)) return "atom";
      return "variableName";
    }
    stream.next();
    return null;
  },
  tokenTable: {
    selector: t.variableName,
    macroName: t.macroName,
    bool: t.bool,
    bracket: t.bracket,
    punctuation: t.punctuation,
  },
  languageData: {
    commentTokens: { line: "#" },
    closeBrackets: { brackets: ["(", "[", "{", '"', "'"] },
  },
});

export const mcfunctionLanguage = mcfunctionParser;

export const cmdlibHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: "#686f7a", fontStyle: "italic" },
  { tag: t.keyword, color: "#ff9368", fontWeight: "600" },
  { tag: t.atom, color: "#e9c98f" },
  { tag: t.typeName, color: "#8fd9c8" },
  { tag: t.variableName, color: "#e6e2d8" },
  { tag: t.propertyName, color: "#b9d6ff" },
  { tag: t.string, color: "#a8d8a0" },
  { tag: t.number, color: "#93c5fd" },
  { tag: t.bool, color: "#ffcf6b" },
  { tag: t.operator, color: "#8e93a1" },
  { tag: t.bracket, color: "#8e93a1" },
  { tag: t.punctuation, color: "#8e93a1" },
  { tag: t.macroName, color: "#ffb86b", fontStyle: "italic" },
  { tag: t.invalid, color: "#ff6b6b" },
]);

export const mcfunctionSupport = [
  mcfunctionParser,
  syntaxHighlighting(cmdlibHighlightStyle),
];
