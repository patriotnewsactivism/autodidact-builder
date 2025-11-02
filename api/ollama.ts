// api/ollama.ts (Vercel) or /netlify/functions/ollama.ts (Netlify)
export default async function handler(req: any, res: any) {
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
  r.headers.forEach((v: string, k: string) => res.setHeader(k, v));
  res.send(await r.text());
}
