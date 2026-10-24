# ai-workflow-kit — notes pour Claude

Kit de démo 1 du projet « Workflow freelance automatisé ». Dépôt public : aucune clé, aucune donnée réelle.

- `npm test`, `npm run build` (lance config:check et la génération n8n), `npm run test:e2e`, `npm run test:n8n` (Docker), `npm run check:generated`.
- Après toute modification de `src/traitement.ts`, `src/rapport.ts`, `src/nodes/` ou `config/demo.json` : `npm run n8n` puis `npm run test:n8n`. La CI vérifie que `n8n/` est à jour.
- Bac à sable des nœuds Code n8n : pas d'objet `URL`, `Object.defineProperty` neutralisé (d'où le bundle sans `globalName`).
- Les contrôles (doublon, fausse facture) restent dans le code (`controler`), jamais dans le prompt.
- API Claude : appel brut par le nœud HTTP de n8n, `anthropic-version: 2026-10-21`, `claude-haiku-5-5`, `output_config` (effort `low`, format JSON schema) ; pas de `temperature`.
- Graphique : couleur de série `--serie` validée (contraste ≥ 3:1 sur les surfaces claire et sombre) ; une seule série, pas de légende, valeur affichée sur la plus haute colonne seulement, tableau des données dans `<details>`.
