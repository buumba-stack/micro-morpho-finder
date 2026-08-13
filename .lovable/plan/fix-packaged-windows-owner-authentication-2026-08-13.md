# Fix packaged Windows owner authentication

## Goal
Keep the reviewer website unchanged while ensuring the Windows application signs owners in inside the existing analyzer and reuses that user session for AI Review, Ask the Data, and owner cloud sync without losing local analysis state.

## Implementation
1. **Remove the packaged legacy auth route**
   - Replace runtime `file://` auth-link selection with an explicit desktop build flag.
   - In desktop builds, render `OwnerSignIn` only; do not include or expose a hosted `/auth` link for AI authentication.
   - Keep the current web reviewer gate and web authentication route unchanged.

2. **Add a defensive Electron boundary**
   - Keep external links working, but explicitly refuse to send MicroFluor authentication URLs to `shell.openExternal`.
   - Verify no AI Review, Ask the Data, or cloud-sync action can invoke an external authentication page.

3. **Preserve session and analyzer continuity**
   - Keep sign-in as a child panel within `AiPanel`, so `AnalyzerApp` remains mounted and its images, particles, edits, blanks, memory, results, and selections stay intact.
   - Refresh the existing auth hook after successful email/password sign-in; AI Review and Ask the Data will both continue through the shared AI client, which prioritizes the normal user access token.
   - Ensure an authenticated owner is treated as a user for cloud sync even if an old reviewer token exists locally.

4. **Create a distinguishable clean package**
   - Increment the authoritative package version from `2.5.0` to `2.5.1`.
   - Add a clean packaging step that removes `dist-desktop` and the previous Electron release before rebuilding.
   - Package a fresh Windows x64 archive from the newly generated renderer only.

## Verification
- Audit all auth-related strings and call paths across source and the packaged `app.asar`.
- Verify the packaged renderer contains the in-app owner form and no hosted authentication URL or desktop `_blank` auth link.
- Exercise the packaged renderer/Electron flow with a loaded analysis and instrument external-link handling to prove Sign in does not call the operating system browser and sign-out does not clear analysis state.
- Verify AI Review and Ask the Data share the user bearer-token path, and owner cloud sync recognizes the signed-in user.
- Where the Linux build environment cannot execute a Windows `.exe` directly or owner test credentials are unavailable, report that limitation precisely rather than claiming an unperformed credentialed test.

## Files expected to change
- `package.json`
- `desktop/vite.config.ts`
- `vite.config.ts`
- `src/components/AiPanel.tsx`
- `src/lib/contamination-sync.ts`
- `electron/main.cjs`
- one focused desktop clean/verification script if needed
