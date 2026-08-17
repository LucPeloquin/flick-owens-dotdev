# Curated ROM payloads

Only ROMs declared in `assets/ds/cartridges.json` may be placed in this
directory for a production build. Payloads must use a content-addressed name,
include a verified SHA-256 and redistribution permission, and pass
`npm run assets:ds:roms:check`.

Private dumps belong outside `public/` (for example `private/roms/`) and are
never copied into a deployment. This project does not ship Nintendo BIOS,
firmware, commercial ROMs, visitor uploads, or arbitrary remote URLs.
