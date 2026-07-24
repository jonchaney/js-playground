import * as acorn from "acorn";

type AstNode = {
  type: string;
  start: number;
  end: number;
  loc?: { start?: { line?: number } };
  [key: string]: unknown;
};

function addPatternNames(node: AstNode | null | undefined, names: Set<string>): void {
  if (!node) return;
  if (node.type === "Identifier") names.add(node.name as string);
  else if (node.type === "ObjectPattern") {
    for (const prop of node.properties as AstNode[]) {
      if (prop.type === "RestElement") {
        addPatternNames(prop.argument as AstNode, names);
      } else {
        addPatternNames((prop.value || prop.key) as AstNode, names);
      }
    }
  } else if (node.type === "ArrayPattern") {
    for (const el of node.elements as (AstNode | null)[]) {
      if (el) addPatternNames(el, names);
    }
  } else if (node.type === "AssignmentPattern") {
    addPatternNames(node.left as AstNode, names);
  } else if (node.type === "RestElement") {
    addPatternNames(node.argument as AstNode, names);
  }
}

function collectBindings(ancestors: AstNode[], debuggerStart: number): string[] {
  const names = new Set<string>();
  for (const node of ancestors) {
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      for (const p of node.params as AstNode[]) addPatternNames(p, names);
      if (node.id) names.add((node.id as AstNode).name as string);
    }
    if (node.type === "CatchClause" && node.param) {
      addPatternNames(node.param as AstNode, names);
    }
    if (node.type === "Program" || node.type === "BlockStatement") {
      for (const stmt of node.body as AstNode[]) {
        if (stmt.start >= debuggerStart) continue;
        if (stmt.type === "VariableDeclaration") {
          for (const d of stmt.declarations as AstNode[]) {
            addPatternNames(d.id as AstNode, names);
          }
        } else if (stmt.type === "FunctionDeclaration" && stmt.id) {
          names.add((stmt.id as AstNode).name as string);
        } else if (stmt.type === "ClassDeclaration" && stmt.id) {
          names.add((stmt.id as AstNode).name as string);
        }
      }
    }
    const init = node.init as AstNode | undefined;
    if (node.type === "ForStatement" && init?.type === "VariableDeclaration") {
      if (init.start < debuggerStart) {
        for (const d of init.declarations as AstNode[]) {
          addPatternNames(d.id as AstNode, names);
        }
      }
    }
    const left = node.left as AstNode | undefined;
    if (
      (node.type === "ForOfStatement" || node.type === "ForInStatement") &&
      left?.type === "VariableDeclaration"
    ) {
      if (left.start < debuggerStart) {
        for (const d of left.declarations as AstNode[]) {
          addPatternNames(d.id as AstNode, names);
        }
      }
    }
  }
  return [...names].filter((n) => !["arguments", "eval", "undefined"].includes(n));
}

function walk(
  node: AstNode | null | undefined,
  ancestors: AstNode[],
  visit: (node: AstNode, ancestors: AstNode[]) => void
): void {
  if (!node || typeof node.type !== "string") return;
  visit(node, ancestors);
  const next = ancestors.concat(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child as AstNode, next, visit);
    } else if (value && typeof (value as AstNode).type === "string") {
      walk(value as AstNode, next, visit);
    }
  }
}

function methodAsyncInsertAt(parent: AstNode, source: string): number {
  // Insert before key, after `static`, and before `*` for generators.
  const key = parent.key as AstNode;
  const ahead = source.slice(parent.start, key.start);
  const star = ahead.lastIndexOf("*");
  if (star >= 0) return parent.start + star;
  return key.start;
}

export type InstrumentResult = {
  code: string;
  count: number;
  parseError?: boolean;
};

export function instrumentDebuggers(source: string): InstrumentResult {
  let ast: AstNode;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: "latest",
      locations: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    }) as unknown as AstNode;
  } catch {
    return { code: source, count: 0, parseError: true };
  }

  const debuggerNodes: { node: AstNode; ancestors: AstNode[] }[] = [];
  const functionsToAsync = new Map<AstNode, AstNode | null>();

  walk(ast, [], (node, ancestors) => {
    if (node.type !== "DebuggerStatement") return;

    let enclosing: { fn: AstNode; parent: AstNode | null } | null = null;
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const a = ancestors[i];
      if (
        a.type === "FunctionDeclaration" ||
        a.type === "FunctionExpression" ||
        a.type === "ArrowFunctionExpression"
      ) {
        enclosing = {
          fn: a,
          parent: i > 0 ? ancestors[i - 1] : null,
        };
        break;
      }
    }

    // Getters/setters cannot be async — leave `debugger` alone.
    const kind = enclosing?.parent?.kind;
    if (kind === "get" || kind === "set") return;

    debuggerNodes.push({ node, ancestors });
    if (enclosing && !enclosing.fn.async) {
      functionsToAsync.set(enclosing.fn, enclosing.parent);
    }
  });

  if (!debuggerNodes.length) return { code: source, count: 0 };

  const edits: { start: number; end: number; text: string }[] = [];

  for (const [fn, parent] of functionsToAsync) {
    if (fn.type === "ArrowFunctionExpression") {
      edits.push({ start: fn.start, end: fn.start, text: "async " });
      continue;
    }

    const slice = source.slice(fn.start, fn.start + 20);
    const idx = slice.indexOf("function");
    if (idx >= 0) {
      edits.push({
        start: fn.start + idx,
        end: fn.start + idx,
        text: "async ",
      });
      continue;
    }

    if (
      parent &&
      (parent.type === "MethodDefinition" ||
        (parent.type === "Property" && parent.method))
    ) {
      const insertAt = methodAsyncInsertAt(parent, source);
      edits.push({ start: insertAt, end: insertAt, text: "async " });
    }
  }

  for (const { node, ancestors } of debuggerNodes) {
    const line = node.loc?.start?.line ?? 1;
    const names = collectBindings(ancestors, node.start);
    const scopeLiteral = names.length
      ? `{ ${names.map((n) => `${JSON.stringify(n)}: ${n}`).join(", ")} }`
      : `{}`;
    const replacement = `await __pg.pause({ line: ${line}, scope: ${scopeLiteral}, evalInFrame: (expr) => eval(expr) })`;
    edits.push({ start: node.start, end: node.end, text: replacement });
  }

  edits.sort((a, b) => b.start - a.start);
  let code = source;
  for (const edit of edits) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  }

  return { code, count: debuggerNodes.length };
}
