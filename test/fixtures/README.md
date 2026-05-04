# Test fixtures

Place portable intake samples here (small PDF/CSV/xlsx) for integration tests and manual smoke checks. Avoid machine-specific paths: tests should read from this directory using `import.meta.url` or `path.join(__dirname, ...)` relative to the repo root.

When adding a new fixture, document its purpose in the test file that uses it.
