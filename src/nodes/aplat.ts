import type { Resultat } from "../types";
import type { Contexte, Element } from "./contexte";

/** Ligne de tableau (une colonne par information) pour les onglets Google Sheets du modèle client. */
export function run(ctx: Contexte): Element[] {
  return ctx.entrees.map((e) => {
    const r = e.json.resultat as Resultat;
    const email = e.json.email as { de: string; sujet: string };
    return {
      json: {
        date: new Date().toISOString(),
        de: email.de,
        sujet: email.sujet,
        categorie: r.categorie,
        priorite: r.priorite,
        informations: r.champs.map((c) => `${c.nom} : ${c.valeur}`).join("\n"),
        analyse: r.enrichissement,
        action: r.action,
        anomalies: r.anomalies.join("\n"),
        brouillon: r.brouillon,
        origine: r.origine,
        threadId: e.json.threadId ?? "",
        expediteur: e.json.expediteur ?? "",
      },
    };
  });
}
