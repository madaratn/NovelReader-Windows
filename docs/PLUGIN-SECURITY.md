# Book-plugin security: family beta

## What this change guarantees

Book-source JavaScript may be **downloaded and evaluated only if its URL belongs to the exact LNReader plugin publisher/path already used by NovelReader**:

`https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/**/*.js`

The policy runs before code evaluation on **Android/iOS and Windows**, and at the book-source list/import UI boundary. It also:

- rejects HTTP, lookalike hosts, userinfo, query strings, fragments and encoded/traversing paths; it requests `redirect: 'error'` and checks final URLs when the platform exposes them. Android CapacitorHttp reports its local interceptor URL, not necessarily the ultimate network redirect, so this is **not a guarantee against every native redirect**;
- caps downloaded JavaScript to 2 MiB and explicitly omits browser credentials in download requests;
- refuses custom or third-party LNReader plugin URLs by default in the family beta;
- includes unit and Playwright tests, using both browser and Electron policy implementations.

A publisher allowlist is a **temporary risk reduction**, not a code-signature check and **not a security sandbox**.

## Critical limitations — DO NOT represent this as safe for untrusted extensions

- The official publisher's branch/tag can change. Code from it has **not been cryptographically pinned**, and upstream compromise or malicious contributions remain a supply-chain risk.
- Android/iOS still run plugin JS with `new Function()` in the application's WebView page. A malicious official plugin can still access web app state and any JavaScript-accessible native bridges. **Never execute third-party book JS outside the allowlist.**
- Windows executes plugin JS through Node's `vm` inside the Electron main process. Node's `vm` is **not an untrusted-code security boundary**; a malicious plugin can still compromise or block the process.
- Android's native WebView bridge is visible to iframe content; a sandboxed iframe alone is **not** sufficient isolation.
- The policy is **only for LNReader book plugins**. Aniyomi-compatible video extensions are handled by a different Kotlin/Java/engine path and require a separate audit.
- Android release builds currently depend on WebView debugging for the CI device smoke test; turn off debugging for distributed builds **only when the smoke harness has been migrated to tests that do not require it**.

## Next necessary engineering phase

1. Implement a **separate restricted process/runtime** for executable book-source code. On Android, use a dedicated native isolation boundary with no Capacitor bridge exposed to arbitrary JavaScript (not a same-WebView iframe). On desktop, use an OS-sandboxed worker/subprocess with a minimal RPC API; avoid passing sensitive filesystem or Electron handles.
2. Proxy extension network access through a host-controlled API with explicit permissions, origin/domain rules, strict time/size limits, no cookies/credentials and private-network blocking.
3. Validate manifest publisher, extension package hash/signature and version before execution. Cache and audit exact hashes, and require reapproval on publisher changes.
4. Run tests against representative multilingual LNReader sources on real Android and Windows devices, including offline, errors, redirects, and slow sources.
5. Remove WebView remote debugging from shipped Android APKs with a dedicated debug/smoke build strategy **without weakening the exact-artifact publication gate**.
6. Perform the separate Aniyomi extension audit before distributing broadly.

## Family guidance

Until proper runtime isolation ships, **only use NovelReader with sources whose publisher you personally trust**. Keep backups. Do not share sync QR codes, expose the PC relay over the internet or install APKs from unknown distributors. No DRM or paywall bypass is part of this change.
