# Contributing

Thanks for your interest in Imagina Signatures. This document describes the
workflow contributors are expected to follow. The architectural rules live in
`CLAUDE.md` — please read it before writing code.

## Workflow

1. **Branch from `develop`** with a descriptive name:
   - `feature/<short-description>`
   - `fix/<short-description>`
   - `chore/<short-description>`
2. **Commit using Conventional Commits** (`feat:`, `fix:`, `chore:`,
   `docs:`, `refactor:`, `test:`).
3. **Run linters and tests locally** before pushing:

   ```bash
   composer run lint
   composer run test
   npm run typecheck
   npm run lint
   npm test
   ```

4. **Open a PR against `develop`**. CI must pass before review.

## Code style

- PHP: WordPress Coding Standards (WPCS). See `phpcs.xml.dist`.
- TypeScript: ESLint + Prettier. See `.eslintrc.cjs`, `.prettierrc`.
- Indentation: tabs in PHP, 2 spaces in TS/JS/CSS/JSON. Enforced via
  `.editorconfig`.
- Every new PHP class file starts with `declare(strict_types=1);` and uses
  the `ImaginaSignatures\…` namespace mapped 1:1 into `src/`.
- Every public PHP method gets a PHPDoc block with `@since` and types.

## Tests

- New PHP services should ship at least one PHPUnit test under
  `tests/php/Unit/<Section>/`. Use Brain Monkey for WordPress mocks.
- New TS modules should ship Vitest tests under `tests/js/`.
- Coverage isn't gated, but services that hold business logic should be
  exercised by tests.

## Git hygiene

- Squash trivial commits before review.
- Keep PRs focused; avoid mixing refactors with feature work.
- Update `CHANGELOG.md` under `[Unreleased]` for user-visible changes.

## Questions

Open a draft PR or a discussion if the change touches the architecture
described in `CLAUDE.md`. Anything that requires updating `CLAUDE.md` should
be flagged in the PR description.
