type Enfant = Node | string | null | undefined | false;

/** Création d'élément sans innerHTML : tout texte (question, réponse du modèle) passe par textContent. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributs: Record<string, string | boolean | ((e: Event) => void)> = {},
  ...enfants: Enfant[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [cle, v] of Object.entries(attributs)) {
    if (typeof v === "function") el.addEventListener(cle.replace(/^on/, ""), v);
    else if (v === true) el.setAttribute(cle, "");
    else if (v !== false) el.setAttribute(cle, v);
  }
  for (const e of enfants) if (e) el.append(e);
  return el;
}

export function lire(cle: string): string | null {
  try {
    return sessionStorage.getItem(cle);
  } catch {
    return null;
  }
}

export function ecrire(cle: string, valeur: string | null): void {
  try {
    if (valeur === null) sessionStorage.removeItem(cle);
    else sessionStorage.setItem(cle, valeur);
  } catch {
    // stockage indisponible (navigation privée) : la démo fonctionne sans
  }
}
