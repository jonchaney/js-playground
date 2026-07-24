import type CodeMirror from "codemirror";

type Editor = CodeMirror.Editor;

/** Move the selected line(s) up (-1) or down (+1). */
export function moveLines(editor: Editor, offset: 1 | -1): void {
  if (offset !== 1 && offset !== -1) return;

  const selections = editor.listSelections();
  const collapsed =
    selections.length === 1 &&
    selections[0].anchor.line === selections[0].head.line &&
    selections[0].anchor.ch === selections[0].head.ch;
  const cursorCh = collapsed ? selections[0].head.ch : 0;

  let startLine = Infinity;
  let endLine = -Infinity;
  for (const sel of selections) {
    const from = Math.min(sel.anchor.line, sel.head.line);
    let to = Math.max(sel.anchor.line, sel.head.line);
    const endPos = sel.anchor.line > sel.head.line ? sel.anchor : sel.head;
    if (from !== to && endPos.ch === 0) to -= 1;
    startLine = Math.min(startLine, from);
    endLine = Math.max(endLine, to);
  }

  if (offset < 0 && startLine === 0) return;
  if (offset > 0 && endLine >= editor.lastLine()) return;

  editor.operation(() => {
    if (offset < 0) {
      const block = editor.getRange(
        { line: startLine, ch: 0 },
        { line: endLine, ch: editor.getLine(endLine).length }
      );
      const above = editor.getLine(startLine - 1);
      editor.replaceRange(
        block + "\n" + above,
        { line: startLine - 1, ch: 0 },
        { line: endLine, ch: editor.getLine(endLine).length }
      );
      if (collapsed) {
        const line = startLine - 1;
        editor.setCursor({
          line,
          ch: Math.min(cursorCh, editor.getLine(line).length),
        });
      } else {
        editor.setSelection(
          { line: startLine - 1, ch: 0 },
          { line: endLine - 1, ch: editor.getLine(endLine - 1).length }
        );
      }
    } else {
      const block = editor.getRange(
        { line: startLine, ch: 0 },
        { line: endLine, ch: editor.getLine(endLine).length }
      );
      const below = editor.getLine(endLine + 1);
      editor.replaceRange(
        below + "\n" + block,
        { line: startLine, ch: 0 },
        { line: endLine + 1, ch: editor.getLine(endLine + 1).length }
      );
      if (collapsed) {
        const line = startLine + 1;
        editor.setCursor({
          line,
          ch: Math.min(cursorCh, editor.getLine(line).length),
        });
      } else {
        editor.setSelection(
          { line: startLine + 1, ch: 0 },
          { line: endLine + 1, ch: editor.getLine(endLine + 1).length }
        );
      }
    }
  });
}

/** Duplicate the selected line(s) below the selection. */
export function duplicateLines(editor: Editor): void {
  const selections = editor.listSelections();
  const collapsed =
    selections.length === 1 &&
    selections[0].anchor.line === selections[0].head.line &&
    selections[0].anchor.ch === selections[0].head.ch;
  const cursorCh = collapsed ? selections[0].head.ch : 0;

  let startLine = Infinity;
  let endLine = -Infinity;
  for (const sel of selections) {
    const from = Math.min(sel.anchor.line, sel.head.line);
    let to = Math.max(sel.anchor.line, sel.head.line);
    const endPos = sel.anchor.line > sel.head.line ? sel.anchor : sel.head;
    if (from !== to && endPos.ch === 0) to -= 1;
    startLine = Math.min(startLine, from);
    endLine = Math.max(endLine, to);
  }

  const block = editor.getRange(
    { line: startLine, ch: 0 },
    { line: endLine, ch: editor.getLine(endLine).length }
  );
  const lineCount = endLine - startLine + 1;

  editor.operation(() => {
    editor.replaceRange(
      "\n" + block,
      { line: endLine, ch: editor.getLine(endLine).length }
    );
    if (collapsed) {
      const line = startLine + lineCount;
      editor.setCursor({
        line,
        ch: Math.min(cursorCh, editor.getLine(line).length),
      });
    } else {
      editor.setSelection(
        { line: startLine + lineCount, ch: 0 },
        {
          line: endLine + lineCount,
          ch: editor.getLine(endLine + lineCount).length,
        }
      );
    }
  });
}
