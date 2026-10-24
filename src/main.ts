import brut from "../config/demo.json";
import { histogramme } from "./chart";
import { CATEGORIES, PRIORITES, TEXTES, type Textes } from "./i18n";
import { calculerKpis, euros, rapportHorsLigne, type Kpis, type Ligne } from "./rapport";
import { classerParRegles, controler, depuisScripte, type FactureConnue } from "./traitement";
import type { Categorie, ConfigDemo, ContenuEmail, Langue, Resultat } from "./types";
import { ecrire, h, lire } from "./ui";
import "./style.css";

const config = brut as unknown as ConfigDemo;
type Onglet = "boite" | "rapport" | "workflow";
interface Traitement {
  etape: number;
  resultat?: Resultat;
  note?: string;
}
interface EmailAffiche {
  id: string;
  contenu: ContenuEmail;
  perso: boolean;
}

const params = new URLSearchParams(location.search);
const ongletUrl = params.get("onglet");
const etat = {
  langue: (params.get("lang") === "en" || params.get("lang") === "fr" ? params.get("lang") : (lire("langue") ?? config.langueParDefaut)) as Langue,
  onglet: (ongletUrl === "rapport" || ongletUrl === "workflow" ? ongletUrl : "boite") as Onglet,
  direct: lire("direct") === "oui",
  code: lire("code") ?? "",
  saisieCode: false,
  erreurCode: "",
  traitements: new Map<string, Traitement>(),
  perso: [] as EmailAffiche[],
  enCours: false,
  selection: null as string | null,
  categorieTableau: "lead" as Categorie,
  rapport: null as { texte: string; origine: "gabarit" | "claude"; note?: string } | null,
  redaction: false,
};

const t = (): Textes => TEXTES[etat.langue];
const racine = document.getElementById("app")!;
document.documentElement.style.setProperty("--accent", config.couleur);
const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function emails(): EmailAffiche[] {
  return [...config.emails.map((e) => ({ id: e.id, contenu: e[etat.langue], perso: false })), ...etat.perso];
}

function reinitialiser(): void {
  etat.traitements.clear();
  etat.perso = [];
  etat.selection = null;
  etat.rapport = null;
}

/** Factures déjà rangées, pour le contrôle de doublon fait par le code. */
function facturesConnues(): FactureConnue[] {
  const res: FactureConnue[] = [];
  for (const [id, tr] of etat.traitements) {
    const r = tr.resultat;
    if (r?.categorie !== "facture" || r.anomalies.length) continue;
    const numero = r.champs.find((c) => /n°|no\.|num/i.test(c.nom))?.valeur;
    const fournisseur = r.champs.find((c) => /fournisseur|supplier/i.test(c.nom))?.valeur ?? emails().find((e) => e.id === id)?.contenu.de ?? "";
    const montant = r.champs.find((c) => /montant|amount/i.test(c.nom))?.valeur ?? "";
    if (numero) res.push({ numero, fournisseur, montant });
  }
  return res;
}

async function appelDirect(corps: Record<string, unknown>): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; note: string }> {
  try {
    const r = await fetch("/api/traiter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...corps, code: etat.code, langue: etat.langue }) });
    if (r.ok) return { ok: true, json: (await r.json()) as Record<string, unknown> };
    const { erreur } = (await r.json().catch(() => ({}))) as { erreur?: string };
    return { ok: false, note: erreur === "limite_atteinte" ? t().limiteAtteinte : t().erreurDirect };
  } catch {
    return { ok: false, note: t().erreurDirect };
  }
}

const entreprise = () => ({ nom: config.entreprise.nom[etat.langue], secteur: config.entreprise.secteur[etat.langue] });

async function traiter(e: EmailAffiche): Promise<void> {
  const tr: Traitement = { etape: 0 };
  etat.traitements.set(e.id, tr);
  const animation = (async () => {
    for (let i = 1; i <= 5; i++) {
      await pause(etat.direct ? 260 : 170);
      tr.etape = Math.max(tr.etape, i);
      rendre();
    }
  })();
  const factures = facturesConnues();
  let resultat: Resultat | undefined;
  if (etat.direct) {
    const r = await appelDirect({ type: "email", email: e.contenu, factures, entreprise: entreprise() });
    if (r.ok && r.json.resultat) resultat = r.json.resultat as Resultat;
    else if (!r.ok) tr.note = r.note;
  }
  if (!resultat) {
    const scripte = config.emails.find((x) => x.id === e.id);
    resultat = scripte ? depuisScripte(scripte, etat.langue) : classerParRegles(e.contenu, etat.langue, config.entreprise.nom[etat.langue]);
    resultat = controler(resultat, factures, e.contenu.de, etat.langue);
  }
  await animation;
  tr.etape = 6;
  tr.resultat = resultat;
  etat.categorieTableau = resultat.categorie;
  rendre();
}

async function lancer(): Promise<void> {
  if (etat.enCours) return;
  etat.enCours = true;
  etat.traitements.clear();
  etat.selection = null;
  rendre();
  for (const e of emails()) await traiter(e);
  etat.enCours = false;
  etat.categorieTableau = "lead";
  rendre();
}

async function traiterPerso(contenu: ContenuEmail): Promise<void> {
  if (etat.enCours || !contenu.corps.trim()) return;
  const e: EmailAffiche = { id: `perso-${etat.perso.length + 1}`, contenu, perso: true };
  etat.perso.push(e);
  etat.enCours = true;
  await traiter(e);
  etat.enCours = false;
  etat.selection = e.id;
  rendre();
}

async function activerDirect(code: string): Promise<void> {
  try {
    const r = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: code.trim() }) });
    if (r.ok && ((await r.json()) as { direct?: boolean }).direct) {
      Object.assign(etat, { direct: true, code: code.trim(), saisieCode: false, erreurCode: "" });
      ecrire("direct", "oui");
      ecrire("code", etat.code);
      reinitialiser();
      return rendre();
    }
  } catch {
    // aperçu statique : pas de fonction serveur
  }
  etat.erreurCode = t().codeErreur;
  rendre();
}

function enTete(): HTMLElement {
  const champ = h("input", { name: "code-ia", "aria-label": t().codeIa, placeholder: t().codeIa, autocomplete: "off", "data-test": "code-ia" });
  return h(
    "header",
    { class: "barre" },
    h("div", { class: "marque" }, h("span", { class: "logo", "aria-hidden": "true" }, config.entreprise.initiales), h("div", {}, h("strong", {}, config.entreprise.nom[etat.langue]), h("span", { class: "sous" }, config.entreprise.secteur[etat.langue]))),
    h(
      "div",
      { class: "actions" },
      etat.saisieCode
        ? h(
            "form",
            { class: "code-ia", onsubmit: (e: Event) => (e.preventDefault(), void activerDirect(champ.value)) },
            champ,
            h("button", { type: "submit", class: "bouton petit" }, t().valider),
            h("button", { type: "button", class: "bouton-texte", onclick: () => ((etat.saisieCode = false), (etat.erreurCode = ""), rendre()) }, t().annuler),
            etat.erreurCode && h("span", { class: "erreur", role: "alert" }, etat.erreurCode),
          )
        : h(
            "button",
            {
              class: "bouton-texte",
              "data-test": "mode-ia",
              onclick: () => {
                if (!etat.direct) return ((etat.saisieCode = true), rendre());
                Object.assign(etat, { direct: false, code: "" });
                ecrire("direct", null);
                ecrire("code", null);
                reinitialiser();
                rendre();
              },
            },
            etat.direct ? t().quitterIa : t().activerIa,
          ),
      h(
        "button",
        { class: "bouton-texte", "data-test": "langue", lang: etat.langue === "fr" ? "en" : "fr", onclick: () => ((etat.langue = etat.langue === "fr" ? "en" : "fr"), ecrire("langue", etat.langue), reinitialiser(), rendre()) },
        t().langue,
      ),
    ),
  );
}

function onglets(): HTMLElement {
  return h(
    "nav",
    { class: "onglets", role: "tablist" },
    ...(Object.keys(t().onglets) as Onglet[]).map((o) =>
      h("button", { role: "tab", "aria-selected": String(etat.onglet === o), class: etat.onglet === o ? "actif" : "", "data-test": `onglet-${o}`, onclick: () => ((etat.onglet = o), rendre()) }, t().onglets[o]),
    ),
  );
}

function etapes(tr: Traitement | undefined): HTMLElement {
  return h(
    "ol",
    { class: "etapes", "aria-hidden": "true" },
    ...t().etapes.map((nom, i) => h("li", { class: !tr ? "" : tr.etape > i ? "fait" : tr.etape === i ? "courant" : "" }, nom)),
  );
}

function pastille(r: Resultat): HTMLElement {
  return h("span", { class: `pastille-cat cat-${r.categorie}` }, CATEGORIES[etat.langue][r.categorie]);
}

function boite(): HTMLElement {
  const liste = emails();
  return h(
    "section",
    { class: "colonne-boite" },
    h("h2", {}, t().boiteTitre),
    h("p", { class: "texte-doux" }, t().boiteTexte),
    h(
      "div",
      { class: "commandes-boite" },
      h("button", { class: "bouton", "data-test": "lancer", disabled: etat.enCours, onclick: () => void lancer() }, etat.traitements.size ? t().relancer : t().lancer),
    ),
    h(
      "ol",
      { class: "emails" },
      ...liste.map((e) => {
        const tr = etat.traitements.get(e.id);
        return h(
          "li",
          { class: `email${etat.selection === e.id ? " selection" : ""}${tr && !tr.resultat ? " en-cours" : ""}`, "data-test": "email" },
          h(
            "button",
            { class: "email-bouton", disabled: !tr?.resultat, onclick: () => ((etat.selection = e.id), (etat.categorieTableau = tr!.resultat!.categorie), rendre()) },
            h("span", { class: "email-de" }, e.contenu.de),
            h("span", { class: "email-sujet" }, e.contenu.sujet),
            h("span", { class: "email-extrait" }, e.contenu.corps.replace(/\s+/g, " ").slice(0, 110)),
            h("span", { class: "email-etat" }, tr?.resultat ? pastille(tr.resultat) : h("span", { class: "a-traiter" }, t().aTraiter), tr?.resultat?.anomalies.length ? h("span", { class: "alerte" }, `⚠ ${t().anomalie}`) : null),
          ),
          tr && !tr.resultat ? etapes(tr) : null,
        );
      }),
    ),
    essai(),
  );
}

function essai(): HTMLElement {
  const sujet = h("input", { name: "sujet", placeholder: t().sujetChamp, "aria-label": t().sujetChamp, maxlength: "200", "data-test": "essai-sujet" });
  const corps = h("textarea", { name: "corps", rows: "4", placeholder: t().corpsChamp, "aria-label": t().corpsChamp, maxlength: "4000", "data-test": "essai-corps" });
  return h(
    "details",
    { class: "essai" },
    h("summary", {}, t().essayer),
    h("p", { class: "texte-doux" }, t().essayerTexte),
    h(
      "form",
      { onsubmit: (e: Event) => (e.preventDefault(), void traiterPerso({ de: etat.langue === "fr" ? "Vous (test)" : "You (test)", sujet: sujet.value, corps: corps.value })) },
      sujet,
      corps,
      h("button", { type: "submit", class: "bouton", disabled: etat.enCours, "data-test": "essai-envoyer" }, t().traiter),
    ),
  );
}

function tableau(): HTMLElement {
  const lignes = emails()
    .map((e) => ({ e, r: etat.traitements.get(e.id)?.resultat, note: etat.traitements.get(e.id)?.note }))
    .filter((x): x is { e: EmailAffiche; r: Resultat; note: string | undefined } => !!x.r);
  const cats: Categorie[] = ["lead", "facture", "support", "autre", "spam"];
  const visibles = lignes.filter((x) => x.r.categorie === etat.categorieTableau);
  const choisi = lignes.find((x) => x.e.id === etat.selection);
  return h(
    "section",
    { class: "colonne-tableau" },
    h("h2", {}, t().tableau),
    h(
      "div",
      { class: "feuilles", role: "tablist" },
      ...cats.map((c) =>
        h(
          "button",
          { role: "tab", "aria-selected": String(c === etat.categorieTableau), class: c === etat.categorieTableau ? "actif" : "", "data-test": `feuille-${c}`, onclick: () => ((etat.categorieTableau = c), rendre()) },
          `${CATEGORIES[etat.langue][c]} (${lignes.filter((x) => x.r.categorie === c).length})`,
        ),
      ),
    ),
    lignes.length === 0
      ? h("p", { class: "texte-doux" }, t().tableauVide)
      : h(
          "div",
          { class: "table-defile" },
          h(
            "table",
            { class: "feuille", "data-test": "feuille" },
            h("thead", {}, h("tr", {}, ...Object.values(t().colonnes).map((c) => h("th", { scope: "col" }, c)))),
            h(
              "tbody",
              {},
              ...visibles.map((x) =>
                h(
                  "tr",
                  { class: etat.selection === x.e.id ? "selection" : "", onclick: () => ((etat.selection = x.e.id), rendre()) },
                  h("td", { "data-label": t().colonnes.de }, x.e.contenu.de),
                  h("td", { "data-label": t().colonnes.sujet }, x.e.contenu.sujet),
                  h("td", { "data-label": t().colonnes.priorite }, h("span", { class: `prio prio-${x.r.priorite}` }, PRIORITES[etat.langue][x.r.priorite])),
                  h("td", { class: "infos", "data-label": t().colonnes.infos }, h("div", {}, ...x.r.champs.slice(0, 4).map((c) => h("span", {}, `${c.nom} : ${c.valeur}`)))),
                  h("td", { "data-label": t().colonnes.action }, x.r.anomalies.length ? h("strong", { class: "alerte" }, `⚠ ${x.r.action}`) : x.r.action),
                ),
              ),
            ),
          ),
        ),
    choisi && detail(choisi.e, choisi.r, choisi.note),
  );
}

function detail(e: EmailAffiche, r: Resultat, note?: string): HTMLElement {
  return h(
    "article",
    { class: "detail", "data-test": "detail" },
    h("h3", {}, `${t().detail} — ${e.contenu.sujet}`),
    note && h("p", { class: "note" }, note),
    h("p", { class: "texte-doux" }, `${pastille(r).textContent} · ${PRIORITES[etat.langue][r.priorite]} · ${t().origine[r.origine]}`),
    h("dl", { class: "champs" }, ...r.champs.flatMap((c) => [h("dt", {}, c.nom), h("dd", {}, c.valeur)])),
    h("p", {}, h("strong", {}, `${t().analyse} : `), r.enrichissement),
    ...r.anomalies.map((a) => h("p", { class: "alerte", role: "note" }, `⚠ ${t().anomalie} : ${a}`)),
    h("h4", {}, t().brouillon),
    r.brouillon ? h("pre", { class: "brouillon", "data-test": "brouillon" }, r.brouillon) : h("p", { class: "texte-doux" }, t().aucunBrouillon),
  );
}

function semaineEcoulee(): string {
  const d = new Date();
  const lundi = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) - 7);
  return lundi.toLocaleDateString(etat.langue === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long" });
}

function variation(v: number | null, precedent?: string): HTMLElement {
  if (v === null) return h("span", { class: "delta" }, etat.langue === "fr" ? "nouveau" : "new");
  const signe = v > 0 ? "▲ +" : v < 0 ? "▼ " : "";
  return h("span", { class: `delta ${v > 0 ? "hausse" : v < 0 ? "baisse" : ""}` }, `${signe}${v.toLocaleString(etat.langue === "fr" ? "fr-FR" : "en-GB")} %${precedent ? ` ${precedent}` : ""}`);
}

function tableLignes(titre: string, lignes: Ligne[]): HTMLElement {
  return h(
    "div",
    { class: "bloc" },
    h("h3", {}, titre),
    h(
      "div",
      { class: "table-defile" },
      h(
      "table",
      { class: "chiffres" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, t().nom), h("th", { scope: "col" }, t().montant), h("th", { scope: "col" }, t().nombre), h("th", { scope: "col" }, t().evolution))),
      h("tbody", {}, ...lignes.map((l) => h("tr", {}, h("td", {}, l.nom), h("td", {}, euros(l.montant, etat.langue)), h("td", {}, String(l.nombre)), h("td", {}, variation(l.variation))))),
      ),
    ),
  );
}

async function rediger(k: Kpis): Promise<void> {
  if (etat.redaction) return;
  etat.redaction = true;
  rendre();
  let note: string | undefined;
  if (etat.direct) {
    const r = await appelDirect({ type: "rapport", kpis: k, entreprise: entreprise() });
    if (r.ok && typeof r.json.texte === "string") {
      etat.rapport = { texte: r.json.texte, origine: r.json.origine === "claude" ? "claude" : "gabarit" };
      etat.redaction = false;
      return rendre();
    }
    if (!r.ok) note = r.note;
  } else await pause(600);
  etat.rapport = { texte: rapportHorsLigne(k, etat.langue, config.entreprise.nom[etat.langue]), origine: "gabarit", note };
  etat.redaction = false;
  rendre();
}

function rapport(): HTMLElement {
  const k = calculerKpis(config.ventes, etat.langue);
  const panierPrecedent = k.ventesPrecedent ? Math.round(k.caPrecedent / k.ventesPrecedent) : 0;
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
  const tuile = (libelle: string, valeur: string, v: number | null) =>
    h("div", { class: "tuile" }, h("span", { class: "tuile-libelle" }, libelle), h("strong", { class: "tuile-valeur" }, valeur), variation(v, t().vsPrecedente));
  const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));
  return h(
    "section",
    { class: "rapport" },
    h("h2", {}, `${t().rapportTitre} (${etat.langue === "fr" ? "semaine du" : "week of"} ${semaineEcoulee()})`),
    h("p", { class: "texte-doux" }, t().rapportTexte),
    h(
      "div",
      { class: "tuiles", "data-test": "tuiles" },
      tuile(t().ca, euros(k.ca, etat.langue), k.variation),
      tuile(t().ventes, String(k.ventes), pct(k.ventes, k.ventesPrecedent)),
      tuile(t().panier, euros(k.panierMoyen, etat.langue), pct(k.panierMoyen, panierPrecedent)),
    ),
    h(
      "div",
      { class: "grille-rapport" },
      histogramme({
        valeurs: k.parJour,
        libelles: t().jours,
        formater: (n) => euros(n, etat.langue),
        formaterAxe: (n) => (etat.langue === "fr" ? `${compact(n)} €` : `€${compact(n).toUpperCase()}`),
        titre: t().parJour,
        titreTableau: t().donneesGraphique,
      }),
      tableLignes(t().offres, k.offres),
      tableLignes(t().canaux, k.canaux),
    ),
    h("button", { class: "bouton", "data-test": "rediger", disabled: etat.redaction, onclick: () => void rediger(k) }, etat.redaction ? t().redaction : t().rediger),
    etat.rapport &&
      h(
        "article",
        { class: "courriel", "data-test": "rapport" },
        h("p", { class: "texte-doux" }, `${t().emailRapport} · ${t().rapportOrigine[etat.rapport.origine]}`),
        etat.rapport.note && h("p", { class: "note" }, etat.rapport.note),
        h("pre", {}, etat.rapport.texte),
      ),
  );
}

function workflow(): HTMLElement {
  const n = (titre: string, sous: string, type = "") => h("li", { class: `noeud ${type}` }, h("strong", {}, titre), h("span", {}, sous));
  const fr = etat.langue === "fr";
  return h(
    "section",
    { class: "workflow" },
    h("h2", {}, t().workflowTitre),
    h("p", { class: "texte-doux" }, t().workflowTexte),
    h(
      "ol",
      { class: "flux", "aria-label": "n8n" },
      n("Gmail Trigger", fr ? "nouveaux e-mails, toutes les 5 min" : "new emails, every 5 min", "declencheur"),
      n(fr ? "Préparer la requête" : "Build the request", fr ? "nœud Code : e-mail normalisé, schéma JSON" : "Code node: normalised email, JSON schema"),
      n("Claude (HTTP Request)", fr ? "claude-haiku-5-5, sortie structurée" : "claude-haiku-5-5, structured output", "ia"),
      n(fr ? "Lire la réponse" : "Read the response", fr ? "contrôles : doublon, fausse facture ; repli sur règles" : "checks: duplicate, fake invoice; rule fallback"),
      h(
        "li",
        { class: "branches" },
        h("strong", {}, fr ? "Router par catégorie (Switch)" : "Route by category (Switch)"),
        h("ul", {}, ...["Leads", fr ? "Factures" : "Invoices", "Support", fr ? "Autres" : "Other"].map((o) => h("li", {}, `Google Sheets — ${o}`)), h("li", {}, fr ? "Gmail — brouillon de réponse (si nécessaire)" : "Gmail — draft reply (when needed)")),
      ),
    ),
    h("ul", { class: "livrables" }, ...t().livrables.map((l) => h("li", {}, l))),
    h(
      "div",
      { class: "telechargements" },
      h("a", { class: "bouton", href: "/n8n/kit1-modele-tri-emails.json", download: "kit1-modele-tri-emails.json", "data-test": "telecharger" }, `⬇ ${t().telechargerModele}`),
      h("a", { class: "bouton-texte", href: "/n8n/kit1-demo-webhook.json", download: "kit1-demo-webhook.json" }, `⬇ ${t().telechargerDemo}`),
    ),
    h("p", { class: "texte-doux" }, t().identifiants),
  );
}

function rendre(): void {
  document.documentElement.lang = etat.langue;
  document.title = `${t().onglets[etat.onglet]} — ${config.entreprise.nom[etat.langue]}`;
  const focus = document.activeElement?.getAttribute("name");
  const ouvert = (document.querySelector("details.essai") as HTMLDetailsElement | null)?.open ?? false;
  const valeurs = Object.fromEntries([...racine.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(".essai [name]")].map((x) => [x.name, x.value]));
  racine.replaceChildren(
    enTete(),
    h("div", { class: `bandeau${config.personnalisee ? " perso" : ""}`, role: "note", "data-test": "bandeau" }, config.personnalisee ? t().bandeauPerso : t().bandeauFictif),
    h(
      "main",
      {},
      h("p", { class: `mode ${etat.direct ? "direct" : ""}`, "data-test": "mode" }, etat.direct ? t().modeDirect : t().modeHorsLigne),
      onglets(),
      etat.onglet === "boite" ? h("div", { class: "espace-boite" }, boite(), tableau()) : etat.onglet === "rapport" ? rapport() : workflow(),
    ),
  );
  const essaiEl = racine.querySelector("details.essai") as HTMLDetailsElement | null;
  if (essaiEl) essaiEl.open = ouvert;
  for (const [nom, v] of Object.entries(valeurs)) {
    const champ = racine.querySelector<HTMLInputElement | HTMLTextAreaElement>(`.essai [name="${nom}"]`);
    if (champ) champ.value = v;
  }
  if (focus) (racine.querySelector(`[name="${focus}"]`) as HTMLElement | null)?.focus();
}

const codeUrl = params.get("code");
if (codeUrl) {
  params.delete("code");
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  void activerDirect(codeUrl);
}
rendre();
