import { traiterSession, type Env } from "../../src/server/proxy";

export const onRequestPost = ({ request, env }: { request: Request; env: Env }): Promise<Response> => traiterSession(request, env);
