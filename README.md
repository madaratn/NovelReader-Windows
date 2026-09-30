# Novel Reader Windows — v0.2 alpha

Windows desktop novel reader with an extensible source engine.

## v0.2 source-engine milestone
- Source registry and stable provider contract
- Parallel search across enabled providers
- Chapter-list/content provider methods
- LNReader adapter boundary prepared
- Electron desktop shell

The included remote provider is deliberately a demo provider. Real providers must respect source access rules, authentication, paywalls and DRM.

## Run

    npm install
    npm run start

## Architecture
src/sources/registry.ts defines the provider contract. Community plugins should not execute with unrestricted Electron/Node privileges. Next: isolated adapter, manifest validation, global-search UI and update checks.
