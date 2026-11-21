// 「GitHub でログイン」の戻り先（Vercel の関数）
// GitHub から戻ってきた code をトークンに替え、そのトークンでその人の GitHub の ID を読む。
// ALLOWED_GITHUB_IDS にいる人だけに、署名を付けたセッションのクッキー（30 日）を渡す。
// トークンは保存しない。ログには、トークン・code・クッキー・鍵を出さない（出すのは番号と理由だけ）。
// うまくいかなかったときは /?login=〈理由〉 へ戻す。理由は次の 3 つだけ。
//   retry  … state が合わない・クッキーが無い（期限切れ）・GitHub の画面でやめた・code が無い
//   denied … ALLOWED_GITHUB_IDS にいない人
//   failed … 環境変数が無い・GitHub とのやり取りに失敗した

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const USER_AGENT = "kihyo-maker";
const TIMEOUT_MS = 10 * 1000; // GitHub を待つのは 10 秒まで

// クッキーの名前
// state と code_verifier は api/login.js と、セッションは api/me.js・api/logout.js・api/generate.js と同じにする
const STATE_COOKIE = "kihyo_oauth_state";
const VERIFIER_COOKIE = "kihyo_oauth_verifier";
const SESSION_COOKIE = "kihyo_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // セッションの期限（秒）＝ 30 日

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET だけ受け付けます" });
  }

  // state と code_verifier は 1 回きり。通しても通さなくても消す
  const cookiesToSet = [cookieLine(STATE_COOKIE, "", "/api", 0), cookieLine(VERIFIER_COOKIE, "", "/api", 0)];
  const fail = (reason) => {
    res.setHeader("Set-Cookie", cookiesToSet);
    return res.redirect(`/?login=${reason}`);
  };

  // 環境変数が 1 つでも無ければ、先へ進まない
  const config = readConfig();
  if (!config) {
    console.error("ログインの設定が足りません");
    return fail("failed");
  }

  const cookies = readCookies(req);
  const query = isPlainObject(req.query) ? req.query : {};

  // クッキーの state と、戻ってきた state が違えば、先へ進まない
  const savedState = text(cookies[STATE_COOKIE]);
  const codeVerifier = text(cookies[VERIFIER_COOKIE]);
  const state = text(query.state);
  if (savedState === "" || codeVerifier === "" || state === "" || !sameText(state, savedState)) {
    return fail("retry");
  }

  // GitHub の画面で「やめる」を押すと error=access_denied で戻ってくる
  const error = text(query.error);
  if (error === "access_denied") {
    return fail("retry");
  }
  if (error !== "") {
    console.error("GitHub がエラーで戻しました", { error: error.slice(0, 64) });
    return fail("failed");
  }

  const code = text(query.code);
  if (code === "") {
    return fail("retry");
  }

  const redirectUri = callbackUrl(req);
  if (!redirectUri) {
    console.error("開いているアドレスが読めません");
    return fail("failed");
  }

  const token = await fetchToken(config, code, redirectUri, codeVerifier);
  if (!token) {
    return fail("failed");
  }

  // トークンは、ここで 1 回使うだけ。保存しない
  const user = await fetchUser(token);
  if (!user) {
    return fail("failed");
  }

  // 返ってきた id（数字）が ALLOWED_GITHUB_IDS に無ければ、通さない
  if (!config.allowedIds.has(String(user.id))) {
    return fail("denied");
  }

  const exp = Date.now() + SESSION_MAX_AGE * 1000; // 期限（ミリ秒）
  const session = signSession({ id: user.id, login: user.login, exp }, config.sessionSecret);
  cookiesToSet.push(cookieLine(SESSION_COOKIE, session, "/", SESSION_MAX_AGE));
  res.setHeader("Set-Cookie", cookiesToSet);
  return res.redirect("/");
}

// code をトークンに替える。うまくいかなければ null
async function fetchToken(config, code, redirectUri, codeVerifier) {
  let response;
  let data = null;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    data = await response.json();
  } catch {
    console.error("GitHub のトークンを受け取れませんでした", { reason: "つながらない・時間切れ・JSON 以外" });
    return null;
  }

  // エラーのときも 200 で error が入ることがあるので、番号だけで決めない
  const ok =
    response.ok &&
    isPlainObject(data) &&
    typeof data.error !== "string" &&
    typeof data.access_token === "string" &&
    data.access_token !== "";
  if (!ok) {
    console.error("GitHub のトークンを受け取れませんでした", {
      status: response.status,
      error: isPlainObject(data) && typeof data.error === "string" ? data.error.slice(0, 64) : null,
    });
    return null;
  }
  return data.access_token;
}

// トークンで https://api.github.com/user を読み、id と login を返す。うまくいかなければ null
async function fetchUser(token) {
  let response;
  let data = null;
  try {
    response = await fetch(USER_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) data = await response.json();
  } catch {
    console.error("GitHub の利用者を読めませんでした", { reason: "つながらない・時間切れ・JSON 以外" });
    return null;
  }

  if (!response.ok) {
    console.error("GitHub の利用者を読めませんでした", { status: response.status });
    return null;
  }
  const ok =
    isPlainObject(data) &&
    Number.isSafeInteger(data.id) &&
    data.id > 0 &&
    typeof data.login === "string" &&
    data.login !== "";
  if (!ok) {
    console.error("GitHub の利用者を読めませんでした", { reason: "id か login が無い" });
    return null;
  }
  return { id: data.id, login: data.login };
}

// セッションのクッキーの中身を作る。「中身（base64url）.署名（base64url）」の形
// 署名は SESSION_SECRET で HMAC-SHA256。確かめる側は api/me.js・api/generate.js の readSession
function signSession(session, secret) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest().toString("base64url");
  return `${payload}.${signature}`;
}

// 2 つの文字列を比べる。かかる時間で中身を当てられないよう、ハッシュにしてから比べる
function sameText(a, b) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

// クッキーを読む。読めなければ空として扱う
function readCookies(req) {
  try {
    return isPlainObject(req.cookies) ? req.cookies : {};
  } catch {
    return {};
  }
}

// 文字列ならそのまま、ほか（無い・2 つ以上ある）は空にする
function text(value) {
  return typeof value === "string" ? value : "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// 戻り先の URL。「https://」＋ 今開いているホスト ＋「/api/callback」（本番とプレビューの両方で動かすため）
// api/login.js にも同じ物がある（GitHub に渡す redirect_uri は、2 回とも同じでないといけない）
function callbackUrl(req) {
  const host = req.headers.host;
  if (typeof host !== "string" || !/^[A-Za-z0-9.-]+(:[0-9]+)?$/.test(host)) return null;
  return `https://${host}/api/callback`;
}

// クッキーの 1 行を作る。どれも HttpOnly・Secure・SameSite=Lax。消すときは中身を空・期限を 0 にする
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
