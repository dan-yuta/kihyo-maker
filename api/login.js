// 「GitHub でログイン」の入り口（Vercel の関数）
// GitHub の OAuth App の Web の流れ（認可コード）を始める。state と PKCE（S256）を必ず付ける。
// state と code_verifier はクッキー（Path=/api・10 分）に入れ、戻り先の api/callback.js で確かめる。
// 鍵などの値は Vercel の環境変数から読む（コードに書かない）。

import { createHash, randomBytes } from "node:crypto";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

// クッキーの名前（api/callback.js と同じにする）
const STATE_COOKIE = "kihyo_oauth_state";
const VERIFIER_COOKIE = "kihyo_oauth_verifier";
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

// 戻り先の URL。「https://」＋ 今開いているホスト ＋「/api/callback」（本番とプレビューの両方で動かすため）
// api/callback.js にも同じ物がある（GitHub に渡す redirect_uri は、2 回とも同じでないといけない）
function callbackUrl(req) {
  const host = req.headers.host;
  if (typeof host !== "string" || !/^[A-Za-z0-9.-]+(:[0-9]+)?$/.test(host)) return null;
  return `https://${host}/api/callback`;
}

// クッキーの 1 行を作る。どれも HttpOnly・Secure・SameSite=Lax
function cookieLine(name, value, path, maxAge) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=Lax`;
}

// 環境変数を読む。4 つのどれかが無ければ null（ログインもしない・AI も使わせない）
// api/login.js・api/callback.js・api/me.js・api/generate.js の 4 つに同じ物がある。直すときは 4 つとも直す
function readConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  const allowedIds = readAllowedIds(process.env.ALLOWED_GITHUB_IDS);
  if (!clientId || !clientSecret || !sessionSecret || !allowedIds) return null;
  return { clientId, clientSecret, sessionSecret, allowedIds };
}

// 通してよい GitHub の数字の ID（カンマ区切り）を読む。数字でない物は使わない。1 つも無ければ null
function readAllowedIds(list) {
  if (typeof list !== "string") return null;
  const ids = new Set();
  for (const part of list.split(",")) {
    const id = part.trim();
    if (/^[1-9][0-9]*$/.test(id)) ids.add(id);
  }
  return ids.size > 0 ? ids : null;
}
