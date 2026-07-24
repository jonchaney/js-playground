import prettier from "prettier/standalone";
import * as prettierPluginBabel from "prettier/plugins/babel";
import * as prettierPluginEstree from "prettier/plugins/estree";

export async function formatSource(
  source: string,
  cursorOffset: number
): Promise<{ formatted: string; cursorOffset: number }> {
  return prettier.formatWithCursor(source, {
    cursorOffset,
    parser: "babel",
    plugins: [prettierPluginBabel, prettierPluginEstree],
    semi: true,
    singleQuote: false,
    trailingComma: "es5",
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    arrowParens: "always",
    bracketSpacing: true,
  });
}
