import { createRef, useState, type RefObject } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { collapseExpandedComposerCursor } from "~/composer-logic";

import { act, render } from "../../test/render";
import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
  type ComposerPromptEditorProps,
} from "./ComposerPromptEditorTiptap";

function Composer({
  initialValue,
  initialCursor = initialValue.length,
  vimEnabled,
  editorRef,
}: {
  readonly initialValue: string;
  readonly initialCursor?: number;
  readonly vimEnabled: boolean;
  readonly editorRef: RefObject<ComposerPromptEditorHandle | null>;
}) {
  const [draft, setDraft] = useState({ value: initialValue, cursor: initialCursor });
  return (
    <ComposerPromptEditorTiptap
      {...editorProps}
      {...draft}
      richTextEnabled
      vimEnabled={vimEnabled}
      editorRef={editorRef}
      onChange={(value, cursor) => setDraft({ value, cursor })}
    />
  );
}

const editorProps = {
  keybindings: DEFAULT_RESOLVED_KEYBINDINGS,
  contextRecords: new Map(),
  skills: [],
  disabled: false,
  placeholder: "Prompt",
  onPaste: () => {},
} satisfies Partial<ComposerPromptEditorProps>;

function editableIn(container: HTMLElement): HTMLElement {
  const editable = container.querySelector<HTMLElement>('[data-testid="composer-editor"]');
  if (!editable) throw new Error("Composer did not mount");
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

async function press(editable: HTMLElement, ...keys: string[]): Promise<void> {
  await act(() => {
    keys.forEach((key) =>
      editable.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      ),
    );
  });
}

describe("Vim composer integration", () => {
  it.each(["pasted text", "pasted\ntext"])(
    "undoes consecutive clipboard pastes separately: %s",
    async (pasted) => {
      const editorRef = createRef<ComposerPromptEditorHandle>();
      await using screen = await render(
        <Composer initialValue="Please " vimEnabled editorRef={editorRef} />,
      );
      const editable = editableIn(screen.container);
      await act(() => editorRef.current?.focusAtEnd());
      await paste(editable, pasted);
      const firstPaste = editorRef.current?.readSnapshot().value;
      expect(firstPaste).toContain(pasted);
      await paste(editable, " again");
      expect(editorRef.current?.readSnapshot().value).toBe(`${firstPaste} again`);
      await press(editable, "Escape", "u");
      expect(editorRef.current?.readSnapshot().value).toBe(firstPaste);
    },
  );

  it("retains pasted text and context references in either mode", async () => {
    const pasted = "$my-skill [Ref](t3-context://v1/file/test-id)\nnext";
    for (const vimEnabled of [false, true]) {
      const editorRef = createRef<ComposerPromptEditorHandle>();
      await using screen = await render(
        <Composer initialValue="Please " vimEnabled={vimEnabled} editorRef={editorRef} />,
      );
      await act(() => editorRef.current?.focusAtEnd());
      await paste(editableIn(screen.container), pasted);
      const snapshot = editorRef.current?.readSnapshot();
      expect(snapshot?.value).toContain(pasted);
      expect(snapshot?.contextIds).toEqual(["test-id"]);
    }
  });

  it("keeps the completed skill caret and lets one Escape dismiss suggestions and exit insert mode", async () => {
    const editorRef = createRef<ComposerPromptEditorHandle>();
    const onCommandKeyDown = vi.fn(() => true);
    const editor = (value: string, cursor: number) => (
      <ComposerPromptEditorTiptap
        {...editorProps}
        value={value}
        cursor={cursor}
        vimEnabled
        vimMenuOpen
        onChange={() => {}}
        onCommandKeyDown={onCommandKeyDown}
        editorRef={editorRef}
      />
    );
    await using screen = await render(editor("$sk", 3));
    const editable = editableIn(screen.container);
    await press(editable, "i");
    expect(editable.getAttribute("data-vim-mode")).toBe("insert");

    const completed = "$my-skill ";
    await screen.rerender(
      editor(completed, collapseExpandedComposerCursor(completed, completed.length)),
    );
    expect(editorRef.current?.readSnapshot().expandedCursor).toBe(completed.length);
    await act(() => editorRef.current?.focusAtEnd());
    expect(editorRef.current?.readSnapshot().expandedCursor).toBe(completed.length);
    await press(editable, "Escape");
    expect(onCommandKeyDown).toHaveBeenCalledWith("Escape", expect.any(KeyboardEvent));
    expect(editable.getAttribute("data-vim-mode")).toBe("normal");
  });

  it("edits literal markdown and restores rich text without losing context", async () => {
    const editorRef = createRef<ComposerPromptEditorHandle>();
    const initialValue = "**bold**\n@src/file.ts [Ref](t3-context://v1/file/test-id)";
    await using screen = await render(
      <Composer initialValue={initialValue} initialCursor={0} vimEnabled editorRef={editorRef} />,
    );
    const editable = editableIn(screen.container);
    await act(() => editorRef.current?.focus());
    expect(editable.textContent).toContain("**bold**");
    expect(editable.querySelector("[data-composer-mention-chip]")).toBeNull();
    expect(editorRef.current?.readSnapshot().contextIds).toEqual(["test-id"]);
    await press(editable, "x");
    expect(editorRef.current?.readSnapshot().value).toBe(initialValue.slice(1));
    await paste(editable, "pasted line ");
    const edited = editorRef.current?.readSnapshot().value;
    expect(edited).toContain("pasted line");
    await screen.rerender(
      <Composer
        initialValue={initialValue}
        initialCursor={0}
        vimEnabled={false}
        editorRef={editorRef}
      />,
    );
    expect(editorRef.current?.readSnapshot().value).toBe(edited);
    expect(editorRef.current?.readSnapshot().contextIds).toEqual(["test-id"]);
    expect(editableIn(screen.container).getAttribute("data-composer-rich-text")).toBe("true");
  });
});
