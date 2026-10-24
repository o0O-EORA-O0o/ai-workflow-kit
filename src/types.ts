export type Langue = "fr" | "en";
export type Categorie = "lead" | "facture" | "support" | "spam" | "autre";
export type Priorite = "urgente" | "haute" | "normale" | "basse";

export interface ContenuEmail {
  de: string;
  sujet: string;
  corps: string;
}

/** Résultat préparé d'un e-mail de démonstration (mode sans IA). */
export interface ResultatScripte {
  categorie: Categorie;
  priorite: Priorite;
  champs: Record<Langue, Record<string, string>>;
  enrichissement: Record<Langue, string>;
  action: Record<Langue, string>;
  brouillon: Record<Langue, string>;
}

export interface EmailDemo {
  id: string;
  fr: ContenuEmail;
  en: ContenuEmail;
  resultat: ResultatScripte;
}

export type Origine = "scripte" | "regles" | "claude";

export interface Resultat {
  categorie: Categorie;
  priorite: Priorite;
  champs: Array<{ nom: string; valeur: string }>;
  enrichissement: string;
  action: string;
  brouillon: string;
  /** Contrôles faits par le code (doublon de facture, montant), jamais délégués au modèle. */
  anomalies: string[];
  origine: Origine;
}

export interface Vente {
  /** 0 : semaine écoulée ; -1 : semaine précédente. */
  semaine: 0 | -1;
  jour: number;
  offre: string;
  offreEn: string;
  canal: string;
  region: string;
  montant: number;
}

export interface ConfigDemo {
  entreprise: { nom: Record<Langue, string>; secteur: Record<Langue, string>; initiales: string };
  couleur: string;
  langueParDefaut: Langue;
  personnalisee?: boolean;
  emails: EmailDemo[];
  ventes: Vente[];
}
