# Installing Wartaq

Use **Install Wartaq / تثبيت وارتق** at the top of the homepage or notebook. On supporting browsers, a click opens the browser's native installation prompt. If no prompt is available, the button shows installation instructions. On iPhone/iPad, open the site in Safari and use **Share → Add to Home Screen**. Installation availability is controlled by the browser; this app never declares installation complete merely because the button was clicked.

The install control disappears in standalone mode and after an `appinstalled` event. A dismissed native event is used only once; the instructions remain available for later installation. Feedback and instructions follow the selected language. The UI does not automatically interrupt the teacher or cover the phone navigation.

## App identity and hosting

The manifest uses **وارتق** alone with 192px and 512px PNG icons and a separate maskable declaration. Icons use the approved Arabic wordmark on deep teal. Regenerate them with `node scripts/render-pwa-icons.mjs` after installing the repository's Playwright Chromium. All identity, start and scope URLs are relative to the deployed repository path. The installed app opens `?page=app`, where the normal account and teacher-approval rules apply.

HTTPS is required outside localhost. The native prompt is not available in every browser; see [MDN's install-prompt guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt) and [installability requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Offline and updates

Production/verification builds generate a versioned `sw.js` from the exact built static assets. Development does not register a worker. It precaches the public HTML shell, compiled code, styles, local fonts, images and manifest. Clean homepage and app entry navigation tries the network first and falls back to that shell when the network is slow or offline; the sample notebook works in memory. Authentication and real student records still require a network connection. This does not add an offline write queue or background synchronization.

The worker does not cache Auth/API responses, cross-origin traffic, non-GET requests, authorization-bearing requests, query URLs or notebook data. Allowlisted clean navigation uses the network first, falling back to the canonical cached HTML after one second or when offline. Each worker keeps its precached HTML and assets together for offline use. It never saves the incoming navigation URL or capability query into the cache.

The Bun server sends `Cache-Control: no-cache` on static responses, so ordinary browser loads revalidate HTML and worker files instead of reusing an unchecked HTTP-cache copy.

The sign-in form appears while the managed session is being checked. You can type, switch language, return home or explore samples immediately; submitting waits for the session check to finish. Tap the growing bookmark during session/account loading. A failed session check, or one still pending after ten seconds, offers **Try again** without clearing typed input. Retry cancels the previous session fetch through the SDK. Private notebook content still waits for server approval; no persistent session, role or notebook cache is added.

During the first upgrade from the previous cache-first worker, its download may finish after the first refresh; refresh again once it has installed. A new worker activates after precaching without reloading or claiming open pages. Save work and refresh a page to load the latest version; other open pages and pending local data are left intact. A bilingual notice offers a Refresh button when an update activates in an open page. It reloads only when selected, after you save your work. Cache cleanup keeps the previous scoped cache for assets needed by older open pages and removes earlier scoped caches; a tab kept open across multiple deployments may need a refresh to load an old lazy asset. Other scopes are untouched. Existing ledger pending batches and retry protections are unchanged. See [service-worker lifecycle guidance](https://web.dev/articles/service-worker-lifecycle).

## Verification

`e2e/pwa.spec.ts` serves the actual built artifact below `/notebook/` on an isolated local HTTP listener. It verifies the manifest through Chromium, icon dimensions, worker scope, offline shell/sample, stalled-network clean navigation, excluded private/authenticated/query/POST requests, native prompt wiring and single use, localized dismissal, iPad-style instructions, standalone hiding and a legacy-worker upgrade by normal refresh while another tab has an unsaved note. The suite runs desktop and touch-emulated cases. Synthetic screenshots are retained under `.artifacts/pwa/`.

Native installation/OS launcher behavior on physical iOS/Android devices is not certified by these checks. The native prompt callback is simulated because headless browser verification cannot operate the OS installer; the manifest, service worker, cache and offline requests are real. No live provider writes are required or claimed.

## Appearance

Choose **Device**, **Light** or **Dark** from the homepage/sign-in appearance control or the notebook profile menu. Device follows the operating system, including changes while the app is open. Explicit choices are saved on this browser and synchronized across tabs. When browser storage is unavailable, the choice still works for the current page session. The same-origin startup script restores the palette before application rendering and is included in the public offline cache. Arabic labels and native form controls follow the selected appearance.
