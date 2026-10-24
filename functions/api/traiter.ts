import { traiterDemande, type Env } from "../../src/server/proxy";

export const onRequestPost = ({ request, env }: { request: Request; env: Env }): Promise<Response> => traiterDemande(request, env);
