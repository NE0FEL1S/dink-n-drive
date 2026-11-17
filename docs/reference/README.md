# Reference

Drop anything here that should guide the build: design inspiration, screenshots, logos, brand colors, sample copy, the owner's notes, competitor sites, wireframes, PDFs.

Claude Code reads this folder before each phase and follows what's here. If a reference conflicts with `docs/SPEC.md`, Claude asks instead of guessing.

## Suggested layout
Use whatever subfolders make sense. For example:

```
reference/
├── design/     screenshots, mockups, color palettes, fonts, sites you like
├── brand/      logo, court photos, name/tagline ideas
├── content/    text for the landing page, rules, FAQs, owner notes
└── private/    anything that must NOT go on GitHub (see below)
```

Tip: add a short note next to a file (or in this README) saying what you like about it, e.g. "like the slot grid in `design/booking-example.png`, not the colors".

## Private files
This repo is public. Put sensitive things in `reference/private/`. That folder is git-ignored, so Claude can still read it locally but it is never committed. Examples:
- the real GCash QR code
- the owner's phone number, name, or business documents
- real customer data

## Notes
<!-- Add anything you want Claude to keep in mind here. -->
