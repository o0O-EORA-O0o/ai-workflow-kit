/** Ce que reçoit le code d'un nœud Code de n8n ; la ligne d'appel est ajoutée par scripts/build-n8n.ts. */
export interface Element {
  json: Record<string, unknown>;
}

export interface Contexte {
  entrees: Element[];
  noeud: (nom: string) => { all(): Element[]; itemMatching(i: number): Element | undefined };
}

export const NOMS = {
  webhook: "Webhook — démo",
  gmail: "Gmail — boîte à trier",
  preparer: "Préparer la requête",
  claude: "Claude",
  lire: "Lire la réponse",
  repondre: "Répondre à la page",
  aPlat: "Mettre à plat",
  router: "Router par catégorie",
  leads: "Sheets — Leads",
  factures: "Sheets — Factures",
  support: "Sheets — Support",
  autres: "Sheets — Autres",
  siBrouillon: "Brouillon à préparer ?",
  brouillon: "Gmail — créer le brouillon",
} as const;
