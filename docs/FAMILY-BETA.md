# NovelReader — Family Beta (v0.22.x)

This is a **small, trusted family-and-friends beta**, not a public security or compatibility certification. Changes to the release process must be tested before a new APK/EXE is handed out.

## Supported platforms and expectations

| Platform | Beta status | Caveat |
|---|---|---|
| Windows 10/11 | Primary | Installer is currently unsigned; Windows SmartScreen may warn. Use the official GitHub Release only and do not disable system security globally. |
| Android phone/tablet | Beta | Install only the APK from this project's GitHub Release. A new version must have the same signing certificate to update without losing app data. |
| Android TV / Google TV | Experimental beta | Test D-pad, OK, Back, video playback and text legibility on a real television. |
| iOS / iPadOS | Not ready for family distribution | Current pipeline produces an unsigned IPA; real-device signing and capability validation are still required. |

## Before inviting anyone

1. Make a backup on **each device** using Settings > Backup/Restore. Confirm it can be restored on a test profile/device; do not overwrite the only copy.
2. Install on a clean Windows machine and a clean Android device. Check first launch, update-over-existing-install, and restart.
3. Run the automated CI checks (typecheck, translations, unit/UI tests, Windows build, Android unit + emulator smoke). Do not publish if any required check fails.
4. Verify the APK signing certificate fingerprint matches the preceding release. A changed signing key prevents seamless upgrades.
5. Only share the official release page: https://github.com/madaratn/NovelReader-Windows/releases . Never send a random installer or APK from a chat attachment.
6. Ask testers to keep their own offline backup and to report the app version, device/OS, source name and reproduction steps; never ask them to send passwords or private sync links.

## Manual acceptance test (use at least one Windows PC and one Android phone)

| Scenario | Windows | Android | Android TV |
|---|:---:|:---:|:---:|
| Clean install and first launch without crash | Required | Required | Required |
| Upgrade from previous version keeps library, positions and settings | Required | Required | Recommended |
| Install one **trusted** book source, search, open chapters | Required | Required | N/A |
| Read offline, close/reopen, resume the correct paragraph/chapter | Required | Required | N/A |
| Search video, open episode, play, seek and resume | Required | Required | Required |
| Switch to a second available source after a failure | Required | Required | Recommended |
| Check subtitles/audio/fullscreen for one representative video | Required | Required | Required |
| Backup, import into fresh profile/device, verify data | Required | Required | Recommended |
| Link by QR on same trusted Wi-Fi, sync both directions, restart and re-sync | Required | Required | N/A |
| Send 'Continue on phone' twice quickly; both should be received | Required | Required | N/A |
| Phone-link OFF and code regenerated: old code no longer works | Required | Required | N/A |
| Video download/offline and recovery after network loss | Required | Required | Recommended |
| TV remote navigation, Back, posters, video pause | N/A | N/A | Required |
| Optional: Cast to a real supported TV; optional: Watch Party with two PCs | Recommended | Recommended | Recommended |

Test Wi-Fi online/offline, then a normal mobile network. Do **not** expose the PC phone-link port to the internet or create router port forwarding rules. A PC link is LAN-only and uses HTTP with a bearer code in the URL, **not TLS encryption**.

## Safe beta rollout

1. **Maintainer only**: test and back up the previous working release.
2. **Two trusted testers**: one Windows and one Android; ask each to test install, video/books, resume, backup/restore and upgrade.
3. **Small circle**: expand only after no data-loss, startup, or update failures are reported.
4. **Rollback**: stop sharing a faulty release, preserve backups, and publish a tested fix. An older Android APK may not install on top of a newer version without data removal; do not ask users to uninstall before exporting their data.

## Open blockers (not yet fixed by the first stabilization PR)

- **Untrusted source extensions**: Android book plugins currently execute downloaded JavaScript with `new Function` in the application context; the Windows VM is not a robust security boundary. For now only install extensions you trust. Proper process/worker isolation and a permission model are needed before broad public distribution.
- **Signing**: a public fallback Android keystore is committed to the repository. Published releases must use a separate protected signing key held in CI secrets, never that test key. Determine which signing certificate users have already installed before rotating anything.
- **LAN relay**: the phone link provides powerful access to the PC engine through HTTP to anyone with the pairing code on the local network. Keep sharing off when unused, do not publish screenshots of the QR code, and regenerate the code if exposed.
- **Dependency reproducibility**: no committed `package-lock.json` yet; generate and commit one after checking dependency compatibility, then switch CI to `npm ci`.
- **Public distribution**: review content-source licenses, intellectual-property issues, privacy disclosures, update signing/integrity and third-party dependency security first.

## Release decision

Ship to family **only when the acceptance tests above pass**, the new installer/APK updates cleanly, and testers understand the beta limitations. Keep the prior stable release and its backups available.
