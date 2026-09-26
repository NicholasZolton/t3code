import {
  initVim,
  type CM5EditorInterface,
  type CM5RangeInterface,
  type Pos,
} from "@replit/codemirror-vim-core";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { flatToPm, pmToFlat, serializeEditorDoc } from "~/composer-rich-text-doc";

type VimPosition = Pos & { hitSide?: boolean };
type VimListener = Function;

class VimPos implements Pos {
  constructor(
    public line: number,
    public ch: number,
  ) {}
}

class VimStringStream {
  pos = 0;
  start = 0;
  constructor(public string: string) {}
  next(): string | undefined {
    return this.string[this.pos++];
  }
  peek(): string | undefined {
    return this.string[this.pos];
  }
  eat(match: string | RegExp | ((ch: string) => boolean)): string | undefined {
    const ch = this.peek();
    if (
      ch === undefined ||
      !(typeof match === "string"
        ? ch === match
        : match instanceof RegExp
          ? match.test(ch)
          : match(ch))
    )
      return undefined;
    this.pos++;
    return ch;
  }
  eatWhile(match: string | RegExp | ((ch: string) => boolean)): boolean {
    const from = this.pos;
    while (this.eat(match)) {}
    return this.pos !== from;
  }
  eatSpace(): boolean {
    return this.eatWhile(/\s/);
  }
  skipToEnd(): void {
    this.pos = this.string.length;
  }
  skipTo(ch: string): boolean {
    const found = this.string.indexOf(ch, this.pos);
    if (found < 0) return false;
    this.pos = found;
    return true;
  }
  backUp(n: number): void {
    this.pos = Math.max(0, this.pos - n);
  }
  column(): number {
    return this.start;
  }
  indentation(): number {
    return this.string.match(/^\s*/)?.[0].length ?? 0;
  }
  match(
    pattern: string | RegExp,
    consume = true,
    caseInsensitive = false,
  ): boolean | RegExpMatchArray | null {
    const rest = this.string.slice(this.pos);
    if (typeof pattern === "string") {
      const matches = caseInsensitive
        ? rest.toLowerCase().startsWith(pattern.toLowerCase())
        : rest.startsWith(pattern);
      if (matches && consume) this.pos += pattern.length;
      return matches;
    }
    const match = rest.match(pattern);
    if (match?.index !== 0) return null;
    if (consume) this.pos += match[0].length;
    return match;
  }
  current(): string {
    return this.string.slice(this.start, this.pos);
  }
  eol(): boolean {
    return this.pos >= this.string.length;
  }
  sol(): boolean {
    return this.pos === 0;
  }
}

class VimMark {
  private active = true;
  readonly cm: VimProseMirror;
  readonly id: number;
  readonly assoc: number;
  constructor(
    editor: VimProseMirror,
    public offset: number,
    assoc: number,
  ) {
    this.cm = editor;
    this.id = ++editor.$mid;
    this.assoc = assoc;
    editor.marks[this.id] = this;
  }
  clear(): void {
    this.active = false;
    delete this.cm.marks[this.id];
  }
  find(): Pos | null {
    return this.active ? this.cm.posFromIndex(this.offset) : null;
  }
  update(change: { from: number; to: number; inserted: number }): void {
    if (this.offset >= change.to) this.offset += change.inserted - (change.to - change.from);
    else if (this.offset > change.from) this.offset = change.from + change.inserted;
  }
}

/** CodeMirror 5's text operations, backed by Tiptap's document and transactions. */
class VimProseMirror implements CM5EditorInterface {
  private static domListeners = new WeakMap<EventTarget, Map<VimListener, EventListener>>();
  static isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  static Pos = VimPos;
  static StringStream = VimStringStream;
  static isWordChar = (ch: string): boolean => /[\w\p{Alphabetic}\p{Number}]/u.test(ch);
  static commands = {
    undo: (cm: CM5EditorInterface): void => {
      if (cm instanceof VimProseMirror) cm.editor.commands.undo();
    },
    redo: (cm: CM5EditorInterface): void => {
      if (cm instanceof VimProseMirror) cm.editor.commands.redo();
    },
    cursorCharLeft: (cm: CM5EditorInterface): void => {
      cm.moveH(-1, "char");
    },
    newlineAndIndent: (cm: CM5EditorInterface): void => {
      cm.replaceSelection("\n");
    },
    indentAuto: (cm: CM5EditorInterface): void => {
      cm.indentMore();
    },
    toggleLineComment: (): void => {},
    newlineAndIndentContinueComment: undefined,
    save: undefined,
  };
  static keys: Record<string, (cm: CM5EditorInterface) => void> = {
    Left: (cm) => cm.moveH(-1, "char"),
    Right: (cm) => cm.moveH(1, "char"),
    Up: (cm) => cm.setCursor(new VimPos(cm.getCursor().line - 1, cm.getCursor().ch)),
    Down: (cm) => cm.setCursor(new VimPos(cm.getCursor().line + 1, cm.getCursor().ch)),
    Backspace: (cm) =>
      cm.replaceRange("", cm.posFromIndex(cm.indexFromPos(cm.getCursor()) - 1), cm.getCursor()),
    Delete: (cm) =>
      cm.replaceRange("", cm.getCursor(), cm.posFromIndex(cm.indexFromPos(cm.getCursor()) + 1)),
  };
  static addClass(el: HTMLElement, className: string): void {
    el.classList.add(className);
  }
  static rmClass(el: HTMLElement, className: string): void {
    el.classList.remove(className);
  }
  static e_preventDefault(event: Event): void {
    event.preventDefault();
  }
  static e_stop(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }
  static lookupKey(key: string, _map: string, handle: Function): void {
    const command = VimProseMirror.keys[key.replace(/^Arrow/, "")];
    if (command) handle(command);
  }
  static on(emitter: VimProseMirror | EventTarget, type: string, callback: VimListener): void {
    if ("addEventListener" in emitter) {
      const listeners = this.domListeners.get(emitter) ?? new Map<VimListener, EventListener>();
      const handler: EventListener = (event) => callback(event);
      listeners.set(callback, handler);
      this.domListeners.set(emitter, listeners);
      emitter.addEventListener(type, handler);
    } else emitter.on(type, callback);
  }
  static off(emitter: VimProseMirror | EventTarget, type: string, callback: VimListener): void {
    if ("removeEventListener" in emitter) {
      const listeners = this.domListeners.get(emitter);
      const handler = listeners?.get(callback);
      if (handler) emitter.removeEventListener(type, handler);
      listeners?.delete(callback);
    } else emitter.off(type, callback);
  }
  static signal(emitter: VimProseMirror, type: string, ...args: unknown[]): void {
    emitter.signal(type, ...args);
  }
  static findMatchingTag(): undefined {
    return undefined;
  }
  static findEnclosingTag(): undefined {
    return undefined;
  }

  readonly state: CM5EditorInterface["state"] = {};
  readonly marks: CM5EditorInterface["marks"] = {};
  readonly options: CM5EditorInterface["options"] = {};
  readonly _handlers: Record<string, VimListener[]> = {};
  readonly cm6: CM5EditorInterface["cm6"] = undefined;
  $mid = 0;
  curOp: CM5EditorInterface["curOp"] = null;
  $lastChangeEndOffset = 0;
  $lineHandleChanges: { from: number; to: number; inserted: number }[] | undefined;
  virtualSelection: CM5RangeInterface[] | null = null;
  private primarySelection = 0;
  private overlay: RegExp | null = null;
  private readonly searchDecorations: (query: RegExp | null) => void;
  private cachedDoc: ProseMirrorNode | null = null;
  private cachedText = "";
  private cachedOffsets: number[] = [0];

  constructor(
    readonly editor: import("@tiptap/core").Editor,
    searchDecorations: (query: RegExp | null) => void = () => {},
  ) {
    this.searchDecorations = searchDecorations;
  }

  private get view(): EditorView {
    return this.editor.view;
  }
  private get text(): string {
    this.updateTextCache();
    return this.cachedText;
  }
  private get offsets(): number[] {
    this.updateTextCache();
    return this.cachedOffsets;
  }
  private updateTextCache(): void {
    const doc = this.view.state.doc;
    if (doc === this.cachedDoc) return;
    this.cachedDoc = doc;
    this.cachedText = serializeEditorDoc(doc).value;
    this.cachedOffsets = [0];
    for (
      let index = this.cachedText.indexOf("\n");
      index >= 0;
      index = this.cachedText.indexOf("\n", index + 1)
    ) {
      this.cachedOffsets.push(index + 1);
    }
  }
  indexFromPos(pos: Pos): number {
    const starts = this.offsets;
    const line = Math.max(0, Math.min(pos.line, starts.length - 1));
    const start = starts[line]!;
    const end = line + 1 < starts.length ? starts[line + 1]! - 1 : this.text.length;
    return pos.line >= starts.length ? end : Math.max(start, Math.min(start + pos.ch, end));
  }
  posFromIndex(offset: number): Pos {
    const starts = this.offsets;
    const bounded = Math.max(0, Math.min(offset, this.text.length));
    const line = starts.findLastIndex((start) => start <= bounded);
    return new VimPos(line, bounded - starts[line]!);
  }
  firstLine(): number {
    return 0;
  }
  lastLine(): number {
    return this.offsets.length - 1;
  }
  lineCount(): number {
    return this.offsets.length;
  }
  getLine(row: number): string {
    const start = this.offsets[row];
    if (start === undefined) return "";
    return this.text.slice(
      start,
      row + 1 < this.offsets.length ? this.offsets[row + 1]! - 1 : undefined,
    );
  }
  getLineHandle(row: number): { row: number; index: number } {
    this.$lineHandleChanges ??= [];
    return { row, index: this.indexFromPos(new VimPos(row, 0)) };
  }
  getLineNumber(handle: { index: number }): number | null {
    if (!this.$lineHandleChanges) return null;
    let offset = handle.index;
    for (const change of this.$lineHandleChanges) {
      if (offset > change.from && offset < change.to) return null;
      if (offset >= change.to) offset += change.inserted - (change.to - change.from);
    }
    const pos = this.posFromIndex(offset);
    return pos.ch === 0 ? pos.line : null;
  }
  releaseLineHandles(): void {
    this.$lineHandleChanges = undefined;
  }
  setCursor(line: number, ch: number): void;
  setCursor(pos: Pos): void;
  setCursor(line: number | Pos, ch?: number): void {
    this.virtualSelection = null;
    const offset = this.indexFromPos(typeof line === "number" ? new VimPos(line, ch ?? 0) : line);
    const map = serializeEditorDoc(this.view.state.doc);
    this.view.dispatch(
      this.view.state.tr
        .setSelection(TextSelection.create(this.view.state.doc, flatToPm(map, offset)))
        .scrollIntoView(),
    );
  }
  getCursor(where: "head" | "anchor" | "start" | "end" = "head"): Pos {
    const virtual = this.virtualSelection?.[this.primarySelection];
    if (virtual) {
      if (where === "anchor" || where === "head") return virtual[where];
      const anchor = this.indexFromPos(virtual.anchor);
      const head = this.indexFromPos(virtual.head);
      return this.posFromIndex(where === "start" ? Math.min(anchor, head) : Math.max(anchor, head));
    }
    const selection = this.view.state.selection;
    const pm =
      where === "start"
        ? selection.from
        : where === "end"
          ? selection.to
          : where === "anchor"
            ? selection.anchor
            : selection.head;
    return this.posFromIndex(pmToFlat(serializeEditorDoc(this.view.state.doc), pm));
  }
  listSelections(): CM5RangeInterface[] {
    return (
      this.virtualSelection ?? [{ anchor: this.getCursor("anchor"), head: this.getCursor("head") }]
    );
  }
  setSelections(ranges: CM5RangeInterface[], primIndex = 0): void {
    const range = ranges[primIndex];
    if (range) {
      this.setSelection(range.anchor, range.head);
      this.virtualSelection = ranges.length > 1 ? ranges : null;
      this.primarySelection = primIndex;
    }
  }
  setSelection(anchor: Pos, head: Pos): void {
    this.virtualSelection = null;
    const map = serializeEditorDoc(this.view.state.doc);
    this.view.dispatch(
      this.view.state.tr
        .setSelection(
          TextSelection.create(
            this.view.state.doc,
            flatToPm(map, this.indexFromPos(anchor)),
            flatToPm(map, this.indexFromPos(head)),
          ),
        )
        .scrollIntoView(),
    );
  }
  getRange(start: Pos, end: Pos): string {
    return this.text.slice(this.indexFromPos(start), this.indexFromPos(end));
  }
  getSelection(): string {
    return this.getSelections().join("\n");
  }
  getSelections(): string[] {
    return this.listSelections().map((range) => {
      const start = Math.min(this.indexFromPos(range.anchor), this.indexFromPos(range.head));
      const end = Math.max(this.indexFromPos(range.anchor), this.indexFromPos(range.head));
      return this.text.slice(start, end);
    });
  }
  somethingSelected(): boolean {
    return this.listSelections().some(
      (range) => this.indexFromPos(range.anchor) !== this.indexFromPos(range.head),
    );
  }
  getValue(): string {
    return this.text;
  }
  setValue(text: string): void {
    this.replaceRange(text, new VimPos(0, 0), this.posFromIndex(this.text.length));
    this.setCursor(0, 0);
  }
  replaceRange(text: string, start: Pos, end: Pos = start): void {
    const before = this.text;
    const from = this.indexFromPos(start);
    const to = this.indexFromPos(end);
    if (from > to) return;
    if (!text.includes("\n") && !before.slice(from, to).includes("\n")) {
      const map = serializeEditorDoc(this.view.state.doc);
      this.view.dispatch(
        this.view.state.tr.insertText(text, flatToPm(map, from), flatToPm(map, to)),
      );
    } else {
      const value = before.slice(0, from) + text + before.slice(to);
      const paragraph = this.view.state.schema.nodes.paragraph!;
      const content = value
        .split("\n")
        .map((line) =>
          paragraph.create(null, line ? this.view.state.schema.text(line) : undefined),
        );
      this.view.dispatch(
        this.view.state.tr.replaceWith(0, this.view.state.doc.content.size, content),
      );
    }
  }
  replaceSelection(text: string): void {
    this.replaceRange(text, this.getCursor("start"), this.getCursor("end"));
  }
  replaceSelections(replacements: string[]): void {
    const ranges = this.listSelections().map((range, index) => ({
      from: Math.min(this.indexFromPos(range.anchor), this.indexFromPos(range.head)),
      to: Math.max(this.indexFromPos(range.anchor), this.indexFromPos(range.head)),
      text: replacements[index] ?? "",
    }));
    this.virtualSelection = null;
    for (const range of ranges.sort((a, b) => b.from - a.from)) {
      this.replaceRange(range.text, this.posFromIndex(range.from), this.posFromIndex(range.to));
    }
  }
  getInputField(): HTMLElement {
    return this.view.dom;
  }
  clipPos(pos: Pos): Pos {
    return this.posFromIndex(this.indexFromPos(pos));
  }
  focus(): void {
    this.view.focus();
  }
  blur(): void {
    this.view.dom.blur();
  }
  defaultTextHeight(): number {
    return Number.parseFloat(getComputedStyle(this.view.dom).lineHeight) || 20;
  }
  findMatchingBracket(pos: Pos): { to: Pos | undefined } {
    const text = this.text;
    const offset = this.indexFromPos(pos);
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
    const opening = text[offset];
    const closing = Object.entries(pairs).find(([, close]) => close === opening)?.[0];
    const target = opening && pairs[opening] ? pairs[opening] : closing;
    if (!target) return { to: undefined };
    const direction = closing ? -1 : 1;
    let depth = 0;
    for (let i = offset + direction; i >= 0 && i < text.length; i += direction) {
      if (text[i] === opening) depth++;
      if (text[i] === target && depth-- === 0) return { to: this.posFromIndex(i) };
    }
    return { to: undefined };
  }
  scanForBracket(pos: Pos, dir: 1 | -1): false | { pos: Pos; ch: string } {
    const text = this.text;
    for (let i = this.indexFromPos(pos) + dir; i >= 0 && i < text.length; i += dir) {
      const ch = text[i]!;
      if (/[()[\]{}]/.test(ch)) return { pos: this.posFromIndex(i), ch };
    }
    return false;
  }
  indentLine(line: number, more?: boolean): void {
    const start = new VimPos(line, 0);
    if (more) this.replaceRange("  ", start);
    else {
      const spaces = this.getLine(line).match(/^ {1,2}/)?.[0];
      if (spaces) this.replaceRange("", start, new VimPos(line, spaces.length));
    }
  }
  indentMore(): void {
    this.indentLine(this.getCursor().line, true);
  }
  indentLess(): void {
    this.indentLine(this.getCursor().line, false);
  }
  execCommand(name: string): void {
    if (name === "goLineLeft") this.setCursor(this.getCursor().line, 0);
    else if (name === "goLineRight")
      this.setCursor(
        this.getCursor().line,
        Math.max(0, this.getLine(this.getCursor().line).length - 1),
      );
    else if (name in VimProseMirror.commands)
      VimProseMirror.commands[name as keyof typeof VimProseMirror.commands]?.(this);
  }
  setBookmark(pos: Pos, options?: { insertLeft: boolean }): VimMark {
    return new VimMark(this, this.indexFromPos(pos), options?.insertLeft ? 1 : -1);
  }
  addOverlay(overlay: { query: RegExp }): { query: RegExp } {
    this.overlay = overlay.query;
    this.searchDecorations(this.overlay);
    return overlay;
  }
  removeOverlay(): void {
    this.overlay = null;
    this.searchDecorations(null);
  }
  getSearchCursor(query: RegExp, pos: Pos): ReturnType<CM5EditorInterface["getSearchCursor"]> {
    let match: RegExpExecArray | null = null;
    let from: Pos | undefined;
    let to: Pos | undefined;
    const find = (back = false): string[] | null => {
      const expression = new RegExp(
        query.source,
        query.flags.includes("g") ? query.flags : query.flags + "g",
      );
      const text = this.text;
      const offset = match ? this.indexFromPos(back ? from! : to!) : this.indexFromPos(pos);
      const matches = Array.from(text.matchAll(expression)).filter((candidate) =>
        back ? candidate.index < offset : candidate.index >= offset,
      );
      match = (back ? matches.at(-1) : matches[0]) ?? null;
      if (!match) return null;
      from = this.posFromIndex(match.index);
      to = this.posFromIndex(match.index + match[0].length);
      return Array.from(match);
    };
    return {
      find,
      findNext: () => find(),
      findPrevious: () => find(true),
      from: () => from,
      to: () => to,
      replace: (text: string) => {
        if (from && to) this.replaceRange(text, from, to);
      },
      get match() {
        return match ? Array.from(match) : null;
      },
    };
  }
  findPosV(start: Pos, amount: number, unit: "page" | "line", goalColumn?: number): VimPosition {
    const startCoords = this.charCoords(start);
    const lineHeight = startCoords.bottom - startCoords.top || this.defaultTextHeight();
    const steps =
      Math.abs(amount) *
      (unit === "page"
        ? Math.max(1, Math.floor(this.getScrollInfo().clientHeight / lineHeight))
        : 1);
    const direction = Math.sign(amount);
    const left = goalColumn ?? startCoords.left;
    let current = start;
    for (let step = 0; step < steps; step++) {
      const currentTop = this.charCoords(current).top;
      const next = this.clipPos(
        this.coordsChar({ left, top: currentTop + direction * lineHeight + lineHeight / 2 }),
      );
      if (direction * (this.charCoords(next).top - currentTop) < lineHeight / 2) {
        return { ...current, hitSide: true };
      }
      current = next;
    }
    return { ...current, hitSide: false };
  }
  charCoords(pos: Pos): { left: number; top: number; bottom: number } {
    const pm = flatToPm(serializeEditorDoc(this.view.state.doc), this.indexFromPos(pos));
    const coords = this.view.coordsAtPos(pm);
    const parent = this.view.dom.getBoundingClientRect();
    return {
      left: coords.left - parent.left,
      top: coords.top - parent.top,
      bottom: coords.bottom - parent.top,
    };
  }
  coordsChar(coords: { left: number; top: number }): Pos {
    const parent = this.view.dom.getBoundingClientRect();
    const pm = this.view.posAtCoords({
      left: coords.left + parent.left,
      top: coords.top + parent.top,
    });
    return this.posFromIndex(pmToFlat(serializeEditorDoc(this.view.state.doc), pm?.pos ?? 1));
  }
  getScrollInfo(): {
    left: number;
    top: number;
    height: number;
    width: number;
    clientHeight: number;
    clientWidth: number;
  } {
    const element = this.view.dom;
    return {
      left: element.scrollLeft,
      top: element.scrollTop,
      height: element.scrollHeight,
      width: element.scrollWidth,
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
    };
  }
  scrollTo(x?: number | null, y?: number | null): void {
    if (x != null) this.view.dom.scrollLeft = x;
    if (y != null) this.view.dom.scrollTop = y;
  }
  scrollIntoView(pos?: Pos): void {
    const pm = pos
      ? flatToPm(serializeEditorDoc(this.view.state.doc), this.indexFromPos(pos))
      : undefined;
    this.view.dispatch(
      this.view.state.tr
        .setSelection(
          pm === undefined
            ? this.view.state.selection
            : TextSelection.create(this.view.state.doc, pm),
        )
        .scrollIntoView(),
    );
  }
  getWrapperElement(): HTMLElement {
    return this.view.dom;
  }
  getMode(): { name: string } {
    return { name: "text" };
  }
  setSize(width: number, height: number): void {
    this.view.dom.style.width = `${width}px`;
    this.view.dom.style.height = `${height}px`;
  }
  refresh(): void {
    this.view.updateState(this.view.state);
  }
  destroy(): void {
    this.removeOverlay();
  }
  getLastEditEnd(): Pos {
    return this.posFromIndex(this.$lastChangeEndOffset);
  }
  onChange(previousDoc?: ProseMirrorNode): void {
    if (!previousDoc) return;
    const before = serializeEditorDoc(previousDoc).value;
    const after = this.text;
    let from = 0;
    while (from < before.length && from < after.length && before[from] === after[from]) from++;
    let suffix = 0;
    while (
      suffix < before.length - from &&
      suffix < after.length - from &&
      before[before.length - suffix - 1] === after[after.length - suffix - 1]
    )
      suffix++;
    const to = before.length - suffix;
    const inserted = after.slice(from, after.length - suffix);
    this.$lastChangeEndOffset = from + inserted.length;
    const change = { from, to, inserted: inserted.length };
    for (const mark of Object.values(this.marks)) mark.update(change);
    this.$lineHandleChanges?.push(change);
    this.signal("change", this, { text: inserted.split("\n") });
  }
  onSelectionChange(): void {
    const range = this.virtualSelection?.[this.primarySelection];
    if (range) {
      const map = serializeEditorDoc(this.view.state.doc);
      const selection = this.view.state.selection;
      if (
        pmToFlat(map, selection.anchor) !== this.indexFromPos(range.anchor) ||
        pmToFlat(map, selection.head) !== this.indexFromPos(range.head)
      ) {
        this.virtualSelection = null;
      }
    }
    this.signal("cursorActivity", this);
  }
  operation<T>(fn: () => T): T {
    this.curOp ??= { $d: 0 };
    this.curOp.$d++;
    try {
      return fn();
    } finally {
      if (this.curOp && --this.curOp.$d === 0) this.onBeforeEndOperation();
    }
  }
  onBeforeEndOperation(): void {
    if (this.curOp?.cursorActivity) this.signal("cursorActivity", this);
    this.curOp = null;
  }
  moveH(increment: number, _unit: string): void {
    this.setCursor(this.posFromIndex(this.indexFromPos(this.getCursor()) + increment));
  }
  setOption(name: string, val: string | number | boolean): void {
    this.options[name] = val;
  }
  getOption(name: "firstLineNumber" | "tabSize" | "textwidth"): number;
  getOption(name: string): number | boolean | string | undefined;
  getOption(name: string): number | boolean | string | undefined {
    if (name === "firstLineNumber") return 1;
    if (name === "tabSize" || name === "indentUnit") return 2;
    if (name === "readOnly") return !this.editor.isEditable;
    if (name === "keyMap") return "vim";
    return this.options[name];
  }
  toggleOverwrite(on: boolean): void {
    this.state.overwrite = on;
  }
  getTokenTypeAt(): "" {
    return "";
  }
  overWriteSelection(text: string): void {
    const from = this.indexFromPos(this.getCursor("start"));
    const to = this.indexFromPos(this.getCursor("end"));
    this.replaceRange(
      text,
      this.posFromIndex(from),
      this.posFromIndex(from === to && this.text[from] !== "\n" ? from + 1 : to),
    );
    this.setCursor(this.posFromIndex(from + text.length));
  }
  isInMultiSelectMode(): boolean {
    return this.virtualSelection !== null && this.virtualSelection.length > 1;
  }
  virtualSelectionMode(): boolean {
    return this.virtualSelection !== null;
  }
  forEachSelection(command: () => void): void {
    const ranges = this.listSelections();
    const updated: CM5RangeInterface[] = [];
    for (const range of ranges) {
      this.setSelection(range.anchor, range.head);
      command();
      updated.push({ anchor: this.getCursor("anchor"), head: this.getCursor("head") });
    }
    this.setSelections(updated);
  }
  hardWrap(options: { from: number; to: number; column?: number }): number {
    const width = options.column ?? this.getOption("textwidth") ?? 80;
    let lastLine = Math.max(options.from, options.to);
    let line = Math.min(options.from, options.to);
    while (line <= lastLine) {
      const text = this.getLine(line);
      if (text.length > width) {
        const breakAt = text.lastIndexOf(" ", width);
        const position = breakAt > 0 ? breakAt : text.indexOf(" ", width);
        if (position > 0) {
          this.replaceRange("\n", new VimPos(line, position), new VimPos(line, position + 1));
          lastLine++;
        }
      }
      line++;
    }
    return line;
  }
  foldCode(): void {}
  openDialog(
    template: Element,
    callback: ((value: string) => void) | undefined,
    options: {
      value?: string;
      onClose?: (dialog: HTMLElement) => void;
      onKeyDown?: (event: KeyboardEvent, value: string, close: (value?: string) => void) => boolean;
      onKeyUp?: (event: KeyboardEvent, value: string, close: (value?: string) => void) => void;
      onInput?: (event: Event, value: string, close: (value?: string) => void) => void;
      closeOnEnter?: boolean;
      closeOnBlur?: boolean;
    } = {},
  ): (value?: string) => void {
    const container = document.createElement("div");
    container.className = "composer-vim-dialog";
    container.append(template);
    this.state.dialog?.remove();
    this.state.dialog = container;
    this.view.dom.after(container);
    const input = container.querySelector("input");
    if (input && options.value) input.value = options.value;
    let closed = false;
    const close = (value?: string): void => {
      if (typeof value === "string") {
        if (input) input.value = value;
        return;
      }
      if (closed) return;
      closed = true;
      container.remove();
      if (this.state.dialog === container) this.state.dialog = null;
      options.onClose?.(container);
      this.focus();
    };
    input?.addEventListener("keydown", (event) => {
      if (options.onKeyDown?.(event, input.value, close)) return;
      if (event.key === "Enter") callback?.(input.value);
      if (event.key === "Escape" || (event.key === "Enter" && options.closeOnEnter !== false)) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
    input?.addEventListener("keyup", (event) => options.onKeyUp?.(event, input.value, close));
    input?.addEventListener("input", (event) => options.onInput?.(event, input.value, close));
    if (options.closeOnBlur !== false)
      input?.addEventListener("blur", () =>
        queueMicrotask(() => {
          if (document.activeElement !== input) close();
        }),
      );
    input?.focus();
    return close;
  }
  openNotification(template: Node, options: { duration?: number } = {}): () => void {
    const container = document.createElement("div");
    container.className = "composer-vim-notification";
    container.append(template);
    this.view.dom.after(container);
    const duration = options.duration ?? 5000;
    const timer = duration ? window.setTimeout(() => container.remove(), duration) : null;
    const close = (): void => {
      if (timer !== null) window.clearTimeout(timer);
      container.remove();
    };
    container.addEventListener("click", close, { once: true });
    return close;
  }
  on(type: string, listener: VimListener): void {
    (this._handlers[type] ??= []).push(listener);
  }
  off(type: string, listener: VimListener): void {
    this._handlers[type] = this._handlers[type]?.filter((existing) => existing !== listener) ?? [];
  }
  signal(type: string, ...args: unknown[]): void {
    for (const listener of this._handlers[type] ?? []) listener(...args);
  }
}

const Vim = initVim(VimProseMirror);

type ComposerVimController = {
  handleKeyDown: (event: KeyboardEvent) => boolean;
  setClipboardEnabled: (enabled: boolean) => void;
  isInsertMode: () => boolean;
};
const composerVimKey = new PluginKey<ComposerVimController>("composerVim");

export function handleComposerVimKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  return composerVimKey.getState(view.state)?.handleKeyDown(event) ?? false;
}

export function setComposerVimClipboard(view: EditorView, enabled: boolean): void {
  composerVimKey.getState(view.state)?.setClipboardEnabled(enabled);
}

export function isComposerVimInsertMode(view: EditorView): boolean {
  return composerVimKey.getState(view.state)?.isInsertMode() ?? true;
}

/** Replit's Vim engine running against the composer's literal markdown Tiptap document. */
export const ComposerVimExtension = Extension.create({
  name: "composerVim",
  addOptions() {
    return { onModeChange: (_mode: string): void => {} };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const onModeChange = this.options.onModeChange;
    let clipboardEnabled = false;
    let cm: VimProseMirror | null = null;
    let mode = "normal";
    let search: RegExp | null = null;
    const decorations = (state: EditorState): DecorationSet => {
      const map = serializeEditorDoc(state.doc);
      const pos = state.selection.head;
      const char = map.value[pmToFlat(map, pos)];
      const marks: Decoration[] = [];
      if (mode !== "insert") {
        if (char && char !== "\n" && pos + 1 <= state.doc.content.size)
          marks.push(Decoration.inline(pos, pos + 1, { class: "composer-vim-block-cursor" }));
        else
          marks.push(
            Decoration.widget(pos, () => {
              const span = document.createElement("span");
              span.className = "composer-vim-block-cursor";
              span.textContent = "\u00a0";
              return span;
            }),
          );
      }
      if (cm?.state.vim?.visualMode && cm.isInMultiSelectMode()) {
        for (const range of cm.listSelections()) {
          const from = cm.indexFromPos(range.anchor);
          const to = cm.indexFromPos(range.head);
          if (from !== to) {
            marks.push(
              Decoration.inline(
                flatToPm(map, Math.min(from, to)),
                flatToPm(map, Math.max(from, to)),
                { class: "composer-vim-selection" },
              ),
            );
          }
        }
      }
      if (search) {
        const matches = map.value.matchAll(
          new RegExp(search.source, search.flags.includes("g") ? search.flags : search.flags + "g"),
        );
        for (const match of matches)
          if (match[0].length)
            marks.push(
              Decoration.inline(
                flatToPm(map, match.index),
                flatToPm(map, match.index + match[0].length),
                { class: "composer-vim-search-match" },
              ),
            );
      }
      return DecorationSet.create(state.doc, marks);
    };
    return [
      new Plugin<ComposerVimController>({
        key: composerVimKey,
        state: {
          init: () => ({
            setClipboardEnabled: (enabled) => {
              clipboardEnabled = enabled;
            },
            isInsertMode: () => cm?.state.vim?.insertMode ?? false,
            handleKeyDown: (event) => {
              if (!cm || !cm.state.vim || event.isComposing || event.keyCode === 229) return false;
              if (!cm.editor.isEditable) return false;
              if (
                event.key === "Enter" &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                !cm.state.vim.insertMode
              ) {
                event.preventDefault();
                return true;
              }
              const key = Vim.vimKeyFromEvent(event, cm.state.vim);
              if (!key) return false;
              if (
                (key === "p" || key === "P") &&
                clipboardEnabled &&
                navigator.clipboard?.readText &&
                !cm.state.vim.insertMode
              ) {
                const current = cm;
                const state = editor.view.state;
                const stillCurrent = (): boolean =>
                  cm === current &&
                  !current.state.vim?.insertMode &&
                  editor.view.hasFocus() &&
                  editor.view.state.doc === state.doc &&
                  editor.view.state.selection.eq(state.selection);
                void navigator.clipboard.readText().then(
                  (text) => {
                    if (stillCurrent()) {
                      if (text) {
                        Vim.getRegisterController().unnamedRegister.setText(
                          text,
                          text.endsWith("\n"),
                          false,
                        );
                      }
                      Vim.handleKey(current, key, "user");
                    }
                  },
                  () => {
                    if (stillCurrent()) Vim.handleKey(current, key, "user");
                  },
                );
                event.preventDefault();
                return true;
              }
              const before = Vim.getRegisterController().unnamedRegister.toString();
              const beforeLines = cm.lineCount();
              const deletingLastLine = cm.getCursor().line === cm.lastLine() && beforeLines > 1;
              let handled = Vim.multiSelectHandleKey(cm, key, "user");
              if (!handled && cm.state.vim.insertMode && cm.state.overwrite) {
                if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                  cm.overWriteSelection(event.key);
                  handled = true;
                } else if (event.key === "Backspace") {
                  cm.moveH(-1, "char");
                  handled = true;
                }
              }
              const controller = Vim.getRegisterController();
              const deleted = controller.unnamedRegister.toString();
              // Deleting the final line captures its preceding separator. Vim's
              // register needs that newline at the end for linewise paste.
              if (
                deletingLastLine &&
                cm.lineCount() < beforeLines &&
                controller.unnamedRegister.linewise &&
                deleted.startsWith("\n")
              ) {
                for (const register of Object.values(controller.registers)) {
                  if (register.linewise && register.toString() === deleted) {
                    register.setText(deleted.slice(1), true, register.blockwise);
                  }
                }
              }
              const after = controller.unnamedRegister.toString();
              if (clipboardEnabled && after && after !== before && navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(after).catch(() => {});
              }
              const nextMode = cm.state.overwrite
                ? "replace"
                : cm.state.vim.insertMode
                  ? "insert"
                  : cm.state.vim.visualBlock
                    ? "visual block"
                    : cm.state.vim.visualLine
                      ? "visual line"
                      : cm.state.vim.visualMode
                        ? "visual"
                        : "normal";
              if (nextMode !== mode) {
                mode = nextMode;
                onModeChange(nextMode);
              }
              if (handled) {
                event.preventDefault();
                event.stopPropagation();
                editor.view.dispatch(editor.view.state.tr);
              }
              if (
                !handled &&
                !cm.state.vim.insertMode &&
                event.key.length === 1 &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey
              ) {
                event.preventDefault();
                return true;
              }
              return !!handled;
            },
          }),
          apply: (_tr, controller) => controller,
        },
        props: {
          decorations,
          attributes: () => ({
            class: mode === "insert" ? "" : "composer-vim-normal",
            "data-vim-mode": mode,
          }),
          handleTextInput: () => !(cm?.state.vim?.insertMode ?? true),
        },
        view: (view) => {
          cm = new VimProseMirror(editor, (query) => {
            search = query;
            view.dispatch(view.state.tr);
          });
          Vim.enterVimMode(cm);
          return {
            update: (updated, previous) => {
              if (!cm) return;
              if (updated.state.doc !== previous.doc) cm.onChange(previous.doc);
              if (!updated.state.selection.eq(previous.selection)) cm.onSelectionChange();
            },
            destroy: () => {
              if (cm) Vim.leaveVimMode(cm);
              cm = null;
            },
          };
        },
      }),
    ];
  },
});
