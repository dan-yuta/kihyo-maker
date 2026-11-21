// 「今ログインしているか」を返す（Vercel の関数）
// セッションのクッキーの署名と期限を確かめ、{ loggedIn: true, login } か { loggedIn: false } を返す。
// ALLOWED_GITHUB_IDS も毎回見直す（外した人は、その場で通らなくする）。
// ログには、クッキー・鍵を出さない。

import { createHmac, timingSafeEqual } from "node:crypto";

// セッションのクッキーの名前（api/callback.js・api/logout.js・api/generate.js と同じにする）
const SESSION_COOKIE = "kihyo_session";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET だけ受け付けます" });
  }

  // 環境変数が 1 つでも無ければ、ログインしていない扱いにする
  const config = readConfig();
  if (!config) {
    return res.status(200).json({ loggedIn: false });
  }

  const session = readSession(req, config.sessionSecret, config.allowedIds);
  if (!session) {
    return res.status(200).json({ loggedIn: false });
  }
  return res.status(200).json({ loggedIn: true, login: session.login });
}

// セッションのクッキーを確かめる。署名が合い・期限内で・ALLOWED_GITHUB_IDS にいれば { id, login }、ほかは null
// 形は「中身（base64url）.署名（base64url）」。作る側は api/callback.js の signSession
// api/me.js・api/generate.js の 2 つに同じ物がある。直すときは 2 つとも直す
function readSession(req, secret, allowedIds) {
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
