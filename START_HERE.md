# Start Here: Apply AIFIAR to a Repository

Paste the target repository URL into your coding AI and state the task you want it to perform.

Suggested request:

> Inspect this repository for the task I describe. Read the applicable root and nested instructions and only the relevant documentation, source, configuration, and tests. Confirm the repository/ref/commit when available. Preserve my requirements, distinguish observed facts from assumptions, make targeted changes, and run relevant checks if tools permit. Report which files you actually inspected, what changed, the checks and results, and what remains unverified. Do not claim persistent memory unless a real persistent store was used.

## Minimal request

`<repository URL>`

"Inspect this repository for my task, follow the applicable project instructions, and verify your findings. Do not assume access or persistent memory that you do not have."

## Expected behavior

1. Confirm the repository, ref, and current commit when the available tools permit.
2. Read applicable root/nested instructions and task-relevant files.
3. Inspect more broadly only when dependencies, ambiguity, or risk require it.
4. Preserve the user's explicit requirements. Use a checklist for multi-step or high-risk work, not as ceremony for every small question.
5. Run only checks that are available and appropriate; report their actual results.
6. Save a project profile only when a real persistent store is available, and recheck freshness before reusing it.

AIFIAR contains a URL intake helper and a JSON profile storage primitive, but these modules do not themselves fetch remote repositories or automatically grant access to external tools. The coding AI must use its actual available GitHub, browser, or filesystem tools. Reading AIFIAR instructions does not install AIFIAR into another agent or make them platform-level rules.
