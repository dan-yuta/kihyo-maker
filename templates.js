// 起票メーカーのテンプレート
// 1つ＝1つのまとまり。足すときは、この配列の最後に1つ足す。
//   name        … ドロップダウンに出る名前
//   backlogType … Backlog の種別（タスク・バグ・要望・その他）
//   titleFormat … 件名の型。{質問の名前} の所に答えが入る
//   questions   … 質問（アンケート）。name が {…} の名前になる
//                 type は "text"（1行）・"textarea"（複数行）・"select"（選ぶ）
//   dueKey      … Backlog の「期限日」に出す質問の名前（無ければ書かない）
//   body        … 本文の型（Markdown）。{質問の名前} の所に答えが入る

const TEMPLATES = [
  {
    name: "作業依頼",
    backlogType: "タスク",
    titleFormat: "【作業】{対象}の{やること}",
    questions: [
      { name: "対象", label: "対象（サーバー・機器の名前）", type: "text", placeholder: "例：web01" },
      { name: "やること", label: "やること", type: "text", placeholder: "例：ディスクの容量を 100GB に増やす" },
      { name: "なぜやるか", label: "なぜやるか", type: "textarea", placeholder: "例：空きが 10% を切ったため" },
      { name: "期限", label: "期限", type: "text", placeholder: "例：11/28" },
      { name: "終わりの形", label: "終わりの形（何ができたら完了か）", type: "textarea", placeholder: "例：df で 100GB と出る" },
    ],
    dueKey: "期限",
    body: `## 目的
{なぜやるか}

## 作業内容
{やること}

## 対象
{対象}

## 期限
{期限}

## 完了条件
{終わりの形}`,
  },
];
