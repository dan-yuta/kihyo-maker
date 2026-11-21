// 起票メーカーの画面の動き
// templates.js の TEMPLATES を読んで、ドロップダウン・質問・型どおりの埋め込みを作る
// 「AI で整える」は裏側（api/generate.js）に頼んで、件名と本文を整えてもらう

const EMPTY_MARK = "（要確認）";

// 「AI で整える」の決まり
const AI_ENDPOINT = "/api/generate";
const AI_MAX_CHARS = 4000; // 送る物の文字数の上限（api/generate.js と同じ）
const TITLE_MAX_CHARS = 40; // 件名の文字数の上限
const PASSCODE_KEY = "kihyo-maker-passcode"; // 合言葉をこのブラウザに残すときの名前
const FALLBACK_HINT = "［型どおりに埋める］なら使えます";
const NO_REPLY = "裏側から返事がありませんでした";
const IS_FILE = location.protocol === "file:";

const templateSelect = document.getElementById("templateSelect");
const questionsBox = document.getElementById("questions");
const fillButton = document.getElementById("fillButton");
const aiButton = document.getElementById("aiButton");
const passcodeInput = document.getElementById("passcodeInput");
const aiMessage = document.getElementById("aiMessage");
const resultBox = document.getElementById("result");
const checkOutput = document.getElementById("checkOutput");
const titleOutput = document.getElementById("titleOutput");
const bodyOutput = document.getElementById("bodyOutput");
const typeOutput = document.getElementById("typeOutput");
const dueOutput = document.getElementById("dueOutput");
const usageOutput = document.getElementById("usageOutput");
const toast = document.getElementById("toast");

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

function clearAiMessage() {
  if (IS_FILE) return; // file: で開いたときの知らせは消さない
  aiMessage.textContent = "";
  aiMessage.hidden = true;
}

function setWaiting(waiting) {
  aiButton.disabled = waiting;
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
  usageOutput.textContent = `使ったトークン数：入力 ${input} ／ 出力 ${output}`;
  usageOutput.hidden = false;
}

aiButton.addEventListener("click", async () => {
  const template = currentTemplate();
  const answers = collectAnswers();
  const passcode = passcodeInput.value;

  if (passcode === "") {
    showAiError("合言葉を入れてください");
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
        passcode,
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

// 合言葉は、このブラウザにだけ残す（残せないブラウザでも動くようにする）
function loadPasscode() {
  try {
    return localStorage.getItem(PASSCODE_KEY) || "";
  } catch {
    return "";
  }
}

function savePasscode(value) {
  try {
    if (value) {
      localStorage.setItem(PASSCODE_KEY, value);
    } else {
      localStorage.removeItem(PASSCODE_KEY);
    }
  } catch {
    // 残せなくても、今の画面ではそのまま使える
  }
}

passcodeInput.value = loadPasscode();
passcodeInput.addEventListener("input", () => savePasscode(passcodeInput.value));

// index.html を直接開いたとき（file:）は、裏側が無いので AI は使えない
if (IS_FILE) {
  aiButton.disabled = true;
  showAiMessage("AI はプレビューか本番の URL で使えます", false);
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
