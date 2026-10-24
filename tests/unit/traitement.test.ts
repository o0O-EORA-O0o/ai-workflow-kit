import { describe, expect, it } from "vitest";
import brut from "../../config/demo.json";
import { calculerKpis, lireReponseRapport, rapportHorsLigne, requeteRapport } from "../../src/rapport";
import { classerParRegles, controler, depuisScripte, lireReponseEmail, requeteEmail, SCHEMA_EMAIL } from "../../src/traitement";
import type { ConfigDemo } from "../../src/types";

const config = brut as unknown as ConfigDemo;
const email = (id: string) => config.emails.find((e) => e.id === id)!;

describe("classement par règles (mode sans IA)", () => {
  it.each([
    ["e1", "lead"],
    ["e2", "lead"],
    ["e3", "facture"],
    ["e4", "facture"],
    ["e5", "support"],
    ["e6", "support"],
    ["e7", "spam"],
    ["e8", "autre"],
  ] as const)("%s → %s (fr et en)", (id, categorie) => {
    expect(classerParRegles(email(id).fr, "fr", "Solarelle").categorie).toBe(categorie);
    expect(classerParRegles(email(id).en, "en", "Solarelle").categorie).toBe(categorie);
  });

  it("extrait numéro, montant et date d'une facture ; priorité urgente en cas de danger", () => {
    const r = classerParRegles(email("e3").fr, "fr", "Solarelle");
    const champs = Object.fromEntries(r.champs.map((c) => [c.nom, c.valeur]));
    expect(champs).toMatchObject({ "N° facture": "F-2026-0412", Montant: "4 380,00 €", Date: "30 novembre 2026" });
    expect(classerParRegles(email("e6").fr, "fr", "Solarelle").priorite).toBe("urgente");
    expect(classerParRegles(email("e7").fr, "fr", "Solarelle").brouillon).toBe("");
  });
});

describe("contrôles faits par le code", () => {
  it("met en quarantaine un numéro de facture déjà utilisé par un autre fournisseur", () => {
    const r = controler(depuisScripte(email("e4"), "fr"), [{ numero: "F-2026-0412", fournisseur: "Onduleurs Rhône", montant: "4 380,00 €" }], email("e4").fr.de, "fr");
    expect(r.anomalies[0]).toMatch(/déjà utilisé par Onduleurs Rhône : possible fraude/);
    expect(r.priorite).toBe("haute");
  });

  it("signale un simple doublon chez le même fournisseur, et laisse passer une facture nouvelle", () => {
    const dup = controler(depuisScripte(email("e3"), "en"), [{ numero: "F-2026-0412", fournisseur: "Rhône Inverters", montant: "" }], email("e3").en.de, "en");
    expect(dup.anomalies[0]).toMatch(/^Duplicate/);
    expect(controler(depuisScripte(email("e3"), "fr"), [], email("e3").fr.de, "fr").anomalies).toEqual([]);
  });
});

describe("requêtes et réponses Claude", () => {
  it("sortie JSON structurée fermée, sans paramètre d'échantillonnage", () => {
    const r = requeteEmail(email("e1").fr, "fr", config);
    expect(r).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA_EMAIL } } });
    expect(r).not.toHaveProperty("temperature");
    expect(SCHEMA_EMAIL.properties.champs.items.additionalProperties).toBe(false);
  });

  it("lit une réponse valide, refuse une réponse inexploitable", () => {
    const texte = JSON.stringify({ categorie: "lead", priorite: "haute", champs: [{ nom: "Budget", valeur: "15 000 €" }], enrichissement: "x", action: "y", brouillon: "z" });
    expect(lireReponseEmail({ content: [{ type: "text", text: texte }], stop_reason: "end_turn" })).toMatchObject({ categorie: "lead", origine: "claude" });
    expect(lireReponseEmail({ error: { type: "overloaded_error" } })).toBeNull();
    expect(lireReponseEmail({ content: [{ type: "text", text: "{" }], stop_reason: "end_turn" })).toBeNull();
    expect(lireReponseEmail({ content: [{ type: "text", text: texte.replace("lead", "inconnue") }] })?.categorie).toBe("autre");
  });
});

describe("rapport hebdomadaire", () => {
  const k = calculerKpis(config.ventes, "fr");

  it("calcule les indicateurs à partir des ventes", () => {
    const courant = config.ventes.filter((v) => v.semaine === 0);
    expect(k.ca).toBe(courant.reduce((s, v) => s + v.montant, 0));
    expect(k.ventes).toBe(courant.length);
    expect(k.parJour.reduce((a, b) => a + b, 0)).toBe(k.ca);
    expect(k.offres.map((o) => o.montant)).toEqual([...k.offres.map((o) => o.montant)].sort((a, b) => b - a));
    expect(k.variation).toBeCloseTo(((k.ca - k.caPrecedent) / k.caPrecedent) * 100, 0);
  });

  it("rédige par gabarit en français et en anglais avec les vrais chiffres", () => {
    expect(rapportHorsLigne(k, "fr", "Solarelle")).toContain(`${k.ca.toLocaleString("fr-FR")} € HT`);
    const en = calculerKpis(config.ventes, "en");
    expect(rapportHorsLigne(en, "en", "Solarelle")).toMatch(/^Weekly report — Solarelle/);
  });

  it("demande à Claude de rédiger sans recalculer", () => {
    const r = requeteRapport(k, "fr", config);
    expect(JSON.stringify(r)).toContain(String(k.ca));
    expect(lireReponseRapport({ content: [{ type: "text", text: " Rapport " }], stop_reason: "end_turn" })).toBe("Rapport");
    expect(lireReponseRapport({ content: [], stop_reason: "refusal" })).toBeNull();
  });
});
