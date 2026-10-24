import config from "../../config/demo.json";
import { calculerKpis, requeteRapport, type Kpis } from "../rapport";
import { requeteEmail, type FactureConnue } from "../traitement";
import type { ConfigDemo, ContenuEmail, Langue } from "../types";
import type { Contexte, Element } from "./contexte";

const cfg = config as unknown as ConfigDemo;

/**
 * Entrée : corps du webhook de la démo ({ type, langue, email | kpis, factures }) ou e-mail du
 * déclencheur Gmail (modèle client). Sortie : la demande normalisée et le corps de la requête à Claude.
 */
/** Entreprise de la démo personnalisée envoyée par la page, bornée ; sinon celle de la configuration. */
function entreprise(brut: Record<string, unknown>): Pick<ConfigDemo, "entreprise"> {
  const e = brut.entreprise as { nom?: unknown; secteur?: unknown } | undefined;
  if (typeof e?.nom !== "string" || typeof e?.secteur !== "string") return cfg;
  const nom = e.nom.slice(0, 60);
  const secteur = e.secteur.slice(0, 120);
  return { entreprise: { nom: { fr: nom, en: nom }, secteur: { fr: secteur, en: secteur }, initiales: "" } };
}

export function run(ctx: Contexte): Element[] {
  return ctx.entrees.map((e) => {
    const brut = (e.json.body ?? e.json) as Record<string, unknown>;
    const langue: Langue = brut.langue === "en" ? "en" : "fr";
    const ent = entreprise(brut);
    if (brut.type === "rapport") {
      const kpis = (brut.kpis as Kpis | undefined) ?? calculerKpis(cfg.ventes, langue);
      return { json: { type: "rapport", langue, kpis, nomEntreprise: ent.entreprise.nom[langue], requete: requeteRapport(kpis, langue, ent) } };
    }
    const de = brut.email ? (brut.email as ContenuEmail).de : String((brut.from as { text?: string } | undefined)?.text ?? brut.from ?? "");
    const email: ContenuEmail = brut.email
      ? {
          de: String((brut.email as ContenuEmail).de ?? "").slice(0, 200),
          sujet: String((brut.email as ContenuEmail).sujet ?? "").slice(0, 300),
          corps: String((brut.email as ContenuEmail).corps ?? "").slice(0, 6000),
        }
      : { de, sujet: String(brut.subject ?? ""), corps: String(brut.text ?? brut.snippet ?? "").slice(0, 6000) };
    const factures = Array.isArray(brut.factures) ? (brut.factures as FactureConnue[]).slice(0, 50) : [];
    return {
      json: {
        type: "email",
        langue,
        nomEntreprise: ent.entreprise.nom[langue],
        email,
        factures,
        threadId: brut.threadId ?? "",
        expediteur: String((brut.from as { value?: Array<{ address?: string }> } | undefined)?.value?.[0]?.address ?? ""),
        requete: requeteEmail(email, langue, ent),
      },
    };
  });
}
