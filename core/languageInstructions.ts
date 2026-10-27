export type LanguageInstructionProvider = "openai" | "anthropic" | "gemini" | "xai" | "local" | "qwen" | "qwen-code";
export type SupportedInstructionLanguage =
  | "bash" | "c" | "cpp" | "csharp" | "go" | "java" | "javascript"
  | "php" | "python" | "ruby" | "rust" | "sql" | "typescript";

const EXTENSION_LANGUAGE: Readonly<Record<string, SupportedInstructionLanguage>> = {
  ".sh": "bash",
  ".bash": "bash",
  ".c": "c",
  ".i": "c",
  ".cc": "cpp",
  ".c++": "cpp",
  ".cppm": "cpp",
  ".ccm": "cpp",
  ".cxxm": "cpp",
  ".ixx": "cpp",
  ".ipp": "cpp",
  ".inl": "cpp",
  ".tpp": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hh": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".cs": "csharp",
  ".go": "go",
  ".java": "java",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".php": "php",
  ".py": "python",
  ".pyi": "python",
  ".pyw": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".sql": "sql",
  ".psql": "sql",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescript"
};

const SUPPORTED_LANGUAGES = new Set<SupportedInstructionLanguage>([
  "bash", "c", "cpp", "csharp", "go", "java", "javascript",
  "php", "python", "ruby", "rust", "sql", "typescript"
]);

const KNOWN_PROVIDERS = new Set<LanguageInstructionProvider>([
  "openai", "anthropic", "gemini", "xai", "local", "qwen", "qwen-code"
]);

/**
 * Infer the language pack from a source path. Ambiguous .h headers intentionally
 * map to C; callers working on C++ headers should provide a matching .hpp/.hh
 * path or use resolveInstructionPathsForLanguages with an explicit language.
 */
export function detectInstructionLanguage(path: string): SupportedInstructionLanguage | undefined {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0")) return undefined;
  const normalized = path.replace(/\\/g, "/");
  if (normalized.split("/").some((part) => part === "..")) return undefined;
  const rawName = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (rawName.endsWith(".C") || rawName.endsWith(".H")) return "cpp";
  const name = rawName.toLowerCase();
  if (name.endsWith(".h")) return "c";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return undefined;
  return EXTENSION_LANGUAGE[name.slice(dot)];
}

export function resolveInstructionPathsForLanguages(
  languages: readonly SupportedInstructionLanguage[],
  provider: LanguageInstructionProvider,
  root = "languages"
): string[] {
  if (!KNOWN_PROVIDERS.has(provider)) throw new Error("Unsupported AI instruction provider.");
  if (typeof root !== "string" || root.length === 0 || root.includes("\0") || root.startsWith("/") || /^[A-Za-z]:[\\/]/.test(root) || root.split(/[\\/]/).some((part) => part === "..")) {
    throw new Error("Instruction root must be a safe relative path.");
  }
  for (const language of languages as readonly string[]) {
    if (!SUPPORTED_LANGUAGES.has(language as SupportedInstructionLanguage)) {
      throw new Error("Unsupported instruction language.");
    }
  }
  const unique = [...new Set(languages)];
  return unique.flatMap((language) => [
    root.replace(/\\/g, "/") + "/" + language + "/common/AGENTS.md",
    root.replace(/\\/g, "/") + "/" + language + "/" + provider + "/INSTRUCTIONS.md"
  ]);
}

export function resolveLanguageInstructionPaths(
  filePaths: readonly string[],
  provider: LanguageInstructionProvider,
  root = "languages"
): string[] {
  const languages = filePaths
    .map(detectInstructionLanguage)
    .filter((language): language is SupportedInstructionLanguage => language !== undefined);
  return resolveInstructionPathsForLanguages(languages, provider, root);
}
