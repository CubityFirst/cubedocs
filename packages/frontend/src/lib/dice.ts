export type RerollCondition = { op: "=" | "<" | ">"; value: number };

export type DiceTerm =
  | { type: "standard"; count: number; sides: number; keep?: { mode: "h" | "l"; count: number }; reroll?: { conditions: RerollCondition[]; once: boolean } }
  | { type: "fate"; count: number }
  | { type: "pool"; count: number; faces: number[] }
  | { type: "table"; count: number; entries: string[] }
  | { type: "constant"; value: number };

export type Operator = "+" | "-" | "*" | "/" | "%" | "**";
export type MathFn = "floor" | "round" | "ceil" | "abs";

export type DiceNode =
  | { type: "term"; term: DiceTerm; inlineLabel?: string }
  | { type: "binary"; op: Operator; left: DiceNode; right: DiceNode }
  | { type: "fn"; fn: MathFn; arg: DiceNode }
  | { type: "negate"; arg: DiceNode };

export interface DiceExpression {
  root: DiceNode;
}

export interface TermResult {
  rolls: (number | string)[];
  kept: (number | string)[];
  total: number;
  label: string;
  inlineLabel?: string;
  /** Lowest possible face value; null for constants/tables (no highlighting). */
  minFace: number | null;
  /** Highest possible face value; null for constants/tables (no highlighting). */
  maxFace: number | null;
  /** For rerolled dice, the original value before rerolling, parallel to rolls[]. */
  rerolledFrom?: (number | undefined)[];
}

export interface RollResult {
  terms: TermResult[];
  total: number;
  /** Maximum possible total for this expression; null for table-only rolls or complex expressions. */
  maxTotal: number | null;
  /** Minimum possible total for this expression; null for table-only rolls or complex expressions. */
  minTotal: number | null;
  expression: string;
  /** Overall roll label, e.g. "Roll for Initiative". */
  label?: string;
}

// --- Tokenizer ---

type Token =
  | { kind: "atom"; value: string }
  | { kind: "op"; value: Operator }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === "(") { tokens.push({ kind: "lparen" }); i++; continue; }
    if (ch === ")") { tokens.push({ kind: "rparen" }); i++; continue; }
    if (ch === "+") { tokens.push({ kind: "op", value: "+" }); i++; continue; }
    if (ch === "-") { tokens.push({ kind: "op", value: "-" }); i++; continue; }
    if (ch === "%") { tokens.push({ kind: "op", value: "%" }); i++; continue; }
    if (ch === "/") { tokens.push({ kind: "op", value: "/" }); i++; continue; }
    if (ch === "*") {
      if (input[i + 1] === "*") { tokens.push({ kind: "op", value: "**" }); i += 2; }
      else { tokens.push({ kind: "op", value: "*" }); i++; }
      continue;
    }
    if (/[a-zA-Z0-9.<>]/.test(ch)) {
      let atom = "";
      while (i < input.length && /[a-zA-Z0-9.<>]/.test(input[i])) atom += input[i++];
      // Consume bracket groups: pool/table dice (1d[fire,ice]) and inline labels (2d6[Fire])
      while (i < input.length && input[i] === "[") {
        let depth = 0;
        while (i < input.length) {
          if (input[i] === "[") depth++;
          else if (input[i] === "]") depth--;
          atom += input[i++];
          if (depth === 0) break;
        }
      }
      tokens.push({ kind: "atom", value: atom });
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in dice expression`);
  }
  return tokens;
}

// --- Parser ---

/**
 * Split notation into formula and optional overall label.
 *
 * Explicit separator: `1d20+5 \ +5 for initiative`
 * Implicit:          `1d20+5 Roll for Initiative`
 *   — first top-level space where the following text doesn't look like a
 *     formula continuation (operator, digit, parenthesis, or function name).
 */
export function splitFormulaLabel(notation: string): { formula: string; label?: string } {
  const bsIdx = notation.indexOf("\\");
  if (bsIdx !== -1) {
    return {
      formula: notation.slice(0, bsIdx).trim(),
      label: notation.slice(bsIdx + 1).trim() || undefined,
    };
  }

  let depth = 0;
  for (let i = 0; i < notation.length; i++) {
    const ch = notation[i];
    if (ch === "[") { depth++; continue; }
    if (ch === "]") { depth--; continue; }
    if (depth > 0 || ch !== " ") continue;

    const after = notation.slice(i).trimStart();
    if (!after) break;
    if (/^[+\-*\/%(\d]/.test(after)) continue;
    if (/^d(\d|[fF]|\[)/i.test(after)) continue;
    if (/^(floor|round|ceil|abs)\s*\(/i.test(after)) continue;

    return { formula: notation.slice(0, i).trim(), label: after };
  }

  return { formula: notation.trim() };
}

/**
 * Extract a trailing `[inline label]` from a token, but only when the
 * character before `[` is NOT `d`/`D` (which would make it a pool/table).
 *
 * `2d10[Fire Damage]`  → termStr="2d10",        inlineLabel="Fire Damage"
 * `1d[fire,ice]`       → termStr="1d[fire,ice]", inlineLabel=undefined
 * `4d6kh3[Stat Roll]`  → termStr="4d6kh3",       inlineLabel="Stat Roll"
 */
function extractInlineLabel(s: string): { termStr: string; inlineLabel?: string } {
  const m = /^(.*[^dD])\[([^\]]+)\]$/.exec(s);
  if (m) return { termStr: m[1], inlineLabel: m[2].trim() || undefined };
  return { termStr: s };
}

const FATE_RE = /^(\d*)d[Ff]$/;
const BRACKET_RE = /^(\d*)d\[([^\]]+)\]$/i;
const CONST_RE = /^-?\d+(\.\d+)?$/;

function parseDiceTerm(s: string): DiceTerm {
  let m: RegExpMatchArray | null;

  if ((m = FATE_RE.exec(s))) {
    const count = m[1] ? parseInt(m[1], 10) : 1;
    return { type: "fate", count };
  }

  if ((m = BRACKET_RE.exec(s))) {
    const count = m[1] ? parseInt(m[1], 10) : 1;
    const raw = m[2].split(",").map((e) => e.trim()).filter((e) => e.length > 0);
    if (raw.length === 0) throw new Error(`Empty bracket expression in: "${s}"`);
    const numeric = raw.map((e) => parseFloat(e));
    if (numeric.every((n) => !isNaN(n))) {
      return { type: "pool", count, faces: numeric.map(Number) };
    }
    return { type: "table", count, entries: raw };
  }

  if ((m = /^(\d*)d(\d+)/i.exec(s))) {
    const count = m[1] ? parseInt(m[1], 10) : 1;
    const sides = parseInt(m[2], 10);
    let rest = s.slice(m[0].length);
    let keep: { mode: "h" | "l"; count: number } | undefined;
    const rerollConditions: RerollCondition[] = [];
    let rerollOnce = false;
    let mod: RegExpMatchArray | null;
    while (rest.length > 0) {
      if ((mod = /^k([hl])(\d+)/i.exec(rest))) {
        keep = { mode: mod[1].toLowerCase() as "h" | "l", count: parseInt(mod[2], 10) };
        rest = rest.slice(mod[0].length);
      } else if ((mod = /^ro([<>]?)(\d+)/i.exec(rest))) {
        rerollOnce = true;
        rerollConditions.push({ op: (mod[1] || "=") as "=" | "<" | ">", value: parseInt(mod[2], 10) });
        rest = rest.slice(mod[0].length);
      } else if ((mod = /^r([<>]?)(\d+)/i.exec(rest))) {
        rerollConditions.push({ op: (mod[1] || "=") as "=" | "<" | ">", value: parseInt(mod[2], 10) });
        rest = rest.slice(mod[0].length);
      } else {
        throw new Error(`Cannot parse dice term: "${s}"`);
      }
    }
    return {
      type: "standard",
      count,
      sides,
      ...(keep ? { keep } : {}),
      ...(rerollConditions.length > 0 ? { reroll: { conditions: rerollConditions, once: rerollOnce } } : {}),
    };
  }

  if (CONST_RE.test(s)) {
    return { type: "constant", value: parseFloat(s) };
  }

  throw new Error(`Cannot parse dice term: "${s}"`);
}

const MATH_FN_NAMES: readonly string[] = ["floor", "round", "ceil", "abs"];

class DiceParser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }
  private expectRparen(): void {
    const t = this.advance();
    if (!t || t.kind !== "rparen") throw new Error("Expected ')'");
  }

  parse(): DiceNode {
    const node = this.parseExpr();
    if (this.pos < this.tokens.length) throw new Error("Unexpected token after expression");
    return node;
  }

  // Addition and subtraction (lowest precedence)
  private parseExpr(): DiceNode {
    let left = this.parseProduct();
    for (;;) {
      const t = this.peek();
      if (!t || t.kind !== "op" || (t.value !== "+" && t.value !== "-")) break;
      this.advance();
      left = { type: "binary", op: t.value, left, right: this.parseProduct() };
    }
    return left;
  }

  // Multiplication, division, modulus
  private parseProduct(): DiceNode {
    let left = this.parseExponent();
    for (;;) {
      const t = this.peek();
      if (!t || t.kind !== "op" || !["*", "/", "%"].includes(t.value)) break;
      this.advance();
      left = { type: "binary", op: t.value as Operator, left, right: this.parseExponent() };
    }
    return left;
  }

  // Exponentiation (right-associative)
  private parseExponent(): DiceNode {
    const base = this.parseUnary();
    const t = this.peek();
    if (t && t.kind === "op" && t.value === "**") {
      this.advance();
      return { type: "binary", op: "**", left: base, right: this.parseExponent() };
    }
    return base;
  }

  // Unary minus
  private parseUnary(): DiceNode {
    const t = this.peek();
    if (t && t.kind === "op" && t.value === "-") {
      this.advance();
      return { type: "negate", arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  // Parentheses, function calls, atoms
  private parsePrimary(): DiceNode {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end of expression");

    if (t.kind === "lparen") {
      this.advance();
      const inner = this.parseExpr();
      this.expectRparen();
      return inner;
    }

    if (t.kind === "atom") {
      const lower = t.value.toLowerCase();
      if (MATH_FN_NAMES.includes(lower) && this.tokens[this.pos + 1]?.kind === "lparen") {
        this.advance(); // fn name
        this.advance(); // (
        const arg = this.parseExpr();
        this.expectRparen();
        return { type: "fn", fn: lower as MathFn, arg };
      }
      this.advance();
      const { termStr, inlineLabel } = extractInlineLabel(t.value);
      return { type: "term", term: parseDiceTerm(termStr), inlineLabel };
    }

    throw new Error(`Unexpected token: ${t.kind}`);
  }
}

export function parseDice(formula: string): DiceExpression {
  const tokens = tokenize(formula);
  if (tokens.length === 0) throw new Error("Empty dice expression");
  return { root: new DiceParser(tokens).parse() };
}

// --- Roller ---

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollDiceTerm(term: DiceTerm): Omit<TermResult, "inlineLabel"> {
  switch (term.type) {
    case "standard": {
      const matchesReroll = (v: number): boolean =>
        (term.reroll?.conditions ?? []).some((c) =>
          c.op === "=" ? v === c.value : c.op === "<" ? v < c.value : v > c.value,
        );

      const rolls: number[] = [];
      const rerolledFrom: (number | undefined)[] = [];

      for (let i = 0; i < term.count; i++) {
        let v = randInt(1, term.sides);
        let original: number | undefined;
        if (term.reroll && matchesReroll(v)) {
          original = v;
          if (term.reroll.once) {
            v = randInt(1, term.sides);
          } else {
            let guard = 0;
            while (matchesReroll(v) && guard++ < 1000) v = randInt(1, term.sides);
          }
        }
        rolls.push(v);
        rerolledFrom.push(original);
      }

      const hasRerolls = rerolledFrom.some((v) => v !== undefined);
      let kept: number[];
      if (term.keep) {
        const sorted = [...rolls].sort((a, b) => a - b);
        kept =
          term.keep.mode === "h"
            ? sorted.slice(-term.keep.count)
            : sorted.slice(0, term.keep.count);
      } else {
        kept = rolls;
      }
      const keepSuffix = term.keep ? `k${term.keep.mode}${term.keep.count}` : "";
      const rerollSuffix = term.reroll
        ? term.reroll.conditions
            .map((c) => `r${term.reroll!.once ? "o" : ""}${c.op === "=" ? "" : c.op}${c.value}`)
            .join("")
        : "";
      return {
        rolls,
        kept,
        total: kept.reduce((s, v) => s + v, 0),
        label: `${term.count}d${term.sides}${keepSuffix}${rerollSuffix}`,
        minFace: 1,
        maxFace: term.sides,
        ...(hasRerolls ? { rerolledFrom } : {}),
      };
    }

    case "fate": {
      const rolls = Array.from({ length: term.count }, () => randInt(-1, 1));
      return {
        rolls,
        kept: rolls,
        total: rolls.reduce((s, v) => s + v, 0),
        label: `${term.count}dF`,
        minFace: -1,
        maxFace: 1,
      };
    }

    case "pool": {
      const rolls = Array.from(
        { length: term.count },
        () => term.faces[randInt(0, term.faces.length - 1)],
      );
      return {
        rolls,
        kept: rolls,
        total: rolls.reduce((s, v) => s + v, 0),
        label: `${term.count}d[${term.faces.join(",")}]`,
        minFace: Math.min(...term.faces),
        maxFace: Math.max(...term.faces),
      };
    }

    case "table": {
      const rolls = Array.from(
        { length: term.count },
        () => term.entries[randInt(0, term.entries.length - 1)],
      );
      return {
        rolls,
        kept: rolls,
        total: 0,
        label: `${term.count}d[${term.entries.join(",")}]`,
        minFace: null,
        maxFace: null,
      };
    }

    case "constant": {
      return {
        rolls: [term.value],
        kept: [term.value],
        total: term.value,
        label: String(term.value),
        minFace: null,
        maxFace: null,
      };
    }
  }
}

function evalNode(node: DiceNode): { total: number; terms: TermResult[] } {
  switch (node.type) {
    case "term": {
      const r = rollDiceTerm(node.term);
      return { total: r.total, terms: [{ ...r, inlineLabel: node.inlineLabel }] };
    }
    case "negate": {
      const { total, terms } = evalNode(node.arg);
      return { total: -total, terms };
    }
    case "fn": {
      const { total, terms } = evalNode(node.arg);
      return { total: Math[node.fn](total), terms };
    }
    case "binary": {
      const l = evalNode(node.left);
      const r = evalNode(node.right);
      let total: number;
      switch (node.op) {
        case "+": total = l.total + r.total; break;
        case "-": total = l.total - r.total; break;
        case "*": total = l.total * r.total; break;
        case "/": total = Math.floor(l.total / r.total); break;
        case "%": total = l.total % r.total; break;
        case "**": total = l.total ** r.total; break;
        default: { const _: never = node.op; throw new Error(`Unknown op: ${_}`); }
      }
      return { total, terms: [...l.terms, ...r.terms] };
    }
  }
}

function termMaxTotal(term: DiceTerm): number | null {
  switch (term.type) {
    case "standard": return (term.keep ? term.keep.count : term.count) * term.sides;
    case "fate": return term.count;
    case "pool": return term.count * Math.max(...term.faces);
    case "table": return null;
    case "constant": return term.value;
  }
}

function termMinTotal(term: DiceTerm): number | null {
  switch (term.type) {
    case "standard": return (term.keep ? term.keep.count : term.count) * 1;
    case "fate": return -term.count;
    case "pool": return term.count * Math.min(...term.faces);
    case "table": return null;
    case "constant": return term.value;
  }
}

function maxNode(node: DiceNode): number | null {
  switch (node.type) {
    case "term": return termMaxTotal(node.term);
    case "negate": {
      const m = minNode(node.arg);
      return m === null ? null : -m;
    }
    case "fn": {
      if (node.fn === "abs") {
        const mx = maxNode(node.arg), mn = minNode(node.arg);
        if (mx === null || mn === null) return null;
        return Math.max(Math.abs(mx), Math.abs(mn));
      }
      const m = maxNode(node.arg);
      return m === null ? null : Math[node.fn](m);
    }
    case "binary": {
      switch (node.op) {
        case "+": { const l = maxNode(node.left), r = maxNode(node.right); return l === null || r === null ? null : l + r; }
        case "-": { const l = maxNode(node.left), r = minNode(node.right); return l === null || r === null ? null : l - r; }
        case "*": { const l = maxNode(node.left), r = maxNode(node.right); return l === null || r === null ? null : l * r; }
        case "/": { const l = maxNode(node.left), r = minNode(node.right); return l === null || r === null || r === 0 ? null : Math.floor(l / r); }
        case "%": return null;
        case "**": return null;
        default: { const _: never = node.op; throw new Error(`Unknown op: ${_}`); }
      }
    }
  }
}

function minNode(node: DiceNode): number | null {
  switch (node.type) {
    case "term": return termMinTotal(node.term);
    case "negate": {
      const m = maxNode(node.arg);
      return m === null ? null : -m;
    }
    case "fn": {
      if (node.fn === "abs") {
        const mx = maxNode(node.arg), mn = minNode(node.arg);
        if (mx === null || mn === null) return null;
        if (mn <= 0 && mx >= 0) return 0;
        return Math.min(Math.abs(mx), Math.abs(mn));
      }
      const m = minNode(node.arg);
      return m === null ? null : Math[node.fn](m);
    }
    case "binary": {
      switch (node.op) {
        case "+": { const l = minNode(node.left), r = minNode(node.right); return l === null || r === null ? null : l + r; }
        case "-": { const l = minNode(node.left), r = maxNode(node.right); return l === null || r === null ? null : l - r; }
        case "*": { const l = minNode(node.left), r = minNode(node.right); return l === null || r === null ? null : l * r; }
        case "/": { const l = minNode(node.left), r = maxNode(node.right); return l === null || r === null || r === 0 ? null : Math.floor(l / r); }
        case "%": return null;
        case "**": return null;
        default: { const _: never = node.op; throw new Error(`Unknown op: ${_}`); }
      }
    }
  }
}

export function rollExpression(expr: DiceExpression): RollResult {
  const { total, terms } = evalNode(expr.root);
  return {
    terms,
    total,
    maxTotal: maxNode(expr.root),
    minTotal: minNode(expr.root),
    expression: terms.map((t) => t.label).join(""),
  };
}

export function roll(notation: string): RollResult {
  const { formula, label } = splitFormulaLabel(notation.trim());
  return { ...rollExpression(parseDice(formula)), label };
}
