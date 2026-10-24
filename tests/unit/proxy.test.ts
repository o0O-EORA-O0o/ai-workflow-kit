import { describe, expect, it, vi } from "vitest";
import { traiterDemande, traiterSession, type Env } from "../../src/server/proxy";

const ENV: Env = { N8N_WEBHOOK_URL: "https://n8n.test/webhook/kit1-demo", N8N_WEBHOOK_TOKEN: "jeton", DEMO_ACCESS_CODE: "CODE", DEMO_DAILY_LIMIT: "2" };
const req = (corps: unknown, ip = "203.0.113.30") => new Request("https://d.test/api/traiter", { method: "POST", body: JSON.stringify(corps), headers: { "cf-connecting-ip": ip } });
const demande = { type: "email", langue: "fr", email: { de: "a", sujet: "b", corps: "c" }, code: "CODE" };

describe("relais vers n8n", () => {
  it("vérifie la demande, la configuration et le code", async () => {
    expect((await traiterDemande(req({ type: "x" }), ENV)).status).toBe(400);
    expect((await traiterDemande(req(demande), {})).status).toBe(503);
    expect((await traiterDemande(req({ ...demande, code: "faux" }), ENV)).status).toBe(401);
    const s = await traiterSession(new Request("https://d.test", { method: "POST", body: JSON.stringify({ code: "CODE" }) }), ENV);
    expect(await s.json()).toEqual({ direct: true });
  });

  it("transmet au webhook avec le jeton, sans le code d'accès", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ type: "email", resultat: { categorie: "lead" } })));
    const r = await traiterDemande(req(demande, "203.0.113.31"), ENV, { fetch: f as unknown as typeof fetch });
    expect(await r.json()).toMatchObject({ resultat: { categorie: "lead" } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENV.N8N_WEBHOOK_URL);
    expect((init.headers as Record<string, string>)["X-Demo-Token"]).toBe("jeton");
    expect(JSON.parse(String(init.body))).not.toHaveProperty("code");
  });

  it("renvoie 502 si n8n répond mal, 429 au-delà de la limite", async () => {
    const panne = vi.fn(async () => new Response("", { status: 500 }));
    expect((await traiterDemande(req(demande, "203.0.113.32"), ENV, { fetch: panne as unknown as typeof fetch })).status).toBe(502);
    const ok = vi.fn(async () => new Response("{}"));
    const statuts = [];
    for (let i = 0; i < 3; i++) statuts.push((await traiterDemande(req(demande, "203.0.113.33"), ENV, { fetch: ok as unknown as typeof fetch })).status);
    expect(statuts).toEqual([200, 200, 429]);
  });
});
