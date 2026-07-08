const LOCAL_CATEGORIES_KEY = "qaCategorizedQuestionsCategories";
const LOCAL_QUESTIONS_KEY = "qaCategorizedQuestionsItems";
const LOCAL_ACTIVE_KEY = "qaCategorizedQuestionsActive";
const LOCAL_UNCOVERED_FILTER_KEY = "qaCategorizedQuestionsUncoveredOnly";
const LOCAL_DATA_VERSION_KEY = "qaCategorizedQuestionsDataVersion";
const FORCE_CLEAN_SYNC_KEY = "qaCategorizedQuestionsForceCleanSync";
const STANDALONE_QUESTIONS_DATA_VERSION = "handbook-sync-manual-delete-2026-07-08";
const MAIN_CATEGORIES = window.PREFILLED_CATEGORIES || [];
const MAIN_QUESTIONS = window.PREFILLED_QUESTIONS || [];

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}
function handbookQuestionKey(question) {
  return `${question.categoryId}::${question.question}`;
}
function stableHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
function handbookQuestionId(question) {
  return `handbook-question-${stableHash(handbookQuestionKey(question))}`;
}
function isHandbookMirrorQuestion(question) {
  return question?.source === "handbook"
    || String(question?.id || "").startsWith("handbook-question-");
}
function isManualQuestion(question, handbookCategoryIds, handbookQuestionKeys) {
  if (question?.source === "manual") return true;
  if (isHandbookMirrorQuestion(question)) return false;
  if (handbookQuestionKeys.has(handbookQuestionKey(question))) return false;
  return !handbookCategoryIds.has(question.categoryId);
}
function buildQuestionBankFromHandbook(sourceCategories = MAIN_CATEGORIES, sourceQuestions = MAIN_QUESTIONS, existingCategories = [], existingQuestions = []) {
  const handbookCategoryIds = new Set(sourceCategories.map(category => category.id));
  const handbookQuestionKeys = new Set(sourceQuestions.map(handbookQuestionKey));
  const existingByKey = new Map(existingQuestions.map(question => [handbookQuestionKey(question), question]));
  const manualCategories = existingCategories.filter(category => category.source === "manual" || !handbookCategoryIds.has(category.id));
  const manualQuestions = existingQuestions.filter(question => isManualQuestion(question, handbookCategoryIds, handbookQuestionKeys));

  const nextCategories = [
    ...sourceCategories.map(category => ({ ...category, source: "handbook" })),
    ...manualCategories
  ];
  const nextQuestions = sourceQuestions.map(question => {
    const existing = existingByKey.get(handbookQuestionKey(question));
    return {
      ...existing,
      id: handbookQuestionId(question),
      source: "handbook",
      categoryId: question.categoryId,
      question: question.question,
      note: existing?.note || "",
      done: true,
      coveredBy: handbookQuestionKey(question),
      createdAt: existing?.createdAt || ""
    };
  }).concat(manualQuestions);

  return { categories: nextCategories, questions: nextQuestions };
}

function getSyncedQuestionBankFromStorage() {
  return buildQuestionBankFromHandbook(
    MAIN_CATEGORIES,
    MAIN_QUESTIONS,
    readStoredArray(LOCAL_CATEGORIES_KEY),
    readStoredArray(LOCAL_QUESTIONS_KEY)
  );
}

function writeQuestionBankToLocalStorage(bank) {
  const savedActiveCategoryId = localStorage.getItem(LOCAL_ACTIVE_KEY);
  const nextActiveCategoryId = bank.categories.some(category => category.id === savedActiveCategoryId)
    ? savedActiveCategoryId
    : bank.categories[0]?.id || "";

  localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(bank.categories));
  localStorage.setItem(LOCAL_QUESTIONS_KEY, JSON.stringify(bank.questions));
  localStorage.setItem(LOCAL_ACTIVE_KEY, nextActiveCategoryId);
  localStorage.setItem(LOCAL_DATA_VERSION_KEY, STANDALONE_QUESTIONS_DATA_VERSION);
}

if (localStorage.getItem(LOCAL_DATA_VERSION_KEY) !== STANDALONE_QUESTIONS_DATA_VERSION) {
  writeQuestionBankToLocalStorage(getSyncedQuestionBankFromStorage());
  localStorage.setItem(FORCE_CLEAN_SYNC_KEY, "true");
}

let categories = JSON.parse(localStorage.getItem(LOCAL_CATEGORIES_KEY)) || window.PREFILLED_STANDALONE_CATEGORIES || [];
let questions = JSON.parse(localStorage.getItem(LOCAL_QUESTIONS_KEY)) || window.PREFILLED_STANDALONE_QUESTIONS || [];
let activeCategoryId = localStorage.getItem(LOCAL_ACTIVE_KEY) || categories[0]?.id || "";
let showUncoveredOnly = localStorage.getItem(LOCAL_UNCOVERED_FILTER_KEY) === "true";
let editingId = null;
let currentUser = null;
let syncTimer = null;
let isHydratingRemote = false;
let lastRemoteUpdatedAt = null;
const doneUnlockClicks = new Map();

const SUPABASE_URL = "https://qzcapeempzzdhicsweqz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nXxnpG6C_RO9mVqcYEt1mg_Z9Z-dpDr";
const SUPABASE_TABLE = "qa_questions_state";
const SUPABASE_ROW_ID = "qa-questions-main";
const HANDBOOK_SUPABASE_TABLE = "qa_handbook_state";
const HANDBOOK_SUPABASE_ROW_ID = "qa-handbook-main";
const SUPABASE_SESSION_KEY = "qaShpargalkaSupabaseSession";
let handbookCategories = loadSavedHandbookCategories();
let handbookQuestions = loadSavedHandbookQuestions();

const authScreen = document.getElementById("authScreen");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginMsg = document.getElementById("loginMsg");
const syncStatus = document.getElementById("syncStatus");
const syncBtn = document.getElementById("syncBtn");
const categoryList = document.getElementById("categoryList");
const categoryTitle = document.getElementById("categoryTitle");
const questionCategory = document.getElementById("questionCategory");
const questionInput = document.getElementById("questionInput");
const noteInput = document.getElementById("noteInput");
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const uncoveredOnlyToggle = document.getElementById("uncoveredOnlyToggle");
const questionsList = document.getElementById("questionsList");
const totalQuestionsCount = document.getElementById("totalQuestionsCount");
const coveredQuestionsCount = document.getElementById("coveredQuestionsCount");
const modal = document.getElementById("questionModal");
const modalTitle = document.getElementById("modalTitle");
const deleteQuestionBtn = document.getElementById("deleteQuestionBtn");

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function escapeAttr(text) {
  return escapeHtml(text).replaceAll('"', "&quot;");
}
function readJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch (error) {
    return fallback;
  }
}
function loadSavedHandbookCategories() {
  return readJsonStorage("qaShpargalkaCategories", MAIN_CATEGORIES);
}
function loadSavedHandbookQuestions() {
  return readJsonStorage("qaShpargalkaQuestions", MAIN_QUESTIONS);
}
function applyHandbookState(state) {
  if (!state || !Array.isArray(state.categories) || !Array.isArray(state.questions)) return false;
  handbookCategories = state.categories;
  handbookQuestions = state.questions;
  return true;
}
function mirrorQuestionsFromHandbook(shouldSync = false) {
  const bank = buildQuestionBankFromHandbook(handbookCategories, handbookQuestions, categories, questions);
  categories = bank.categories;
  questions = bank.questions;
  activeCategoryId = categories.some(category => category.id === activeCategoryId) ? activeCategoryId : categories[0]?.id || "";
  saveLocal();
  localStorage.setItem(LOCAL_DATA_VERSION_KEY, STANDALONE_QUESTIONS_DATA_VERSION);
  if (shouldSync) {
    localStorage.setItem(FORCE_CLEAN_SYNC_KEY, "true");
    scheduleSync();
  }
}
async function hydrateHandbookCoverageSource() {
  handbookCategories = loadSavedHandbookCategories();
  handbookQuestions = loadSavedHandbookQuestions();

  if (!currentUser) {
    mirrorQuestionsFromHandbook(false);
    render();
    return;
  }

  try {
    const query = `/rest/v1/${HANDBOOK_SUPABASE_TABLE}?id=eq.${encodeURIComponent(HANDBOOK_SUPABASE_ROW_ID)}&select=state,updated_at`;
    const rows = await supabaseJson(query, { headers: { "Accept": "application/json" } });
    const state = Array.isArray(rows) ? rows[0]?.state : null;
    if (applyHandbookState(state)) {
      mirrorQuestionsFromHandbook(true);
      render();
    }
  } catch (error) {
    console.warn("Failed to load handbook answers for coverage", error);
  }
}
function makeId(prefix, text = "") {
  const slug = String(text || prefix).toLowerCase().trim().replace(/[^\wа-яіїєґ]+/gi, "-").replace(/^-|-$/g, "");
  return `${prefix}-${slug || "item"}-${Date.now()}`;
}
function setSyncStatus(text, isError = false) {
  syncStatus.textContent = text;
  syncStatus.style.color = isError ? "#dc2626" : "#6b7280";
}
function hasLocalChanges() {
  return Boolean(localStorage.getItem(LOCAL_CATEGORIES_KEY) || localStorage.getItem(LOCAL_QUESTIONS_KEY));
}
function updateSaveButtonState(state = "") {
  if (!syncBtn) return;

  syncBtn.classList.remove("dirty", "success", "error", "saving");
  if (state) syncBtn.classList.add(state);
  else syncBtn.classList.add(hasLocalChanges() ? "dirty" : "success");

  if (state === "saving") syncBtn.textContent = "Збереження...";
  else if (state === "error") syncBtn.textContent = "Помилка";
  else if (state === "success" || !hasLocalChanges()) syncBtn.textContent = "Синхронізовано";
  else syncBtn.textContent = "Не збережено";
}
function showAuthScreen() {
  authScreen.classList.remove("hidden");
  document.querySelector(".sidebar")?.classList.add("hidden");
  document.querySelector(".book")?.classList.add("hidden");
}
function showApp() {
  authScreen.classList.add("hidden");
  document.querySelector(".sidebar")?.classList.remove("hidden");
  document.querySelector(".book")?.classList.remove("hidden");
}
function saveLocal() {
  localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(categories));
  localStorage.setItem(LOCAL_QUESTIONS_KEY, JSON.stringify(questions));
  localStorage.setItem(LOCAL_ACTIVE_KEY, activeCategoryId);
}
function clearLocal() {
  localStorage.removeItem(LOCAL_CATEGORIES_KEY);
  localStorage.removeItem(LOCAL_QUESTIONS_KEY);
  updateSaveButtonState();
}
function save() {
  saveLocal();
  updateSaveButtonState();
  scheduleSync();
  render();
}
function getCloudState() {
  return {
    categories,
    questions,
    activeCategoryId,
    updatedAt: new Date().toISOString()
  };
}
function applyCloudState(state) {
  if (!state || !Array.isArray(state.categories) || !Array.isArray(state.questions)) return false;
  categories = state.categories;
  questions = state.questions;
  activeCategoryId = state.activeCategoryId || categories[0]?.id || "";
  localStorage.setItem(LOCAL_ACTIVE_KEY, activeCategoryId);
  return true;
}
function humanizeSupabaseError(error) {
  const message = String(error?.message || "невідома помилка");
  if (message.includes("relation") && message.includes("does not exist")) return "Не знайдена таблиця qa_questions_state у Supabase";
  if (message.toLowerCase().includes("row-level security")) return "Перевір RLS policies для qa_questions_state";
  return message;
}
function saveSession(session) {
  if (session?.access_token) localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
}
function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SUPABASE_SESSION_KEY) || "null");
    return session?.access_token ? session : null;
  } catch (error) {
    return null;
  }
}
function clearSession() {
  localStorage.removeItem(SUPABASE_SESSION_KEY);
}
async function supabaseJson(path, options = {}) {
  const session = loadSession();
  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
    ...options.headers
  };

  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.message || `Supabase request failed (${response.status})`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function loadRemoteState() {
  const query = `/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&select=state,updated_at`;
  const rows = await supabaseJson(query, { headers: { "Accept": "application/json" } });
  return Array.isArray(rows) ? rows[0] : null;
}
async function upsertRemoteState(state) {
  return await supabaseJson(`/rest/v1/${SUPABASE_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Prefer": "resolution=merge-duplicates,return=minimal"
    },
    body: { id: SUPABASE_ROW_ID, state, updated_at: state.updatedAt }
  });
}
async function login() {
  loginMsg.textContent = "";
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) {
    loginMsg.textContent = "Введи email і пароль";
    return;
  }

  try {
    const session = await supabaseJson("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { email, password }
    });
    saveSession(session);
    await handleSession(session);
  } catch (error) {
    loginMsg.textContent = "Помилка входу: " + humanizeSupabaseError(error);
  }
}
async function logout() {
  clearSession();
  currentUser = null;
  showAuthScreen();
  setSyncStatus("Supabase: очікує вхід");
}
async function hydrateFromSupabase() {
  if (!currentUser) return false;

  try {
    setSyncStatus("Supabase: завантаження...");
    const data = await loadRemoteState();

    if (data?.state && applyCloudState(data.state)) {
      isHydratingRemote = true;
      lastRemoteUpdatedAt = data.state.updatedAt || data.updated_at || null;
      clearLocal();
      isHydratingRemote = false;
      render();
    } else if (questions.length) {
      await syncToSupabase();
    }

    setSyncStatus("Supabase: готово");
    updateSaveButtonState("success");
    return true;
  } catch (error) {
    console.error(error);
    setSyncStatus("Supabase: " + humanizeSupabaseError(error), true);
    updateSaveButtonState("error");
    return false;
  }
}
function scheduleSync() {
  if (!currentUser || isHydratingRemote) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToSupabase, 700);
}
async function syncToSupabase() {
  if (!currentUser) {
    updateSaveButtonState("error");
    setSyncStatus("Supabase: увійди в акаунт", true);
    showAuthScreen();
    return;
  }

  if (syncBtn) syncBtn.disabled = true;
  updateSaveButtonState("saving");
  setSyncStatus("Supabase: збереження...");

  try {
    const remote = await loadRemoteState();
    const remoteUpdatedAt = remote?.state?.updatedAt || remote?.updated_at || null;
    if (
      remote?.state &&
      remoteUpdatedAt &&
      lastRemoteUpdatedAt &&
      new Date(remoteUpdatedAt).getTime() > new Date(lastRemoteUpdatedAt).getTime()
    ) {
      isHydratingRemote = true;
      applyCloudState(remote.state);
      lastRemoteUpdatedAt = remoteUpdatedAt;
      clearLocal();
      isHydratingRemote = false;
      render();
      setSyncStatus("Supabase: підтягнув новіші дані");
      updateSaveButtonState("success");
      return true;
    }

    const state = getCloudState();
    await upsertRemoteState(state);
    lastRemoteUpdatedAt = state.updatedAt;
    clearLocal();
    localStorage.removeItem(FORCE_CLEAN_SYNC_KEY);
    setSyncStatus("Supabase: збережено");
    updateSaveButtonState("success");
    return true;
  } catch (error) {
    console.error(error);
    setSyncStatus("Supabase: " + humanizeSupabaseError(error), true);
    updateSaveButtonState("error");
    setTimeout(() => updateSaveButtonState(), 3000);
    return false;
  } finally {
    if (syncBtn) syncBtn.disabled = false;
  }
}
async function handleSession(session) {
  currentUser = session?.user || null;
  if (!currentUser) {
    showAuthScreen();
    return;
  }
  showApp();
  setSyncStatus(`Supabase: ${currentUser.email || "online"}`);
  await hydrateFromSupabase();
  await hydrateHandbookCoverageSource();
}
function toggleClearSearch() {
  clearSearchBtn.classList.toggle("hidden", !searchInput.value);
}
function isQuestionCovered(item) {
  return Boolean(item.done && item.coveredBy);
}
function isQuestionUncovered(item) {
  return !isQuestionCovered(item);
}
function getVisibleQuestions() {
  const query = searchInput.value.toLowerCase().trim();
  let list = questions;
  if (query) {
    list = list.filter(item => `${item.question} ${item.note || ""}`.toLowerCase().includes(query));
  } else {
    list = list.filter(item => item.categoryId === activeCategoryId);
  }
  if (showUncoveredOnly) list = list.filter(isQuestionUncovered);
  return list;
}
function getCurrentTitle() {
  const query = searchInput.value.trim();
  const title = query ? "Search results" : categories.find(cat => cat.id === activeCategoryId)?.name || "";
  return showUncoveredOnly && title ? `${title} - не покрито` : title;
}
function renderCategories() {
  categoryList.innerHTML = "";
  questionCategory.innerHTML = "";

  if (showUncoveredOnly) {
    const activeCategoryHasUncovered = questions.some(item => item.categoryId === activeCategoryId && isQuestionUncovered(item));
    const firstUncoveredCategory = categories.find(cat => questions.some(item => item.categoryId === cat.id && isQuestionUncovered(item)));
    if (!activeCategoryHasUncovered && firstUncoveredCategory) {
      activeCategoryId = firstUncoveredCategory.id;
      localStorage.setItem(LOCAL_ACTIVE_KEY, activeCategoryId);
    }
  }

  categories.forEach(cat => {
    const categoryQuestions = questions.filter(item => item.categoryId === cat.id);
    const count = categoryQuestions.length;
    const coveredCount = categoryQuestions.filter(isQuestionCovered).length;
    const uncoveredCount = count - coveredCount;

    const option = document.createElement("option");
    option.value = cat.id;
    option.textContent = cat.name;
    questionCategory.appendChild(option);

    if (showUncoveredOnly && uncoveredCount === 0) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-item${cat.id === activeCategoryId ? " active" : ""}`;
    button.innerHTML = `<span>${escapeHtml(cat.name)}</span><span class="count">${count} / ${coveredCount}</span>`;
    button.onclick = () => {
      activeCategoryId = cat.id;
      localStorage.setItem(LOCAL_ACTIVE_KEY, activeCategoryId);
      searchInput.value = "";
      toggleClearSearch();
      render();
    };
    button.oncontextmenu = event => {
      event.preventDefault();
      const action = prompt("Напиши: rename або delete", "rename");
      if (action === "rename") renameCategory(cat.id);
      if (action === "delete") deleteCategory(cat.id);
    };
    categoryList.appendChild(button);
  });
}
function renderStats() {
  totalQuestionsCount.textContent = questions.length;
  coveredQuestionsCount.textContent = questions.filter(isQuestionCovered).length;
}
function renderQuestions() {
  const list = getVisibleQuestions();
  const query = searchInput.value.trim();
  categoryTitle.textContent = getCurrentTitle();
  questionsList.innerHTML = "";
  if (!list.length) {
    questionsList.innerHTML = `<div class="empty">Тут поки немає запитань.</div>`;
    return;
  }

  questionsList.innerHTML = list.map((item, index) => {
    const categoryName = categories.find(cat => cat.id === item.categoryId)?.name || "Без категорії";
    const categoryBadge = query ? `<div class="question-category">${escapeHtml(categoryName)}</div>` : "";
    return `
      <article class="question-card ${item.done ? "done" : ""}" data-id="${item.id}">
        <div class="question-head">
          <div>
            ${categoryBadge}
            <h2 class="question-title">${index + 1}. ${escapeHtml(item.question)}</h2>
          </div>
          <div class="question-actions">
            <button class="small-btn done-btn ${item.done ? "active" : ""}" type="button" data-action="done" data-id="${item.id}">${item.done ? "Готово" : "Не готово"}</button>
          </div>
        </div>
        ${item.note ? `<p class="question-note">${escapeHtml(item.note)}</p>` : ""}
        ${item.done ? renderCoverageSelect(item) : ""}
      </article>
    `;
  }).join("");
}
function renderCoverageSelect(item) {
  const selectedLabel = getCoverageLabel(item.coveredBy);
  const groups = handbookCategories.map(category => {
    const categoryQuestions = handbookQuestions.filter(question => question.categoryId === category.id);
    if (!categoryQuestions.length) return "";
    const questionOptions = categoryQuestions.map(question => {
      const value = `${category.id}::${question.question}`;
      const selected = item.coveredBy === value ? " selected" : "";
      return `<button class="coverage-option${selected}" type="button" data-action="coverage-option" data-id="${escapeAttr(item.id)}" data-value="${escapeAttr(value)}">${escapeHtml(question.question)}</button>`;
    }).join("");
    return `
      <div class="coverage-group">
        <div class="coverage-group-title">${escapeHtml(category.name)}</div>
        ${questionOptions}
      </div>
    `;
  }).join("");

  return `
    <div class="coverage-picker">
      <label>Покрито в головному handbook</label>
      <div class="coverage-row">
        <div class="coverage-combobox" data-id="${escapeAttr(item.id)}">
          <button class="coverage-trigger" type="button" data-action="coverage-toggle" data-id="${escapeAttr(item.id)}">
            <span>${escapeHtml(selectedLabel || "Вибери пункт...")}</span>
          </button>
          <div class="coverage-menu hidden">
            <input class="coverage-search" data-action="coverage-search" data-id="${escapeAttr(item.id)}" placeholder="Пошук відповіді..." />
            <button class="coverage-clear" type="button" data-action="coverage-option" data-id="${escapeAttr(item.id)}" data-value="">Без прив'язки</button>
            <div class="coverage-options">${groups}</div>
            <div class="coverage-empty hidden">Нічого не знайдено</div>
          </div>
        </div>
        ${item.coveredBy ? `<a class="answer-link" href="${escapeHtml(getCoverageUrl(item.coveredBy))}">Відкрити відповідь</a>` : ""}
      </div>
    </div>
  `;
}
function getCoverageLabel(coveredBy) {
  const [categoryId, questionText] = String(coveredBy || "").split("::");
  if (!categoryId || !questionText) return "";
  const categoryName = handbookCategories.find(category => category.id === categoryId)?.name;
  return categoryName ? `${categoryName}: ${questionText}` : questionText;
}
function getCoverageUrl(coveredBy) {
  const [categoryId, question] = String(coveredBy || "").split("::");
  if (!categoryId || !question) return "index.html";
  return `index.html?category=${encodeURIComponent(categoryId)}&question=${encodeURIComponent(question)}`;
}
function render() {
  renderStats();
  renderCategories();
  renderQuestions();
}
function openNewQuestion() {
  editingId = null;
  modalTitle.textContent = "Нове питання";
  questionCategory.value = activeCategoryId;
  questionInput.value = "";
  noteInput.value = "";
  deleteQuestionBtn.classList.add("hidden");
  modal.classList.remove("hidden");
  questionInput.focus();
}
function openEditQuestion(id) {
  const item = questions.find(entry => entry.id === id);
  if (!item) return;
  editingId = id;
  modalTitle.textContent = "Редагувати питання";
  questionCategory.value = item.categoryId;
  questionInput.value = item.question;
  noteInput.value = item.note || "";
  deleteQuestionBtn.classList.remove("hidden");
  modal.classList.remove("hidden");
  questionInput.focus();
}
function saveQuestionFromModal() {
  const categoryId = questionCategory.value;
  const question = questionInput.value.trim();
  const note = noteInput.value.trim();
  if (!question) {
    questionInput.focus();
    return;
  }

  if (editingId) {
    questions = questions.map(item => item.id === editingId ? { ...item, categoryId, question, note } : item);
  } else {
    questions.unshift({ id: makeId("question", question), source: "manual", categoryId, question, note, done: false, createdAt: new Date().toISOString() });
  }
  activeCategoryId = categoryId;
  modal.classList.add("hidden");
  save();
}
function toggleDone(id) {
  questions = questions.map(item => {
    if (item.id !== id) return item;
    const done = !item.done;
    return { ...item, done, coveredBy: done ? (item.coveredBy || "") : "" };
  });
  save();
}
function resetDoneUnlockButton(id, button) {
  const guard = doneUnlockClicks.get(id);
  if (guard?.timer) clearTimeout(guard.timer);
  doneUnlockClicks.delete(id);
  if (button?.isConnected) button.textContent = "Готово";
}
function handleDoneButtonClick(id, button) {
  const item = questions.find(entry => entry.id === id);
  if (!item) return;

  if (!item.done) {
    toggleDone(id);
    return;
  }

  const previous = doneUnlockClicks.get(id);
  if (previous?.timer) clearTimeout(previous.timer);

  const clicks = (previous?.clicks || 0) + 1;
  if (clicks >= 3) {
    resetDoneUnlockButton(id, button);
    toggleDone(id);
    return;
  }

  button.textContent = `${clicks}/3`;
  const timer = setTimeout(() => resetDoneUnlockButton(id, button), 1200);
  doneUnlockClicks.set(id, { clicks, timer });
}
function setCoverage(id, coveredBy) {
  questions = questions.map(item => item.id === id ? { ...item, coveredBy } : item);
  save();
}
function closeCoverageMenus(except = null) {
  document.querySelectorAll(".coverage-combobox").forEach(combo => {
    if (except && combo === except) return;
    combo.querySelector(".coverage-menu")?.classList.add("hidden");
  });
}
function filterCoverageOptions(input) {
  const menu = input.closest(".coverage-menu");
  if (!menu) return;
  const query = input.value.toLowerCase().trim();
  let visibleCount = 0;

  menu.querySelectorAll(".coverage-group").forEach(group => {
    let groupVisible = false;
    group.querySelectorAll(".coverage-option").forEach(option => {
      const matches = option.textContent.toLowerCase().includes(query);
      option.classList.toggle("hidden", !matches);
      if (matches) {
        groupVisible = true;
        visibleCount += 1;
      }
    });
    group.classList.toggle("hidden", !groupVisible);
  });

  menu.querySelector(".coverage-empty")?.classList.toggle("hidden", visibleCount > 0);
}
function deleteQuestion(id) {
  if (!confirm("Видалити питання?")) return;
  questions = questions.filter(item => item.id !== id);
  modal.classList.add("hidden");
  save();
}
function renameCategory(id) {
  const category = categories.find(cat => cat.id === id);
  if (!category) return;
  const name = prompt("Нова назва:", category.name);
  if (!name || !name.trim()) return;
  categories = categories.map(cat => cat.id === id ? { ...cat, name: name.trim() } : cat);
  save();
}
function deleteCategory(id) {
  if (questions.some(item => item.categoryId === id)) {
    alert("Спочатку видали або перенеси питання з цієї категорії.");
    return;
  }
  if (!confirm("Видалити категорію?")) return;
  categories = categories.filter(cat => cat.id !== id);
  activeCategoryId = categories[0]?.id || "";
  save();
}
function addCategory() {
  const name = prompt("Назва категорії:");
  if (!name || !name.trim()) return;
  const id = makeId("category", name);
  categories.push({ id, name: name.trim(), source: "manual" });
  activeCategoryId = id;
  save();
}

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("logoutBtn").addEventListener("click", logout);
syncBtn.addEventListener("click", syncToSupabase);
document.getElementById("addCategoryBtn").addEventListener("click", addCategory);
document.getElementById("addQuestionBtn").addEventListener("click", openNewQuestion);
document.getElementById("saveQuestionBtn").addEventListener("click", saveQuestionFromModal);
document.getElementById("closeQuestionModal").addEventListener("click", () => modal.classList.add("hidden"));
deleteQuestionBtn.addEventListener("click", () => {
  if (editingId) deleteQuestion(editingId);
});
searchInput.addEventListener("input", () => {
  toggleClearSearch();
  renderQuestions();
});
clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  toggleClearSearch();
  renderQuestions();
  searchInput.focus();
});
uncoveredOnlyToggle.addEventListener("change", () => {
  showUncoveredOnly = uncoveredOnlyToggle.checked;
  localStorage.setItem(LOCAL_UNCOVERED_FILTER_KEY, String(showUncoveredOnly));
  render();
});
[loginEmail, loginPassword].forEach(input => {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") login();
  });
});
questionsList.addEventListener("click", event => {
  const coverageToggle = event.target.closest("[data-action='coverage-toggle']");
  const coverageOption = event.target.closest("[data-action='coverage-option']");
  const button = event.target.closest("button[data-action]");
  const card = event.target.closest(".question-card");
  if (coverageToggle) {
    const combo = coverageToggle.closest(".coverage-combobox");
    const menu = combo?.querySelector(".coverage-menu");
    if (!combo || !menu) return;
    const willOpen = menu.classList.contains("hidden");
    closeCoverageMenus(combo);
    menu.classList.toggle("hidden", !willOpen);
    if (willOpen) {
      const input = menu.querySelector(".coverage-search");
      if (input) {
        input.value = "";
        filterCoverageOptions(input);
        setTimeout(() => input.focus(), 0);
      }
    }
    return;
  }
  if (coverageOption) {
    setCoverage(coverageOption.dataset.id, coverageOption.dataset.value || "");
    return;
  }
  if (event.target.closest(".coverage-combobox")) return;
  if (button) {
    const id = button.dataset.id;
    if (button.dataset.action === "done") handleDoneButtonClick(id, button);
    return;
  }
  if (event.detail === 2 && card?.dataset.id) openEditQuestion(card.dataset.id);
});
questionsList.addEventListener("change", event => {
  const select = event.target.closest("select[data-action='coverage']");
  if (!select) return;
  setCoverage(select.dataset.id, select.value);
});
questionsList.addEventListener("input", event => {
  const input = event.target.closest("[data-action='coverage-search']");
  if (!input) return;
  filterCoverageOptions(input);
});
document.addEventListener("click", event => {
  if (event.target.closest(".coverage-combobox")) return;
  closeCoverageMenus();
});
questionsList.addEventListener("contextmenu", event => {
  const card = event.target.closest(".question-card");
  if (!card?.dataset.id) return;
  event.preventDefault();
  const action = prompt("Напиши: edit або delete", "edit");
  if (action === "edit") openEditQuestion(card.dataset.id);
  if (action === "delete") deleteQuestion(card.dataset.id);
});

toggleClearSearch();
uncoveredOnlyToggle.checked = showUncoveredOnly;
updateSaveButtonState();
render();
handleSession(loadSession());
