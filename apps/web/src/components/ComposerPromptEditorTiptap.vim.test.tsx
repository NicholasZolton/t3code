// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { collapseExpandedComposerCursor } from "~/composer-logic";

import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";

describe("Vim composer integration", () => {
  it("serializes the same prompt and context references after pasting skills in either mode", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const editorRef = createRef<ComposerPromptEditorHandle>();
    const pasted = "$my-skill [Ref](t3-context://v1/file/test-id)\nnext";
    const snapshots: ReturnType<ComposerPromptEditorHandle["readSnapshot"]>[] = [];
    try {
      for (const vimEnabled of [false, true]) {
        await act(async () => {
          root.render(
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
            />,
          );
        });
        const clipboardData = new DataTransfer();
        clipboardData.setData("text/plain", pasted);
        await act(async () => {
          container
            .querySelector('[data-testid="composer-editor"]')
            ?.dispatchEvent(
              new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
            );
        });
        snapshots.push(editorRef.current!.readSnapshot());
      }
      expect(snapshots[0]?.value).toBe(`Please \n${pasted}`);
      expect(snapshots[1]?.value).toBe(snapshots[0]?.value);
      expect(snapshots[1]?.contextIds).toEqual(["test-id"]);
      expect(snapshots[1]?.contextIds).toEqual(snapshots[0]?.contextIds);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("places the caret after a completed skill and lets one Escape close suggestions and exit insert mode", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const editorRef = createRef<ComposerPromptEditorHandle>();
    const onCommandKeyDown = vi.fn(() => true);
    const render = (value: string, cursor: number, vimMenuOpen: boolean): void => {
      root.render(
        <ComposerPromptEditorTiptap
          value={value}
          cursor={cursor}
          keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
          vimEnabled
          vimMenuOpen={vimMenuOpen}
          contextRecords={new Map()}
          skills={[]}
          disabled={false}
          placeholder="Prompt"
          onChange={() => {}}
          onCommandKeyDown={onCommandKeyDown}
          onPaste={() => {}}
          editorRef={editorRef}
        />,
      );
    };
    try {
      await act(async () => render("$sk", 3, true));
      const editable = container.querySelector<HTMLElement>('[data-testid="composer-editor"]');
      const key = (name: string): void => {
        editable?.dispatchEvent(
          new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
        );
      };
      await act(async () => key("i"));
      expect(editable?.getAttribute("data-vim-mode")).toBe("insert");

      const completed = "$my-skill ";
      await act(async () =>
        render(completed, collapseExpandedComposerCursor(completed, completed.length), true),
      );
      expect(editorRef.current?.readSnapshot().expandedCursor).toBe(completed.length);
      editorRef.current?.focusAtEnd();
      expect(editorRef.current?.readSnapshot().expandedCursor).toBe(completed.length);

      await act(async () => key("Escape"));
      expect(onCommandKeyDown).toHaveBeenCalledWith("Escape", expect.any(KeyboardEvent));
      expect(editable?.getAttribute("data-vim-mode")).toBe("normal");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("edits literal markdown and restores the rich editor when Vim is turned off", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const editorRef = createRef<ComposerPromptEditorHandle>();
    let draft =
      "**bold**\n@src/file.ts [Assistant quote](citation) [Ref](t3-context://v1/file/test-id)";
    let cursor = 0;
    const onChange = vi.fn((value: string, nextCursor: number) => {
      draft = value;
      cursor = nextCursor;
    });
    const render = (vimEnabled: boolean): void => {
      root.render(
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
        />,
      );
    };
    try {
      await act(async () => render(true));
      const editable = container.querySelector<HTMLElement>('[data-testid="composer-editor"]');
      expect(editable?.textContent).toContain("**bold**");
      expect(editable?.querySelector("[data-composer-mention-chip]")).toBeNull();
      expect(editable?.querySelector(".composer-vim-block-cursor")).not.toBeNull();
      expect(editorRef.current?.readSnapshot().contextIds).toEqual(["test-id"]);

      await act(async () => {
        editable?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }),
        );
      });
      expect(editorRef.current?.readSnapshot().value).toBe(
        "*bold**\n@src/file.ts [Assistant quote](citation) [Ref](t3-context://v1/file/test-id)",
      );
      expect(editorRef.current?.readSnapshot().contextIds).toEqual(["test-id"]);

      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "\npasted line");
      await act(async () => {
        editable?.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
        );
      });
      expect(editorRef.current?.readSnapshot().value).toContain("pasted line");

      await act(async () => render(false));
      expect(editorRef.current?.readSnapshot().value).toBe(draft);
      expect(
        container
          .querySelector('[data-testid="composer-editor"]')
          ?.getAttribute("data-composer-rich-text"),
      ).toBe("true");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
