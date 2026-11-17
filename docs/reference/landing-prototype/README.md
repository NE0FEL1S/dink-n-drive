# Landing page prototype

The approved design for the landing page `/`, built as a single HTML page before the real Next.js version. The real page should match it. Design rules are in `docs/DESIGN.md` §5.

- `preview.html`: open it in a browser to see the prototype (narrow the window to see the phone layout).
- `template.html`: the source, with image placeholders `__PADDLE__` and `__BALL__`.
- `build.py`: rebuilds `preview.html` from the template (`python build.py`).
- `assets/`: the cut-out paddle and ball (upscaled 2×, transparent WebP).

Live, private copy: https://claude.ai/artifact/QfKzsLRhC5LZYXgo35ZvNR

Example data in the prototype (booking pass, availability in the booking popup) is illustrative only. In the real app, prices, hours and hold time come from the `settings` table, and availability from the database.
