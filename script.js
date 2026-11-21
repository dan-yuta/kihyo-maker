// 起票メーカーの画面の動き
// templates.js の TEMPLATES を読んで、ドロップダウン・質問・型どおりの埋め込みを作る

const EMPTY_MARK = "（要確認）";

const templateSelect = document.getElementById("templateSelect");
const questionsBox = document.getElementById("questions");
const fillButton = document.getElementById("fillButton");
const resultBox = document.getElementById("result");
const titleOutput = document.getElementById("titleOutput");
const bodyOutput = document.getElementById("bodyOutput");
const typeOutput = document.getElementById("typeOutput");
const dueOutput = document.getElementById("dueOutput");
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

function showResult(title, body) {
  const template = currentTemplate();
  const answers = collectAnswers();
  titleOutput.textContent = title;
  bodyOutput.textContent = body;
  typeOutput.textContent = template.backlogType;
  const due = template.dueKey ? answers[template.dueKey] : "";
  dueOutput.textContent = due ? due : "-";
  resultBox.hidden = false;
}

fillButton.addEventListener("click", () => {
  const template = currentTemplate();
  const answers = collectAnswers();
  showResult(fillFormat(template.titleFormat, answers), fillFormat(template.body, answers));
});

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
