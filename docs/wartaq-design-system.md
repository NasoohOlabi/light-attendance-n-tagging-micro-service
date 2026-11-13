# Wartaq: two design drafts

Status: **B / Midad selected by the owner on 2026-11-13.** The current application implements that direction with a public advertising homepage and a separate authenticated notebook. Branding uses **وارتق** alone; the owner rejected the supplied symbol, which has been removed from both the UI and phone/favicon assets. The earlier review routes remain isolated samples for reference.

## Current site structure

- Root `/`: public bilingual homepage with a labelled illustrative register, features, account/approval steps, native FAQ disclosures and sample/sign-in actions. No provider requests are made here.
- `/?page=app`: real managed sign-in, sign-up, password reset, approval/loading states, then the assigned teacher notebook. Managed sessions resume here; closing a sample or signing out returns home.
- Legacy private access fragments/session storage still enter their notebook directly. View state remains in `src/queryState.ts`; changing a teacher resets working forms while preserving the selected view.
- Desktop: deep-teal Midad rail, actual student/date/note counts and latest-note context beside the real attendance register. Other sections retain student notes, roster, summaries and correction history.
- Phone: compact identity/header, five labelled bottom destinations with safe-area spacing, native date/select/email/password fields, 44px targets and 16px input text. All working content can scroll above the bar.

`src/HomePage.tsx` and `src/home.css` own public presentation; `src/App.tsx` and `src/workspace.css` own notebook composition; `src/NeonAuth.tsx` owns managed account flows. Shared fonts/tokens/logo stay in `src/brand/` and base controls in `src/index.css`. No routing or animation dependency was added. The reset capability is captured once in memory before URL sanitization and consumed by the existing Auth client.

Current proof is `e2e/home.spec.ts`, `e2e/mobile.spec.ts` and `e2e/neon.spec.ts`, plus the existing notebook/assigned/provider tests. The full suite has 40 desktop/touch-emulated cases. Synthetic screenshots are retained under `.artifacts/wartaq-final/`; physical-device and live-provider certification remain separate.

## Earlier comparison

Run `bun run dev`, then open `/?design=a` or `/?design=b`. The review bar switches designs and Arabic/English. Both routes use local sample data only, skip session loading, and make no Auth/API requests. Reload or switching directions resets that direction's demonstration state; changing language preserves its current input. The normal URL still opens the existing notebook.

## Directions

| Draft            | Character                          | Layout and components                                                                                                              | Best fit                                    |
| ---------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| A / Rihab / رحاب | Spacious, welcoming, architectural | Framed arch/book welcome; top navigation; six-student register beside note and session-summary panels; separate component examples | A public welcome with a calm, open notebook |
| B / Midad / مداد | Focused, contemporary teacher desk | Deep-teal rail; compact attendance rows, search and notes tray; students and summary views; horizontal phone navigation            | Repeated daily attendance and note-taking   |

Two drafts are enough to compare genuinely different structures. A third color variation would add little. Both reuse the same six synthetic students and five existing attendance codes so the comparison is about the interface.

## Shared foundation

| Token     | Value     | Use                               |
| --------- | --------- | --------------------------------- |
| Deep teal | `#004D57` | Main text and Midad rail          |
| Teal      | `#007D8D` | Primary actions and outlines      |
| Turquoise | `#00A7B5` | Active and decorative accents     |
| Sky       | `#CCEAF2` | Pale brand surfaces               |
| Cloud     | `#F5FAFC` | Working canvas                    |
| Sand      | `#E8D9C4` | Restrained architectural dividers |

IBM Plex Sans Arabic and IBM Plex Sans are self-hosted. Spacing starts at 8px, with 12px control and 18px panel radii. Controls have 44px touch targets and inputs use at least 16px text. Layout uses logical directions, isolated mixed text, visible focus, semantic controls and reduced-motion support.

```text
public/brand/wartaq/       selected supplied SVGs, local WOFF2 and license
src/brand/                scoped tokens/type, logo/icons, base-aware asset URLs
src/design-drafts/        shared sample vocabulary, review shell, A/B components and scoped CSS
src/Entry.tsx             lazy draft entry before normal session loading
e2e/wartaq.spec.ts        real browser actions, responsive and isolation checks
```

Each CSS layer has one job: foundation, review controls, then the selected direction. No draft style is added to the existing notebook's classes. Source boards and duplicate archives remain reference material outside Git; asset provenance and the provisional wordmark decision are in [wartaq-assets.md](wartaq-assets.md).

## Integration sequence

1. Selected shared logo/type/palette and Midad navigation/page frame.
2. Integrated real sign-in/loading/approval states.
3. Styled real attendance rows and saves while retaining append/retry behavior.
4. Retained student notes/tags, roster, summary and correction history in the new frame.
5. Verified desktop/mobile flows; publication follows the existing release process.

The samples' welcome email field, schedule and save feedback are explicitly demonstrations. There is no registration, course playback, published schedule, offline write promise or production data persistence in these drafts.

## Proof and limits

`bun run verify:ui` covers 36 desktop/touch-emulated scenarios, including six Wartaq cases. Draft checks cover Arabic/English, 320/390px portrait and 844px landscape, native status controls, mark/save attendance, note/tag state, language-preserved input and feedback, Midad search/views, Rihab components and return to the real notebook. Draft requests stay on the local origin. Existing 30 notebook/Auth/access scenarios remain passing.

Ignored screenshots and comparison: `.artifacts/wartaq/`; browser report/traces: `.artifacts/playwright-report/` and `.artifacts/test-results/`. Inspect the actual welcome, both notebooks and phone captures before choosing. Chromium emulation does not certify physical Safari/Android or assistive technology. No live provider check or publication is performed for unselected drafts.
