# Wartaq draft assets

The review drafts use the user-supplied `wartaq-svg-assets.zip` and the reference design boards. The web kit's 18 SVG files are byte-identical to the standalone archive; its application code and raster boards were not imported. These assets were supplied for this project; their independent licensing or final trademark approval has not been established.

## Selected

`public/brand/wartaq/` contains the supplied symbol, arch, pattern tile, Quran book, corner ornament, and hero illustration. They were inspected for scripts, event handlers, external references, and embedded content (the hero uses local gradient IDs only) before inclusion. The symbol appears beside live Arabic text **وارتق** in the draft logo. This is a typeset placeholder, not final bespoke lettering. The kit's `brand-horizontal.svg` says **ورتق**, so it is deliberately excluded. Remaining illustrations, media/course graphics and decorative assets are deferred until a notebook use calls for them.

The scoped tokens in `src/brand/index.css` preserve the supplied deep teal, teal, turquoise, sky, cloud and sand palette, with 8px spacing and 12/18px radii. Dark teal is the main text color; white on teal can be used for primary controls. Draft controls should be at least 44px and use logical properties for both directions. Decorative assets should be hidden from assistive technology.

## Type

IBM Plex Sans Latin and IBM Plex Sans Arabic WOFF2 subsets were downloaded from Google Fonts' `fonts.gstatic.com` CSS distribution, derived from the [IBM Plex project](https://github.com/IBM/plex). The local files are served with the site; no font service is contacted at runtime. The [SIL Open Font License 1.1](../public/brand/wartaq/FONT-LICENSE.txt) is included. Arabic includes regular, semibold and bold; Latin uses the variable 400–700 subset. Uncovered characters fall back to system sans-serif.
