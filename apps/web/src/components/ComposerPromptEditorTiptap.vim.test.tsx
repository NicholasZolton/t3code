// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";

import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";

describe("Vim composer integration", () => {
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
