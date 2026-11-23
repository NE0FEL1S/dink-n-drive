/**
 * Dink n' Drive mark: the single source for every use (header, landing, booking
 * pass, Apple touch icon). `src/app/icon.svg` is a static copy of
 * logoMarkupString("t"); regenerate it if this file changes.
 *
 * Concept: a bold white "D" (Dink / Drive), slanted forward like the drive shot and
 * the italic "n'" in the wordmark. A lime pickleball (round, with a ring of holes)
 * sits in the D's counter, framed by a ring of the orange tile. A small frost
 * sparkle in the corner echoes the ice glints on the landing slab. 40×40 grid.
 */
export const LOGO_TILE_TOP = "#FB8C47";
export const LOGO_TILE_BOTTOM = "#E8601C";

/** The D (rounded stem corners). It is slanted; its counter is punched afterwards as an
 *  upright circle in the tile colour, so the orange ring around the ball stays even. */
const D_PATH = "M11.3 8.5H19.5C25.85 8.5 31 13.65 31 20S25.85 31.5 19.5 31.5H11.3A1.3 1.3 0 0 1 10 30.2V9.8A1.3 1.3 0 0 1 11.3 8.5Z";
const COUNTER_R = 5.45;

// Ball sits at the counter's centre (unchanged by the skew, which pivots on y = 20).
const BALL = { cx: 20.8, cy: 20, r: 4.05 };
const HOLES = Array.from({ length: 6 }, (_, i) => {
  const a = ((i * 60 + 30) * Math.PI) / 180;
  return [BALL.cx + Math.cos(a) * 2.25, BALL.cy + Math.sin(a) * 2.25] as const;
});

/** Inner SVG markup (no <svg> wrapper). `gid` = gradient id; `rounded=false` for full-bleed icons. */
export function logoMarkupString(gid: string, { rounded = true }: { rounded?: boolean } = {}) {
  const f = (n: number) => n.toFixed(2);
  return [
    `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="40"><stop offset="0" stop-color="${LOGO_TILE_TOP}"/><stop offset="1" stop-color="${LOGO_TILE_BOTTOM}"/></linearGradient></defs>`,
    `<rect width="40" height="40" rx="${rounded ? 12 : 0}" fill="url(#${gid})"/>`,
    rounded ? `<rect x="0.5" y="0.5" width="39" height="39" rx="11.5" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="1"/>` : "",
    `<path transform="translate(20 20) skewX(-9) translate(-20 -20)" fill="#fff" d="${D_PATH}"/>`,
    `<circle cx="${BALL.cx}" cy="${BALL.cy}" r="${COUNTER_R}" fill="url(#${gid})"/>`,
    `<circle cx="${BALL.cx}" cy="${BALL.cy}" r="${BALL.r}" fill="#D4F02E"/>`,
    ...HOLES.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="0.55" fill="#0F1B33" fill-opacity="0.55"/>`),
    `<path fill="#fff" d="M33 4.6l.85 2.05 2.05.85-2.05.85-.85 2.05-.85-2.05-2.05-.85 2.05-.85z"/>`,
  ].join("");
}
