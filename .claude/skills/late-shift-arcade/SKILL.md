```markdown
# late-shift-arcade Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill covers the core development patterns, coding conventions, and workflows used in the `late-shift-arcade` JavaScript codebase. It guides contributors on how to structure code, document features and decisions, and implement and test new functionality, ensuring consistency and clarity throughout the project.

## Coding Conventions

### File Naming

- Use **camelCase** for file names.
  - Example: `cartridgeTest.js`, `gameRegistry.js`

### Import Style

- Use **relative imports** for modules.
  ```js
  import { loadCartridge } from './cartridge.js';
  ```

### Export Style

- Use **named exports**.
  ```js
  // cartridge.js
  export function loadCartridge(id) { ... }
  export function ejectCartridge() { ... }
  ```

### Commit Patterns

- Commit messages are **freeform** but often use prefixes such as `charter`, `catalog`, `dorveille`, `plan`.
- Average commit message length: ~59 characters.

## Workflows

### Feature Spec and Charter Update

**Trigger:** When formalizing or updating platform rules, trust models, or major feature charters.  
**Command:** `/update-charter-spec`

1. Edit or add to `AGENTS.md` to define agent or trust class changes.
2. Edit or update `SPEC.md` to reflect new specifications or platform rules.
3. Commit changes with a descriptive message (e.g., `charter: update agent trust model`).

**Example:**
```markdown
# AGENTS.md
## Agent Classes
- TrustedAgent: Can access all games.
- GuestAgent: Limited access.
```

---

### Feature Implementation and Test Update

**Trigger:** When adding or changing catalog/game logic and ensuring correctness with tests.  
**Command:** `/feature-with-tests`

1. Edit or add to core implementation files (e.g., `games/registry.js`, `shell/cartridge.js`).
2. Update or add corresponding test files (e.g., `test/cartridge.test.js`) to cover new logic.
3. Run tests to verify correctness.
4. Commit both implementation and tests together (e.g., `catalog: add new game loader with tests`).

**Example:**
```js
// games/registry.js
export function registerGame(game) { ... }

// test/registry.test.js
import { registerGame } from '../games/registry.js';
test('registerGame adds game to registry', () => { ... });
```

---

### Decision and Calibration Logging

**Trigger:** When logging new project decisions, calibration results, or historical notes.  
**Command:** `/log-decision`

1. Edit or add markdown files in `.dorveille/` to record new decisions or calibration data.
   - Examples: `.dorveille/calibration.md`, `.dorveille/f-002-decisions.md`, `.dorveille/hypnogram.md`
2. Use clear headings and timestamps for each entry.
3. Commit with a message like `dorveille: log calibration results`.

**Example:**
```markdown
# .dorveille/calibration.md
## 2024-06-01
- Calibrated game timing for latency reduction.
```

## Testing Patterns

- Test files use the pattern `*.test.js` and are placed in the `test/` directory.
- The testing framework is **unknown**, but tests follow standard JavaScript test structure.
- Tests import functions using **relative imports** and use named exports.

**Example:**
```js
// test/catalog.test.js
import { getCatalog } from '../shell/catalog.js';

test('getCatalog returns all available games', () => {
  // ...test logic...
});
```

## Commands

| Command                | Purpose                                                        |
|------------------------|----------------------------------------------------------------|
| /update-charter-spec   | Update or formalize platform rules and specifications          |
| /feature-with-tests    | Implement new features or catalog changes with corresponding tests |
| /log-decision          | Record project decisions, calibrations, or historical notes    |
```
