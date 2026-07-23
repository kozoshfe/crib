const DEMO_MODE_KEY = "qaShpargalkaDemoMode";
const isDemoMode = localStorage.getItem(DEMO_MODE_KEY) === "true";
const QUESTIONS_LOCAL_KEY = "qaShpargalkaQuestions";
const CATEGORIES_LOCAL_KEY = "qaShpargalkaCategories";
const INTERVIEW_STATE_KEY = isDemoMode ? "qaDemoInterviewSessionState" : "qaInterviewSessionState";
const DEMO_STUDY_STATUS_KEY = "qaDemoInterviewStudyStatuses";
const SUPABASE_URL = "https://qzcapeempzzdhicsweqz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nXxnpG6C_RO9mVqcYEt1mg_Z9Z-dpDr";
const HANDBOOK_CATEGORIES_TABLE = "qa_handbook_categories";
const HANDBOOK_SUPABASE_TABLE = "qa_handbook_questions";

let questions = JSON.parse(localStorage.getItem(QUESTIONS_LOCAL_KEY)) || window.PREFILLED_QUESTIONS || [];
let categories = JSON.parse(localStorage.getItem(CATEGORIES_LOCAL_KEY)) || window.PREFILLED_CATEGORIES || [];
let demoStudyStatuses = loadDemoStudyStatuses();
let currentQuestionIndex = -1;
let seenQuestionIndexes = [];
let unknownQuestionIndexes = [];
let lastReviewUnknownIndexes = [];
let selectedQuestionStatus = null;

const questionCategory = document.getElementById("questionCategory");
const questionCounter = document.getElementById("questionCounter");
const questionText = document.getElementById("questionText");
const questionStatus = document.getElementById("questionStatus");
const answerPanel = document.getElementById("answerPanel");
const answerText = document.getElementById("answerText");
const showAnswerBtn = document.getElementById("showAnswerBtn");
const knowBtn = document.getElementById("knowBtn");
const dontKnowBtn = document.getElementById("dontKnowBtn");
const reviewPanel = document.getElementById("reviewPanel");
const reviewTitle = document.getElementById("reviewTitle");
const reviewList = document.getElementById("reviewList");
const exportUnknownBtn = document.getElementById("exportUnknownBtn");
const restartInterviewBtn = document.getElementById("restartInterviewBtn");
const logoutBtn = document.getElementById("logoutBtn");

document.body.classList.toggle("demo-mode", isDemoMode);

function loadDemoStudyStatuses() {
  try {
    const statuses = JSON.parse(localStorage.getItem(DEMO_STUDY_STATUS_KEY) || "{}");
    return statuses && typeof statuses === "object" ? statuses : {};
  } catch (error) {
    return {};
  }
}

function getStudyStatusKey(question) {
  return `${question.categoryId}::${question.question}`;
}

function getQuestionIndexByKey(questionKey) {
  return questions.findIndex(question => getStudyStatusKey(question) === questionKey);
}

function getQuestionIndexesByKeys(questionKeys) {
  if (!Array.isArray(questionKeys)) return null;
  return questionKeys
    .map(getQuestionIndexByKey)
    .filter(index => index >= 0);
}

if (isDemoMode) {
  questions.forEach(question => {
    question.studyStatus = demoStudyStatuses[getStudyStatusKey(question)] || "";
  });
}

function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function saveQuestions() {
  if (isDemoMode) {
    localStorage.setItem(DEMO_STUDY_STATUS_KEY, JSON.stringify(demoStudyStatuses));
    return;
  }
  localStorage.setItem(QUESTIONS_LOCAL_KEY, JSON.stringify(questions));
}

async function hydrateQuestionsFromDatabase() {
  try {
    const headers = {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Accept": "application/json"
    };
    const [categoriesResponse, questionsResponse] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/${HANDBOOK_CATEGORIES_TABLE}?select=id,name,sort_order&order=sort_order.asc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/${HANDBOOK_SUPABASE_TABLE}?select=category_id,question,answer,study_status,sort_order&order=sort_order.asc`, { headers })
    ]);
    if (!categoriesResponse.ok || !questionsResponse.ok) throw new Error("Supabase request failed");
    const [remoteCategories, remoteQuestions] = await Promise.all([categoriesResponse.json(), questionsResponse.json()]);
    const state = {
      categories: (remoteCategories || []).map(item => ({ id: item.id, name: item.name })),
      questions: (remoteQuestions || []).map(item => ({ categoryId: item.category_id, question: item.question, answer: item.answer, studyStatus: item.study_status || "" }))
    };
    if (!state || !Array.isArray(state.categories) || !Array.isArray(state.questions)) return;

    categories = state.categories;
    questions = state.questions;
    if (isDemoMode) {
      questions.forEach(question => {
        question.studyStatus = demoStudyStatuses[getStudyStatusKey(question)] || "";
      });
    }

    if (!restoreInterviewState()) renderQuestion();
  } catch (error) {
    console.warn("Failed to load interview questions from Supabase", error);
  }
}

function saveInterviewState(finished = false) {
  localStorage.setItem(INTERVIEW_STATE_KEY, JSON.stringify({
    currentQuestionIndex,
    seenQuestionIndexes,
    unknownQuestionIndexes,
    currentQuestionKey: currentQuestionIndex >= 0 ? getStudyStatusKey(questions[currentQuestionIndex]) : null,
    seenQuestionKeys: seenQuestionIndexes.map(index => questions[index] ? getStudyStatusKey(questions[index]) : null).filter(Boolean),
    unknownQuestionKeys: unknownQuestionIndexes.map(index => questions[index] ? getStudyStatusKey(questions[index]) : null).filter(Boolean),
    finished,
    questionsCount: questions.length
  }));
}

function restoreInterviewState() {
  const state = JSON.parse(localStorage.getItem(INTERVIEW_STATE_KEY) || "null");
  const hasKeyState = Boolean(state?.currentQuestionKey) || Array.isArray(state?.seenQuestionKeys);
  if (!state || (!hasKeyState && state.questionsCount !== questions.length)) return false;

  const savedSeenIndexes = getQuestionIndexesByKeys(state.seenQuestionKeys);
  const savedUnknownIndexes = getQuestionIndexesByKeys(state.unknownQuestionKeys);
  const savedCurrentIndex = state.currentQuestionKey
    ? getQuestionIndexByKey(state.currentQuestionKey)
    : -1;

  seenQuestionIndexes = savedSeenIndexes || (Array.isArray(state.seenQuestionIndexes)
    ? state.seenQuestionIndexes.filter(index => questions[index])
    : []);
  unknownQuestionIndexes = savedUnknownIndexes || (Array.isArray(state.unknownQuestionIndexes)
    ? state.unknownQuestionIndexes.filter(index => questions[index])
    : []);
  currentQuestionIndex = savedCurrentIndex >= 0
    ? savedCurrentIndex
    : (questions[state.currentQuestionIndex] ? state.currentQuestionIndex : -1);

  if (state.finished) {
    renderReview();
    return true;
  }

  if (currentQuestionIndex >= 0) {
    renderCurrentQuestion();
    return true;
  }

  return false;
}

function getCategoryName(categoryId) {
  return categories.find(category => category.id === categoryId)?.name || "Без категорії";
}

function getNextRandomQuestionIndex() {
  if (!questions.length) return -1;

  const availableIndexes = questions
    .map((_, index) => index)
    .filter(index => index !== currentQuestionIndex && !seenQuestionIndexes.includes(index));

  const pool = availableIndexes.length
    ? availableIndexes
    : questions.map((_, index) => index).filter(index => index !== currentQuestionIndex);

  if (!pool.length) return 0;
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderCurrentQuestion() {
  reviewPanel.classList.add("hidden");
  questionText.classList.remove("hidden");
  showAnswerBtn.classList.remove("hidden");
  questionStatus.classList.add("hidden");
  answerPanel.classList.add("hidden");
  showAnswerBtn.setAttribute("aria-expanded", "false");
  showAnswerBtn.title = "Показати відповідь";
  document.querySelector(".interview-actions").classList.remove("hidden");
  selectedQuestionStatus = null;

  if (currentQuestionIndex < 0) {
    questionCategory.textContent = "Інтерв'ю";
    questionCounter.textContent = "0 / 0";
    questionText.textContent = "Питань ще немає.";
    questionStatus.classList.add("hidden");
    answerPanel.classList.add("hidden");
    showAnswerBtn.disabled = true;
    knowBtn.disabled = true;
    dontKnowBtn.disabled = true;
    return;
  }

  const question = questions[currentQuestionIndex];
  questionCategory.textContent = getCategoryName(question.categoryId);
  questionCounter.textContent = `${seenQuestionIndexes.length} / ${questions.length}`;
  questionText.innerHTML = escapeHtml(question.question);
  questionStatus.classList.remove("error");
  showAnswerBtn.disabled = false;
  knowBtn.disabled = false;
  dontKnowBtn.disabled = false;
}

function renderQuestion() {
  currentQuestionIndex = getNextRandomQuestionIndex();
  if (currentQuestionIndex >= 0 && !seenQuestionIndexes.includes(currentQuestionIndex)) {
    seenQuestionIndexes.push(currentQuestionIndex);
  }
  saveInterviewState(false);
  renderCurrentQuestion();
}

function renderReview() {
  currentQuestionIndex = -1;
  questionCategory.textContent = "Результат інтерв'ю";
  questionCounter.textContent = `${questions.length} / ${questions.length}`;
  questionText.classList.add("hidden");
  showAnswerBtn.classList.add("hidden");
  questionStatus.classList.add("hidden");
  answerPanel.classList.add("hidden");
  document.querySelector(".interview-actions").classList.add("hidden");
  reviewPanel.classList.remove("hidden");

  const uniqueUnknownIndexes = [...new Set(unknownQuestionIndexes)];
  lastReviewUnknownIndexes = uniqueUnknownIndexes;
  saveInterviewState(true);
  if (!uniqueUnknownIndexes.length) {
    reviewTitle.textContent = "Все знаєш";
    reviewList.innerHTML = `<div class="review-empty">У цьому проходженні не було питань з відповіддю “Не знаю”.</div>`;
    exportUnknownBtn.disabled = true;
    return;
  }

  exportUnknownBtn.disabled = false;
  reviewTitle.textContent = `Що повторити: ${uniqueUnknownIndexes.length}`;
  reviewList.innerHTML = uniqueUnknownIndexes.map((questionIndex, index) => {
    const question = questions[questionIndex];
    return `
      <div class="review-item">
        <div class="review-number">${index + 1}. ${escapeHtml(getCategoryName(question.categoryId))}</div>
        <div class="review-question">${escapeHtml(question.question)}</div>
      </div>
    `;
  }).join("");
}

function markQuestion(status) {
  if (currentQuestionIndex < 0) return;
  const question = questions[currentQuestionIndex];
  question.studyStatus = status;
  if (isDemoMode) demoStudyStatuses[getStudyStatusKey(question)] = status;
  if (status === "not-learned") unknownQuestionIndexes.push(currentQuestionIndex);
  saveQuestions();
  selectedQuestionStatus = status;

  const isKnown = status === "learned";
  questionStatus.textContent = isKnown
    ? "Чудово!"
    : "Нічого страшного — повтори це питання пізніше.";
  questionStatus.classList.toggle("error", !isKnown);
  questionStatus.classList.remove("hidden");
  knowBtn.disabled = true;
  dontKnowBtn.disabled = true;
  goToNextQuestion();
}

function toggleAnswer() {
  if (currentQuestionIndex < 0) return;
  const isHidden = answerPanel.classList.contains("hidden");

  if (isHidden) {
    const question = questions[currentQuestionIndex];
    answerText.innerHTML = question.answer || "Відповідь для цього запитання ще готується.";
    answerPanel.classList.remove("hidden");
    showAnswerBtn.setAttribute("aria-expanded", "true");
    showAnswerBtn.title = "Сховати відповідь";
  } else {
    answerPanel.classList.add("hidden");
    showAnswerBtn.setAttribute("aria-expanded", "false");
    showAnswerBtn.title = "Показати відповідь";
  }
}

function goToNextQuestion() {
  if (!selectedQuestionStatus) return;
  if (seenQuestionIndexes.length >= questions.length) {
    renderReview();
    return;
  }

  renderQuestion();
}

function restartInterview() {
  currentQuestionIndex = -1;
  seenQuestionIndexes = [];
  unknownQuestionIndexes = [];
  lastReviewUnknownIndexes = [];
  renderQuestion();
}

knowBtn.addEventListener("click", () => markQuestion("learned"));
dontKnowBtn.addEventListener("click", () => markQuestion("not-learned"));
showAnswerBtn.addEventListener("click", toggleAnswer);
restartInterviewBtn.addEventListener("click", restartInterview);
logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("qaShpargalkaSupabaseSession");
  localStorage.removeItem(DEMO_MODE_KEY);
  window.location.href = "index.html";
});
exportUnknownBtn.addEventListener("click", () => {
  if (!lastReviewUnknownIndexes.length) return;

  const content = lastReviewUnknownIndexes.map((questionIndex, index) => {
    const question = questions[questionIndex];
    return `${index + 1}. [${getCategoryName(question.categoryId)}] ${question.question}`;
  }).join("\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "interview-unknown-questions.txt";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

if (!restoreInterviewState()) {
  renderQuestion();
}
hydrateQuestionsFromDatabase();
