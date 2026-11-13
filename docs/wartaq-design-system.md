# Wartaq: two design drafts

Status: interactive design review, awaiting the owner's choice. These drafts adapt the supplied Wartaq 5 identity to the existing teacher attendance/tagged-note notebook. They are not a new course platform and do not replace the live application.

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

## Component sequence after selection

1. Confirm logo/type/palette, then finish the chosen navigation and page frame.
2. Integrate the real sign-in/loading/approval states.
3. Replace the real attendance rows and save states while retaining append/retry behavior.
4. Integrate student-specific notes/tags, roster, summary and correction history.
5. Verify real desktop/mobile flows and promote through the existing release process.

The samples' welcome email field, schedule and save feedback are explicitly demonstrations. There is no registration, course playback, published schedule, offline write promise or production data persistence in these drafts.

## Proof and limits

`bun run verify:ui` covers 36 desktop/touch-emulated scenarios, including six Wartaq cases. Draft checks cover Arabic/English, 320/390px portrait and 844px landscape, native status controls, mark/save attendance, note/tag state, language-preserved input and feedback, Midad search/views, Rihab components and return to the real notebook. Draft requests stay on the local origin. Existing 30 notebook/Auth/access scenarios remain passing.

Ignored screenshots and comparison: `.artifacts/wartaq/`; browser report/traces: `.artifacts/playwright-report/` and `.artifacts/test-results/`. Inspect the actual welcome, both notebooks and phone captures before choosing. Chromium emulation does not certify physical Safari/Android or assistive technology. No live provider check or publication is performed for unselected drafts.
