import type { ScannedFile } from "./repositoryScanner.js";
import { redactPotentialSecrets } from "./secretRedaction.js";

export type SymbolLanguage = "typescript" | "javascript" | "python" | "c" | "cpp" | "csharp" | "java" | "go" | "rust" | "php" | "ruby";
export interface IndexedSymbol {
  name: string;
  kind: "class" | "interface" | "function" | "method" | "type" | "enum" | "constant" | "variable" | "struct" | "trait" | "module";
  path: string;
  line: number;
  language: SymbolLanguage;
  exported?: boolean;
  signature?: string;
}
export interface IndexedReference {
  name: string;
  path: string;
  line: number;
  kind: "import" | "call" | "type-use";
}
export interface SymbolIndex {
  schemaVersion: 1;
  generatedAt: string;
  symbols: IndexedSymbol[];
  references: IndexedReference[];
  unsupportedFiles: string[];
}
const extensions: Record<string, SymbolLanguage> = {
  ".ts":"typescript",".tsx":"typescript",".mts":"typescript",".cts":"typescript",
  ".js":"javascript",".jsx":"javascript",".mjs":"javascript",".cjs":"javascript",
  ".py":"python",".c":"c",".h":"c",".cc":"cpp",".cpp":"cpp",".cxx":"cpp",".hpp":"cpp",".hh":"cpp",
  ".cs":"csharp",".java":"java",".go":"go",".rs":"rust",".php":"php",".rb":"ruby"
};
function pattern(language: SymbolLanguage): RegExp[] {
  const patterns: Partial<Record<SymbolLanguage, RegExp[]>> = {
    typescript: [/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, /^\s*(?:export\s+)?(?:type|enum)\s+([A-Za-z_$][\w$]*)/, /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, /^\s*(?:public|private|protected|static|async|readonly|override|\s)+\s*([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*\{/],
    javascript: [/^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/, /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, /^\s*module\.exports\s*=\s*([A-Za-z_$][\w$]*)/],
    python: [/^\s*class\s+([A-Za-z_]\w*)/, /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, /^\s*([A-Z][A-Z0-9_]*)\s*=/],
    c: [/^\s*(?:typedef\s+)?struct\s+([A-Za-z_]\w*)/, /^\s*(?:enum|union)\s+([A-Za-z_]\w*)/, /^\s*[A-Za-z_*\s]+\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{/],
    cpp: [/^\s*(?:template\s*<.*>\s*)?(?:class|struct)\s+([A-Za-z_]\w*)/, /^\s*enum(?:\s+class)?\s+([A-Za-z_]\w*)/, /^\s*[A-Za-z_:<>*&\s]+\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:const\s*)?\{/],
    csharp: [/^\s*(?:public|internal|private|protected|\s)*(?:abstract\s+|static\s+|sealed\s+)*(class|interface|struct|enum)\s+([A-Za-z_]\w*)/, /^\s*(?:public|internal|private|protected|static|virtual|async|override|\s)+[\w<>?,.\[\]]+\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:\{|=>)/],
    java: [/^\s*(?:public|protected|private|abstract|static|final|\s)*(class|interface|enum|record)\s+([A-Za-z_]\w*)/, /^\s*(?:public|protected|private|static|final|synchronized|\s)+[\w<>?,.\[\]]+\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:\{|throws)/],
    go: [/^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/, /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/, /^\s*const\s+([A-Za-z_]\w*)/, /^\s*var\s+([A-Za-z_]\w*)/],
    rust: [/^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/, /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, /^\s*(?:pub\s+)?type\s+([A-Za-z_]\w*)/, /^\s*mod\s+([A-Za-z_]\w*)/],
    php: [/^\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/, /^\s*(?:public|protected|private|static|\s)*function\s+([A-Za-z_]\w*)/, /^\s*const\s+([A-Za-z_]\w*)/],
    ruby: [/^\s*class\s+([A-Z]\w*)/, /^\s*module\s+([A-Z]\w*)/, /^\s*def\s+([A-Za-z_]\w*[!?=]?)/]
  };
  return patterns[language] ?? [];
}
function classify(language: SymbolLanguage, line: string, index: number): IndexedSymbol["kind"] {
  const lower = line.trim();
  if (/\bclass\b/.test(lower)) return "class";
  if (/\binterface\b/.test(lower)) return "interface";
  if (/\b(enum)\b/.test(lower)) return "enum";
  if (/\b(struct)\b/.test(lower)) return "struct";
  if (/\b(trait)\b/.test(lower)) return "trait";
  if (/\b(module|mod)\b/.test(lower)) return "module";
  if (/\b(type)\b/.test(lower)) return "type";
  if (/\b(const|let|var)\b/.test(lower) || /^[A-Z][A-Z0-9_]*\s*=/.test(lower)) return "constant";
  if (/\b(def|function|fn)\b/.test(lower) || /\([^;]*\)\s*(?:\{|=>|$)/.test(lower)) return index > 0 ? "method" : "function";
  return "variable";
}
function getName(language: SymbolLanguage, match: RegExpExecArray): string | undefined {
  if (language === "csharp" || language === "java") return match[2] ?? match[1];
  return match[1];
}
export function buildSymbolIndex(files: readonly ScannedFile[]): SymbolIndex {
  const symbols: IndexedSymbol[] = [];
  const references: IndexedReference[] = [];
  const unsupportedFiles: string[] = [];
  for (const file of files) {
    if (file.content === undefined) continue;
    const language = extensions[file.extension.toLowerCase()];
    if (!language) { unsupportedFiles.push(file.path); continue; }
    const lines = file.content.split(/\r?\n/);
    const patterns = pattern(language);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
      for (const regex of patterns) {
        const match = regex.exec(line);
        if (!match) continue;
        const name = getName(language, match);
        if (!name || name === "class" || name === "interface" || name === "struct" || name === "enum") continue;
        const kind = classify(language, line, symbols.length);
        symbols.push({
          name, kind, path: file.path, line: i + 1, language,
          ...( /^\s*export\b/.test(line) ? { exported: true } : {}),
          signature: redactPotentialSecrets(trimmed, { maxInputBytes: 4096 }).text.slice(0, 240)
        });
        break;
      }
      const importPatterns = [
        /^\\s*import\\s+.*?\\bfrom\\s+["']([^"']+)["']/,
        /^\\s*import\\s+["']([^"']+)["']/,
        /^\\s*from\\s+([\\w.]+)\\s+import\\s+/,
        /^\\s*#include\\s*[<"]([^>"]+)[>"]/,
        /^\\s*use\\s+([\\w:]+)/,
        /^\\s*require\\s*\\(?\\s*["']([^"']+)["']/
      ];
      let foundImport = false;
      for (const regex of importPatterns) {
        const match = regex.exec(line);
        if (match?.[1]) { references.push({ name: match[1], path: file.path, line: i + 1, kind: "import" }); foundImport = true; break; }
      }
      if (!foundImport) {
        const calls = [...line.matchAll(/\\b([A-Za-z_$][\\w$]*)\\s*\\(/g)];
        for (const call of calls.slice(0, 100)) {
          const name = call[1];
          if (name && !["if", "for", "while", "switch", "catch", "function", "def", "class", "sizeof", "return"].includes(name)) {
            references.push({ name, path: file.path, line: i + 1, kind: "call" });
          }
        }
        const types = [...line.matchAll(/\\b(?:new|extends|implements|instanceof|as|is|:\\s*)\\s*([A-Z][A-Za-z0-9_$]*)/g)];
        for (const use of types.slice(0, 100)) if (use[1]) references.push({ name: use[1], path: file.path, line: i + 1, kind: "type-use" });
      }
    }
  }
  symbols.sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line||a.name.localeCompare(b.name));
  references.sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line);
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), symbols, references, unsupportedFiles: unsupportedFiles.sort() };
}
export function findSymbols(index: SymbolIndex, query: string, limit = 50): IndexedSymbol[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const safeLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 50, 500));
  return index.symbols.filter((symbol) => symbol.name.toLowerCase().includes(q) || symbol.path.toLowerCase().includes(q)).slice(0, safeLimit);
}
