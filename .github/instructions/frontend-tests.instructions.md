---
applyTo: "frontend/src/**/*.test.{js,jsx}"
---
# Rules for frontend test files
- Import `describe, it, expect, vi` from `vitest`.
- Render with `@testing-library/react`; simulate users with `userEvent.setup()`.
- Mock `./api.js` with `vi.mock('./api.js', ...)`; reset mocks in `beforeEach`.
- Use `findBy*` or `waitFor` for anything asynchronous. The search box in `App.jsx` is debounced by 250 ms.
- Cover: happy path, empty state, error state, and one edge case per feature.
- Name tests as sentences describing behaviour, e.g. `it('shows an error banner when loading fails')`.
