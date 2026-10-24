import config from "../../config/demo.json";
import { lireReponseRapport, rapportHorsLigne, type Kpis } from "../rapport";
import { classerParRegles, controler, lireReponseEmail, type FactureConnue } from "../traitement";
import type { ConfigDemo, ContenuEmail, Langue } from "../types";
import { NOMS, type Contexte, type Element } from "./contexte";

const cfg = config as unknown as ConfigDemo;

/** Réponse de l'API → résultat ; sans réponse exploitable, repli sur les règles (le webhook répond toujours). */
export function run(ctx: Contexte): Element[] {
  return ctx.entrees.map((e, i) => {
    const p = ctx.noeud(NOMS.preparer).itemMatching(i)?.json ?? {};
    const langue = (p.langue === "en" ? "en" : "fr") as Langue;
    const entreprise = typeof p.nomEntreprise === "string" ? p.nomEntreprise : cfg.entreprise.nom[langue];
    if (p.type === "rapport") {
      const texte = lireReponseRapport(e.json);
      return {
        json: { type: "rapport", origine: texte ? "claude" : "gabarit", texte: texte ?? rapportHorsLigne(p.kpis as Kpis, langue, entreprise) },
      };
    }
    const email = p.email as ContenuEmail;
    const lu = lireReponseEmail(e.json) ?? classerParRegles(email, langue, entreprise);
    const resultat = controler(lu, (p.factures as FactureConnue[]) ?? [], email.de, langue);
    return { json: { type: "email", resultat, email, threadId: p.threadId ?? "", expediteur: p.expediteur ?? "" } };
  });
}
