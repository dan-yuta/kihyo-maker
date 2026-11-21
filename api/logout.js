// ログアウト（Vercel の関数）
// セッションのクッキーを消す。POST だけ受け付ける。

// セッションのクッキーの名前と、クッキーの 1 行の作り方は lib/session.js にある（api/callback.js と同じ物を使う）
import { SESSION_COOKIE, cookieLine } from "../lib/session.js";

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
