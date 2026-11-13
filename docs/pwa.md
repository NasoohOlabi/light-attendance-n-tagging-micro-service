# Installing Wartaq

Use **Install Wartaq / تثبيت وارتق** at the top of the homepage or notebook. On supporting browsers, a click opens the browser's native installation prompt. If no prompt is available, the button shows installation instructions. On iPhone/iPad, open the site in Safari and use **Share → Add to Home Screen**. Installation availability is controlled by the browser; this app never declares installation complete merely because the button was clicked.

The install control disappears in standalone mode and after an `appinstalled` event. A dismissed native event is used only once; the instructions remain available for later installation. Feedback and instructions follow the selected language. The UI does not automatically interrupt the teacher or cover the phone navigation.

## App identity and hosting

The manifest uses **وارتق** alone with 192px and 512px PNG icons and a separate maskable declaration. Icons use the approved Arabic wordmark on deep teal. Regenerate them with `node scripts/render-pwa-icons.mjs` after installing the repository's Playwright Chromium. All identity, start and scope URLs are relative to the deployed repository path. The installed app opens `?page=app`, where the normal account and teacher-approval rules apply.

HTTPS is required outside localhost. The native prompt is not available in every browser; see [MDN's install-prompt guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt) and [installability requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Offline and updates

Production/verification builds generate a versioned `sw.js` from the exact built static assets. Development does not register a worker. It precaches the public HTML shell, compiled code, styles, local fonts, images and manifest. Offline navigation to the clean homepage or app entry can open that shell; the sample notebook works in memory. Authentication and real student records still require a network connection. This does not add an offline write queue or background synchronization.

The worker does not cache Auth/API responses, cross-origin traffic, non-GET requests, authorization-bearing requests, query URLs or notebook data. Navigation tries the network first and uses the canonical precached HTML only after a network failure. It never saves the incoming navigation URL or capability query into the cache.

Updates use the browser's normal waiting lifecycle, without forced activation, tab reloads or claiming an open page. Finish work and close the open site/app windows before reopening to activate a waiting version. Cache names contain the repository scope; cleanup only removes this scope's older versions. Existing ledger pending batches and retry protections are unchanged. See [service-worker lifecycle guidance](https://web.dev/articles/service-worker-lifecycle).

## Verification

`e2e/pwa.spec.ts` serves the actual built artifact below `/notebook/` on an isolated local HTTP listener. It verifies the manifest through Chromium, icon dimensions, worker scope, offline shell/sample, excluded private/authenticated/query/POST requests, native prompt wiring and single use, localized dismissal, iPad-style instructions, standalone hiding and a waiting update while a note remains unsaved. The full suite has 48 desktop/touch-emulated cases. Synthetic screenshots are retained under `.artifacts/pwa/`.

Native installation/OS launcher behavior on physical iOS/Android devices is not certified by these checks. The native prompt callback is simulated because headless browser verification cannot operate the OS installer; the manifest, service worker, cache and offline requests are real. No live provider writes are required or claimed.
