import { consommer, egal, type Kv } from "./limite";

export interface Env {
  /** URL du webhook n8n sur le serveur Hetzner, ex. https://n8n.exemple.fr/webhook/kit1-demo */
  N8N_WEBHOOK_URL?: string;
  /** Jeton attendu par l'identifiant « Header Auth » du nœud Webhook. */
  N8N_WEBHOOK_TOKEN?: string;
  N8N_WEBHOOK_HEADER?: string;
  DEMO_ACCESS_CODE?: string;
  DEMO_DAILY_LIMIT?: string;
  DEMO_GLOBAL_DAILY_LIMIT?: string;
  RATE_LIMIT?: Kv;
}

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export const directDisponible = (env: Env) => !!env.N8N_WEBHOOK_URL && !!env.N8N_WEBHOOK_TOKEN && !!env.DEMO_ACCESS_CODE;
export const codeValide = (env: Env, code: unknown) => directDisponible(env) && typeof code === "string" && egal(code.trim(), env.DEMO_ACCESS_CODE!);

export async function traiterSession(req: Request, env: Env): Promise<Response> {
  const corps = (await req.json().catch(() => ({}))) as { code?: unknown };
  return json({ direct: codeValide(env, corps.code) });
}

/**
 * POST /api/traiter : relaie la demande au workflow n8n « Kit 1 — Démo en direct » (D-032). Le jeton du
 * webhook reste côté serveur ; la page ne voit jamais l'adresse de n8n.
 */
export async function traiterDemande(req: Request, env: Env, deps: { fetch?: typeof fetch; maintenant?: () => Date } = {}): Promise<Response> {
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corps || (corps.type !== "email" && corps.type !== "rapport")) return json({ erreur: "demande_invalide" }, 400);
  if (corps.type === "email") {
    const e = corps.email as { corps?: unknown } | undefined;
    if (typeof e?.corps !== "string" || !e.corps.trim() || e.corps.length > 6000) return json({ erreur: "email_invalide" }, 400);
  }
  if (!directDisponible(env)) return json({ erreur: "direct_indisponible" }, 503);
  if (!codeValide(env, corps.code)) return json({ erreur: "code_invalide" }, 401);

  const jour = (deps.maintenant?.() ?? new Date()).toISOString().slice(0, 10);
  const ip = req.headers.get("cf-connecting-ip") ?? "inconnue";
  const okIp = await consommer(env.RATE_LIMIT, `ip:${ip}:${jour}`, Number(env.DEMO_DAILY_LIMIT ?? 40));
  const okGlobal = okIp && (await consommer(env.RATE_LIMIT, `global:${jour}`, Number(env.DEMO_GLOBAL_DAILY_LIMIT ?? 400)));
  if (!okIp || !okGlobal) return json({ erreur: "limite_atteinte" }, 429);

  const { code: _code, ...transmis } = corps;
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), 45_000);
  try {
    const r = await (deps.fetch ?? fetch)(env.N8N_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", [env.N8N_WEBHOOK_HEADER ?? "X-Demo-Token"]: env.N8N_WEBHOOK_TOKEN! },
      body: JSON.stringify(transmis),
      signal: controle.signal,
    });
    if (!r.ok) return json({ erreur: "n8n_indisponible", statut: r.status }, 502);
    return json(await r.json());
  } catch (e) {
    console.error("n8n :", (e as Error).message);
    return json({ erreur: "n8n_indisponible" }, 502);
  } finally {
    clearTimeout(minuteur);
  }
}
