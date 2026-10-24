import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/** Test de fumée indépendant du contenu, lancé sur toute démo personnalisée. */
const config = JSON.parse(readFileSync(join(import.meta.dirname, "../../config/demo.json"), "utf8")) as {
  personnalisee?: boolean;
  entreprise: { nom: { fr: string } };
  emails: unknown[];
};

test("fumée : bandeau, workflow sur tous les e-mails, rapport, aucune erreur, pas de débordement", async ({ page }) => {
  const erreurs: string[] = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto("/?lang=fr");
  await expect(page.getByTestId("bandeau")).toContainText(config.personnalisee ? "non commandée par le client" : "fictifs");
  await expect(page.getByRole("banner")).toContainText(config.entreprise.nom.fr);
  await page.getByTestId("lancer").click();
  await expect(page.locator(".email .pastille-cat")).toHaveCount(config.emails.length, { timeout: 30_000 });
  await page.getByTestId("onglet-rapport").click();
  await page.getByTestId("rediger").click();
  await expect(page.getByTestId("rapport")).toBeVisible();
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(debord).toBeLessThanOrEqual(0);
  expect(erreurs).toEqual([]);
});
