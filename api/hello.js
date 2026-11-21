// 裏側の入り口（Vercel の関数）
// 時刻と「鍵があるか」だけを返す。鍵の中身は返さない。
export default function handler(req, res) {
  res.status(200).json({
    message: "裏側から返事です",
    time: new Date().toISOString(),
    keyIsSet: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
