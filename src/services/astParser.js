/**
 * AST Parser Service for Weavr
 * Handles parsing plain JS data files (src/data/*.js) containing named exports
 * and serializing modified objects back into formatted JavaScript code.
 */

export function parseJsNamedExports(codeContent) {
  try {
    const exports = {};
    // Extract export const <name> = <json/object>;
    const regex = /export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*([\s\S]*?);(?=\s*(?:export|$))/g;
    let match;
    while ((match = regex.exec(codeContent)) !== null) {
      const name = match[1];
      const rawVal = match[2].trim();
      try {
        // Evaluates plain object literals safely
        // eslint-disable-next-line no-eval
        exports[name] = eval(`(${rawVal})`);
      } catch (err) {
        console.warn(`[astParser] Could not eval export ${name}:`, err);
        exports[name] = rawVal;
      }
    }
    return exports;
  } catch (error) {
    console.error('[astParser] Failed to parse JS exports:', error);
    return {};
  }
}

export function serializeJsNamedExport(exportName, dataObject, commentHeader = "") {
  const formattedJson = JSON.stringify(dataObject, null, 2);
  const header = commentHeader ? `// ${commentHeader}\n\n` : "";
  return `${header}export const ${exportName} = ${formattedJson};\n`;
}
