import { h } from "./ui";

const NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attributs)) el.setAttribute(k, String(v));
  return el;
}

/** Maximum d'axe « propre » : 1, 2 ou 5 × 10^n au-dessus de la valeur. */
export function maxPropre(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/** Colonne à sommet arrondi (4 px), base carrée posée sur l'axe. */
function colonne(x: number, y: number, l: number, base: number): string {
  const r = Math.min(4, l / 2, Math.max(0, base - y));
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + l - r}Q${x + l},${y} ${x + l},${y + r}V${base}Z`;
}

/**
 * Histogramme d'une seule série : colonnes de 24 px au plus, grille fine, valeur affichée sur la plus haute
 * seulement, infobulle au survol et au clavier, tableau des données à côté (accessibilité).
 */
export function histogramme(opts: {
  valeurs: number[];
  libelles: string[];
  formater: (n: number) => string;
  formaterAxe: (n: number) => string;
  titre: string;
  titreTableau: string;
}): HTMLElement {
  const { valeurs, libelles, formater, formaterAxe, titre } = opts;
  const L = 480;
  const H = 230;
  const m = { haut: 22, droite: 8, bas: 28, gauche: 62 };
  const base = H - m.bas;
  const max = maxPropre(Math.max(...valeurs));
  const bande = (L - m.gauche - m.droite) / valeurs.length;
  const largeur = Math.min(24, bande * 0.5);
  const y = (v: number) => base - (v / max) * (base - m.haut);

  const racine = svg("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": titre, class: "histogramme" });
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    racine.append(svg("line", { x1: m.gauche, x2: L - m.droite, y1: y(v), y2: y(v), class: i === 0 ? "axe" : "grille" }));
    const t = svg("text", { x: m.gauche - 8, y: y(v) + 4, "text-anchor": "end", class: "graduation" });
    t.textContent = formaterAxe(v);
    racine.append(t);
  }
  const indiceMax = valeurs.indexOf(Math.max(...valeurs));
  const bulle = h("div", { class: "bulle", role: "status", hidden: true });
  const conteneur = h("div", { class: "graphique" });

  valeurs.forEach((v, i) => {
    const cx = m.gauche + bande * i + bande / 2;
    const g = svg("g", { class: "barre", tabindex: 0, "aria-label": `${libelles[i]} : ${formater(v)}` });
    // Zone de survol plus large que la colonne.
    g.append(svg("rect", { x: cx - bande / 2, y: m.haut, width: bande, height: base - m.haut, class: "zone" }));
    g.append(svg("path", { d: colonne(cx - largeur / 2, y(v), largeur, base), class: "colonne" }));
    const etiquette = svg("text", { x: cx, y: base + 18, "text-anchor": "middle", class: "graduation" });
    etiquette.textContent = libelles[i] ?? "";
    racine.append(etiquette);
    if (i === indiceMax) {
      const valeur = svg("text", { x: cx, y: y(v) - 8, "text-anchor": "middle", class: "valeur" });
      valeur.textContent = formater(v);
      g.append(valeur);
    }
    const montrer = () => {
      bulle.textContent = `${libelles[i]} — ${formater(v)}`;
      bulle.hidden = false;
      bulle.style.left = `${(cx / L) * 100}%`;
      bulle.style.top = `${(y(v) / H) * 100}%`;
      g.classList.add("active");
    };
    const cacher = () => {
      bulle.hidden = true;
      g.classList.remove("active");
    };
    g.addEventListener("pointerenter", montrer);
    g.addEventListener("pointerleave", cacher);
    g.addEventListener("focus", montrer);
    g.addEventListener("blur", cacher);
    racine.append(g);
  });

  conteneur.append(racine, bulle);
  return h(
    "figure",
    { class: "figure" },
    h("figcaption", {}, titre),
    conteneur,
    h(
      "details",
      { class: "donnees" },
      h("summary", {}, opts.titreTableau),
      h("table", {}, h("tbody", {}, ...valeurs.map((v, i) => h("tr", {}, h("th", { scope: "row" }, libelles[i] ?? ""), h("td", {}, formater(v)))))),
    ),
  );
}
