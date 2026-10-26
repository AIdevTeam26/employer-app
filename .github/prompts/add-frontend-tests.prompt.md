---
description: Add or improve unit tests for a frontend file, run them and fix failures
agent: agent
---
Write unit tests for ${file} (or the file I name below) following `.github/instructions/frontend-tests.instructions.md`.

1. List the behaviours worth testing (happy path, empty state, error state, edge cases).
2. Create or extend the test file next to the source.
3. Run `npm test --prefix frontend` and fix failing tests until all pass.
4. Report what is covered and what is not.
