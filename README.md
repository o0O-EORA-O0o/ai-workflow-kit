# Kit 1 — Workflow n8n + IA

**EN —** Demo of an n8n + AI workflow for a fictional solar installer: incoming emails are read, classified (lead, invoice, support, junk, other), enriched, checked (duplicate or fake invoice), filed into a tracking sheet and given a draft reply; a weekly sales report is written from computed KPIs. Offline demo mode (free) and live mode through a hosted n8n workflow calling Claude. The n8n workflows are downloadable. French and English. *All data is fictional. All rights reserved.*

Démo : <https://ai-workflow-kit.pages.dev>

## Ce que montre la démo

- **Tri des e-mails** : 8 e-mails fictifs de **Solarelle** (installateur solaire fictif) passent par les étapes Lecture → Classement → Extraction → Contrôles → Rangement → Brouillon. Le tableau de suivi a un onglet par catégorie ; chaque ligne ouvre le détail et le brouillon de réponse.
- **Contrôles faits par le code**, pas par le modèle : la relance « F-2026-0412 » d'un autre fournisseur que la facture d'origine est mise en quarantaine (fraude au faux fournisseur).
- **Essayer avec son e-mail** : le visiteur colle un e-mail fictif ; classement par règles hors ligne, par Claude en mode IA.
- **Rapport hebdomadaire** : indicateurs calculés à partir de 47 ventes fictives sur deux semaines (tuiles, chiffre d'affaires par jour, offres, canaux), puis rapport rédigé pour la direction.
- **Le workflow n8n** : schéma et téléchargement des deux workflows.

## Deux modes

| Mode | Déclenché par | Fonctionnement |
| --- | --- | --- |
| Démo sans IA (par défaut) | rien | résultats préparés pour les 8 e-mails (`config/demo.json`), règles pour un e-mail saisi, rapport par gabarit |
| IA en direct | bouton « Mode IA » + code `DEMO_ACCESS_CODE` | `functions/api/traiter.ts` relaie au webhook n8n du serveur Hetzner (D-032), qui appelle Claude (`claude-haiku-5-5`, sortie JSON structurée) ; le jeton du webhook reste côté serveur |

## Workflows n8n (`n8n/`, générés)

| Fichier | Rôle |
| --- | --- |
| `kit1-demo-webhook.json` | Webhook (en-tête `X-Demo-Token`) → Préparer la requête → Claude → Lire la réponse → réponse à la page. Sert le mode IA de la démo |
| `kit1-modele-tri-emails.json` | **Modèle client** : Gmail Trigger → Claude → contrôles → Switch par catégorie → Google Sheets (Leads, Factures, Support, Autres) + brouillon Gmail. Point de départ d'une mission |

Les nœuds Code sont générés depuis `src/` par `npm run n8n` (bundle esbuild) : même logique que la page. `npm run test:n8n` exécute les deux workflows dans un vrai n8n (Docker) avec des bouchons pour le webhook, Gmail, Sheets et l'API ; les nœuds Switch et IF sont les vrais.

### Brancher le mode IA

1. Sur le serveur n8n du pipeline (dépôt `freelance-pipeline`, Caddy laisse passer `/webhook/*`) : importer `n8n/kit1-demo-webhook.json`, créer les identifiants « Kit 1 — jeton du webhook » (Header Auth, nom `X-Demo-Token`, valeur aléatoire) et « Anthropic — x-api-key », activer le workflow.
2. Dans le projet Cloudflare Pages : `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_TOKEN`, `DEMO_ACCESS_CODE` (Production et Preview).
3. Lien prospect : `https://ai-workflow-kit.pages.dev/?code=<DEMO_ACCESS_CODE>&lang=en`.

## Personnaliser

`config/demo.json` : `entreprise`, `couleur`, `emails` (contenu FR/EN et résultat attendu : catégorie, priorité, champs, analyse, action, brouillon), `ventes` (`semaine` 0 ou -1, `jour` 0 à 4, offre, canal, région, montant). `npm run config:check` vérifie la configuration ; une démo personnalisée ne contient ni lien ni adresse e-mail. En mode IA, le nom et le secteur de l'entreprise sont transmis au workflow.

## Développement

```bash
npm ci
npm run dev
npm test                             # règles, contrôles, requêtes Claude, rapport, relais n8n
npm run build && npm run test:e2e    # Playwright ordinateur + mobile
npm run test:n8n                     # Docker requis
```

Mise en ligne : secrets `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` dans le dépôt (workflow « Déploiement », projet `ai-workflow-kit`).

---

Code et contenus : tous droits réservés. Entreprise, personnes, e-mails et ventes fictifs.
