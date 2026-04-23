import { useState, useCallback } from "react";
import { Dices } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { roll, splitFormulaLabel, type RollResult, type TermResult } from "@/lib/dice";

interface DiceRollProps {
  notation: string;
}

function dieColor(value: number | string, t: TermResult): string {
  if (typeof value === "string" || t.minFace === null || t.maxFace === null || t.minFace === t.maxFace) return "";
  if (value === t.maxFace) return "text-green-400";
  if (value === t.minFace) return "text-red-400";
  return "";
}

function DieValue({ value, term, tooltip }: { value: number | string; term: TermResult; tooltip?: string }) {
  const color = dieColor(value, term);
  const span = <span className={color || undefined}>{value}</span>;
  if (!tooltip) return span;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent side="top" className="font-sans text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function DiceList({ values, term, rerolledFrom, inlineLabel }: { values: (number | string)[]; term: TermResult; rerolledFrom?: (number | undefined)[]; inlineLabel?: string }) {
  return (
    <>
      {"["}
      {values.map((v, i) => {
        const orig = rerolledFrom?.[i];
        return (
          <span key={i}>
            {i > 0 && ", "}
            {orig !== undefined && (
              <span className="line-through text-zinc-600 mr-0.5">{orig}</span>
            )}
            <DieValue value={v} term={term} tooltip={inlineLabel} />
          </span>
        );
      })}
      {"]"}
    </>
  );
}

function resolveLabels(terms: TermResult[]): TermResult[] {
  const out = [...terms];
  let carry: string | undefined;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].inlineLabel) carry = out[i].inlineLabel;
    else if (carry) out[i] = { ...out[i], inlineLabel: carry };
  }
  return out;
}

function buildBreakdown(result: RollResult) {
  const isStringOnly = result.terms.every(
    (t) => t.minFace === null && t.kept.some((v) => typeof v === "string"),
  );
  const terms = resolveLabels(result.terms);

  return (
    <div className="space-y-0.5">
      {result.label && (
        <div className="text-zinc-300 font-sans font-medium pb-0.5">{result.label}</div>
      )}
      {terms.map((t, i) => {
        const isTable = t.kept.some((v) => typeof v === "string");
        const isConstant = t.minFace === null && !isTable;

        if (isConstant) {
          const val = <span className="text-zinc-300"> = {t.total}</span>;
          return (
            <div key={i}>
              <span className="text-zinc-400">{t.label}</span>
              {t.inlineLabel ? (
                <>
                  <span className="text-zinc-500"> [{t.inlineLabel}]</span>
                  <Tooltip>
                    <TooltipTrigger asChild>{val}</TooltipTrigger>
                    <TooltipContent side="top" className="font-sans text-xs">{t.inlineLabel}</TooltipContent>
                  </Tooltip>
                </>
              ) : val}
            </div>
          );
        }

        if (isTable) {
          return (
            <div key={i}>
              <span className="text-zinc-400">{t.label}</span>
              {t.inlineLabel && <span className="text-zinc-500"> [{t.inlineLabel}]</span>}
              <span className="text-zinc-300">: </span>
              <DiceList values={t.kept} term={t} inlineLabel={t.inlineLabel} />
            </div>
          );
        }

        const hasKeep = t.rolls.length !== t.kept.length;
        return (
          <div key={i}>
            <span className="text-zinc-400">{t.label}</span>
            {t.inlineLabel && <span className="text-zinc-500"> [{t.inlineLabel}]</span>}
            <span className="text-zinc-400">: </span>
            <DiceList values={t.rolls} term={t} rerolledFrom={t.rerolledFrom} inlineLabel={t.inlineLabel} />
            {hasKeep && (
              <>
                <span className="text-zinc-500"> keep </span>
                <DiceList values={t.kept} term={t} inlineLabel={t.inlineLabel} />
              </>
            )}
            <span className="text-zinc-300"> = {t.total}</span>
          </div>
        );
      })}
      <div className="border-t border-zinc-600 pt-0.5 text-zinc-200">
        {isStringOnly
          ? <>Result: {terms.flatMap((t) => t.kept).join(", ")}</>
          : <>Total: {result.total}</>}
      </div>
    </div>
  );
}

function tryRoll(notation: string): RollResult | null {
  try {
    return roll(notation);
  } catch {
    return null;
  }
}

export function DiceRoll({ notation }: DiceRollProps) {
  const [result, setResult] = useState<RollResult | "invalid" | null>(null);

  const doRoll = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResult(tryRoll(notation) ?? "invalid");
    },
    [notation],
  );

  if (result === "invalid") {
    return (
      <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[0.875em] text-red-300 font-mono">
        dice: {notation}
      </span>
    );
  }

  if (result === null) {
    return (
      <button
        onClick={doRoll}
        className="inline-flex items-center gap-1 rounded bg-zinc-700/60 px-1.5 py-0.5 text-[0.875em] text-zinc-400 font-mono hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
      >
        <Dices className="h-3.5 w-3.5" />
        <span>{notation}</span>
      </button>
    );
  }

  const isStringOnly = result.terms.every((t) => t.kept.some((v) => typeof v === "string"));
  const displayValue = isStringOnly
    ? result.terms.flatMap((t) => t.kept).join(", ")
    : result.total;
  const isMaxRoll = !isStringOnly && result.maxTotal !== null && result.total === result.maxTotal;
  const isMinRoll = !isStringOnly && result.minTotal !== null && result.total === result.minTotal;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={doRoll}
            className="inline-flex items-center gap-1 rounded bg-zinc-700/60 px-1.5 py-0.5 text-[0.875em] text-zinc-200 font-mono select-none not-prose hover:bg-zinc-700 transition-colors cursor-pointer"
            aria-label="Re-roll"
          >
            <Dices className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-zinc-400">{splitFormulaLabel(notation).formula}</span>
            {result.label && (
              <span className="text-zinc-400">{result.label}</span>
            )}
            <span className="text-zinc-500">:</span>
            <span className={`font-semibold ${isMaxRoll ? "text-green-400" : isMinRoll ? "text-red-400" : "text-zinc-100"}`}>{displayValue}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs font-mono text-xs">
          {buildBreakdown(result)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
