// Empty stub for `server-only` used under vitest. In production, importing
// `server-only` from client code throws at build time. We preserve the
// import in test files for fidelity with server module signatures, but
// vitest aliases it to this empty module so the tests actually run.
export {};
