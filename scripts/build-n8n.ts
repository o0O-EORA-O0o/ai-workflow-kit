/**
 * Génère les workflows n8n du kit 1 (n8n/*.json) et leur copie téléchargeable (public/n8n/).
 *
 *   npm run n8n                 écrit les fichiers
 *   npm run check:generated     échoue si n8n/ ne correspond pas au code
 *   tsx scripts/build-n8n.ts --test <dossier>   variantes de test (webhook, Gmail, Sheets et API remplacés)
 */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NOMS } from "../src/nodes/contexte";
import { ANTHROPIC_VERSION } from "../src/traitement";
import type { ConfigDemo } from "../src/types";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const modeCheck = args.includes("--check");
const dossierTest = args.includes("--test") ? args[args.indexOf("--test") + 1] : undefined;
const config = JSON.parse(readFileSync(join(racine, "config/demo.json"), "utf8")) as ConfigDemo;

type Json = Record<string, unknown>;

const uuid = (graine: string) => {
  const h = createHash("sha256").update(graine).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Bundle d'un nœud Code. Pas de globalName : le bac à sable n8n neutralise Object.defineProperty. */
async function codeNoeud(module: string): Promise<string> {
  const r = await build({
    stdin: { contents: `import { run } from "./${module}";\n__kitRun = run;\n`, resolveDir: join(racine, "src/nodes"), sourcefile: `${module}.entree.ts`, loader: "ts" },
    bundle: true,
    format: "iife",
    platform: "neutral",
    target: "es2022",
    charset: "utf8",
    legalComments: "none",
    write: false,
  });
  return `// Généré par scripts/build-n8n.ts depuis src/nodes/${module}.ts (dépôt ai-workflow-kit) : ne pas modifier ici.
let __kitRun;
${r.outputFiles[0]!.text}
return __kitRun({ entrees: $input.all(), noeud: (nom) => $(nom) });
`;
}

function noeud(nom: string, type: string, typeVersion: number, position: [number, number], parameters: Json, extra: Json = {}): Json {
  return { id: uuid(`${type}:${nom}`), name: nom, type, typeVersion, position, parameters, ...extra };
}
const code = (nom: string, position: [number, number], jsCode: string, extra: Json = {}) =>
  noeud(nom, "n8n-nodes-base.code", 2, position, { mode: "runOnceForAllItems", language: "javaScript", jsCode }, extra);
const lien = (vers: string, index = 0) => ({ node: vers, type: "main", index });

const CRED_ANTHROPIC = { httpHeaderAuth: { id: "", name: "Anthropic — x-api-key" } };
const CRED_SHEETS = { googleSheetsOAuth2Api: { id: "", name: "Google Sheets — client" } };
const CRED_GMAIL = { gmailOAuth2: { id: "", name: "Gmail — boîte du client" } };

const claude = (position: [number, number]) =>
  noeud(
    NOMS.claude,
    "n8n-nodes-base.httpRequest",
    4.2,
    position,
    {
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "anthropic-version", value: ANTHROPIC_VERSION }] },
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.requete) }}",
      options: { timeout: 60000 },
    },
    { credentials: CRED_ANTHROPIC, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: "continueRegularOutput" },
  );

async function workflowDemo(): Promise<Json> {
  const nodes = [
    noeud(
      NOMS.webhook,
      "n8n-nodes-base.webhook",
      2,
      [0, 0],
      { httpMethod: "POST", path: "kit1-demo", authentication: "headerAuth", responseMode: "responseNode", options: {} },
      { webhookId: uuid("webhook-kit1-demo"), credentials: { httpHeaderAuth: { id: "", name: "Kit 1 — jeton du webhook" } } },
    ),
    code(NOMS.preparer, [220, 0], await codeNoeud("preparer")),
    claude([440, 0]),
    code(NOMS.lire, [660, 0], await codeNoeud("lire")),
    noeud(NOMS.repondre, "n8n-nodes-base.respondToWebhook", 1.5, [880, 0], { respondWith: "firstIncomingItem", options: {} }),
  ];
  return {
    id: "kit1DemoWebhook1",
    name: "Kit 1 — Démo en direct (webhook)",
    active: false,
    nodes,
    connections: {
      [NOMS.webhook]: { main: [[lien(NOMS.preparer)]] },
      [NOMS.preparer]: { main: [[lien(NOMS.claude)]] },
      [NOMS.claude]: { main: [[lien(NOMS.lire)]] },
      [NOMS.lire]: { main: [[lien(NOMS.repondre)]] },
    },
    settings: { executionOrder: "v1", timezone: "Europe/Paris", saveDataSuccessExecution: "none" },
    pinData: {},
    tags: [],
  };
}

const onglet = (nom: string, ongletNom: string, position: [number, number]) =>
  noeud(
    nom,
    "n8n-nodes-base.googleSheets",
    4.7,
    position,
    {
      resource: "sheet",
      operation: "append",
      documentId: { __rl: true, mode: "id", value: "REMPLACER_PAR_L_ID_DU_CLASSEUR" },
      sheetName: { __rl: true, mode: "name", value: ongletNom },
      columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] },
      options: { cellFormat: "RAW", handlingExtraData: "ignoreIt", useAppend: true },
    },
    { credentials: CRED_SHEETS },
  );

function regle(valeur: string, sortie: string): Json {
  return {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [{ id: uuid(`regle-${valeur}`), leftValue: "={{ $json.categorie }}", rightValue: valeur, operator: { type: "string", operation: "equals" } }],
      combinator: "and",
    },
    renameOutput: true,
    outputKey: sortie,
  };
}

async function workflowModele(): Promise<Json> {
  const nodes = [
    noeud(
      NOMS.gmail,
      "n8n-nodes-base.gmailTrigger",
      1.4,
      [0, 0],
      { pollTimes: { item: [{ mode: "everyX", value: 5, unit: "minutes" }] }, simple: false, maxResults: 25, filters: { readStatus: "unread" }, options: {} },
      { credentials: CRED_GMAIL },
    ),
    code(NOMS.preparer, [220, 0], await codeNoeud("preparer")),
    claude([440, 0]),
    code(NOMS.lire, [660, 0], await codeNoeud("lire")),
    code(NOMS.aPlat, [880, 0], await codeNoeud("aplat")),
    noeud(NOMS.router, "n8n-nodes-base.switch", 3.2, [1100, -160], {
      mode: "rules",
      rules: { values: [regle("lead", "Leads"), regle("facture", "Factures"), regle("support", "Support"), regle("autre", "Autres")] },
      options: {},
    }),
    onglet(NOMS.leads, "Leads", [1340, -360]),
    onglet(NOMS.factures, "Factures", [1340, -200]),
    onglet(NOMS.support, "Support", [1340, -40]),
    onglet(NOMS.autres, "Autres", [1340, 120]),
    noeud(NOMS.siBrouillon, "n8n-nodes-base.if", 2.2, [1100, 220], {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{ id: uuid("si-brouillon"), leftValue: "={{ $json.brouillon }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } }],
        combinator: "and",
      },
      options: {},
    }),
    noeud(
      NOMS.brouillon,
      "n8n-nodes-base.gmail",
      2.1,
      [1340, 300],
      {
        resource: "draft",
        operation: "create",
        subject: "={{ 'Re: ' + $json.sujet }}",
        emailType: "text",
        message: "={{ $json.brouillon }}",
        options: { threadId: "={{ $json.threadId }}", sendTo: "={{ $json.expediteur }}" },
      },
      { credentials: CRED_GMAIL },
    ),
  ];
  return {
    id: "kit1ModeleTri001",
    name: "Kit 1 — Modèle client : tri des e-mails",
    active: false,
    nodes,
    connections: {
      [NOMS.gmail]: { main: [[lien(NOMS.preparer)]] },
      [NOMS.preparer]: { main: [[lien(NOMS.claude)]] },
      [NOMS.claude]: { main: [[lien(NOMS.lire)]] },
      [NOMS.lire]: { main: [[lien(NOMS.aPlat)]] },
      [NOMS.aPlat]: { main: [[lien(NOMS.router), lien(NOMS.siBrouillon)]] },
      [NOMS.router]: { main: [[lien(NOMS.leads)], [lien(NOMS.factures)], [lien(NOMS.support)], [lien(NOMS.autres)]] },
      [NOMS.siBrouillon]: { main: [[lien(NOMS.brouillon)], []] },
    },
    settings: { executionOrder: "v1", timezone: "Europe/Paris" },
    pinData: {},
    tags: [],
  };
}

/** Réponse factice de l'API pour un e-mail de la démo, construite depuis son résultat préparé. */
function reponseFactice(): string {
  const parSujet = Object.fromEntries(
    config.emails.flatMap((e) =>
      (["fr", "en"] as const).map((l) => [
        e[l].sujet,
        {
          categorie: e.resultat.categorie,
          priorite: e.resultat.priorite,
          champs: Object.entries(e.resultat.champs[l]).map(([nom, valeur]) => ({ nom, valeur })),
          enrichissement: e.resultat.enrichissement[l],
          action: e.resultat.action[l],
          brouillon: e.resultat.brouillon[l],
        },
      ]),
    ),
  );
  return `const parSujet = ${JSON.stringify(parSujet)};
return $input.all().map((e, i) => {
  const req = e.json.requete;
  const texte = e.json.type === "rapport"
    ? "Rapport hebdomadaire (réponse factice)\\n\\nLe chiffre d'affaires progresse."
    : JSON.stringify(parSujet[e.json.email.sujet] ?? { categorie: "autre", priorite: "normale", champs: [], enrichissement: "", action: "", brouillon: "" });
  return { json: { id: "msg_test", type: "message", role: "assistant", model: req.model, content: [{ type: "text", text: texte }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } }, pairedItem: { item: i } };
});`;
}

function versionTest(wf: Json, bouchons: Record<string, string>): Json {
  const nodes = (wf.nodes as Json[]).map((n) => {
    const corps = bouchons[n.name as string];
    return corps === undefined ? n : code(n.name as string, n.position as [number, number], corps);
  });
  const declencheur = (wf.nodes as Json[])[0]!.name as string;
  nodes.unshift(noeud("Test — déclencheur manuel", "n8n-nodes-base.manualTrigger", 1, [-220, 0], {}));
  return {
    ...wf,
    id: `${String(wf.id).slice(0, 12)}Test`,
    name: `${wf.name as string} (test)`,
    nodes,
    connections: { "Test — déclencheur manuel": { main: [[lien(declencheur)]] }, ...(wf.connections as Json) },
  };
}

const passer = "return $input.all();";

function bouchonsDemo(): Record<string, string> {
  const corps = [
    ...config.emails.map((e) => ({ type: "email", langue: "fr", email: e.fr, factures: e.id === "e4" ? [{ numero: "F-2026-0412", fournisseur: "Onduleurs Rhône", montant: "4 380,00 €" }] : [] })),
    { type: "email", langue: "en", email: config.emails[0]!.en, factures: [] },
    { type: "rapport", langue: "fr" },
  ];
  return {
    [NOMS.webhook]: `return ${JSON.stringify(corps)}.map((body) => ({ json: { headers: {}, params: {}, query: {}, body } }));`,
    [NOMS.claude]: reponseFactice(),
    [NOMS.repondre]: passer,
  };
}

function bouchonsModele(): Record<string, string> {
  const gmail = config.emails.map((e) => ({ id: e.id, threadId: `t-${e.id}`, from: { value: [{ address: `${e.id}@exemple.test` }], text: e.fr.de }, subject: e.fr.sujet, text: e.fr.corps }));
  return {
    [NOMS.gmail]: `return ${JSON.stringify(gmail)}.map((json) => ({ json }));`,
    [NOMS.claude]: reponseFactice(),
    [NOMS.leads]: passer,
    [NOMS.factures]: passer,
    [NOMS.support]: passer,
    [NOMS.autres]: passer,
    [NOMS.brouillon]: passer,
  };
}

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

async function main(): Promise<void> {
  const demo = await workflowDemo();
  const modele = await workflowModele();
  if (dossierTest) {
    mkdirSync(dossierTest, { recursive: true });
    writeFileSync(join(dossierTest, "kit1-demo-test.json"), json(versionTest(demo, bouchonsDemo())));
    writeFileSync(join(dossierTest, "kit1-modele-test.json"), json(versionTest(modele, bouchonsModele())));
    console.log(`Variantes de test écrites dans ${dossierTest}`);
    return;
  }
  const fichiers: Record<string, string> = {
    "n8n/kit1-demo-webhook.json": json(demo),
    "n8n/kit1-modele-tri-emails.json": json(modele),
  };
  const ecarts = Object.entries(fichiers)
    .filter(([chemin, contenu]) => !existsSync(join(racine, chemin)) || readFileSync(join(racine, chemin), "utf8") !== contenu)
    .map(([chemin]) => chemin);
  if (modeCheck) {
    if (ecarts.length) {
      console.error(`Workflows périmés : ${ecarts.join(", ")}. Lancer « npm run n8n ».`);
      process.exit(1);
    }
    console.log("Workflows à jour.");
    return;
  }
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(racine, chemin)), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
    // Copie servie par la page (lien « Télécharger le workflow »).
    mkdirSync(join(racine, "public/n8n"), { recursive: true });
    writeFileSync(join(racine, "public", chemin), contenu);
  }
  console.log("Workflows n8n générés.");
}

await main();
