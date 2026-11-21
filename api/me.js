// 「今ログインしているか」を返す（Vercel の関数）
// セッションのクッキーの署名と期限を確かめ、{ loggedIn: true, login } か { loggedIn: false } を返す。
// ALLOWED_GITHUB_IDS も毎回見直す（外した人は、その場で通らなくする）。
// ログには、クッキー・鍵を出さない。

// 環境変数の読み込みと、セッションのクッキーの確かめは lib/session.js にある（api/generate.js と同じ物を使う）
import { readConfig, readSession } from "../lib/session.js";

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
