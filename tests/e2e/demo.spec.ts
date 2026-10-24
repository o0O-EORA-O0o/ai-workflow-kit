import { expect, test } from "@playwright/test";

test("le workflow trie les 8 e-mails, détecte la fausse facture et prépare les brouillons", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("bandeau")).toContainText("100 % fictifs");
  await page.getByTestId("lancer").click();
  await expect(page.getByTestId("feuille-lead")).toHaveText("Leads (2)", { timeout: 15_000 });
  await expect(page.getByTestId("feuille-autre")).toHaveText("Autres (1)", { timeout: 15_000 });
  await expect(page.getByTestId("feuille-spam")).toHaveText("Indésirables (1)");
  await page.getByTestId("feuille-facture").click();
  await expect(page.getByTestId("feuille")).toContainText("Mise en quarantaine");
  await page.getByTestId("feuille-lead").click();
  await page.getByTestId("feuille").locator("tbody tr").first().click();
  await expect(page.getByTestId("brouillon")).toContainText("visite technique");
});

test("un e-mail saisi est classé par règles en mode sans IA", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Essayer avec votre e-mail").click();
  await page.getByTestId("essai-sujet").fill("Facture FA-2026-00123");
  await page.getByTestId("essai-corps").fill("Bonjour, veuillez trouver la facture FA-2026-00123 d'un montant de 1 250,00 € HT, échéance 15/12/2026.");
  await page.getByTestId("essai-envoyer").click();
  await expect(page.getByTestId("detail")).toContainText("FA-2026-00123", { timeout: 10_000 });
  await expect(page.getByTestId("detail")).toContainText("règles");
});

test("rapport hebdomadaire : tuiles, graphique accessible, rapport rédigé", async ({ page }) => {
  await page.goto("/?onglet=rapport");
  await expect(page.getByTestId("tuiles")).toContainText("Chiffre d'affaires HT");
  await expect(page.getByRole("img", { name: "Chiffre d'affaires par jour" })).toBeVisible();
  await page.getByText("Données du graphique").click();
  await expect(page.locator(".donnees table tr")).toHaveCount(5);
  await page.getByTestId("rediger").click();
  await expect(page.getByTestId("rapport")).toContainText("Rapport hebdomadaire — Solarelle");
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(debord).toBeLessThanOrEqual(0);
});

test("anglais, workflow téléchargeable, pas de défilement horizontal", async ({ page }) => {
  await page.goto("/?lang=en&onglet=workflow");
  await expect(page.getByTestId("bandeau")).toContainText("100% fictional");
  const lien = page.getByTestId("telecharger");
  await expect(lien).toHaveAttribute("href", "/n8n/kit1-modele-tri-emails.json");
  const r = await page.request.get("/n8n/kit1-modele-tri-emails.json");
  expect((await r.json()).name).toBe("Kit 1 — Modèle client : tri des e-mails");
  for (const onglet of ["boite", "rapport", "workflow"]) {
    await page.getByTestId(`onglet-${onglet}`).click();
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(debord, onglet).toBeLessThanOrEqual(0);
  }
});
