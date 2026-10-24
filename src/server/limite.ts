/** Sous-ensemble de l'API KV de Cloudflare utilisé ici. */
export interface Kv {
  get(cle: string): Promise<string | null>;
  put(cle: string, valeur: string, options?: { expirationTtl?: number }): Promise<void>;
}

const memoire = new Map<string, number>();

/**
 * Compteur quotidien par adresse IP et global. Avec un espace KV lié (RATE_LIMIT), la limite tient
 * entre instances ; sans KV, elle reste par instance (au mieux), ce qui suffit pour une démo.
 */
export async function consommer(kv: Kv | undefined, cle: string, limite: number): Promise<boolean> {
  if (limite <= 0) return true;
  if (!kv) {
    const n = (memoire.get(cle) ?? 0) + 1;
    memoire.set(cle, n);
    return n <= limite;
  }
  const n = Number((await kv.get(cle)) ?? "0") + 1;
  if (n > limite) return false;
  await kv.put(cle, String(n), { expirationTtl: 2 * 86_400 });
  return true;
}

/** Comparaison en temps constant, pour ne pas révéler le code d'accès caractère par caractère. */
export function egal(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
