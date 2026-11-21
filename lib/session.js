// ログインの確かめに使う部品（api/ の関数から import して使う）
// 2 つ以上の api/ のファイルで使う物だけを、ここに 1 つだけ置く。1 つのファイルでしか使わない物は、そのファイルに置く。
// api/ の外に置くのは、Vercel が api/ の中のファイルを全部、関数として出すため。
// 鍵などの値は、ここに書かない。readConfig が、呼ばれたときに Vercel の環境変数から読む。

import { createHmac, timingSafeEqual } from "node:crypto";

// クッキーの名前
// state と code_verifier … api/login.js が渡し、api/callback.js が確かめる
export const STATE_COOKIE = "kihyo_oauth_state";
export const VERIFIER_COOKIE = "kihyo_oauth_verifier";
// セッション … api/callback.js が渡し、api/me.js・api/generate.js が readSession で確かめ、api/logout.js が消す
export const SESSION_COOKIE = "kihyo_session";

// 環境変数を読む。4 つのどれかが無ければ null（ログインもしない・AI も使わせない）
// 使う所：api/login.js・api/callback.js・api/me.js・api/generate.js
export function readConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  const allowedIds = readAllowedIds(process.env.ALLOWED_GITHUB_IDS);
  if (!clientId || !clientSecret || !sessionSecret || !allowedIds) return null;
  return { clientId, clientSecret, sessionSecret, allowedIds };
}

// 通してよい GitHub の数字の ID（カンマ区切り）を読む。数字でない物は使わない。1 つも無ければ null
// readConfig の中だけで使う
function readAllowedIds(list) {
  if (typeof list !== "string") return null;
  const ids = new Set();
  for (const part of list.split(",")) {
    const id = part.trim();
    if (/^[1-9][0-9]*$/.test(id)) ids.add(id);
  }
  return ids.size > 0 ? ids : null;
}

// セッションのクッキーを確かめる。署名が合い・期限内で・ALLOWED_GITHUB_IDS にいれば { id, login }、ほかは null
// 形は「中身（base64url）.署名（base64url）」。作る側は api/callback.js の signSession
// 使う所：api/me.js・api/generate.js
export function readSession(req, secret, allowedIds) {
  let cookies;
  try {
    cookies = req.cookies;
  } catch {
    return null;
  }
  const value = isPlainObject(cookies) && typeof cookies[SESSION_COOKIE] === "string" ? cookies[SESSION_COOKIE] : "";
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  // 署名を比べる。かかる時間で中身を当てられないよう、timingSafeEqual で比べる
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest().toString("base64url"));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let session;
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isPlainObject(session)) return null;
  const { id, login, exp } = session;
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (typeof login !== "string" || login === "") return null;
  if (typeof exp !== "number" || !(exp > Date.now())) return null; // 期限切れ
  if (!allowedIds.has(String(id))) return null; // ALLOWED_GITHUB_IDS から外された人
  return { id, login };
}

// クッキーの 1 行を作る。どれも HttpOnly・Secure・SameSite=Lax。消すときは中身を空・期限を 0 にする
// 使う所：api/login.js・api/callback.js・api/logout.js
export function cookieLine(name, value, path, maxAge) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=Lax`;
}

// 戻り先の URL。「https://」＋ 今開いているホスト ＋「/api/callback」（本番とプレビューの両方で動かすため）
// 使う所：api/login.js・api/callback.js（GitHub に渡す redirect_uri は、2 回とも同じでないといけない）
export function callbackUrl(req) {
  const host = req.headers.host;
  if (typeof host !== "string" || !/^[A-Za-z0-9.-]+(:[0-9]+)?$/.test(host)) return null;
  return `https://${host}/api/callback`;
}

// 使う所：この中の readSession・api/callback.js・api/generate.js
export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
