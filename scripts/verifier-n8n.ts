/** Lit les résultats de scripts/test-in-n8n.sh et vérifie les sorties de chaque nœud dans n8n. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NOMS } from "../src/nodes/contexte";

type Run = { error?: { message?: string }; data?: { main?: Array<Array<{ json: Record<string, unknown> }> | null> } };
type Execution = { status?: string; data?: { resultData?: { error?: { message?: string }; runData?: Record<string, Run[]> } } };

const dossier = process.argv[2] ?? ".n8n-test";
const erreurs: string[] = [];
const verifier = (ok: boolean, m: string) => {
  console.log(`${ok ? "✓" : "✗"} ${m}`);
  if (!ok) erreurs.push(m);
};

function lire(nom: string, log: string): Execution {
  const brut = readFileSync(join(dossier, nom), "utf8");
  const debut = brut.indexOf("{");
  if (debut < 0) throw new Error(`${nom} vide :\n${readFileSync(join(dossier, log), "utf8").slice(-3000)}`);
  return JSON.parse(brut.slice(debut)) as Execution;
}

function sortie(e: Execution, noeud: string, index = -1): Array<Record<string, unknown>> {
  const runs = e.data?.resultData?.runData?.[noeud] ?? [];
  for (const r of runs) if (r.error) erreurs.push(`${noeud} : ${r.error.message}`);
  return runs.flatMap((r) => (index < 0 ? (r.data?.main ?? []).flat() : (r.data?.main?.[index] ?? [])).filter(Boolean).map((i) => i!.json));
}

const demo = lire("demo-resultat.json", "demo.log");
verifier(demo.status === "success", `démo : exécution ${demo.status}${demo.data?.resultData?.error ? ` (${demo.data.resultData.error.message})` : ""}`);
const reponses = sortie(demo, NOMS.lire);
verifier(reponses.length === 10, `démo : ${reponses.length} réponses (10 attendues)`);
const cat = reponses.filter((r) => r.type === "email").map((r) => (r.resultat as { categorie: string }).categorie);
verifier(cat.join(",") === "lead,lead,facture,facture,support,support,spam,autre,lead", `démo : catégories ${cat.join(",")}`);
const e4 = reponses[3]?.resultat as { anomalies?: string[] } | undefined;
verifier(!!e4?.anomalies?.[0]?.includes("fraude"), "démo : doublon de numéro de facture détecté par le code");
const rapport = reponses.find((r) => r.type === "rapport");
verifier(rapport?.origine === "claude" && String(rapport.texte).length > 10, "démo : rapport rédigé (réponse factice)");

const modele = lire("modele-resultat.json", "modele.log");
verifier(modele.status === "success", `modèle : exécution ${modele.status}${modele.data?.resultData?.error ? ` (${modele.data.resultData.error.message})` : ""}`);
const compte = (n: string) => sortie(modele, n).length;
verifier(compte(NOMS.leads) === 2 && compte(NOMS.factures) === 2 && compte(NOMS.support) === 2 && compte(NOMS.autres) === 1, `modèle : Switch → Leads ${compte(NOMS.leads)}, Factures ${compte(NOMS.factures)}, Support ${compte(NOMS.support)}, Autres ${compte(NOMS.autres)} (2, 2, 2, 1 ; le spam n'est rangé nulle part)`);
verifier(compte(NOMS.brouillon) === 5, `modèle : ${compte(NOMS.brouillon)} brouillons Gmail (5 attendus)`);

if (erreurs.length) {
  console.error(`\n${erreurs.length} échec(s).`);
  process.exit(1);
}
console.log("\nWorkflows validés dans n8n.");
