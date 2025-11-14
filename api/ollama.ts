// api/ollama.ts (Vercel) or /netlify/functions/ollama.ts (Netlify)

interface ProxyRequest {
  url: string;
  method: string;
  body?: unknown;
}

interface ProxyResponse {
  status: (statusCode: number) => ProxyResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

export default async function handler(req: ProxyRequest, res: ProxyResponse) {
  const base = process.env.OLLAMA_ENDPOINT!;
  const upstream = `${base}${req.url.replace(/^\/api\/ollama/, "")}`;

  // Forward JSON; add auth header for your proxy
  const r = await fetch(upstream, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OLLAMA_TOKEN}`,
    },
    body: ["GET","HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
  });

  res.status(r.status);
  r.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(await r.text());
}
