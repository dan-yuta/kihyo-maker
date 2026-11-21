// 起票メーカーの画面の動き
// templates.js の TEMPLATES を読んで、ドロップダウン・質問・型どおりの埋め込みを作る
// 「AI で整える」は裏側（api/generate.js）に頼んで、件名と本文を整えてもらう
// 「AI で整える」を使えるのは「GitHub でログイン」した人だけ（api/login.js・api/me.js・api/logout.js）

const EMPTY_MARK = "（要確認）";

// 「AI で整える」の決まり
const AI_ENDPOINT = "/api/generate";
const AI_MAX_CHARS = 4000; // 送る物の文字数の上限（api/generate.js と同じ）
const TITLE_MAX_CHARS = 40; // 件名の文字数の上限
// おおよその料金（円）を出すための数（料金が変わったら、ここだけ直す）
const PRICE_INPUT_PER_MTOK = 4; // 入力：100万トークンで何ドルか（Claude Opus 5.5）
const PRICE_OUTPUT_PER_MTOK = 20; // 出力：100万トークンで何ドルか
const YEN_PER_DOLLAR = 150; // 1ドルを何円で計算するか
const FALLBACK_HINT = "［型どおりに埋める］なら使えます";
const NO_REPLY = "裏側から返事がありませんでした";
const IS_FILE = location.protocol === "file:";
const FILE_NOTICE = "AI はプレビューか本番の URL で使えます";

// ログインの決まり
const ME_ENDPOINT = "/api/me";
const LOGOUT_ENDPOINT = "/api/logout";
const LOGIN_NEEDED = "AI を使うにはログインしてください";
const OLD_PASSCODE_KEY = "kihyo-maker-passcode"; // 前に合言葉を残していた名前（消すためだけに使う）
// /?login=〈理由〉 で戻ってきたときの知らせ（理由は api/callback.js が付ける）
const LOGIN_REASONS = new Map([
  ["retry", "もう一度ログインしてください"],
  ["denied", "このアプリを使えるのは、許可された人だけです"],
  ["failed", "GitHub とのやり取りに失敗しました"],
]);

const templateSelect = document.getElementById("templateSelect");
const questionsBox = document.getElementById("questions");
const fillButton = document.getElementById("fillButton");
const aiButton = document.getElementById("aiButton");
const aiMessage = document.getElementById("aiMessage");
const authBox = document.getElementById("authBox");
const authStatus = document.getElementById("authStatus");
const loginLink = document.getElementById("loginLink");
const logoutButton = document.getElementById("logoutButton");
const loginMessage = document.getElementById("loginMessage");
const resultBox = document.getElementById("result");
const checkOutput = document.getElementById("checkOutput");
const titleOutput = document.getElementById("titleOutput");
const bodyOutput = document.getElementById("bodyOutput");
const typeOutput = document.getElementById("typeOutput");
const dueOutput = document.getElementById("dueOutput");
const usageOutput = document.getElementById("usageOutput");
const toast = document.getElementById("toast");

// ログインの今の状態
let loginState = "checking"; // "checking"（確かめ中）・"in"（ログイン中）・"out"（ログインしていない）
let loginName = ""; // ログイン中の GitHub の名前
let waiting = false; // AI の返事を待っている間は true

// ドロップダウンにテンプレートを並べる
TEMPLATES.forEach((template, index) => {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = template.name;
  templateSelect.appendChild(option);
});

function currentTemplate() {
  return TEMPLATES[Number(templateSelect.value)];
}

// 選んだテンプレートの質問を出す
function renderQuestions() {
  const template = currentTemplate();
  questionsBox.textContent = "";
  template.questions.forEach((question) => {
    const label = document.createElement("label");
    label.className = "field";

    const caption = document.createElement("span");
    caption.className = "field-label";
    caption.textContent = question.label;
    label.appendChild(caption);

    let input;
    if (question.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
    } else if (question.type === "select") {
      input = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "（選ぶ）";
      input.appendChild(blank);
      (question.options || []).forEach((text) => {
        const option = document.createElement("option");
        option.value = text;
        option.textContent = text;
        input.appendChild(option);
      });
    } else {
      input = document.createElement("input");
      input.type = "text";
    }
    input.dataset.name = question.name;
    if (question.placeholder) input.placeholder = question.placeholder;
    label.appendChild(input);
    questionsBox.appendChild(label);
  });
  resultBox.hidden = true;
}

// 今の答えを { 質問の名前: 答え } の形で集める
function collectAnswers() {
  const answers = {};
  questionsBox.querySelectorAll("[data-name]").forEach((input) => {
    answers[input.dataset.name] = input.value.trim();
  });
  return answers;
}

// 型の {質問の名前} に答えを入れる。空なら（要確認）
function fillFormat(format, answers) {
  return format.replace(/\{([^{}]+)\}/g, (whole, name) => {
    if (!(name in answers)) return whole;
    return answers[name] === "" ? EMPTY_MARK : answers[name];
  });
}

// 結果を出す。テンプレートと答えは、ボタンを押したときの物を受け取る
function showResult(template, answers, title, body) {
  titleOutput.textContent = title;
  bodyOutput.textContent = body;
  typeOutput.textContent = template.backlogType;
  const due = template.dueKey ? answers[template.dueKey] : "";
  dueOutput.textContent = due ? due : "-";
  showProblems([]);
  showUsage(null);
  resultBox.hidden = false;
}

fillButton.addEventListener("click", () => {
  const template = currentTemplate();
  const answers = collectAnswers();
  clearAiMessage();
  showResult(template, answers, fillFormat(template.titleFormat, answers), fillFormat(template.body, answers));
});

// ---- AI で整える ----

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// 文字数を数える（絵文字なども 1 文字と数える）。api/generate.js の countSendChars と同じ数え方
function countChars(text) {
  return Array.from(text).length;
}

function countSendChars(titleFormat, bodyFormat, answers) {
  let total = countChars(titleFormat) + countChars(bodyFormat);
  Object.entries(answers).forEach(([name, value]) => {
    total += countChars(name) + countChars(value);
  });
  return total;
}

function showAiMessage(text, isError) {
  aiMessage.textContent = text;
  aiMessage.classList.toggle("is-error", Boolean(isError));
  aiMessage.hidden = false;
}

function showAiError(text) {
  showAiMessage(`${text}\n${FALLBACK_HINT}`, true);
}

// AI の知らせを、ふだんの物に戻す
function clearAiMessage() {
  if (IS_FILE) return; // file: で開いたときの知らせは消さない
  if (loginState === "out") {
    showAiMessage(LOGIN_NEEDED, false); // ログインしていないときは、ログインのお願いを残す
    return;
  }
  aiMessage.textContent = "";
  aiMessage.hidden = true;
}

// ［AI で整える］を押せるのは、プレビューか本番の URL で、ログインしているときだけ
function canUseAi() {
  return !IS_FILE && loginState === "in";
}

function updateAiButton() {
  aiButton.disabled = waiting || !canUseAi();
}

function setWaiting(value) {
  waiting = value;
  updateAiButton();
  if (waiting) showAiMessage("AI が書いています…", false);
}

// 本文の見出し（# で始まる行）を、上から順に集める
function headingsOf(markdown) {
  const headings = [];
  markdown.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match) headings.push(`${match[1]} ${match[2]}`);
  });
  return headings;
}

// AI の返事が決まりどおりかを確かめる。外れていれば、その知らせを返す
function checkAiResult(template, title, body) {
  const problems = [];

  const expected = headingsOf(template.body);
  const actual = headingsOf(body);
  const same = expected.length === actual.length && expected.every((heading, i) => heading === actual[i]);
  if (!same) {
    const missing = expected.filter((heading) => !actual.includes(heading));
    const extra = actual.filter((heading) => !expected.includes(heading));
    problems.push("本文の見出しが、本文の型と合っていません。");
    if (missing.length > 0) problems.push(`・足りない見出し：${missing.join("、")}`);
    if (extra.length > 0) problems.push(`・多い見出し：${extra.join("、")}`);
    if (missing.length === 0 && extra.length === 0) problems.push("・見出しの順番か数が違います。");
    problems.push(`・型の順番：${expected.join(" → ")}`);
  }

  const titleLength = countChars(title);
  if (titleLength > TITLE_MAX_CHARS) {
    problems.push(`件名が ${TITLE_MAX_CHARS} 文字を超えています（${titleLength} 文字）。`);
  }

  return problems;
}

function showProblems(problems) {
  checkOutput.textContent = problems.join("\n");
  checkOutput.hidden = problems.length === 0;
}

function showUsage(usage) {
  if (!isPlainObject(usage) || typeof usage.inputTokens !== "number" || typeof usage.outputTokens !== "number") {
    usageOutput.textContent = "";
    usageOutput.hidden = true;
    return;
  }
  const input = usage.inputTokens.toLocaleString("ja-JP");
  const output = usage.outputTokens.toLocaleString("ja-JP");
  const dollars = (usage.inputTokens * PRICE_INPUT_PER_MTOK + usage.outputTokens * PRICE_OUTPUT_PER_MTOK) / 1000000;
  const yen = dollars * YEN_PER_DOLLAR;
  const yenText = yen < 10 ? yen.toFixed(1) : Math.round(yen).toLocaleString("ja-JP");
  usageOutput.textContent = `使ったトークン数：入力 ${input} ／ 出力 ${output}（おおよそ ${yenText} 円）`;
  usageOutput.hidden = false;
}

aiButton.addEventListener("click", async () => {
  const template = currentTemplate();
  const answers = collectAnswers();

  if (!canUseAi()) {
    clearAiMessage();
    return;
  }

  const size = countSendChars(template.titleFormat, template.body, answers);
  if (size > AI_MAX_CHARS) {
    showAiError(`送る文字数が ${AI_MAX_CHARS} 文字を超えています（今は ${size} 文字）。答えを短くしてください`);
    return;
  }

  resultBox.hidden = true; // 前の結果を、今の結果と見間違えないように隠す
  setWaiting(true);

  let response;
  let data = null;
  try {
    response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titleFormat: template.titleFormat,
        bodyFormat: template.body,
        answers,
      }),
    });
    data = await response.json();
  } catch {
    data = null; // つながらない・JSON 以外が返った
  }

  setWaiting(false);

  if (!isPlainObject(data)) {
    showAiError(NO_REPLY);
    return;
  }

  if (!response.ok) {
    // 401 は「ログインしてください」（期限切れ・許可から外された）。上のログインの所も戻す
    if (response.status === 401) setLogin("out", "");
    const text = typeof data.error === "string" ? data.error : NO_REPLY;
    const code = typeof data.apiStatus === "number" ? `（元の番号：${data.apiStatus}）` : "";
    showAiError(text + code);
    return;
  }

  if (typeof data.title !== "string" || typeof data.body !== "string") {
    showAiError("AI の答えが読めませんでした");
    return;
  }

  clearAiMessage();
  showResult(template, answers, data.title, data.body);
  showProblems(checkAiResult(template, data.title, data.body));
  showUsage(data.usage);
});

// ---- GitHub でログイン ----

// 上の帯（［GitHub でログイン］・「〇〇 でログイン中」・［ログアウト］）を、今の状態に合わせる
function renderLogin() {
  loginLink.hidden = loginState !== "out";
  logoutButton.hidden = loginState !== "in";
  if (loginState === "checking") {
    authStatus.textContent = "ログインを確かめています…";
  } else if (loginState === "in") {
    authStatus.textContent = `${loginName} でログイン中`; // 名前も textContent で出す
  } else {
    authStatus.textContent = "";
  }
  authStatus.hidden = authStatus.textContent === "";
  updateAiButton();
}

function setLogin(state, name) {
  loginState = state;
  loginName = name;
  renderLogin();
  clearAiMessage();
}

// 開いたときに /api/me で、ログインしているかを確かめる
async function checkLogin() {
  let data = null;
  try {
    const response = await fetch(ME_ENDPOINT, { cache: "no-store" });
    data = await response.json();
  } catch {
    data = null; // つながらない・JSON 以外が返った → ログインしていない扱い
  }
  if (isPlainObject(data) && data.loggedIn === true && typeof data.login === "string" && data.login !== "") {
    setLogin("in", data.login);
  } else {
    setLogin("out", "");
  }
}

function showLoginMessage(text) {
  loginMessage.textContent = text;
  loginMessage.hidden = false;
}

function hideLoginMessage() {
  loginMessage.textContent = "";
  loginMessage.hidden = true;
}

// /?login=〈理由〉 で戻ってきたときは、理由を日本語で出し、アドレス欄から ?login= を消す
function showLoginReason() {
  const url = new URL(location.href);
  if (!url.searchParams.has("login")) return;
  const text = LOGIN_REASONS.get(url.searchParams.get("login"));
  if (text) showLoginMessage(text);
  url.searchParams.delete("login");
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  let ok = false;
  try {
    const response = await fetch(LOGOUT_ENDPOINT, { method: "POST" });
    ok = response.ok;
  } catch {
    ok = false;
  }
  logoutButton.disabled = false;

  if (!ok) {
    showLoginMessage("ログアウトできませんでした。もう一度押してください");
    return;
  }
  hideLoginMessage();
  setLogin("out", "");
  say("ログアウトしました");
});

// 合言葉はもう使わない。前にこのブラウザに残した合言葉も消す
try {
  localStorage.removeItem(OLD_PASSCODE_KEY);
} catch {
  // 消せないブラウザでも、画面はそのまま動く
}

if (IS_FILE) {
  // index.html を直接開いたとき（file:）は、裏側が無いので AI もログインも使えない
  authBox.hidden = true;
  aiButton.disabled = true;
  showAiMessage(FILE_NOTICE, false);
} else {
  showLoginReason();
  renderLogin();
  checkLogin();
}

// コピー
function say(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(say.timer);
  say.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // file: で開いたときなど
  return new Promise((resolve, reject) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    ok ? resolve() : reject(new Error("copy failed"));
  });
}

document.querySelectorAll(".copy-button").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.target);
    copyText(target.textContent).then(
      () => say("コピーしました"),
      () => say("コピーできませんでした。選んでコピーしてください")
    );
  });
});

templateSelect.addEventListener("change", renderQuestions);
renderQuestions();
