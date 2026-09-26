import type { EditorState, Transaction } from "@tiptap/pm/state";

/** Delete the preceding whitespace-delimited word without splitting inline chips. */
export function deletePreviousComposerWord(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!selection.empty) return state.tr.deleteSelection().scrollIntoView();

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  const preceding = $from.parent.textBetween(0, $from.parentOffset, "", "\uFFFC");
  const match = preceding.match(/(?:\S+\s*|\s+)$/u);
  if (!match) return null;

  return state.tr.delete($from.pos - match[0].length, $from.pos).scrollIntoView();
}
