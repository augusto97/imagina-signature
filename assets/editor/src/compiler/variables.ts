// Variable interpolation: replaces `{{name}}` placeholders with values
// from a variables map. Unknown placeholders are left intact so authors
// can spot missing variables in preview.

export function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
  });
}
