import type { EnvironmentId, OrchestrationSearchPromptsResult } from "@t3tools/contracts";
import { scoreQueryMatch } from "@t3tools/shared/searchRanking";
import { MessageSquareIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useEnvironmentQuery } from "../../state/query";
import { useDebouncedValue } from "../../state/queries";
import { CommandPaletteContent } from "../CommandPaletteContent";
import {
  CommandDialog,
  CommandDialogPopup,
  CommandFooterAction,
  CommandItem,
  CommandList,
} from "../ui/command";
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
    listRef.current?.querySelectorAll("[data-prompt-result]")[selectedIndex]?.scrollIntoView({
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
      event.stopPropagation();
      if (matches.length > 0) {
        const direction = event.key === "ArrowUp" ? -1 : 1;
        setSelectedIndex((index) => (index + direction + matches.length) % matches.length);
      }
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      event.stopPropagation();
      props.onSelect(selected.prompt);
    }
  };

  return (
    <CommandDialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <CommandDialogPopup
        aria-label="Prompt history"
        className="overflow-hidden"
        onBackdropPointerDown={props.onClose}
      >
        <CommandPaletteContent
          mode="none"
          value={query}
          onValueChange={(value) => {
            setQuery(value);
            setSelectedIndex(0);
            setOffset(0);
            setPriorMatches([]);
            listRef.current
              ?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
              ?.scrollTo({ top: 0 });
          }}
          inputProps={{
            "aria-label": "Search sent prompts",
            placeholder: "Search sent prompts…",
            maxLength: 200,
            onKeyDown,
          }}
          footerActionLabel="Use prompt"
          footerTrailing={
            nextOffset !== null && nextOffset !== undefined ? (
              <CommandFooterAction
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setPriorMatches([...priorMatches, ...(result.data?.matches ?? [])]);
                  setOffset(nextOffset);
                }}
              >
                Load older prompts
              </CommandFooterAction>
            ) : null
          }
        >
          {matches.length > 0 ? (
            <CommandList ref={listRef}>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {query.trim() ? "Matching prompts" : "Recent prompts"}
              </div>
              {matches.map((match, index) => {
                const [firstLine, ...otherLines] = match.prompt.split("\n");
                const detail = otherLines.join(" ").trim();
                return (
                  <CommandItem
                    key={match.id}
                    value={match.id}
                    active={index === Math.min(selectedIndex, matches.length - 1)}
                    data-prompt-result="true"
                    onMouseMove={() => setSelectedIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => props.onSelect(match.prompt)}
                  >
                    <MessageSquareIcon className="size-4 shrink-0 text-icon-muted" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col text-left">
                      <span className="line-clamp-2 wrap-anywhere text-sm leading-5">
                        {firstLine}
                      </span>
                      {detail && (
                        <span className="truncate text-xs text-secondary-label">{detail}</span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandList>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {loading ? "Searching…" : (result.error ?? "No sent prompts found")}
            </p>
          )}
        </CommandPaletteContent>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
