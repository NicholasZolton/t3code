import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  ComposerVimExtension,
  handleComposerVimKeyDown,
  setComposerVimClipboard,
} from "./composerVimProseMirror";

function setup(value: string): {
  editor: Editor;
  key: (name: string, options?: KeyboardEventInit) => boolean;
  text: () => string;
} & Disposable {
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
  const key = (name: string, options?: KeyboardEventInit): boolean =>
    handleComposerVimKeyDown(
      editor.view,
      new KeyboardEvent("keydown", { ...options, key: name, cancelable: true, bubbles: true }),
    );
  return {
    editor,
    key,
    text: () => editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n"),
    [Symbol.dispose]: () => {
      editor.destroy();
      element.remove();
    },
  };
}

describe("Replit Vim engine in Tiptap", () => {
  it("moves gj and gk by wrapped display lines while j follows logical lines", () => {
    using fixture = setup("abcdefghij\nsecond");
    const { editor, key } = fixture;
    const view = editor.view;
    // Simulate a four-character wrap in the first paragraph's layout.
    using _coords = vi.spyOn(view, "coordsAtPos").mockImplementation((pos) => {
      const offset = pos - 1;
      const row = offset < 11 ? Math.floor(offset / 4) : 3;
      const column = offset < 11 ? offset % 4 : offset - 12;
      return { left: column * 10, right: column * 10, top: row * 20, bottom: row * 20 + 20 };
    });
    using _positions = vi.spyOn(view, "posAtCoords").mockImplementation(({ left, top }) => {
      const row = Math.max(0, Math.floor(top / 20));
      const column = Math.max(0, Math.floor(left / 10));
      const offset = row < 3 ? Math.min(row * 4 + column, 10) : 11 + Math.min(column, 6);
      return { pos: offset + (row < 3 ? 1 : 2), inside: -1 };
    });
    key("g");
    key("j");
    expect(editor.state.selection.from).toBe(5);
    key("g");
    key("j");
    expect(editor.state.selection.from).toBe(9);
    key("g");
    key("k");
    expect(editor.state.selection.from).toBe(5);
    key("j");
    expect(editor.state.selection.from).toBe(17);
  });

  it("uses real motions, operators, and registers on the Tiptap document", () => {
    using fixture = setup("hello world\nsecond line");
    const { editor, key, text } = fixture;
    expect(key("w")).toBe(true);
    expect(editor.state.selection.from).toBe(7);
    key("d");
    key("w");
    expect(text()).toBe("hello \nsecond line");
    key("u");
    expect(text()).toBe("hello world\nsecond line");
  });

  it("keeps Enter out of the send handler in normal mode and returns to insert mode", () => {
    using fixture = setup("hello");
    const { editor, key } = fixture;
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
    using fixture = setup("**bold**\n@src/file.ts\nlast");
    const { key, text } = fixture;
    key("d");
    key("d");
    expect(text()).toBe("@src/file.ts\nlast");
    key("p");
    expect(text()).toBe("@src/file.ts\n**bold**\nlast");
  });

  it("restores a deleted final line without inserting a blank paragraph", () => {
    using fixture = setup("first\nsecond");
    const { key, text } = fixture;
    key("j");
    key("d");
    key("d");
    expect(text()).toBe("first");
    key("p");
    expect(text()).toBe("first\nsecond");
  });

  it("supports counts, text objects, dot repeat, and visual selection", () => {
    using fixture = setup("one two three four");
    const { editor, key, text } = fixture;
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
    using fixture = setup("first middle last");
    const { editor, key } = fixture;
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
    using fixture = setup("first middle last middle");
    const { editor, key } = fixture;
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
    using fixture = setup("one two one");
    const { editor, key, text } = fixture;
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
    using fixture = setup("one two three");
    const { key, text } = fixture;
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
    using fixture = setup("abc\ndef\nghi");
    const { key, text } = fixture;
    key("v", { ctrlKey: true });
    key("j");
    key("l");
    key("d");
    expect(text()).toBe("c\nf\nghi");
  });

  it("releases a rectangular selection when the composer moves the caret", () => {
    using fixture = setup("abc\ndef\nghi");
    const { editor, key } = fixture;
    key("v", { ctrlKey: true });
    key("j");
    editor.commands.setTextSelection(12);
    key("Escape");
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(12);
  });

  it("replaces characters in replace mode and returns to normal mode", () => {
    using fixture = setup("hello");
    const { key, text } = fixture;
    key("R");
    key("X");
    key("Y");
    key("Escape");
    expect(text()).toBe("XYllo");
    key("x");
    expect(text()).toBe("Xllo");
  });

  it("repeats typed insertions with the dot command", () => {
    using fixture = setup("one two");
    const { editor, key, text } = fixture;
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
      using fixture = setup("hello");
      const { editor, key, text } = fixture;
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
    using fixture = setup("only line");
    const { editor, key, text } = fixture;
    key("d");
    key("d");
    expect(text()).toBe("");
    expect(editor.state.doc.childCount).toBe(1);
    key("i");
    editor.commands.insertContent("next");
    expect(text()).toBe("next");
  });

  it("opens lines and wraps markdown without converting its markers to rich nodes", () => {
    using fixture = setup("**first** second");
    const { editor, key, text } = fixture;
    key("o");
    editor.commands.insertContent("- [ ] task");
    key("Escape");
    expect(text()).toBe("**first** second\n- [ ] task");
    expect(editor.state.doc.child(1).type.name).toBe("paragraph");
  });
});
