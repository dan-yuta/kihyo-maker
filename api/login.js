// 「GitHub でログイン」の入り口（Vercel の関数）
// GitHub の OAuth App の Web の流れ（認可コード）を始める。state と PKCE（S256）を必ず付ける。
// state と code_verifier はクッキー（Path=/api・10 分）に入れ、戻り先の api/callback.js で確かめる。
// 鍵などの値は Vercel の環境変数から読む（コードに書かない。読むのは lib/session.js の readConfig）。

import { createHash, randomBytes } from "node:crypto";
import { STATE_COOKIE, VERIFIER_COOKIE, callbackUrl, cookieLine, readConfig } from "../lib/session.js";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

const FLOW_MAX_AGE = 10 * 60; // state と code_verifier のクッキーの期限（秒）＝ 10 分

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET だけ受け付けます" });
  }

  // 環境変数が 1 つでも無ければ、ログインを始めない
  const config = readConfig();
  if (!config) {
    return res.status(500).json({ error: "ログインの設定が足りません" });
  }

  const redirectUri = callbackUrl(req);
  if (!redirectUri) {
    return res.status(400).json({ error: "開いているアドレスが読めません" });
  }

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url"); // 43 文字（PKCE の決まりは 43〜128 文字）
  const codeChallenge = createHash("sha256").update(codeVerifier).digest().toString("base64url");

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // scope は付けない（公開されている名前と ID だけを読む）

  res.setHeader("Set-Cookie", [
    cookieLine(STATE_COOKIE, state, "/api", FLOW_MAX_AGE),
    cookieLine(VERIFIER_COOKIE, codeVerifier, "/api", FLOW_MAX_AGE),
  ]);
  return res.redirect(url.toString());
}
