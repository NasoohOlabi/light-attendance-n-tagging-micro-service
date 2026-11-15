# Mobile and languages

The public homepage, sign-in and notebook support English and Arabic, including right-to-left layout. Language preference is best-effort; switching preserves working input and filters. Mobile navigation, touch targets, form sizing and summary table scrolling are covered in `e2e/mobile.spec.ts`; `e2e/neon.spec.ts` covers Arabic sign-in with synthetic same-origin fixtures. Synthetic screenshots and reports are retained under `.artifacts`.

Browser emulation does not certify physical iOS or Android devices, keyboards, screen readers or OS controls. Native installation has not been verified on a physical device. See [PWA behavior](pwa.md).
