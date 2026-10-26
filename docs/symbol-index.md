# Symbol index

AIFIAR's lexical symbol index is implemented in `core/symbolIndex.ts` and persisted through `core/repositoryMemory.ts`.

Supported extensions include TypeScript/JavaScript, Python, C/C++, C#, Java, Go, Rust, PHP, and Ruby. The index records likely declarations with source line, language, declaration kind, bounded signature, and import/call/type-use references. `findSymbols(index, query, limit)` searches symbol names and paths.

The index is designed to narrow the files a coding agent must inspect. It is not a compiler, language server, type checker, or authoritative call graph. Dynamic dispatch, macros, overloaded functions, nested scope, aliases, generated code, and complex syntax may be missed. References are lexical heuristics and may include false positives. A match is a navigation hint, not proof of runtime behavior.

Before editing, reopen the current file and check the relevant context. Use the stored hash to determine whether an indexed summary still corresponds to the current file. Rebuild the memory index after changes and surface partial scans or unsupported extensions instead of claiming complete coverage.
