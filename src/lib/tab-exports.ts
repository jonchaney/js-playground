import * as acorn from "acorn";

type AstNode = {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
};

export type TabLib = {
  name: string;
  code: string;
};

export type ExtractedExport = {
  name: string;
  code: string;
};

function isFunctionInit(node: AstNode | null | undefined): boolean {
  return (
    !!node &&
    (node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression")
  );
}

/** Top-level function / class / function-valued bindings from a tab. */
export function extractTabExports(source: string): ExtractedExport[] {
  let ast: AstNode;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: "latest",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    }) as unknown as AstNode;
  } catch {
    return [];
  }

  const out: ExtractedExport[] = [];
  const body = (ast.body as AstNode[]) || [];

  for (const stmt of body) {
    if (
      (stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") &&
      stmt.id
    ) {
      const id = stmt.id as AstNode;
      out.push({
        name: id.name as string,
        code: source.slice(stmt.start, stmt.end),
      });
      continue;
    }

    if (stmt.type !== "VariableDeclaration") continue;
    const kind = stmt.kind as string;
    for (const d of stmt.declarations as AstNode[]) {
      const id = d.id as AstNode;
      if (id?.type !== "Identifier" || !isFunctionInit(d.init as AstNode)) {
        continue;
      }
      out.push({
        name: id.name as string,
        code: `${kind} ${source.slice(d.start, d.end)}`,
      });
    }
  }

  return out;
}

function uniqueTabKey(name: string, seen: Map<string, number>): string {
  const base = name.trim() || "Untitled";
  const n = seen.get(base) || 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base} (${n + 1})`;
}

/**
 * Prelude that defines other tabs' exports in scope and a `tabs` map:
 *   tabs["Valid Anagram"].validAnagram("a", "a")
 * Bare names are also available (later tabs overwrite earlier ones).
 */
export function buildCrossTabPrelude(libs: TabLib[]): string {
  if (!libs.length) return "";

  const seenNames = new Map<string, number>();
  const blocks: string[] = [];
  const bareAssigns: string[] = [];

  for (const lib of libs) {
    const exports = extractTabExports(lib.code);
    if (!exports.length) continue;

    const key = uniqueTabKey(lib.name, seenNames);
    const keyLit = JSON.stringify(key);
    const decls = exports.map((e) => e.code).join("\n  ");
    const props = exports
      .map((e) => `${JSON.stringify(e.name)}: ${e.name}`)
      .join(", ");

    blocks.push(
      `tabs[${keyLit}] = (() => {\n  ${decls}\n  return { ${props} };\n})();`
    );

    for (const exp of exports) {
      // Don't clobber the tabs map (or runner locals) with a bare binding.
      if (exp.name === "tabs" || exp.name === "console" || exp.name === "__pg") {
        continue;
      }
      bareAssigns.push(
        `var ${exp.name} = tabs[${keyLit}][${JSON.stringify(exp.name)}];`
      );
    }
  }

  if (!blocks.length) return "";

  return (
    `// Cross-tab imports\n` +
    `var tabs = Object.create(null);\n` +
    `${blocks.join("\n")}\n` +
    `${bareAssigns.join("\n")}\n`
  );
}
