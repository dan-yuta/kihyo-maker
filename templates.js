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
  {
    name: "障害報告",
    backlogType: "バグ",
    titleFormat: "【障害】{対象}で{起きていること}",
    questions: [
      { name: "発生日時", label: "発生日時（24時間表記）", type: "text", placeholder: "例：11/21 22:30" },
      { name: "対象", label: "対象（サーバー・機器の名前）", type: "text", placeholder: "例：web01" },
      { name: "起きていること", label: "起きていること", type: "text", placeholder: "例：画面を開くと 502 が出る" },
      { name: "影響範囲", label: "影響範囲", type: "select", options: ["全体", "一部の利用者", "なし", "調査中"] },
      { name: "やった対応", label: "やった対応", type: "textarea", placeholder: "例：web01 を再起動した" },
      { name: "原因", label: "原因", type: "textarea", placeholder: "分からなければ空のまま" },
      { name: "次の報告", label: "次の報告", type: "text", placeholder: "例：11:30 に状況を報告" },
    ],
    body: `## 事象
{起きていること}

## 発生日時
{発生日時}

## 影響範囲
{影響範囲}

## 暫定対応
{やった対応}

## 原因
{原因}

## 次の報告
{次の報告}`,
  },
  {
    name: "変更作業の申請",
    backlogType: "タスク",
    titleFormat: "【変更】{作業日} {対象}の{変更内容}",
    questions: [
      { name: "作業日", label: "作業日", type: "text", placeholder: "例：11/28" },
      { name: "作業時間", label: "作業時間（24時間表記）", type: "text", placeholder: "例：22:00〜23:30" },
      { name: "対象", label: "対象（サーバー・機器の名前）", type: "text", placeholder: "例：web01" },
      { name: "変更内容", label: "変更内容", type: "text", placeholder: "例：OS のセキュリティパッチを当てる" },
      { name: "なぜ変えるか", label: "なぜ変えるか", type: "textarea", placeholder: "例：月に1回のパッチ当てのため" },
      { name: "サービス停止", label: "サービスの停止", type: "select", options: ["あり", "瞬断のみ", "なし"] },
      { name: "影響の中身", label: "影響の中身（止まる時間・利用者への連絡）", type: "textarea", placeholder: "例：22:30〜22:40 は web01 の画面が開けない。利用者には 11/25 に連絡済み" },
      { name: "作業手順", label: "作業手順（手順書の場所か、手順の流れ）", type: "textarea", placeholder: "例：パッチを当てる → 再起動する → 画面が開けるか確かめる" },
      { name: "切り戻し手順", label: "切り戻し手順（うまくいかないときに元に戻す方法）", type: "textarea", placeholder: "例：23:00 までに確認が終わらなければ、パッチを外して再起動する" },
      { name: "作業後の確認", label: "作業後の確認（何を見たら終わりか）", type: "textarea", placeholder: "例：web01 の画面が開ける。監視にアラートが出ていない" },
    ],
    dueKey: "作業日",
    body: `## 目的
{なぜ変えるか}

## 変更内容
{変更内容}

## 対象
{対象}

## 作業日時
{作業日} {作業時間}

## サービスへの影響
- 停止：{サービス停止}
- 中身：{影響の中身}

## 作業手順
{作業手順}

## 切り戻し手順
{切り戻し手順}

## 作業後の確認
{作業後の確認}`,
  },
  {
    name: "調査依頼",
    backlogType: "タスク",
    titleFormat: "【調査】{対象}の{調べること}",
    questions: [
      { name: "対象", label: "対象（サーバー・機器の名前）", type: "text", placeholder: "例：db01" },
      { name: "調べること", label: "調べること", type: "text", placeholder: "例：夜間バッチが遅くなった原因" },
      { name: "なぜ調べるか", label: "なぜ調べるか", type: "textarea", placeholder: "例：11/20 から終わる時刻が 30 分遅れている" },
      { name: "分かっていること", label: "分かっていること", type: "textarea", placeholder: "例：11/20 にデータが 2 倍になった" },
      { name: "期限", label: "期限", type: "text", placeholder: "例：12/1" },
      { name: "報告の形", label: "報告の形（何を出したら完了か）", type: "textarea", placeholder: "例：原因と対策の案を、このチケットのコメントに書く" },
    ],
    dueKey: "期限",
    body: `## 背景
{なぜ調べるか}

## 調べること
{調べること}

## 対象
{対象}

## 分かっていること
{分かっていること}

## 期限
{期限}

## 報告の形
{報告の形}`,
  },
];
