# Installing Wartaq

Use **Install Wartaq / تثبيت وارتق** at the top of the homepage or notebook. A click calls `navigator.install()` where supported, including Chrome 158 on desktop. Other compatible browsers use their deferred installation prompt when available. The browser asks for your confirmation. If the browser offers neither path, the button shows installation instructions. On iPhone/iPad, open the site in Safari and use **Share → Add to Home Screen**.

The install control is hidden in standalone mode, after an `appinstalled` event, and when the browser confirms that Wartaq is already installed in the current profile. A link you open in a regular tab stays there. Chrome and Edge support this lookup on desktop from version 140, and Chrome supports it on Android from version 84. Browsers that cannot confirm an existing install fall back to the install control and help. [Browser support and matching rules](https://developer.chrome.com/docs/capabilities/get-installed-related-apps#check-if-your-progressive-web-app-is-already-installed-in-scope)

You can retry a canceled Web Install API request. A deferred prompt event can be used once, and the instructions remain available after dismissal. Feedback and instructions follow the selected language.

## App identity and hosting

The manifest uses **وارتق** alone with 192px and 512px PNG icons and a separate maskable declaration. Icons use the approved Arabic wordmark on deep teal. Regenerate them with `node scripts/render-pwa-icons.mjs` after installing the repository's Playwright Chromium. The manifest's own ID, start URL and scope are relative. The related app entry uses Railway's absolute app ID because desktop Chromium requires it for installed-app lookup. Update the related app ID if the production origin changes. The installed app opens `?page=app`, where the normal account and teacher-approval rules apply.

HTTPS is required outside localhost. The native prompt is not available in every browser; see [MDN's install-prompt guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt) and [installability requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Offline and updates

Wartaq opens the offline notebook automatically when it detects a lost connection. **Profile → My changes** appears while this device has unsynced attendance, notes or contact edits for the current account. Review them and resolve conflicts inside the regular notebook layout after reconnecting. The menu item disappears when the queue clears. The sign-in and loading screens offer **Open offline notebook** when offline access is available and the normal notebook cannot open.

Production/verification builds generate a versioned `sw.js` from the exact built static assets. Development does not register a worker. It precaches the public HTML shell, compiled code, styles, local fonts, images and manifest. Allowlisted homepage and notebook navigation tries the network first and falls back to the public shell when the network is slow or offline. Open the notebook once online to save the full assigned roster on that device. Reopen Wartaq offline to browse students, record course attendance, add notes and change phone numbers. The offline notebook saves on the device and syncs while open when connectivity and the same account's sign-in are available.

The worker does not cache Auth/API responses, cross-origin traffic, non-GET requests, authorization-bearing requests, query URLs or notebook data. Allowlisted clean navigation uses the network first, falling back to the canonical cached HTML after one second or when offline. Each worker keeps its precached HTML and assets together for offline use. It never saves the incoming navigation URL or capability query into the cache.

The Bun server sends `Cache-Control: no-cache` on static responses, so ordinary browser loads revalidate HTML and worker files instead of reusing an unchecked HTTP-cache copy.

The sign-in form appears while the managed session is being checked. You can type, switch language, return home or explore samples immediately; submitting waits for the session check to finish. Tap the growing bookmark during session/account loading. A failed session check, or one still pending after ten seconds, offers **Try again** without clearing typed input. Retry cancels the previous session fetch through the SDK. Private notebook content uses server approval. Prepared attendance uses a limited account-scoped local roster, separate from the authenticated notebook and its session.

During the first upgrade from the previous cache-first worker, its download may finish after the first refresh; refresh again once it has installed. A new worker activates after precaching without reloading or claiming open pages. Save work and refresh a page to load the latest version; other open pages and pending local data are left intact. A bilingual notice offers a Refresh button when an update activates in an open page. It reloads only when selected, after you save your work. Cache cleanup keeps the previous scoped cache for assets needed by older open pages and removes earlier scoped caches; a tab kept open across multiple deployments may need a refresh to load an old lazy asset. Other scopes are untouched. Existing ledger pending batches and retry protections are unchanged. See [service-worker lifecycle guidance](https://web.dev/articles/service-worker-lifecycle).

## Verification

`e2e/pwa.spec.ts` serves the actual built artifact below `/notebook/` on an isolated local HTTP listener. It verifies the manifest through Chromium, icon dimensions, worker scope, offline shell/sample, stalled-network clean navigation, excluded private/authenticated/query/POST requests, direct API invocation and retry after cancellation, deferred prompt single use, localized dismissal, iPad-style instructions, standalone hiding and a legacy-worker upgrade by normal refresh while another tab has an unsaved note. The suite runs desktop and touch-emulated cases. Synthetic screenshots are retained under `.artifacts/pwa/`.

The automated suite simulates browser responses to both install APIs and checks installed-app lookup on a fresh browser link, including fallback after an empty or rejected lookup. It exercises the real manifest, service worker, cache and offline requests. Native installation and OS launcher behavior require verification in a browser with an installer.

## Appearance

Choose **Device**, **Light** or **Dark** from the homepage/sign-in appearance control or the notebook profile menu. Device follows the operating system, including changes while the app is open. Explicit choices are saved on this browser and synchronized across tabs. When browser storage is unavailable, the choice still works for the current page session. The same-origin startup script restores the palette before application rendering and is included in the public offline cache. Arabic labels and native form controls follow the selected appearance.

The installed app requests the same window title-bar color as the page background in each theme. The manifest uses the light page color as its startup fallback. An existing installation picks up the updated appearance on an online refresh.
