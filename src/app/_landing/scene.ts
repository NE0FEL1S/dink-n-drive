// Landing scene: background painting, snow, ice-break layout and parallax.
// Ported from the approved prototype (docs/reference/landing-prototype/template.html).
// Runs in the browser only, on elements rendered by <LandingScene>, found via data-l attributes.

type Pt = [number, number];
type Box = { l: number; t: number; r: number; b: number };

export type SceneOptions = {
  openHour: number;
  closeHour: number;
};

/** Small deterministic PRNG (mulberry32) so the scene looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hourText = (h: number) => {
  const x = h % 24;
  return `${x % 12 === 0 ? 12 : x % 12} ${x < 12 ? "AM" : "PM"}`;
};

export function mountLandingScene(root: HTMLElement, opts: SceneOptions): () => void {
  const q = <T extends Element = HTMLElement>(name: string) => root.querySelector<T>(`[data-l="${name}"]`)!;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanups: Array<() => void> = [];

  const stage = q("stage");
  const bg = q<HTMLCanvasElement>("bg");
  const snow = q<HTMLCanvasElement>("snow");
  const panel = q("panel");
  const nav = q("nav");
  const head = q("head");
  const cta = q("cta");
  const fx = q<SVGSVGElement>("fx");
  const trail = q<SVGSVGElement>("trail");
  const pFront = q("paddle");
  const ball = q("ball");
  const shadowSvg = q<SVGSVGElement>("shadow");
  const shadowPath = q<SVGPathElement>("shadow-path");
  const chipPrice = q("chip-price");
  const chipAhead = q("chip-ahead");
  const chipLights = q("chip-lights");
  const chipPaddles = q("chip-paddles");
  const chipOpen = q("chip-open");
  const pass = q("pass");
  const shards = [...root.querySelectorAll<HTMLElement>('[data-l="shard"]')];

  /* ---------- open / closed chip (Manila time, from settings) ---------- */
  const updateOpen = () => {
    const h = new Date(Date.now() + 8 * 3_600_000).getUTCHours();
    const isOpen = h >= opts.openHour && h < opts.closeHour;
    q("open-text").textContent = isOpen ? `Open now · till ${hourText(opts.closeHour)}` : `Closed · opens ${hourText(opts.openHour)}`;
    chipOpen.classList.toggle("l-closed", !isOpen);
  };
  updateOpen();
  const openTimer = window.setInterval(updateOpen, 60_000);
  cleanups.push(() => window.clearInterval(openTimer));

  /* ---------- background: rays, cumulus horizon, court with a red kitchen, benches ---------- */
  const ctx = bg.getContext("2d")!;
  const sansFamily =
    getComputedStyle(document.documentElement).getPropertyValue("--font-jakarta").trim() || "system-ui, sans-serif";

  /**
   * One shared cumulus painter, used for every cloud so they all look the same:
   * a bumpy base row, a middle tier and a domed top (tall, not thin), drawn as one
   * merged shape offscreen. Base colour is a soft blue-grey shade; each puff then gets
   * a white highlight shifted up, which leaves shading in the creases and underneath.
   * Bottoms stay round and bumpy (never flat).
   */
  function cumulus(r: () => number, cx: number, baseY: number, w: number, alpha: number, stretch = 1) {
    // `stretch` widens the cloud (more puffs across a wider span) without making it taller
    const dpr = Math.min(window.devicePixelRatio || 1, 2),
      h = w * 0.58,
      pad = w * 0.16,
      sw = w * stretch,
      bw = sw + pad * 2,
      bh = h + pad * 2,
      Y0 = pad + h; // cloud base inside the offscreen canvas
    const puffs: Array<[number, number, number]> = [];
    // base row: many medium puffs; their varied sizes make the underside bumpy
    const nb = Math.round((7 + Math.floor(r() * 3)) * stretch);
    for (let i = 0; i < nb; i++) {
      const t = (i + 0.5) / nb - 0.5,
        rad = w * (0.085 + 0.045 * r()) * (0.75 + 0.35 * Math.cos(t * Math.PI));
      puffs.push([pad + sw / 2 + t * sw * 0.86 + (r() - 0.5) * w * 0.03, Y0 - rad * (0.72 + r() * 0.18), rad]);
    }
    // middle tier: bigger puffs, narrower
    const nm = Math.round((4 + Math.floor(r() * 2)) * stretch);
    for (let i = 0; i < nm; i++) {
      const t = (i + 0.5) / nm - 0.5,
        rad = w * (0.13 + 0.05 * r()) * (0.8 + 0.25 * Math.cos(t * Math.PI));
      puffs.push([pad + sw / 2 + t * sw * 0.6 + (r() - 0.5) * w * 0.05, Y0 - h * (0.42 + r() * 0.08), rad]);
    }
    // domed top: one to three large puffs near the middle
    const nt = Math.round((1 + Math.floor(r() * 3)) * stretch);
    for (let i = 0; i < nt; i++) {
      const rad = w * (0.15 + 0.05 * r());
      puffs.push([pad + sw / 2 + (r() - 0.5) * sw * 0.32, Y0 - h * (0.66 + r() * 0.08), rad]);
    }

    const off = document.createElement("canvas");
    off.width = Math.ceil(bw * dpr);
    off.height = Math.ceil(bh * dpr);
    const oc = off.getContext("2d");
    if (!oc) return;
    oc.scale(dpr, dpr);
    const disc = (x: number, y: number, rad: number) => {
      oc.beginPath();
      oc.arc(x, y, rad, 0, Math.PI * 2);
      oc.fill();
    };
    // body in the shade colour
    const body = oc.createLinearGradient(0, Y0 - h, 0, Y0 + w * 0.04);
    body.addColorStop(0, "#E4EDF7");
    body.addColorStop(1, "#BCCDE2");
    oc.fillStyle = body;
    puffs.forEach(([x, y, rad]) => disc(x, y, rad));
    // white highlights on top of each puff (source-atop keeps them inside the shape)
    oc.globalCompositeOperation = "source-atop";
    oc.filter = "blur(" + (w * 0.012).toFixed(1) + "px)";
    oc.fillStyle = "#FFFFFF";
    puffs.forEach(([x, y, rad]) => disc(x - rad * 0.06, y - rad * 0.2, rad * 0.88));
    oc.filter = "none";
    ctx.save();
    ctx.globalAlpha = alpha;
    if ("filter" in ctx) ctx.filter = "blur(0.6px)";
    ctx.drawImage(off, cx - bw / 2, baseY - Y0, bw, bh);
    ctx.restore();
  }

  function drawBG() {
    const W = bg.clientWidth,
      H = bg.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bg.width = Math.round(W * dpr);
    bg.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const phone = W < 700,
      hz = H * 0.64,
      M = Math.max(W, H);

    // winter twilight: deep indigo overhead → blue → lavender → golden horizon
    let g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, "#0B1F47");
    g.addColorStop(0.16, "#173E78");
    g.addColorStop(0.36, "#2F6AA8");
    g.addColorStop(0.58, "#7DB2DC");
    g.addColorStop(0.76, "#D9CFDB");
    g.addColorStop(0.9, "#F6C9A0");
    g.addColorStop(1, "#FBDDBE");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hz + 1);

    // early stars, fading out toward the horizon
    {
      const rs = rng(21),
        band = hz * 0.46,
        n = Math.min(240, Math.round((W * band) / 2600));
      for (let i = 0; i < n; i++) {
        const x = rs() * W,
          y = Math.pow(rs(), 1.6) * band,
          fade = 1 - y / band,
          big = rs() < 0.07,
          r0 = big ? 1.3 + rs() * 0.6 : 0.4 + rs() * 0.8,
          a = (0.35 + rs() * 0.6) * fade;
        ctx.fillStyle = `rgba(255,250,240,${a.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, r0, 0, 6.2832);
        ctx.fill();
        if (big) {
          // a small four-point glint on the brightest stars
          ctx.strokeStyle = `rgba(255,248,230,${(a * 0.55).toFixed(2)})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x - r0 * 4, y);
          ctx.lineTo(x + r0 * 4, y);
          ctx.moveTo(x, y - r0 * 4);
          ctx.lineTo(x, y + r0 * 4);
          ctx.stroke();
        }
      }
    }

    // soft sun rays fanning up from behind the clouds
    const sx = W * 0.72,
      sy = hz - H * 0.03,
      rr = rng(3);
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI / 2 + (i - 5) * 0.2 + (rr() - 0.5) * 0.08,
        wdt = 0.025 + rr() * 0.035,
        L = M * 1.1;
      const rg = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L);
      rg.addColorStop(0, "rgba(255,240,220,0.16)");
      rg.addColorStop(1, "rgba(255,240,220,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a - wdt) * L, sy + Math.sin(a - wdt) * L);
      ctx.lineTo(sx + Math.cos(a + wdt) * L, sy + Math.sin(a + wdt) * L);
      ctx.closePath();
      ctx.fill();
    }

    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      const x = (r() * 1.3 - 0.15) * W,
        y = hz * (0.08 + r() * 0.4),
        rad = (0.08 + r() * 0.14) * M;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.22);
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      cg.addColorStop(0, `rgba(255,255,255,${0.07 + r() * 0.1})`);
      cg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = cg;
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      ctx.restore();
    }
    // upper-sky cumulus (same painter as the horizon bank, so every cloud matches)
    {
      const rt = rng(31);
      const tops: Array<[number, number, number]> = phone
        ? [[0.12, 0.22, 0.42], [0.86, 0.3, 0.46], [0.5, 0.16, 0.34]]
        : [[0.1, 0.2, 0.15], [0.36, 0.13, 0.11], [0.66, 0.18, 0.13], [0.9, 0.26, 0.15], [0.2, 0.42, 0.1], [0.8, 0.48, 0.11]];
      // stretched wider than the horizon clouds, so the upper sky reads as long, drifting banks
      tops.forEach(([fxp, fyp, fw]) => cumulus(rt, W * fxp, hz * fyp, (phone ? W : M) * fw, 0.96, 1.5));
    }

    // horizon bank: two overlapping rows of the same cumulus (far row smaller and fainter)
    {
      const rh = rng(5),
        unit = phone ? W * 0.34 : M * 0.15;
      const far = [0.04, 0.2, 0.37, 0.53, 0.69, 0.85, 1.0];
      const near = [-0.03, 0.13, 0.3, 0.47, 0.63, 0.8, 0.97];
      far.forEach((f) => cumulus(rh, W * f, hz + unit * 0.06, unit * (0.85 + rh() * 0.3), 0.82));
      near.forEach((f) => cumulus(rh, W * f, hz + unit * 0.22, unit * (1.05 + rh() * 0.35), 1));
    }
    g = ctx.createRadialGradient(sx, sy, 0, sx, sy, M * 0.55);
    g.addColorStop(0, "rgba(255,226,186,0.75)");
    g.addColorStop(0.15, "rgba(255,196,146,0.32)");
    g.addColorStop(0.45, "rgba(255,170,120,0.06)");
    g.addColorStop(1, "rgba(255,170,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hz + 1);

    // ground + court (feet; camera 5.5 ft high)
    g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, "#B7CDE0");
    g.addColorStop(0.2, "#4F7EA8");
    g.addColorStop(1, "#173F66");
    ctx.fillStyle = g;
    ctx.fillRect(0, hz, W, H - hz);
    const hc = 5.5,
      Z0 = 9,
      Zf = Z0 + 44,
      Zn = Z0 + 22,
      f = ((H * 0.99 - hz) * Z0) / hc,
      vx = W * 0.5;
    const P3 = (X: number, Y: number, Z: number): Pt => [vx + (f * X) / Z, hz + (f * (hc - Y)) / Z];
    const P = (X: number, Z: number) => P3(X, 0, Z);
    const poly = (pts: Pt[], fill: string | CanvasGradient) => {
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      pts.slice(1).forEach((p) => ctx.lineTo(...p));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const quad = (x1: number, x2: number, z1: number, z2: number, fill: string | CanvasGradient) =>
      poly([P(x1, z1), P(x2, z1), P(x2, z2), P(x1, z2)], fill);
    g = ctx.createLinearGradient(0, P(0, 80)[1], 0, H);
    g.addColorStop(0, "#6A91B6");
    g.addColorStop(1, "#1B4C7A");
    quad(-19, 19, 6, 80, g);
    g = ctx.createLinearGradient(0, P(0, Zf)[1], 0, P(0, Z0)[1]);
    g.addColorStop(0, "#7AA6CF");
    g.addColorStop(0.4, "#4384BF");
    g.addColorStop(1, "#2A68A6");
    quad(-10, 10, Z0, Zf, g);
    // the kitchen (non-volley zone) is red on a real court
    g = ctx.createLinearGradient(0, P(0, Zn + 7)[1], 0, P(0, Zn - 7)[1]);
    g.addColorStop(0, "#C9786E");
    g.addColorStop(1, "#B43A2C");
    quad(-10, 10, Zn - 7, Zn + 7, g);
    const lw = 0.17,
      wl = "rgba(255,255,255,0.94)";
    quad(-10, 10, Z0, Z0 + lw, wl);
    quad(-10, 10, Zf - lw, Zf, wl);
    quad(-10, -10 + lw, Z0, Zf, wl);
    quad(10 - lw, 10, Z0, Zf, wl);
    quad(-10, 10, Zn - 7 - lw, Zn - 7, wl);
    quad(-10, 10, Zn + 7, Zn + 7 + lw, wl);
    quad(-lw / 2, lw / 2, Z0, Zn - 7, wl);
    quad(-lw / 2, lw / 2, Zn + 7, Zf, wl);

    // benches along both sidelines (drawn far to near)
    function bench(side: number, z1: number, z2: number) {
      const xi = side * 12.6,
        xo = side * 14.1,
        seat = 1.5,
        back = 3;
      poly(
        [P3(xi + side * 0.2, 0, z1 - 0.2), P3(xo + side * 0.6, 0, z1 - 0.2), P3(xo + side * 0.6, 0, z2 + 0.4), P3(xi + side * 0.2, 0, z2 + 0.4)],
        "rgba(6,24,48,0.28)",
      );
      ctx.strokeStyle = "#0F1B33";
      ctx.lineCap = "round";
      [z1 + 0.3, z2 - 0.3].forEach((z) => {
        [xi + side * 0.15, xo - side * 0.15].forEach((x) => {
          const a = P3(x, seat, z),
            b = P3(x, 0, z);
          ctx.lineWidth = Math.max(1, (f * 0.12) / z);
          ctx.beginPath();
          ctx.moveTo(...a);
          ctx.lineTo(...b);
          ctx.stroke();
        });
        const a = P3(xo, back, z),
          b = P3(xo, seat, z);
        ctx.lineWidth = Math.max(1, (f * 0.12) / z);
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      });
      const wood = ctx.createLinearGradient(...P3(xi, seat, z1), ...P3(xi, seat, z2));
      wood.addColorStop(0, "#D99A5B");
      wood.addColorStop(1, "#C07A3E");
      poly([P3(xi, seat, z1), P3(xo, seat, z1), P3(xo, seat, z2), P3(xi, seat, z2)], wood);
      poly([P3(xi, seat, z1), P3(xi, seat, z2), P3(xi, seat - 0.22, z2), P3(xi, seat - 0.22, z1)], "#9A5E2B");
      poly([P3(xo, back, z1), P3(xo, back, z2), P3(xo, back - 0.5, z2), P3(xo, back - 0.5, z1)], "#CF8A4C");
      poly([P3(xo, back - 0.75, z1), P3(xo, back - 0.75, z2), P3(xo, back - 1.2, z2), P3(xo, back - 1.2, z1)], "#C88245");
      const sxi = xi + side * 0.08,
        sxo = xo - side * 0.08;
      poly(
        [P3(sxi, seat + 0.14, z1 + 0.3), P3(sxo, seat + 0.14, z1 + 0.25), P3(sxo, seat + 0.1, z2 - 0.4), P3(sxi, seat + 0.16, z2 - 0.3), P3(sxi, seat, z2 - 0.3), P3(sxi, seat, z1 + 0.3)],
        "rgba(255,255,255,0.95)",
      );
      poly(
        [P3(xo, back + 0.16, z1 + 0.2), P3(xo, back + 0.2, (z1 + z2) / 2), P3(xo, back + 0.12, z2 - 0.3), P3(xo, back - 0.05, z2 - 0.3), P3(xo, back - 0.05, z1 + 0.2)],
        "rgba(255,255,255,0.92)",
      );
    }
    [[38, 44], [24, 30], [12.5, 18.5]].forEach(([z1, z2]) => {
      bench(-1, z1, z2);
      bench(1, z1, z2);
    });

    // net
    const nl = P(-11, Zn),
      nr = P(11, Zn),
      topY = hz + (f * (hc - 3)) / Zn;
    ctx.fillStyle = "rgba(15,27,51,0.4)";
    ctx.fillRect(nl[0], topY, nr[0] - nl[0], nl[1] - topY);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillRect(nl[0], topY - 1, nr[0] - nl[0], 2.5);
    ctx.fillStyle = "#0F1B33";
    ctx.fillRect(nl[0] - 2, topY - 2, 3, nl[1] - topY + 2);
    ctx.fillRect(nr[0] - 1, topY - 2, 3, nr[1] - topY + 2);

    g = ctx.createLinearGradient(0, hz - H * 0.06, 0, hz + H * 0.12);
    g.addColorStop(0, "rgba(245,238,230,0)");
    g.addColorStop(0.4, "rgba(245,240,233,0.75)");
    g.addColorStop(1, "rgba(214,228,240,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, hz - H * 0.06, W, H * 0.18);

    // branded windscreen fence along the far end of the court
    {
      const Zw = 60,
        xa = P(-26, Zw)[0],
        xb = P(26, Zw)[0];
      const yTop = P3(0, 10, Zw)[1],
        yMid = P3(0, 5.5, Zw)[1],
        yBot = P(0, Zw)[1];
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "rgba(20,36,64,0.35)";
      ctx.lineWidth = 0.7;
      const cell = Math.max(3, (yMid - yTop) / 5);
      ctx.beginPath();
      for (let x = xa - (yMid - yTop); x < xb; x += cell) {
        ctx.moveTo(Math.max(xa, x), yTop + Math.max(0, xa - x));
        ctx.lineTo(Math.min(xb, x + (yMid - yTop)), yMid - Math.max(0, x + (yMid - yTop) - xb));
      }
      for (let x = xa; x < xb + (yMid - yTop); x += cell) {
        ctx.moveTo(Math.min(xb, x), yTop + Math.max(0, x - xb));
        ctx.lineTo(Math.max(xa, x - (yMid - yTop)), yMid - Math.max(0, xa - (x - (yMid - yTop))));
      }
      ctx.stroke();
      const wg = ctx.createLinearGradient(0, yMid, 0, yBot);
      wg.addColorStop(0, "#1A3359");
      wg.addColorStop(1, "#10213D");
      ctx.fillStyle = wg;
      ctx.fillRect(xa, yMid, xb - xa, yBot - yMid);
      ctx.fillStyle = "#EC6620";
      ctx.fillRect(xa, yMid, xb - xa, Math.max(1.5, (yBot - yMid) * 0.08));
      const fs = (yBot - yMid) * 0.42;
      ctx.font = `800 ${fs.toFixed(1)}px ${sansFamily}`;
      ctx.textBaseline = "middle";
      const label = "DINK N' DRIVE  ·  LUYANG  ·  ",
        lw2 = ctx.measureText(label).width;
      ctx.save();
      ctx.beginPath();
      ctx.rect(xa, yMid, xb - xa, yBot - yMid);
      ctx.clip();
      for (let x = xa + 6, i = 0; x < xb && lw2 > 0; x += lw2, i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.85)" : "#F59A5C";
        ctx.fillText(label, x, (yMid + yBot) / 2 + fs * 0.05);
      }
      ctx.restore();
      ctx.strokeStyle = "#0F1B33";
      ctx.lineWidth = Math.max(1, (f * 0.18) / Zw);
      ctx.beginPath();
      ctx.moveTo(xa, yTop);
      ctx.lineTo(xb, yTop);
      ctx.stroke();
      for (let X = -26; X <= 26; X += 6.5) {
        const a = P3(X, 10, Zw),
          b = P(X, Zw);
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(xa, yTop - 1.5, xb - xa, 2);
      ctx.restore();
    }

    // floodlights around the court: poles, lamp banks, glow and beams
    const lamps: Array<[number, number, number, number, number]> = [];
    [58, 44, 30, 18].forEach((Z) =>
      [-1, 1].forEach((side) => {
        const X = side * 15.5,
          base = P3(X, 0, Z),
          top = P3(X, 17, Z);
        if (top[0] < -60 || top[0] > W + 60) return;
        ctx.strokeStyle = "#13233F";
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1.2, (f * 0.32) / Z);
        ctx.beginPath();
        ctx.moveTo(...base);
        ctx.lineTo(...top);
        ctx.stroke();
        const hw = (f * 2.6) / Z,
          hh = (f * 1.1) / Z,
          lx = top[0] - side * hw * 0.2;
        ctx.fillStyle = "#1B2B47";
        ctx.fillRect(lx - hw / 2, top[1] - hh, hw, hh);
        ctx.fillStyle = "#FFF6DC";
        for (let c = 0; c < 3; c++) ctx.fillRect(lx - hw / 2 + hw * (0.07 + c * 0.31), top[1] - hh * 0.82, hw * 0.25, hh * 0.6);
        lamps.push([lx, top[1] - hh / 2, f / Z, X, Z]);
      }),
    );
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    lamps.forEach(([lx, ly, k, X, Z]) => {
      const a = P3(X * 0.2, 0, Z - 8),
        b = P3(X * 0.2, 0, Z + 8);
      const bm = ctx.createLinearGradient(lx, ly, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      bm.addColorStop(0, "rgba(255,236,200,0.16)");
      bm.addColorStop(1, "rgba(255,236,200,0)");
      ctx.fillStyle = bm;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(...a);
      ctx.lineTo(...b);
      ctx.closePath();
      ctx.fill();
      const R = k * 7,
        gl = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
      gl.addColorStop(0, "rgba(255,246,222,0.9)");
      gl.addColorStop(0.14, "rgba(255,226,172,0.38)");
      gl.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
    });
    ctx.restore();

    // festoon string lights strung from pole to pole across the court
    {
      const key: Record<string, (typeof lamps)[number]> = {};
      lamps.forEach((l) => {
        key[(l[3] < 0 ? "L" : "R") + l[4]] = l;
      });
      const chain: Array<[number, number, number]> = [[-40, H * 0.04, 1.3]];
      [18, 30, 44, 58].forEach((Z) => {
        const l = key["L" + Z];
        if (l) chain.push([l[0], l[1] - 3, l[2] / 28]);
      });
      [58, 44, 30, 18].forEach((Z) => {
        const l = key["R" + Z];
        if (l) chain.push([l[0], l[1] - 3, l[2] / 28]);
      });
      chain.push([W + 40, H * 0.04, 1.3]);
      const rb = rng(9),
        bulbs: Array<[number, number, number, boolean]> = [];
      for (let i = 0; i < chain.length - 1; i++) {
        const [ax, ay, as] = chain[i],
          [bx, by, bsz] = chain[i + 1];
        const d = Math.hypot(bx - ax, by - ay),
          cx2 = (ax + bx) / 2,
          cy2 = Math.max(ay, by) + d * 0.12 + 8;
        ctx.strokeStyle = "rgba(14,24,44,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx2, cy2, bx, by);
        ctx.stroke();
        const sc = (as + bsz) / 2,
          n = Math.max(3, Math.floor(d / (24 * sc)));
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n,
            x = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cx2 + u * u * bx,
            y = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cy2 + u * u * by;
          bulbs.push([x, y + 3 * (as + (bsz - as) * u), 2.3 * (as + (bsz - as) * u), rb() < 0.22]);
        }
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      bulbs.forEach(([x, y, rad, warm]) => {
        const gg = ctx.createRadialGradient(x, y, 0, x, y, rad * 6);
        gg.addColorStop(0, warm ? "rgba(255,170,100,0.6)" : "rgba(255,220,160,0.55)");
        gg.addColorStop(1, "rgba(255,200,140,0)");
        ctx.fillStyle = gg;
        ctx.fillRect(x - rad * 6, y - rad * 6, rad * 12, rad * 12);
      });
      ctx.restore();
      bulbs.forEach(([x, y, rad, warm]) => {
        ctx.fillStyle = warm ? "#FFC48A" : "#FFF1CF";
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, 6.2832);
        ctx.fill();
      });
    }

    g = ctx.createLinearGradient(0, H * 0.82, 0, H);
    g.addColorStop(0, "rgba(5,30,58,0)");
    g.addColorStop(1, "rgba(5,30,58,0.3)");
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.82, W, H * 0.18);

    // soft snowbanks in the bottom corners (laptop only; phones keep the clean look)
    if (!phone) {
      const bank = (pts: Pt[]) => {
        ctx.beginPath();
        ctx.moveTo(...pts[0]);
        for (let i = 1; i < pts.length; i += 3) ctx.bezierCurveTo(...pts[i], ...pts[i + 1], ...pts[i + 2]);
        ctx.closePath();
        const sg = ctx.createLinearGradient(0, H * 0.78, 0, H);
        sg.addColorStop(0, "#FFFFFF");
        sg.addColorStop(0.5, "#EEF5FB");
        sg.addColorStop(1, "#C8DBEB");
        ctx.fillStyle = sg;
        ctx.shadowColor = "rgba(8,30,60,0.35)";
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = -4;
        ctx.fill();
        ctx.shadowColor = "transparent";
      };
      bank([[-20, H + 20], [-20, H * 0.88], [W * 0.05, H * 0.83], [W * 0.12, H * 0.86], [W * 0.18, H * 0.885], [W * 0.24, H * 0.93], [W * 0.32, H + 20]]);
      bank([[W + 20, H + 20], [W + 20, H * 0.9], [W * 0.95, H * 0.87], [W * 0.89, H * 0.9], [W * 0.84, H * 0.925], [W * 0.8, H * 0.96], [W * 0.74, H + 20]]);
      const rs2 = rng(14);
      for (let i = 0; i < 70; i++) {
        const left = i % 3 !== 0,
          x = left ? rs2() * W * 0.3 : W - rs2() * W * 0.24,
          y = H * (left ? 0.86 : 0.9) + rs2() * H * 0.12;
        ctx.fillStyle = `rgba(255,255,255,${(0.5 + rs2() * 0.5).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + rs2() * 1.2, 0, 6.2832);
        ctx.fill();
      }
    }
  }

  /* ---------- snow ---------- */
  const sctx = snow.getContext("2d")!;
  type Flake = { L: number; x: number; y: number; r: number; v: number; ph: number; fq: number };
  let flakes: Flake[] = [],
    snowRAF = 0,
    sW = 0,
    sH = 0,
    lastT = 0;
  const LAYERS = [
    { r: [1.0, 1.9], v: [16, 28], a: 0.85, sway: 8 },
    { r: [1.9, 3.2], v: [28, 46], a: 0.95, sway: 14 },
    { r: [4.2, 7.2], v: [48, 72], a: 0.6, sway: 22 },
  ];
  const srnd = rng(77);
  function flake(anywhere: boolean): Flake {
    const p = srnd(),
      L = p < 0.62 ? 0 : p < 0.93 ? 1 : 2,
      ly = LAYERS[L];
    return {
      L,
      x: srnd() * sW,
      y: anywhere ? srnd() * sH : -10,
      r: ly.r[0] + srnd() * (ly.r[1] - ly.r[0]),
      v: ly.v[0] + srnd() * (ly.v[1] - ly.v[0]),
      ph: srnd() * 6.28,
      fq: 0.4 + srnd() * 0.6,
    };
  }
  function initSnow() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    sW = snow.clientWidth;
    sH = snow.clientHeight;
    if (!sW || !sH) return;
    snow.width = Math.round(sW * dpr);
    snow.height = Math.round(sH * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(440, Math.round((sW * sH) / 2800));
    flakes = Array.from({ length: n }, () => flake(true));
  }
  function drawSnow(t: number) {
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    sctx.clearRect(0, 0, sW, sH);
    for (const fl of flakes) {
      const ly = LAYERS[fl.L];
      fl.y += fl.v * dt;
      fl.x += (Math.sin((t / 1000) * fl.fq + fl.ph) * ly.sway + 6) * dt;
      if (fl.y > sH + 10) Object.assign(fl, flake(false));
      if (fl.x > sW + 10) fl.x = -10;
      if (fl.L === 2) {
        const gg = sctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, fl.r);
        gg.addColorStop(0, `rgba(255,255,255,${ly.a})`);
        gg.addColorStop(1, "rgba(255,255,255,0)");
        sctx.fillStyle = gg;
      } else sctx.fillStyle = `rgba(255,255,255,${ly.a})`;
      sctx.beginPath();
      sctx.arc(fl.x, fl.y, fl.r, 0, 6.2832);
      sctx.fill();
      if (fl.L < 2) {
        sctx.strokeStyle = "rgba(40,80,130,0.28)";
        sctx.lineWidth = 0.6;
        sctx.stroke();
      }
    }
    if (!reduce && !document.hidden) snowRAF = requestAnimationFrame(drawSnow);
  }

  /* ---------- layout: slab, paddle, ice break, ball, chips, pass, shards ---------- */
  const AR = 586 / 1156; // paddle image aspect ratio
  const HC = { u: 0.5, v: 0.36 }; // the break is centred behind the paddle head
  const K1 = 1.25,
    RX = 0.55,
    RY = 0.38; // hole radii as fractions of paddle width/height; K1 = worst-case edge roughness
  const SHARD_POLY = [
    "0 18%, 100% 0, 72% 100%",
    "12% 0, 100% 38%, 44% 100%, 0 68%",
    "0 0, 100% 28%, 22% 100%",
    "30% 0, 100% 62%, 0 100%",
    "0 30%, 70% 0, 100% 100%",
    "20% 0, 100% 20%, 80% 100%, 0 80%",
    "0 0, 100% 50%, 10% 100%",
    "50% 0, 100% 100%, 0 70%",
    "0 40%, 60% 0, 100% 70%, 30% 100%",
  ];
  const canHole = CSS.supports("clip-path", 'path(evenodd, "M0 0L1 0L1 1Z")');
  const place = (el: HTMLElement, x: number, y: number, w?: number, h?: number) => {
    el.style.left = x + "px";
    el.style.top = y + "px";
    if (w != null) el.style.width = w + "px";
    if (h != null) el.style.height = h + "px";
  };
  const rectOf = (el: Element, S: DOMRect): Box => {
    const b = el.getBoundingClientRect();
    return { l: b.left - S.left, t: b.top - S.top, r: b.right - S.left, b: b.bottom - S.top };
  };
  const hit = (a: Box, b: Box, m = 0) => a.l < b.r + m && a.r > b.l - m && a.t < b.b + m && a.b > b.t - m;
  const rrect = (w: number, h: number, R: number) =>
    `M ${R} 0 H ${w - R} A ${R} ${R} 0 0 1 ${w} ${R} V ${h - R} A ${R} ${R} 0 0 1 ${w - R} ${h} H ${R} A ${R} ${R} 0 0 1 0 ${h - R} V ${R} A ${R} ${R} 0 0 1 ${R} 0 Z`;
  const f1 = (v: number) => v.toFixed(1);
  const pp = (a: Pt[]) => a.map((p) => f1(p[0]) + "," + f1(p[1])).join(" ");
  const norm = (x: number, y: number): Pt => {
    const L = Math.hypot(x, y) || 1;
    return [x / L, y / L];
  };

  // An ice-like break: a chunky saw-toothed hole (thick faceted edge, crushed halo, shards and cracks drawn below).
  function shatter(hx: number, hy: number, rx: number, ry: number, P: { w: number; h: number }, yMin: number, phone: boolean) {
    const r = rng(41),
      TAU = Math.PI * 2,
      N = phone ? 26 : 34;
    const ph = [r() * TAU, r() * TAU];
    const m = (a: number) => 1 + 0.08 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]);
    const cl = (x: number, y: number): Pt => [Math.max(8, Math.min(P.w - 8, x)), Math.max(yMin, Math.min(P.h - 8, y))];
    const hole: Pt[] = [];
    for (let i = 0; i < N; i++) {
      const a = ((i + (r() - 0.5) * 0.45) / N) * TAU;
      let k = m(a) * (i % 2 ? 0.84 + r() * 0.08 : 1.0 + r() * 0.1);
      if (r() < 0.15) k *= 0.86;
      hole.push(cl(hx + Math.cos(a) * rx * k, hy + Math.sin(a) * ry * k));
    }
    return { hole, r };
  }

  function layout() {
    const W = stage.clientWidth,
      H = stage.clientHeight;
    if (!W || !H) return;
    const phone = W < 700;
    const S = stage.getBoundingClientRect();
    let P: { x: number; y: number; w: number; h: number };
    if (phone) {
      place(nav, 0, 0, W);
      const navH = nav.offsetHeight;
      place(cta, 0, 0, W);
      const ctaH = cta.offsetHeight;
      place(cta, 0, H - ctaH - 8);
      const top = navH + 12,
        bottom = H - ctaH - 36;
      P = { x: 0, y: top, w: W, h: Math.max(320, bottom - top) };
      place(head, P.x + 20, P.y + 20, P.w - 40);
    } else {
      const w = W < 1000 ? W * 0.82 : Math.min(W * 0.68, 1000);
      // shifted right of centre to leave a column for the booking pass on the left
      const x = (W - w) / 2 + (W < 1000 ? W * 0.05 : W * 0.078);
      // measure the nav and text first, so the slab is always tall enough to hold them
      place(nav, x, 0, w);
      const navH = nav.offsetHeight,
        colW = w * 0.54;
      place(head, x + 44, 0, colW);
      place(cta, x + 44, 0, colW);
      const total = head.offsetHeight + 30 + cta.offsetHeight;
      const h = Math.min(H - 24, Math.max(Math.min(H * 0.8, 660, w * 0.72), navH + total + 64));
      const y = Math.max(12, (H - h) / 2 - H * 0.01);
      P = { x, y, w, h };
      place(nav, P.x, P.y, P.w);
      const y0 = P.y + navH + Math.max(14, (P.h - navH - total) / 2);
      place(head, P.x + 44, y0);
      place(cta, P.x + 44, y0 + head.offsetHeight + 30);
    }
    place(panel, P.x, P.y, P.w, P.h);
    shadowSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const hr = rectOf(head, S),
      cr = rectOf(cta, S),
      nr = rectOf(nav, S);
    const textEls = phone
      ? head.querySelectorAll(".l-loc, h1 span, .l-para, .l-book")
      : root.querySelectorAll('[data-l="head"] .l-loc, [data-l="head"] h1 span, [data-l="head"] .l-para, [data-l="head"] .l-book, [data-l="cta"] .l-features li');
    const textR = Math.max(...[...textEls].map((e) => rectOf(e, S).r));

    // Right-hand chip column (laptops): measured first, so the paddle can be kept left of it.
    // The column is reserved only if the paddle stays at least 75% of its natural size;
    // otherwise the chips hide and the paddle keeps its full size.
    const col = [chipLights, chipPaddles, chipAhead];
    col.forEach((c) => (c.hidden = false)); // measurable
    const colSizes = col.map((c) => [c.offsetWidth, c.offsetHeight] as const);
    col.forEach((c) => (c.hidden = true));
    const colW = Math.max(...colSizes.map(([w0]) => w0)),
      colL = W - 12 - colW;
    let useCol = false;

    // paddle: in front of the glass; the break sits behind its head and stays fully inside the slab
    let ph: number, cx: number, cy: number;
    if (phone) {
      const free = P.y + P.h - hr.b;
      ph = Math.min((free - 18) / (2 * K1 * RY), (free + 22) / (K1 * RY + (1 - HC.v)), P.w * 1.3);
      cy = hr.b + 8 + K1 * RY * ph;
      cx = P.x + P.w * 0.6;
    } else {
      const top = nr.b + 6,
        bottom = P.y + P.h - 10,
        left = textR + 40,
        right = P.x + P.w - 10,
        maxV = Math.min(P.h * 0.9, (bottom - top) / (2 * K1 * RY));
      // natural size: the whole ice break fits between the text and the slab's right edge
      const natural = Math.min(maxV, (right - left) / (2 * K1 * RX * AR));
      // with the chip column: the paddle IMAGE stays left of the column (the jagged break may
      // tuck under the chips) and the break may come a little closer to the text
      const imgRight = colL - 8,
        leftC = textR + 28,
        hole = K1 * RX; // break half-width as a fraction of the paddle width
      const withCol = Math.min(maxV, (imgRight - leftC) / (0.5 + hole) / AR);
      if (colL > P.x + P.w * 0.6 && withCol >= natural * 0.75) {
        useCol = true;
        ph = withCol;
        const pwC = ph * AR;
        cx = Math.min(imgRight - 0.5 * pwC, right - hole * pwC);
      } else {
        ph = natural;
        cx = Math.min(right - K1 * RX * ph * AR, Math.max(left + K1 * RX * ph * AR, P.x + P.w * 0.72));
      }
      cy = Math.min(Math.max(top + K1 * RY * ph, P.y + P.h * 0.52), bottom - K1 * RY * ph);
    }
    ph = Math.max(ph, 60);
    const pw = ph * AR,
      rx = pw * RX,
      ry = ph * RY;
    place(pFront, cx - HC.u * pw, cy - HC.v * ph, pw, ph);

    // the break
    const yMin = phone ? 10 : nr.b - P.y + 4;
    const hx = cx - P.x,
      hy = cy - P.y;
    const B = shatter(hx, hy, rx, ry, P, yMin, phone);
    const holeD = "M " + B.hole.map((p) => f1(p[0]) + " " + f1(p[1])).join(" L ") + " Z";
    const outer = rrect(P.w, P.h, phone ? 26 : 30);
    if (canHole) {
      panel.style.clipPath = `path(evenodd, '${outer} ${holeD}')`;
      panel.style.setProperty("-webkit-clip-path", panel.style.clipPath);
    }
    shadowPath.setAttribute("d", canHole ? `${outer} ${holeD}` : outer);
    shadowPath.setAttribute("transform", `translate(${P.x} ${P.y})`);

    const txt = [hr, cr].map((b) => ({ l: b.l - P.x - 12, t: b.t - P.y - 12, r: b.r - P.x + 12, b: b.b - P.y + 12 }));
    const underText = (x: number, y: number) => txt.some((b) => x > b.l && x < b.r && y > b.t && y < b.b);
    let s = `<defs>
      <filter id="l-soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${phone ? 7 : 11}"/></filter>
      <mask id="l-noHole" maskUnits="userSpaceOnUse" x="${-P.x}" y="${-P.y}" width="${W}" height="${H}"><rect x="${-P.x}" y="${-P.y}" width="${W}" height="${H}" fill="#fff"/><path d="${holeD}" fill="#000"/></mask>`;
    let body = `<path d="${outer}" fill="none" stroke="#fff" stroke-opacity="0.92" stroke-width="1.4"/>`;
    if (canHole) {
      const rc = B.r,
        H0 = B.hole,
        n = H0.length;
      // crushed, whiter ice around the opening
      const halo = (k: number) => "M " + H0.map((p) => f1(hx + (p[0] - hx) * k) + " " + f1(hy + (p[1] - hy) * k)).join(" L ") + " Z";
      body += `<g mask="url(#l-noHole)"><path d="${halo(1.42)}" fill="#fff" fill-opacity="0.5" filter="url(#l-soft)"/><path d="${halo(1.14)}" fill="#F4FAFF" fill-opacity="0.55" filter="url(#l-soft)"/></g>`;
      // short tapered cracks running out of the break
      for (let j = 0; j < (phone ? 7 : 10); j++) {
        const i = Math.floor(rc() * n),
          p = H0[i];
        let [dx, dy] = norm(p[0] - hx, p[1] - hy);
        const jt = (rc() - 0.5) * 0.7;
        [dx, dy] = [dx * Math.cos(jt) - dy * Math.sin(jt), dx * Math.sin(jt) + dy * Math.cos(jt)];
        const L = rx * (0.22 + rc() * 0.42),
          w0 = phone ? 2 : 3,
          tip: Pt = [p[0] + dx * L, p[1] + dy * L];
        if (underText(...tip) || tip[1] < yMin || tip[0] < 4 || tip[0] > P.w - 4 || tip[1] > P.h - 4) continue;
        body += `<polygon class="frag" points="${pp([[p[0] - dy * w0, p[1] + dx * w0], [p[0] + dy * w0, p[1] - dx * w0], tip])}" fill="#fff" fill-opacity="0.8"/>`;
        if (rc() < 0.6) {
          const b2 = 0.5 + rc() * 0.3,
            br = (rc() < 0.5 ? -1 : 1) * (0.45 + rc() * 0.35);
          const m0: Pt = [p[0] + dx * L * b2, p[1] + dy * L * b2],
            ux = dx * Math.cos(br) - dy * Math.sin(br),
            uy = dx * Math.sin(br) + dy * Math.cos(br);
          const t2: Pt = [m0[0] + ux * L * 0.45, m0[1] + uy * L * 0.45];
          if (!underText(...t2))
            body += `<polygon class="frag" points="${pp([[m0[0] - uy * 1.2, m0[1] + ux * 1.2], [m0[0] + uy * 1.2, m0[1] - ux * 1.2], t2])}" fill="#fff" fill-opacity="0.55"/>`;
        }
      }
      // the thick, faceted icy edge (chunks bent toward the viewer)
      const T = phone ? [6, 11] : [10, 20];
      const Q: Pt[] = H0.map((p) => {
        const [nx, ny] = norm(p[0] - hx, p[1] - hy),
          d = T[0] + rc() * (T[1] - T[0]);
        return [Math.max(4, Math.min(P.w - 4, p[0] + nx * d)), Math.max(yMin - 2, Math.min(P.h - 4, p[1] + ny * d))];
      });
      body += `<path d="${holeD}" fill="none" stroke="rgba(10,40,80,0.35)" stroke-width="3" transform="translate(1.5 2)"/>`;
      for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n,
          a = H0[i],
          b = H0[i2],
          qa = Q[i],
          qb = Q[i2];
        let [nx, ny] = norm(-(b[1] - a[1]), b[0] - a[0]);
        if (((a[0] + b[0]) / 2 - hx) * nx + ((a[1] + b[1]) / 2 - hy) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        const lit = -(nx * 0.45 + ny * 0.89);
        const m1: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          m2: Pt = [(qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2];
        const stops: Array<[string, number]> =
          lit > -0.15
            ? [["#FFFFFF", 0.97], ["#E2F1FB", 0.85], ["#BCD8EE", 0.12]]
            : [["#EEF6FC", 0.92], ["#97BCDC", 0.78], ["#7DA6CC", 0.1]];
        s += `<linearGradient id="l-eg${i}" gradientUnits="userSpaceOnUse" x1="${f1(m1[0])}" y1="${f1(m1[1])}" x2="${f1(m2[0])}" y2="${f1(m2[1])}">${stops
          .map((st, k) => `<stop offset="${[0, 0.45, 1][k]}" stop-color="${st[0]}" stop-opacity="${st[1]}"/>`)
          .join("")}</linearGradient>`;
        body += `<polygon class="frag" points="${pp([a, b, qb, qa])}" fill="url(#l-eg${i})"/>`;
      }
      body += `<polyline points="${pp([...Q, Q[0]])}" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="0.8" stroke-linejoin="round"/>`;
      body += `<path d="${holeD}" fill="none" stroke="#fff" stroke-width="2" stroke-opacity="0.98" stroke-linejoin="round"/>`;
      // big shards jutting into the opening, two-tone like broken ice
      for (let j = 0; j < (phone ? 6 : 8); j++) {
        const i = (Math.floor((rc() * n) / 2) * 2) % n,
          p = H0[i],
          p0 = H0[(i - 1 + n) % n],
          p1 = H0[(i + 1) % n];
        const b0: Pt = [p[0] + (p0[0] - p[0]) * 0.5, p[1] + (p0[1] - p[1]) * 0.5],
          b1: Pt = [p[0] + (p1[0] - p[0]) * 0.5, p[1] + (p1[1] - p[1]) * 0.5];
        const [dx, dy] = norm(hx - p[0], hy - p[1]),
          L = Math.min(rx, ry) * (0.16 + rc() * 0.2),
          sk = (rc() - 0.5) * 0.5;
        const apex: Pt = [p[0] + (dx - dy * sk) * L, p[1] + (dy + dx * sk) * L],
          bm: Pt = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2];
        body += `<polygon class="frag" points="${pp([b0, apex, bm])}" fill="#fff" fill-opacity="0.9"/>`;
        body += `<polygon class="frag" points="${pp([bm, apex, b1])}" fill="#9EC3E2" fill-opacity="0.85"/>`;
        body += `<polyline points="${pp([b0, apex, b1])}" fill="none" stroke="#fff" stroke-width="0.9" stroke-opacity="0.9" stroke-linejoin="round"/>`;
      }
      // a few glints on the ice
      for (let j = 0; j < (phone ? 4 : 6); j++) {
        const p = Q[Math.floor(rc() * n)],
          g0 = 5 + rc() * 6;
        body += `<path class="glint" style="animation-delay:${(-rc() * 3).toFixed(2)}s" d="M${f1(p[0] - g0)} ${f1(p[1])} L${f1(p[0] + g0)} ${f1(p[1])} M${f1(p[0])} ${f1(p[1] - g0)} L${f1(p[0])} ${f1(p[1] + g0)}" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`;
      }
    }
    s += `</defs><g transform="translate(${P.x} ${P.y})">${body}</g>`;
    fx.setAttribute("viewBox", `0 0 ${W} ${H}`);
    fx.innerHTML = s;

    // the ball, meeting the paddle face, with speed lines and an impact burst
    const bs = phone ? Math.min(pw * 0.52, 104) : Math.min(pw * 0.5, 150);
    const pl = cx - HC.u * pw,
      pt = cy - HC.v * ph;
    const contact: Pt = [pl + pw * 0.17, pt + ph * 0.25];
    let bx = contact[0] - bs * 0.34;
    const by = contact[1] + bs * 0.06;
    if (!phone) bx = Math.max(bx, textR + 14 + bs / 2);
    place(ball, bx - bs / 2, by - bs / 2, bs, bs);
    ball.style.setProperty("--fx", (-bs * 1.8).toFixed(0) + "px");
    ball.style.setProperty("--fy", (bs * 1.3).toFixed(0) + "px");
    const ballR = { l: bx - bs / 2, t: by - bs / 2, r: bx + bs / 2, b: by + bs / 2 };
    const dir = norm(-0.78, 0.62),
      perp: Pt = [-dir[1], dir[0]];
    let tr = "<defs>",
      tl = "";
    [-1, 0, 1].forEach((jj, k) => {
      const off = jj * bs * 0.26,
        sx0 = bx + dir[0] * bs * 0.5 + perp[0] * off,
        sy0 = by + dir[1] * bs * 0.5 + perp[1] * off;
      let L = bs * (jj === 0 ? 1.5 : 1.05);
      if (!phone) {
        const lim = (sx0 - (textR + 10)) / -dir[0];
        if (lim < L) L = Math.max(0, lim);
      } else L = Math.min(L, (sx0 - 6) / -dir[0]);
      if (L < 12) return;
      const ex = sx0 + dir[0] * L,
        ey = sy0 + dir[1] * L;
      tr += `<linearGradient id="l-tg${k}" gradientUnits="userSpaceOnUse" x1="${f1(sx0)}" y1="${f1(sy0)}" x2="${f1(ex)}" y2="${f1(ey)}"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
      tl += `<line x1="${f1(sx0)}" y1="${f1(sy0)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="url(#l-tg${k})" stroke-width="${jj === 0 ? 3.4 : 2.2}" stroke-linecap="round"/>`;
    });
    let rays = "";
    for (let j = 0; j < 9; j++) {
      const a = -1.75 + j * (3.5 / 8),
        u: Pt = [Math.cos(a), Math.sin(a)],
        r0 = bs * 0.5,
        r1 = bs * (0.68 + (j % 2) * 0.14);
      rays += `<line x1="${f1(contact[0] + u[0] * r0)}" y1="${f1(contact[1] + u[1] * r0)}" x2="${f1(contact[0] + u[0] * r1)}" y2="${f1(contact[1] + u[1] * r1)}" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    trail.setAttribute("viewBox", `0 0 ${W} ${H}`);
    trail.innerHTML = `${tr}</defs>${tl}<g class="rays">${rays}</g><circle class="ring" cx="${f1(contact[0])}" cy="${f1(contact[1])}" r="${f1(bs * 0.42)}" fill="none" stroke="#fff" stroke-width="2.5"/>`;

    // booking pass in the open column left of the slab (laptop only)
    pass.hidden = phone || P.x < 250;
    let passR: Box = { l: 0, t: 0, r: 0, b: 0 };
    if (!pass.hidden) {
      const k = Math.min(1.02, (P.x - 36) / 250);
      pass.style.setProperty("--k", k.toFixed(3));
      const hh = pass.offsetHeight,
        ccx = P.x / 2 - 4,
        ccy = P.y + P.h * 0.58;
      place(pass, ccx - 125, ccy - hh / 2);
      passR = { l: ccx - 125 * k, t: ccy - (hh * k) / 2, r: ccx + 125 * k, b: ccy + (hh * k) / 2 };
    }

    // floating chips (laptop only)
    [chipPrice, chipOpen].forEach((c) => {
      c.hidden = phone;
    });
    col.forEach((c) => (c.hidden = true)); // shown only if placed below
    const rightR: Box[] = [];
    if (!phone) {
      place(chipPrice, Math.max(8, P.x / 2 - chipPrice.offsetWidth / 2 - 10), Math.max(8, Math.min(P.y + P.h * 0.08, passR.t - chipPrice.offsetHeight - 40)));
      place(chipOpen, P.x + P.w - chipOpen.offsetWidth - 14, P.y - chipOpen.offsetHeight - 14);
      [chipPrice, chipOpen].forEach((c) => {
        const b = rectOf(c, S);
        c.hidden = b.l < 2 || b.r > W - 2 || b.t < 2 || hit(b, ballR, 8) || hit(b, hr, 8) || hit(b, cr, 8) || (!pass.hidden && hit(b, passR, 6));
      });

      // Right-side chips (lights, paddles, book-ahead): one left-aligned column at colL with
      // equal gaps (capped at COL_GAP so they read as a group), centred vertically between the
      // nav row and the slab's bottom edge. The paddle was already kept left of this column.
      if (useCol) {
        const n = col.length,
          sumH = colSizes.reduce((sum, [, h0]) => sum + h0, 0),
          y0 = nr.b + 18,
          y1 = Math.min(H - 12, P.y + P.h + 8),
          COL_GAP = 72,
          gap = Math.min(COL_GAP, (y1 - y0 - sumH) / (n - 1));
        if (gap >= 12) {
          const blockers: Box[] = [ballR, hr, cr];
          if (!chipOpen.hidden) blockers.push(rectOf(chipOpen, S));
          let y = y0 + (y1 - y0 - (sumH + gap * (n - 1))) / 2;
          col.forEach((c, i) => {
            const [w0, h0] = colSizes[i];
            const bx = { l: colL, t: y, r: colL + w0, b: y + h0 };
            y += h0 + gap;
            if (blockers.some((o) => hit(bx, o, 8))) return;
            place(c, bx.l, bx.t);
            c.hidden = false;
            rightR.push(bx);
          });
        }
      }
    }

    // shards flying outward from the break
    const k = phone ? 0.6 : 1,
      avoid = [hr, cr, nr, ballR, ...rightR],
      rs = rng(53);
    shards.forEach((el, i) => {
      const a = -2.9 + i * 0.68 + (rs() - 0.5) * 0.3,
        dist = 1.35 + rs() * 0.6;
      const sz = (16 + rs() * 30) * k;
      const x = cx + Math.cos(a) * rx * dist * 1.3,
        y = cy + Math.sin(a) * ry * dist * 1.15;
      place(el, x - sz / 2, y - sz / 2, sz, sz);
      el.style.setProperty("--depth", (-14 - rs() * 26).toFixed(0) + "px");
      el.style.setProperty("--fx", (cx - x).toFixed(0) + "px");
      el.style.setProperty("--fy", (cy - y).toFixed(0) + "px");
      const gl = el.querySelector<HTMLElement>(".l-glass")!;
      gl.style.clipPath = `polygon(${SHARD_POLY[i % SHARD_POLY.length]})`;
      gl.style.setProperty("-webkit-clip-path", gl.style.clipPath);
      gl.style.setProperty("--r0", (rs() * 60 - 30).toFixed(0) + "deg");
      gl.style.setProperty("--r1", (rs() * 60 - 30).toFixed(0) + "deg");
      gl.style.setProperty("--dx", (rs() * 12 - 6).toFixed(0) + "px");
      gl.style.setProperty("--dy", (-4 - rs() * 10).toFixed(0) + "px");
      gl.style.animationDelay = `${-i * 0.7}s`;
      const box = { l: x - sz / 2, t: y - sz / 2, r: x + sz / 2, b: y + sz / 2 };
      el.hidden = !canHole || box.l < 2 || box.r > W - 2 || box.t < 2 || box.b > H - 2 || avoid.some((o) => hit(box, o, 6));
    });

    stage.classList.add("l-ready");
  }

  /* ---------- parallax (pointer or finger) ---------- */
  let tx = 0,
    ty = 0,
    px = 0,
    py = 0,
    raf = 0;
  function tick() {
    px += (tx - px) * 0.08;
    py += (ty - py) * 0.08;
    stage.style.setProperty("--mx", px.toFixed(4));
    stage.style.setProperty("--my", py.toFixed(4));
    raf = Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001 ? requestAnimationFrame(tick) : 0;
  }
  function aim(x: number, y: number) {
    tx = x;
    ty = y;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  if (!reduce) {
    const onMove = (e: PointerEvent) => aim((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    const onLeave = () => aim(0, 0);
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") aim(0, 0);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onLeave);
    cleanups.push(() => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onLeave);
      cancelAnimationFrame(raf);
    });
  }

  /* ---------- go ---------- */
  let introTimer = 0;
  if (reduce) stage.classList.remove("l-intro");
  else introTimer = window.setTimeout(() => stage.classList.remove("l-intro"), 1600);

  const redraw = () => {
    drawBG();
    layout();
    initSnow();
    if (reduce) drawSnow(performance.now());
  };
  redraw();
  const ro = new ResizeObserver(redraw);
  ro.observe(stage);
  ro.observe(nav); // the account area streams in and can change the nav height
  let alive = true;
  document.fonts?.ready.then(() => {
    if (alive) redraw();
  });

  const startSnow = () => {
    if (!reduce && !snowRAF && !document.hidden) {
      lastT = 0;
      snowRAF = requestAnimationFrame(drawSnow);
    }
  };
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(snowRAF);
      snowRAF = 0;
    } else startSnow();
  };
  document.addEventListener("visibilitychange", onVisibility);
  startSnow();

  return () => {
    alive = false;
    ro.disconnect();
    window.clearTimeout(introTimer);
    cancelAnimationFrame(snowRAF);
    snowRAF = 0;
    document.removeEventListener("visibilitychange", onVisibility);
    cleanups.forEach((fn) => fn());
  };
}
