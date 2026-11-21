// ログアウト（Vercel の関数）
// セッションのクッキーを消す。POST だけ受け付ける。

// セッションのクッキーの名前（api/callback.js・api/me.js・api/generate.js と同じにする）
const SESSION_COOKIE = "kihyo_session";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  // 渡したときと同じ名前・同じ Path で、中身を空・期限を 0 にすると消える
  res.setHeader("Set-Cookie", cookieLine(SESSION_COOKIE, "", "/", 0));
  return res.status(200).json({ loggedIn: false });
}

// クッキーの 1 行を作る。どれも HttpOnly・Secure・SameSite=Lax（api/login.js・api/callback.js と同じ形）
function cookieLine(name, value, path, maxAge) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=Lax`;
}
