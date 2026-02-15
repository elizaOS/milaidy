## 2025-02-17 - Missing Security Headers in API Server
**Vulnerability:** The API server (`src/api/server.ts`) was missing standard security headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) despite documentation/memory suggesting they were implemented.
**Learning:** Documentation and memory can drift from the actual codebase state. "Trust but verify" is crucial. Security features must be explicitly tested.
**Prevention:** Added `test/api-security-headers.e2e.test.ts` to enforce the presence of these headers. Always verify security controls with automated tests.
