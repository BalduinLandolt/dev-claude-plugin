# Rust Conventions

Project-specific review criteria for the `rust-reviewer` agent. Adapt every
section below to this project — the placeholders marked `<!-- adapt -->` are
starting points, not rules to copy verbatim. Delete sections that do not apply
and add project-specific ones the reviewer should enforce.

## Error handling

The dividing line is **whose fault a failure is**:

- **Return a `Result` (and propagate with `?`)** when the *world* is wrong:
  bad input, a missing file, a failed network call, a parse error, a value out
  of range. These are expected states that can occur in normal operation. The
  layer that hits them returns an error so the caller can decide what to do,
  even when this particular layer cannot itself recover.
- **Panic** only when the *code* is wrong: a violated invariant the program
  assumes can never happen. Reaching that state means there is a bug, not a
  problem with input or environment. Continuing would produce incorrect or
  unsafe behaviour, so failing fast is correct.

Litmus test: *if this fires in production, is the right fix to change the code
(panic justified) or to handle the situation gracefully (should have been a
`Result`)?* Equivalently: a panic is permitted for what the program genuinely
cannot meaningfully recover from — but "cannot recover" is judged at the right
altitude. A library function usually cannot recover from a missing file on its
own, yet it should still return an error and let the caller decide; only at a
boundary where there is no sensible error to return and continuing would be
wrong does the panic become the right tool.

### `expect` over `unwrap`

When a panic *is* the right call, prefer `expect("...")` over `unwrap()`. Phrase
the message as the invariant being asserted, so the panic documents why the
state was assumed impossible:

```rust
// good — the message states the invariant
let port = config.port.expect("port is set: validated during startup");
let first = items.first().expect("items is non-empty: checked above");

// avoid — no explanation of why this can't be None
let port = config.port.unwrap();
```

The message must state the invariant. An `expect("")` or `expect("todo")` is no
better than `unwrap()` and should be flagged the same way.

Bare `unwrap()`/`expect()` is acceptable in tests and examples, where a panic
*is* the intended failure signal. In production code paths, flag `unwrap()` (and
content-free `expect(...)`) and ask for either an `expect` with a justifying
message or a `Result`.

### Boundaries

<!-- adapt: name this project's error types and where each is used. Example: -->
- Library/domain crates return a typed error enum (e.g. `thiserror`-derived).
- The application entry point (`main`, command handlers) is where errors are
  rendered to the user and the process exits non-zero — not where they panic.
- `anyhow` (or equivalent) is acceptable <!-- adapt: where? binaries only? --> .

## Type design

- Make illegal states unrepresentable: prefer enums and newtypes over bare
  `bool`/`String`/`i64` where a domain type carries meaning.
- Parse, don't validate: convert untrusted input into a validated type once, at
  the boundary, then pass the validated type inward.
- Derive `Debug` on public types; derive `Clone`/`PartialEq` where it makes
  sense and does not leak surprising semantics.

## Dependency direction

<!-- adapt: state the project's layering and give grep patterns the reviewer
can run to detect violations. Example for a layered workspace: -->
- `domain` must not depend on `infra` or `app`. Check:
  `grep -rn "use crate::infra\|use crate::app" src/domain/`
- Adjust the crate/module names and the forbidden directions to this project.

## Visibility

- Default to private. Expose `pub` only what other modules genuinely need, and
  `pub(crate)` in preference to `pub` when the item is internal to the crate.
- Public items carry rustdoc (`///`) explaining intent, not restating the
  signature.

## Tests

<!-- adapt: state the canonical test runner and any required flags. -->
- Run tests with the project's canonical command (e.g. `just test`,
  `cargo nextest run`, or `cargo test --all-features`).
- Unit tests live in-module under `#[cfg(test)]`; integration tests in `tests/`.
- A change to behaviour ships with a test that would fail without it.

## What the reviewer should not flag

- Formatting and import ordering (rustfmt owns these).
- Bare `unwrap()`/`expect()` in test code and doc examples.
- Stylistic preferences that do not affect correctness or readability.
