import type { EnvironmentId, OrchestrationSearchPromptsResult } from "@t3tools/contracts";
import { scoreQueryMatch } from "@t3tools/shared/searchRanking";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useEnvironmentQuery } from "../../state/query";
import { useDebouncedValue } from "../../state/queries";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { recallableComposerPrompt } from "./composerPromptHistory";

type PromptMatch = OrchestrationSearchPromptsResult["matches"][number];

export function rankPromptMatches(matches: ReadonlyArray<PromptMatch>, query: string) {
  const normalized = query.trim().toLowerCase();
  const seen = new Set<string>();
  return matches
    .flatMap((match) => {
      const prompt = recallableComposerPrompt(match.text);
      if (!prompt || seen.has(prompt)) return [];
      seen.add(prompt);
      const score = normalized
        ? scoreQueryMatch({
            value: prompt.toLowerCase(),
            query: normalized,
            exactBase: 0,
            prefixBase: 10,
            includesBase: 100,
            fuzzyBase: 200,
          })
        : 0;
      return score === null ? [] : [{ id: match.messageId, prompt, score }];
    })
    .sort((a, b) => a.score - b.score);
}

export function ComposerPromptSearch(props: {
  environmentId: EnvironmentId;
  onClose: () => void;
  onSelect: (prompt: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [priorMatches, setPriorMatches] = useState<ReadonlyArray<PromptMatch>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 150);
  const result = useEnvironmentQuery(
    orchestrationEnvironment.promptSearch({
      environmentId: props.environmentId,
      input: { query: debouncedQuery, offset },
    }),
  );
  const loading = query.trim() !== debouncedQuery || result.isPending;
  const matches = useMemo(
    () =>
      rankPromptMatches([...priorMatches, ...(loading ? [] : (result.data?.matches ?? []))], query),
    [loading, priorMatches, query, result.data],
  );
  const selected = matches[Math.min(selectedIndex, matches.length - 1)];
  const nextOffset = loading ? null : result.data?.nextOffset;

  useEffect(() => {
    listRef.current?.querySelectorAll('[role="option"]')[selectedIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedIndex]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      (event.key.toLowerCase() === "r" &&
        event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey)
    ) {
      event.preventDefault();
      if (matches.length > 0) {
        const direction = event.key === "ArrowUp" ? -1 : 1;
        setSelectedIndex((index) => (index + direction + matches.length) % matches.length);
      }
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      props.onSelect(selected.prompt);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup aria-label="Search prompt history">
        <DialogTitle>Search prompt history</DialogTitle>
        <input
          ref={inputRef}
          autoFocus
          aria-label="Search sent prompts"
          maxLength={200}
          className="mt-4 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none"
          placeholder="Search sent prompts…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
            setOffset(0);
            setPriorMatches([]);
            listRef.current?.scrollTo({ top: 0 });
          }}
          onKeyDown={onKeyDown}
        />
        <div
          ref={listRef}
          className="mt-2 max-h-80 overflow-y-auto"
          role="listbox"
          aria-label="Sent prompts"
        >
          {matches.length > 0 ? (
            matches.map((match, index) => (
              <button
                key={match.id}
                type="button"
                role="option"
                aria-selected={index === Math.min(selectedIndex, matches.length - 1)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent aria-selected:bg-accent"
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => props.onSelect(match.prompt)}
              >
                <span className="line-clamp-2 whitespace-pre-wrap wrap-anywhere">
                  {match.prompt}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-5 text-center text-sm text-muted-foreground">
              {loading ? "Searching…" : (result.error ?? "No sent prompts found")}
            </p>
          )}
          {nextOffset !== null && nextOffset !== undefined && (
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-center text-sm text-muted-foreground hover:bg-accent"
              onClick={() => {
                setPriorMatches([...priorMatches, ...(result.data?.matches ?? [])]);
                setOffset(nextOffset);
                inputRef.current?.focus();
              }}
            >
              Load older prompts
            </button>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
