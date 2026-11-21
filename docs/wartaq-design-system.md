# Wartaq design system

The public course homepage is separate from the account and notebook entry at `?page=app`. Course teacher, schedule and enrollment details are placeholders. `src/HomePage.tsx` and `src/home.css` own public presentation; `src/App.tsx` loads the notebook on entry. `src/Workspace.tsx` and `src/workspace.css` own the notebook; `src/NeonAuth.tsx` owns account flows. Shared brand assets live in `src/brand/`.

`/?design=a` and `/?design=b` are local sample design routes, not authenticated notebooks. `e2e/home.spec.ts`, `e2e/wartaq.spec.ts`, `e2e/mobile.spec.ts` and `e2e/neon.spec.ts` cover homepage, design drafts, responsive layout and authentication with synthetic data. Physical-device and live-provider verification remain separate.
