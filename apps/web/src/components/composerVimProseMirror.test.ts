// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  ComposerVimExtension,
  handleComposerVimKeyDown,
  setComposerVimClipboard,
} from "./composerVimProseMirror";

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors.length = 0;
  document.body.replaceChildren();
});

function setup(value: string): {
  editor: Editor;
  key: (name: string, options?: KeyboardEventInit) => boolean;
  text: () => string;
} {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [StarterKit, ComposerVimExtension],
    content: {
      type: "doc",
      content: value.split("\n").map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      })),
    },
  });
  editors.push(editor);
  const key = (name: string, options?: KeyboardEventInit): boolean =>
    handleComposerVimKeyDown(
      editor.view,
      new KeyboardEvent("keydown", { ...options, key: name, cancelable: true, bubbles: true }),
    );
  return {
    editor,
    key,
    text: () => editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n"),
  };
}

describe("Replit Vim engine in Tiptap", () => {
  it("uses real motions, operators, and registers on the Tiptap document", () => {
    const { editor, key, text } = setup("hello world\nsecond line");
    expect(key("w")).toBe(true);
    expect(editor.state.selection.from).toBe(7);
    key("d");
    key("w");
    expect(text()).toBe("hello \nsecond line");
    key("u");
    expect(text()).toBe("hello world\nsecond line");
  });

  it("keeps Enter out of the send handler in normal mode and returns to insert mode", () => {
    const { editor, key } = setup("hello");
    expect(key("Enter")).toBe(true);
    expect(key("Enter", { shiftKey: true })).toBe(true);
    expect(key("!")).toBe(true);
    expect(key("Enter", { metaKey: true })).toBe(false);
    expect(key("i")).toBe(true);
    expect(key("Enter")).toBe(false);
    expect(key("Escape")).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe("hello");
  });

  it("deletes and pastes whole lines without losing literal markdown", () => {
    const { key, text } = setup("**bold**\n@src/file.ts\nlast");
    key("d");
    key("d");
    expect(text()).toBe("@src/file.ts\nlast");
    key("p");
    expect(text()).toBe("@src/file.ts\n**bold**\nlast");
  });

  it("restores a deleted final line without inserting a blank paragraph", () => {
    const { key, text } = setup("first\nsecond");
    key("j");
    key("d");
    key("d");
    expect(text()).toBe("first");
    key("p");
    expect(text()).toBe("first\nsecond");
  });

  it("supports counts, text objects, dot repeat, and visual selection", () => {
    const { editor, key, text } = setup("one two three four");
    key("2");
    key("w");
    expect(editor.state.selection.from).toBe(9);
    key("d");
    key("i");
    key("w");
    expect(text()).toBe("one two  four");
    key("w");
    key(".");
    expect(text()).toBe("one two  ");
    key("0");
    key("v");
    key("e");
    expect(editor.state.selection.empty).toBe(false);
    key("Escape");
    expect(editor.state.selection.empty).toBe(true);
  });

  it("finds text and returns a block cursor decoration in normal mode", () => {
    const { editor, key } = setup("first middle last");
    editor.view.setProps({ attributes: { class: "composer-tiptap" } });
    expect(editor.view.dom.classList.contains("composer-vim-normal")).toBe(true);
    expect(editor.view.dom.querySelector(".composer-vim-block-cursor")).not.toBeNull();
    key("f");
    key("m");
    expect(editor.state.selection.from).toBe(7);
    key("i");
    expect(editor.view.dom.classList.contains("composer-vim-normal")).toBe(false);
  });

  it("searches from a Vim prompt and navigates the matches", () => {
    const { editor, key } = setup("first middle last middle");
    key("/");
    const input = editor.view.dom.parentElement?.querySelector(".composer-vim-dialog input");
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) return;
    input.value = "middle";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(editor.state.selection.from).toBe(7);
    key("n");
    expect(editor.state.selection.from).toBe(19);
  });

  it("runs ex substitution through the Tiptap document", () => {
    const { editor, key, text } = setup("one two one");
    key(":");
    const input = editor.view.dom.parentElement?.querySelector(".composer-vim-dialog input");
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) return;
    input.value = "s/one/three/g";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(text()).toBe("three two three");
  });

  it("records and replays Vim macros", () => {
    const { key, text } = setup("one two three");
    key("q");
    key("a");
    key("x");
    key("w");
    key("q");
    expect(text()).toBe("ne two three");
    key("@");
    key("a");
    expect(text()).toBe("ne wo three");
  });

  it("edits a rectangular visual selection", () => {
    const { key, text } = setup("abc\ndef\nghi");
    key("v", { ctrlKey: true });
    key("j");
    key("l");
    key("d");
    expect(text()).toBe("c\nf\nghi");
  });

  it("releases a rectangular selection when the composer moves the caret", () => {
    const { editor, key } = setup("abc\ndef\nghi");
    key("v", { ctrlKey: true });
    key("j");
    editor.commands.setTextSelection(12);
    key("Escape");
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(12);
  });

  it("replaces characters in replace mode and returns to normal mode", () => {
    const { key, text } = setup("hello");
    key("R");
    key("X");
    key("Y");
    key("Escape");
    expect(text()).toBe("XYllo");
    key("x");
    expect(text()).toBe("Xllo");
  });

  it("repeats typed insertions with the dot command", () => {
    const { editor, key, text } = setup("one two");
    key("i");
    editor.commands.insertContent("z");
    key("Escape");
    key("w");
    key(".");
    expect(text()).toBe("zone ztwo");
  });

  it("uses the system clipboard only when the separate setting is enabled", async () => {
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          writes.push(text);
        },
        readText: async () => "external",
      },
    });
    try {
      const { editor, key, text } = setup("hello");
      key("y");
      key("y");
      expect(writes).toEqual([]);
      setComposerVimClipboard(editor.view, true);
      key("x");
      expect(writes).toEqual(["h"]);
      editor.view.focus();
      key("p");
      await Promise.resolve();
      expect(text()).toContain("external");
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("keeps an editable paragraph after deleting the only line", () => {
    const { editor, key, text } = setup("only line");
    key("d");
    key("d");
    expect(text()).toBe("");
    expect(editor.state.doc.childCount).toBe(1);
    key("i");
    editor.commands.insertContent("next");
    expect(text()).toBe("next");
  });

  it("opens lines and wraps markdown without converting its markers to rich nodes", () => {
    const { editor, key, text } = setup("**first** second");
    key("o");
    editor.commands.insertContent("- [ ] task");
    key("Escape");
    expect(text()).toBe("**first** second\n- [ ] task");
    expect(editor.state.doc.child(1).type.name).toBe("paragraph");
  });
});
