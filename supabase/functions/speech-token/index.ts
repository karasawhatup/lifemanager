import { isResponse, json, preflight, requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== "POST") return json({ error: "POST だけ受け付けます" }, 405);

  const user = await requireUser(req);
  if (isResponse(user)) return user;

  const key = (Deno.env.get("AZURE_SPEECH_KEY") ?? "").trim();
  const region = (Deno.env.get("AZURE_SPEECH_REGION") ?? "").trim().toLowerCase();
  if (!key || !region) {
    return json(
      { error: "Azure Speech の秘密がまだありません。GitHub の秘密を入れて、Deploy speaking functions を実行してください。" },
      503,
    );
  }
  if (!/^[a-z0-9]+$/.test(region)) return json({ error: "AZURE_SPEECH_REGION の形が違います" }, 500);

  let response: Response;
  try {
    response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Length": "0",
      },
    });
  } catch (err) {
    console.error("azure token network", err instanceof Error ? err.name : "error");
    return json({ error: "Azure に接続できませんでした" }, 502);
  }

  const token = (await response.text()).trim();
  if (!response.ok || token.length < 20) {
    console.error("azure token status", response.status);
    return json({ error: "Azure のトークンを取れませんでした。キーとリージョンを確認してください。" }, 502);
  }

  return json({ token, region, expires_in: 600 });
});
