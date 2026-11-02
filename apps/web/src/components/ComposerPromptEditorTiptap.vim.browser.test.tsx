import { createRef, type ReactElement } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { collapseExpandedComposerCursor } from "~/composer-logic";
import { act, render } from "../../test/render";

import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";

function editableIn(container: HTMLElement): HTMLElement {
  const editable = container.querySelector<HTMLElement>('[data-testid="composer-editor"]');
  if (editable === null) throw new Error("Composer did not mount");
  return editable;
}

async function paste(editable: HTMLElement, text: string): Promise<void> {
  const clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", text);
  await act(() => {
    editable.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  });
}

async function key(editable: HTMLElement, name: string): Promise<void> {
  await act(() => {
    editable.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  });
}

describe("Vim composer integration", () => {
  it.each(["pasted text", "pasted\ntext"])(
    "undoes consecutive clipboard pastes separately in Vim mode: %s",
    async (pasted) => {
      const editorRef = createRef<ComposerPromptEditorHandle>();
      await using screen = await render(
        <ComposerPromptEditorTiptap
          value="Please "
          cursor={7}
          keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
          vimEnabled
          contextRecords={new Map()}
          skills={[]}
          disabled={false}
          placeholder="Prompt"
          onChange={() => {}}
          onPaste={() => {}}
          editorRef={editorRef}
        />,
      );
      const editable = editableIn(screen.container);
      await paste(editable, pasted);
      const firstPaste = editorRef.current?.readSnapshot().value;
      await paste(editable, " again");
      expect(editorRef.current?.readSnapshot().value).toBe(`${firstPaste} again`);
      await key(editable, "Escape");
      await key(editable, "u");
      expect(editorRef.current?.readSnapshot().value).toBe(firstPaste);
    },
  );

  it("serializes the same prompt and context references after pasting skills in either mode", async () => {
    const editorRef = createRef<ComposerPromptEditorHandle>();
    const pasted = "$my-skill [Ref](t3-context://v1/file/test-id)\nnext";
    const snapshots: ReturnType<ComposerPromptEditorHandle["readSnapshot"]>[] = [];
    const composer = (vimEnabled: boolean): ReactElement => (
      <ComposerPromptEditorTiptap
        value="Please "
        cursor={7}
        keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
        vimEnabled={vimEnabled}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder="Prompt"
        onChange={() => {}}
        onPaste={() => {}}
        editorRef={editorRef}
      />
    );
    await using screen = await render(composer(false));
    await paste(editableIn(screen.container), pasted);
    if (editorRef.current === null) throw new Error("Composer did not mount");
    snapshots.push(editorRef.current.readSnapshot());
    await screen.rerender(composer(true));
    await paste(editableIn(screen.container), pasted);
    snapshots.push(editorRef.current.readSnapshot());
    expect(snapshots[0]?.value).toBe(`Please \n${pasted}`);
    expect(snapshots[1]?.value).toBe(snapshots[0]?.value);
    expect(snapshots[1]?.contextIds).toEqual(["test-id"]);
    expect(snapshots[1]?.contextIds).toEqual(snapshots[0]?.contextIds);
  });

  it("places the caret after a completed skill and lets one Escape close suggestions and exit insert mode", async () => {
    const editorRef = createRef<ComposerPromptEditorHandle>();
    const onCommandKeyDown = vi.fn(() => true);
    const composer = (value: string, cursor: number): ReactElement => (
      <ComposerPromptEditorTiptap
        value={value}
        cursor={cursor}
        keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
        vimEnabled
        vimMenuOpen
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder="Prompt"
        onChange={() => {}}
        onCommandKeyDown={onCommandKeyDown}
        onPaste={() => {}}
        editorRef={editorRef}
      />
    );
    await using screen = await render(composer("$sk", 3));
    const editable = editableIn(screen.container);
    await key(editable, "i");
    expect(editable.getAttribute("data-vim-mode")).toBe("insert");

    const completed = "$my-skill ";
    await screen.rerender(
      composer(completed, collapseExpandedComposerCursor(completed, completed.length)),
    );
    expect(editorRef.current?.readSnapshot().expandedCursor).toBe(completed.length);
    await act(() => editorRef.current?.focusAtEnd());
    expect(editorRef.current?.readSnapshot().expandedCursor).toBe(completed.length);

    await key(editable, "Escape");
    expect(onCommandKeyDown).toHaveBeenCalledWith("Escape", expect.any(KeyboardEvent));
    expect(editable.getAttribute("data-vim-mode")).toBe("normal");
  });

  it("edits literal markdown and restores the rich editor when Vim is turned off", async () => {
    const editorRef = createRef<ComposerPromptEditorHandle>();
    let draft =
      "**bold**\n@src/file.ts [Assistant quote](citation) [Ref](t3-context://v1/file/test-id)";
    let cursor = 0;
    const onChange = vi.fn((value: string, nextCursor: number) => {
      draft = value;
      cursor = nextCursor;
    });
    const composer = (vimEnabled: boolean): ReactElement => (
      <ComposerPromptEditorTiptap
        value={draft}
        cursor={cursor}
        keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
        richTextEnabled
        vimEnabled={vimEnabled}
        vimSystemClipboard={false}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder="Prompt"
        onChange={onChange}
        onPaste={() => {}}
        editorRef={editorRef}
      />
    );
    await using screen = await render(composer(true));
    const editable = editableIn(screen.container);
    expect(editable.textContent).toContain("**bold**");
    expect(editable.querySelector("[data-composer-mention-chip]")).toBeNull();
    expect(editable.querySelector(".composer-vim-block-cursor")).not.toBeNull();
    expect(editorRef.current?.readSnapshot().contextIds).toEqual(["test-id"]);

    await key(editable, "x");
    expect(editorRef.current?.readSnapshot().value).toBe(
      "*bold**\n@src/file.ts [Assistant quote](citation) [Ref](t3-context://v1/file/test-id)",
    );
    expect(editorRef.current?.readSnapshot().contextIds).toEqual(["test-id"]);

    await paste(editable, "\npasted line");
    expect(editorRef.current?.readSnapshot().value).toContain("pasted line");

    await screen.rerender(composer(false));
    expect(editorRef.current?.readSnapshot().value).toBe(draft);
    expect(editableIn(screen.container).getAttribute("data-composer-rich-text")).toBe("true");
  });
});
