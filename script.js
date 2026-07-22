let categories = JSON.parse(localStorage.getItem("qaShpargalkaCategories")) || window.PREFILLED_CATEGORIES;
let questions = JSON.parse(localStorage.getItem("qaShpargalkaQuestions")) || window.PREFILLED_QUESTIONS;
let activeCategoryId = localStorage.getItem("qaShpargalkaActive") || categories[0].id;
let editingIndex = null;
let questionClickTimer = null;
let draggedCategoryId = null;
let categoryDragMoved = false;
let activeStudyFilter = "";
let sidebarExpanded = false;
let currentUser = null;
let syncTimer = null;
let isHydratingRemote = false;
let lastRemoteUpdatedAt = null;
let activeQuestionDeepLink = null;
let pendingQuestionJump = null;

const SUPABASE_URL = "https://qzcapeempzzdhicsweqz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nXxnpG6C_RO9mVqcYEt1mg_Z9Z-dpDr";
const SUPABASE_CATEGORIES_TABLE = "qa_handbook_categories";
const SUPABASE_QUESTIONS_TABLE = "qa_handbook_questions";
const QUESTIONS_SUPABASE_TABLE = "qa_questions";
const SUPABASE_SESSION_KEY = "qaShpargalkaSupabaseSession";
const DEMO_MODE_KEY = "qaShpargalkaDemoMode";
const DEMO_STUDY_STATUS_KEY = "qaShpargalkaDemoStudyStatuses";
const QUESTIONS_LOCAL_KEY = "qaCategorizedQuestionsItems";
let isDemoMode = localStorage.getItem(DEMO_MODE_KEY) === "true";
let demoStudyStatuses = loadDemoStudyStatuses();

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
function getQuestionStudyStatus(question) {
  return isDemoMode ? (demoStudyStatuses[getStudyStatusKey(question)] || "") : question.studyStatus;
}
function applyDemoStudyStatuses() {
  if (!isDemoMode) return;
  questions.forEach(question => {
    question.studyStatus = demoStudyStatuses[getStudyStatusKey(question)] || "";
  });
}
applyDemoStudyStatuses();

const categoryList = document.getElementById("categoryList");
const questionsList = document.getElementById("questionsList");
const categoryTitle = document.getElementById("categoryTitle");
const questionCategory = document.getElementById("questionCategory");
const search = document.getElementById("search");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const showLearnedBtn = document.getElementById("showLearnedBtn");
const showNotLearnedBtn = document.getElementById("showNotLearnedBtn");
const printBook = document.getElementById("printBook");
const answerInput = document.getElementById("answerInput");
const deleteQuestionBtn = document.getElementById("deleteQuestionBtn");
const syncStatus = document.getElementById("syncStatus");
const totalQuestionsCount = document.getElementById("totalQuestionsCount");
const allowedAnswerTags = new Set(["B", "STRONG", "I", "EM", "OL", "UL", "LI", "BR", "P", "DIV"]);

function save() {
  localStorage.setItem("qaShpargalkaCategories", JSON.stringify(categories));
  localStorage.setItem("qaShpargalkaQuestions", JSON.stringify(questions));
  localStorage.setItem("qaShpargalkaActive", activeCategoryId);
  updateSaveButtonState();
  scheduleSupabaseSync();
}
function saveActiveCategory() {
  localStorage.setItem("qaShpargalkaActive", activeCategoryId);
}
function escapeHtml(text) { return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function makeId(name) { return name.toLowerCase().trim().replace(/[^\wа-яіїєґ]+/gi, "-") + "-" + Date.now(); }
function hasHtml(text) { return /<\/?[a-z][\s\S]*>/i.test(String(text)); }
function formatInlineText(text) {
  return escapeHtml(text)
    .replace(/^([А-ЯІЇЄҐA-Z][^:<]{1,45}?)(\s*[-–—:]\s*)/, "<strong><em>$1</em></strong>$2")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}
function plainTextToHtml(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let listType = null;
  let listItemOpen = false;
  let nestedListOpen = false;

  function isExplicitOrdered(line) {
    return line.trim().match(/^\d+[.)]\s+(.+)$/);
  }
  function isExplicitUnordered(line) {
    return line.trim().match(/^[-•*]\s+(.+)$/);
  }
  function hasInlineDefinition(text) {
    return /^[А-ЯІЇЄҐA-Z][^:<]{1,55}\s*:\s+.+/.test(text.trim());
  }
  function isStandaloneListLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (isExplicitOrdered(trimmed) || isExplicitUnordered(trimmed)) return false;
    if (trimmed.length > 95) return false;
    if (/[.!?…]$/.test(trimmed)) return false;
    if (/\s[-–—]\s/.test(trimmed)) return false;
    return true;
  }
  function isAutoNumberedLine(line) {
    return isStandaloneListLine(line) || hasInlineDefinition(line);
  }
  function isContinuationBulletLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (isExplicitOrdered(trimmed) || isExplicitUnordered(trimmed)) return false;
    if (trimmed.length > 120) return false;
    if (/[.!?…]$/.test(trimmed)) return false;
    if (/\s[-–—]\s/.test(trimmed)) return false;
    return true;
  }
  function nextContentLine(index) {
    for (let i = index + 1; i < lines.length; i++) {
      if (lines[i].trim()) return lines[i].trim();
    }
    return "";
  }
  function standaloneRunLength(startIndex) {
    let length = 0;
    for (let i = startIndex; i < lines.length; i++) {
      if (!isAutoNumberedLine(lines[i])) break;
      length++;
    }
    return length;
  }
  function addParagraph(paragraphLines) {
    if (!paragraphLines.length) return;
    html += `<p>${paragraphLines.map(formatInlineText).join("<br>")}</p>`;
  }
  function closeListItem() {
    if (!listItemOpen) return;
    closeNestedBulletList();
    html += "</li>";
    listItemOpen = false;
  }
  function closeList() {
    if (!listType) return;
    closeListItem();
    html += `</${listType}>`;
    listType = null;
  }
  function openList(type) {
    if (listType === type) return;
    closeList();
    html += `<${type}>`;
    listType = type;
  }
  function addListItem(type, itemText) {
    openList(type);
    closeListItem();
    const content = type === "ol" && isStandaloneListLine(itemText) && !hasInlineDefinition(itemText) ? `<strong>${formatInlineText(itemText)}</strong>` : formatInlineText(itemText);
    html += `<li>${content}`;
    listItemOpen = true;
  }
  function addListContinuation(line) {
    if (!listItemOpen) return;
    html += `<br>${formatInlineText(line)}`;
  }
  function addNestedBullet(line) {
    if (!listItemOpen) return;
    if (!nestedListOpen) {
      html += `<ul>`;
      nestedListOpen = true;
    }
    html += `<li>${formatInlineText(line)}</li>`;
  }
  function closeNestedBulletList() {
    if (!nestedListOpen) return;
    html += "</ul>";
    nestedListOpen = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const orderedMatch = isExplicitOrdered(line);
    const unorderedMatch = isExplicitUnordered(line);

    if (!trimmed) {
      closeNestedBulletList();
      closeList();
    } else if (orderedMatch) {
      closeNestedBulletList();
      addListItem("ol", orderedMatch[1]);
      if (hasInlineDefinition(orderedMatch[1]) || isExplicitOrdered(nextContentLine(i))) {
        closeListItem();
      }
    } else if (unorderedMatch) {
      closeNestedBulletList();
      addListItem("ul", unorderedMatch[1]);
    } else if (listType === "ol" && isContinuationBulletLine(line)) {
      addNestedBullet(line);
    } else if (listType) {
      closeNestedBulletList();
      addListContinuation(line);
    } else if (standaloneRunLength(i) >= 2) {
      openList("ol");
      while (i < lines.length && isAutoNumberedLine(lines[i])) {
        addListItem("ol", lines[i].trim());
        i++;
      }
      i--;
      closeList();
    } else {
      const paragraph = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() && !isExplicitOrdered(lines[i + 1]) && !isExplicitUnordered(lines[i + 1]) && standaloneRunLength(i + 1) < 2) {
        i++;
        paragraph.push(lines[i]);
      }
      addParagraph(paragraph);
    }
  }

  closeList();
  return html;
}
function sanitizeAnswerHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");

  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) { node.remove(); return; }

    if (!allowedAnswerTags.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }

    Array.from(node.attributes).forEach(attr => node.removeAttribute(attr.name));
    Array.from(node.childNodes).forEach(clean);
  }

  Array.from(template.content.childNodes).forEach(clean);
  return template.innerHTML.trim();
}
function renderAnswer(answer) {
  return sanitizeAnswerHtml(hasHtml(answer) ? answer : plainTextToHtml(answer));
}
function renderAnswerForWord(answer) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderAnswer(answer);

  wrapper.querySelectorAll("ol, ul").forEach(list => {
    const previous = list.previousSibling;
    if (previous?.nodeType === Node.ELEMENT_NODE && previous.tagName === "BR") {
      previous.remove();
    }
    if (previous?.nodeType === Node.ELEMENT_NODE && previous.tagName === "P") {
      const lastChild = previous.lastChild;
      if (lastChild?.nodeType === Node.ELEMENT_NODE && lastChild.tagName === "BR") {
        lastChild.remove();
      }
    }
  });

  function listToWordParagraphs(list, level = 0) {
    const fragment = document.createDocumentFragment();
    const isOrdered = list.tagName === "OL";

    Array.from(list.children).forEach((li, index, items) => {
      const p = document.createElement("p");
      p.className = `word-list-item${index === 0 ? " word-list-first" : ""}${index === items.length - 1 ? " word-list-last" : ""}`;
      if (level > 0) p.classList.add("word-list-nested");

      if (isOrdered) {
        const number = document.createElement("strong");
        number.textContent = `${index + 1}. `;
        p.appendChild(number);
      } else {
        p.append("• ");
      }

      const nestedLists = [];
      Array.from(li.childNodes).forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === "OL" || child.tagName === "UL")) {
          nestedLists.push(child);
        } else {
          p.appendChild(child);
        }
      });

      fragment.appendChild(p);
      nestedLists.forEach(nestedList => {
        fragment.appendChild(listToWordParagraphs(nestedList, level + 1));
      });
    });

    return fragment;
  }

  Array.from(wrapper.querySelectorAll("ol, ul"))
    .filter(list => !list.parentElement.closest("ol, ul"))
    .forEach(list => {
      list.replaceWith(listToWordParagraphs(list));
    });

  wrapper.querySelectorAll("p").forEach(p => {
    if (!(p.textContent || "").replace(/\u00a0/g, "").trim() && !p.querySelector("img, table")) {
      p.remove();
    }
  });

  return wrapper.innerHTML;
}
function answerToSearchText(answer) {
  const div = document.createElement("div");
  div.innerHTML = renderAnswer(answer);
  return div.textContent || "";
}
function normalizeListFormatting(root) {
  root.querySelectorAll("li").forEach(li => {
    const liTextLength = (li.textContent || "").trim().length;
    li.querySelectorAll("b, strong").forEach(strong => {
      const strongTextLength = (strong.textContent || "").trim().length;
      if (liTextLength > 0 && strongTextLength / liTextLength > 0.55) {
        strong.querySelectorAll("i, em").forEach(em => {
          const keepStrong = document.createElement("strong");
          em.replaceWith(keepStrong);
          keepStrong.appendChild(em);
        });
        strong.replaceWith(...Array.from(strong.childNodes));
      }
    });
  });
}
function applyInlineFormat(tagName) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

  const range = selection.getRangeAt(0);
  if (!answerInput.contains(range.commonAncestorContainer)) return;

  const formatTags = tagName === "strong" ? ["B", "STRONG"] : ["I", "EM"];
  let node = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
  while (node && node !== answerInput) {
    if (formatTags.includes(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      selection.removeAllRanges();
      return;
    }
    node = node.parentElement;
  }

  const wrapper = document.createElement(tagName);
  wrapper.appendChild(range.extractContents());
  range.insertNode(wrapper);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapper);
  selection.addRange(nextRange);
}
function getEditorHtml() {
  normalizeListFormatting(answerInput);
  return sanitizeAnswerHtml(answerInput.innerHTML).replace(/<p><br><\/p>/g, "").trim();
}
function setEditorHtml(answer) {
  answerInput.innerHTML = answer ? renderAnswer(answer) : "";
  normalizeListFormatting(answerInput);
}
function focusEditor() {
  answerInput.focus();
}
function toggleClearSearch() {
  clearSearchBtn.classList.toggle("hidden", !search.value);
}
function setQuestionStudyStatus(index, status) {
  const question = questions[index];
  if (!question) return;

  const nextStatus = getQuestionStudyStatus(question) === status ? "" : status;
  question.studyStatus = nextStatus;
  if (isDemoMode) {
    const storageKey = getStudyStatusKey(question);
    if (nextStatus) demoStudyStatuses[storageKey] = nextStatus;
    else delete demoStudyStatuses[storageKey];
    localStorage.setItem(DEMO_STUDY_STATUS_KEY, JSON.stringify(demoStudyStatuses));
    renderQuestions();
    return;
  }
  save();
  renderQuestions();
}
function updateStudyFilterButtons() {
  showLearnedBtn.checked = activeStudyFilter === "learned";
  showNotLearnedBtn.checked = activeStudyFilter === "not-learned";
}
function setStudyFilter(status) {
  activeStudyFilter = activeStudyFilter === status ? "" : status;
  updateStudyFilterButtons();
  renderQuestions();
}
function getVisibleQuestions() {
  const query = search.value.toLowerCase().trim();
  let list = questions.map((q, index) => ({...q, index}));

  if (query) list = list.filter(q => (q.question + " " + answerToSearchText(q.answer)).toLowerCase().includes(query));
  if (activeStudyFilter) list = list.filter(q => getQuestionStudyStatus(q) === activeStudyFilter);
  if (!query && !activeStudyFilter) list = list.filter(q => q.categoryId === activeCategoryId);

  return list;
}
function getCurrentViewTitle() {
  const query = search.value.trim();
  const activeCat = categories.find(c => c.id === activeCategoryId);

  if (activeStudyFilter === "learned") return "Вивчено";
  if (activeStudyFilter === "not-learned") return "Не вивчено";
  if (query) return "Search results";
  return activeCat ? activeCat.name : "";
}
function moveCategory(draggedId, targetId) {
  if (isDemoMode) return;
  if (!draggedId || draggedId === targetId) return;

  const fromIndex = categories.findIndex(cat => cat.id === draggedId);
  const toIndex = categories.findIndex(cat => cat.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;

  const [movedCategory] = categories.splice(fromIndex, 1);
  categories.splice(toIndex, 0, movedCategory);
  categoryDragMoved = true;
  save();
  render();
}
function getCategoryIcon(name) {
  const value = (name || "").toLowerCase();
  if (value.includes("api")) return "{}";
  if (value.includes("git")) return "◎";
  if (value.includes("chrome") || value.includes("developer")) return "⌘";
  if (value.includes("ризик")) return "△";
  if (value.includes("process")) return "◷";
  if (value.includes("estimation")) return "◴";
  if (value.includes("документац")) return "▧";
  if (value.includes("вимог")) return "☑";
  if (value.includes("тест")) return "⚗";
  if (value.includes("репорт")) return "↗";
  return "□";
}

function renderCategories() {
  categoryList.innerHTML = ""; questionCategory.innerHTML = "";
  let visibleCategories = sidebarExpanded ? categories : categories.slice(0, 14);
  const activeCategory = categories.find(cat => cat.id === activeCategoryId);
  if (!sidebarExpanded && activeCategory && !visibleCategories.some(cat => cat.id === activeCategoryId)) {
    visibleCategories = [...visibleCategories.slice(0, 13), activeCategory];
  }
  visibleCategories.forEach(cat => {
    const count = questions.filter(q => q.categoryId === cat.id).length;
    const btn = document.createElement("button");
    btn.className = "category-item" + (cat.id === activeCategoryId ? " active" : "");
    btn.type = "button";
    btn.draggable = !isDemoMode;
    if (!isDemoMode) btn.title = "Перетягни, щоб змінити порядок";
    btn.innerHTML = `<span class="category-icon" aria-hidden="true">${escapeHtml(getCategoryIcon(cat.name))}</span><span class="category-name">${escapeHtml(cat.name)}</span><span class="count">${count}</span>`;
    btn.onclick = () => { if (categoryDragMoved) return; activeStudyFilter = ""; activeCategoryId = cat.id; saveActiveCategory(); render(); };
    btn.oncontextmenu = (e) => { e.preventDefault(); const action = prompt("Напиши: rename або delete", "rename"); if (action === "rename") renameCategory(cat.id); if (action === "delete") deleteCategory(cat.id); };
    btn.ondragstart = (e) => {
      if (isDemoMode) return;
      draggedCategoryId = cat.id;
      categoryDragMoved = false;
      btn.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", cat.id);
    };
    btn.ondragover = (e) => {
      if (isDemoMode) return;
      if (!draggedCategoryId || draggedCategoryId === cat.id) return;
      e.preventDefault();
      btn.classList.add("drag-over");
      e.dataTransfer.dropEffect = "move";
    };
    btn.ondragleave = () => btn.classList.remove("drag-over");
    btn.ondrop = (e) => {
      if (isDemoMode) return;
      e.preventDefault();
      btn.classList.remove("drag-over");
      moveCategory(e.dataTransfer.getData("text/plain") || draggedCategoryId, cat.id);
    };
    btn.ondragend = () => {
      if (isDemoMode) return;
      draggedCategoryId = null;
      document.querySelectorAll(".category-item.dragging, .category-item.drag-over").forEach(item => item.classList.remove("dragging", "drag-over"));
      setTimeout(() => { categoryDragMoved = false; }, 150);
    };
    categoryList.appendChild(btn);
  });
  if (categories.length > 14) {
    const moreBtn = document.createElement("button");
    moreBtn.className = "show-more-categories";
    moreBtn.type = "button";
    moreBtn.innerHTML = `<span>${sidebarExpanded ? "Показати менше" : "Показати більше"}</span><span aria-hidden="true">${sidebarExpanded ? "⌃" : "⌄"}</span>`;
    moreBtn.onclick = () => { sidebarExpanded = !sidebarExpanded; renderCategories(); };
    categoryList.appendChild(moreBtn);
  }
  categories.forEach(cat => {
    const opt = document.createElement("option"); opt.value = cat.id; opt.textContent = cat.name; questionCategory.appendChild(opt);
  });
}
function renderQuestions() {
  const query = search.value.toLowerCase().trim();
  const list = getVisibleQuestions();
  categoryTitle.textContent = getCurrentViewTitle();
  updateStudyFilterButtons();
  questionsList.innerHTML = "";
  if (!list.length) { questionsList.innerHTML = `<div class="empty">Питань ще немає.</div>`; return; }
  list.forEach((q, i) => {
    const article = document.createElement("article"); article.className = "qa";
    article.dataset.question = q.question;
    const studyStatus = getQuestionStudyStatus(q);
    const isLearned = studyStatus === "learned";
    const isNotLearned = studyStatus === "not-learned";
    const questionCategoryName = categories.find(cat => cat.id === q.categoryId)?.name || "Без категорії";
    const showCategoryName = Boolean(query || activeStudyFilter);
    const categoryBadge = showCategoryName ? `<div class="qa-category">${escapeHtml(questionCategoryName)}</div>` : "";
    article.classList.toggle("learned", isLearned);
    article.classList.toggle("not-learned", isNotLearned);
    article.innerHTML = `<div class="qa-header"><div>${categoryBadge}<h2 class="qa-question">${i + 1}. ${escapeHtml(q.question)}</h2></div><div class="study-actions"><button type="button" class="study-btn learned-btn${isLearned ? " active" : ""}" data-status="learned" title="Позначити як вивчено">✓ Вивчено</button><button type="button" class="study-btn not-learned-btn${isNotLearned ? " active" : ""}" data-status="not-learned" title="Позначити як не вивчено">× Не вивчено</button></div></div><div class="qa-answer">${renderAnswer(q.answer)}</div>`;
    article.querySelectorAll(".study-btn").forEach(button => {
      button.onclick = (e) => {
        e.stopPropagation();
        setQuestionStudyStatus(q.index, button.dataset.status);
      };
    });
    article.onclick = (e) => {
      if (e.detail === 2) {
        clearTimeout(questionClickTimer);
        questionClickTimer = setTimeout(() => openEditQuestion(q.index), 260);
      }
      if (e.detail === 3) {
        clearTimeout(questionClickTimer);
        openEditQuestion(q.index);
      }
    };
    article.oncontextmenu = (e) => { e.preventDefault(); const action = prompt("Напиши: edit або delete", "edit"); if (action === "edit") openEditQuestion(q.index); if (action === "delete") deleteQuestion(q.index); };
    questionsList.appendChild(article);
  });
}
function applyQuestionDeepLink() {
  if (!pendingQuestionJump) return;
  const targetQuestion = pendingQuestionJump.question;
  pendingQuestionJump = null;

  requestAnimationFrame(() => {
    const target = Array.from(document.querySelectorAll(".qa")).find(article => article.dataset.question === targetQuestion);
    if (!target) return;
    target.classList.add("jump-highlight");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => target.classList.remove("jump-highlight"), 2400);
  });
}
function activateQuestionDeepLink() {
  if (!activeQuestionDeepLink) return;

  if (categories.some(category => category.id === activeQuestionDeepLink.categoryId)) {
    activeCategoryId = activeQuestionDeepLink.categoryId;
    activeStudyFilter = "";
    search.value = "";
    toggleClearSearch();
    saveActiveCategory();
  }

  pendingQuestionJump = { question: activeQuestionDeepLink.question };
}
function renderStats() {
  totalQuestionsCount.textContent = questions.length;
}
function buildCategoriesHtml(forcePageBreaks = false) {
  let html = "";
  categories.forEach((cat, catIndex) => {
    const list = questions.filter(q => q.categoryId === cat.id);
    if (forcePageBreaks && catIndex > 0) {
      html += `<br clear="all" style="mso-special-character: line-break; page-break-before: always;">`;
    }
    html += `<section class="print-category"><h1>${escapeHtml(cat.name)}</h1>`;
    if (!list.length) html += `<p>Питань ще немає.</p>`;
    else list.forEach((q, i) => { html += `<div class="print-qa"><h2 class="print-question">${i + 1}. ${escapeHtml(q.question)}</h2><div class="print-answer">${renderAnswer(q.answer)}</div></div>`; });
    html += `</section>`;
  });
  return html;
}
function buildVisibleCategoriesHtml(useWordFormat = false) {
  const visibleQuestions = getVisibleQuestions();
  const groupedCategories = categories
    .map(cat => ({ ...cat, questions: visibleQuestions.filter(q => q.categoryId === cat.id) }))
    .filter(cat => cat.questions.length);

  if (!groupedCategories.length) return `<section class="print-category"><h1>${escapeHtml(getCurrentViewTitle())}</h1><p>Питань ще немає.</p></section>`;

  let html = "";
  groupedCategories.forEach((cat, catIndex) => {
    if (catIndex > 0) {
      html += `<br clear="all" style="mso-special-character: line-break; page-break-before: always;">`;
    }
    html += `<section class="print-category"><h1>${escapeHtml(cat.name)}</h1>`;
    cat.questions.forEach((q, i) => {
      if (useWordFormat) {
        html += `<table class="word-qa" cellspacing="0" cellpadding="0"><tr class="word-qa-row"><td><h2 class="print-question">${i + 1}. ${escapeHtml(q.question)}</h2><div class="print-answer">${renderAnswerForWord(q.answer)}</div></td></tr></table>`;
      } else {
        html += `<div class="print-qa"><h2 class="print-question">${i + 1}. ${escapeHtml(q.question)}</h2><div class="print-answer">${renderAnswer(q.answer)}</div></div>`;
      }
    });
    html += `</section>`;
  });
  return html;
}
function buildWordCategoriesHtml() {
  let html = "";
  categories.forEach((cat, catIndex) => {
    const list = questions.filter(q => q.categoryId === cat.id);
    if (catIndex > 0) {
      html += `<br clear="all" style="mso-special-character: line-break; page-break-before: always;">`;
    }
    html += `<section class="print-category"><h1>${escapeHtml(cat.name)}</h1>`;
    if (!list.length) html += `<p>Питань ще немає.</p>`;
    else list.forEach((q, i) => {
      html += `<table class="word-qa" cellspacing="0" cellpadding="0"><tr class="word-qa-row"><td><h2 class="print-question">${i + 1}. ${escapeHtml(q.question)}</h2><div class="print-answer">${renderAnswerForWord(q.answer)}</div></td></tr></table>`;
    });
    html += `</section>`;
  });
  return html;
}
function buildPrintBook() {
  const date = new Date().toLocaleDateString("uk-UA");
  const isFilteredExport = Boolean(activeStudyFilter || search.value.trim());
  const title = isFilteredExport ? getCurrentViewTitle() : "QA Handbook";
  let html = `<div class="print-title"><h1>${escapeHtml(title)}</h1><p>Generated: ${date}</p></div>`;
  if (!isFilteredExport) {
    html += `<div class="toc"><h1>Зміст</h1>${categories.map((cat, i) => { const count = questions.filter(q => q.categoryId === cat.id).length; return `<div class="toc-item"><span>${i + 1}. ${escapeHtml(cat.name)}</span><span>${count} питань</span></div>`; }).join("")}</div>`;
    html += buildCategoriesHtml();
  } else {
    html += buildVisibleCategoriesHtml();
  }
  printBook.innerHTML = html;
}
function printFullBook() {
  buildPrintBook();
  alert("Щоб у PDF не було URL, дати, назви та номера сторінки, у вікні друку вимкни опцію Headers and footers / Верхні та нижні колонтитули.");
  const originalTitle = document.title;
  document.title = "";
  setTimeout(() => window.print(), 100);
  window.onafterprint = () => { document.title = originalTitle; };
}
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const WORD_EXPORT_STYLES = `
  @page WordSection1{size:595.3pt 841.9pt;margin:0.8cm 0.8cm 0.8cm 0.8cm;}
  div.WordSection1{page:WordSection1;}
  body{font-family:Georgia,'Times New Roman',serif;color:#111827;margin:0;}
  h1{text-align:center;font-size:24pt;font-weight:400;margin:0 0 26pt 0;line-height:30pt;mso-line-height-rule:at-least}
  .word-qa{width:100%;border-collapse:collapse;margin:0 0 18pt 0;page-break-inside:avoid;mso-table-lspace:0pt;mso-table-rspace:0pt}
  .word-qa-row{page-break-inside:avoid}
  .word-qa td{border:none;padding:0;page-break-inside:avoid}
  .print-question{font-family:Arial,sans-serif;font-size:14pt;font-weight:800;margin:0 0 10pt 0;line-height:18pt;mso-line-height-rule:at-least;page-break-after:avoid}
  .print-answer{font-size:12pt;line-height:18pt;mso-line-height-rule:at-least;margin-left:24pt;margin-bottom:0;page-break-before:avoid}
  .print-answer p{margin:0 0 8pt 0;line-height:18pt;mso-line-height-rule:at-least}
  .print-answer p.word-list-item{margin:0;mso-margin-top-alt:0pt;mso-margin-bottom-alt:0pt;line-height:14.5pt;mso-line-height-rule:at-least;text-indent:0;padding-left:0}
  .print-answer p.word-list-first{margin-top:0;mso-margin-top-alt:0pt}
  .print-answer p.word-list-last{margin-bottom:2pt;mso-margin-bottom-alt:2pt}
  .print-answer p.word-list-nested{margin-left:18pt;mso-margin-left-alt:18pt}
`;

function exportToWord() {
  const isFilteredExport = Boolean(activeStudyFilter || search.value.trim());
  const title = isFilteredExport ? getCurrentViewTitle() : "QA Handbook";
  const body = isFilteredExport ? buildVisibleCategoriesHtml(true) : buildWordCategoriesHtml();
  const filename = title.replace(/[^\wа-яіїєґ-]+/gi, "-").replace(/^-|-$/g, "") || "QA-Handbook";
  const content = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${escapeHtml(title)}</title><style>${WORD_EXPORT_STYLES}</style></head><body><div class="WordSection1">${body}</div></body></html>`;
  downloadFile(`${filename}.doc`, "\ufeff" + content, "application/msword");
}
function exportDataJs() {
  save();
  const content = `window.PREFILLED_CATEGORIES = ${JSON.stringify(categories, null, 2)};\n\nwindow.PREFILLED_QUESTIONS = ${JSON.stringify(questions, null, 2)};\n`;
  downloadFile("data.js", content, "text/javascript;charset=utf-8");
}
function clearSavedLocalData() {
  localStorage.removeItem("qaShpargalkaCategories");
  localStorage.removeItem("qaShpargalkaQuestions");
  localStorage.removeItem("qaShpargalkaActive");
  updateSaveButtonState();
}
function hasLocalChanges() {
  return Boolean(localStorage.getItem("qaShpargalkaCategories") || localStorage.getItem("qaShpargalkaQuestions"));
}
function updateSaveButtonState(state = "") {
  const button = document.getElementById("syncSupabaseBtn");
  if (!button) return;

  button.classList.remove("dirty", "success", "error", "saving");
  if (state) button.classList.add(state);
  else button.classList.add(hasLocalChanges() ? "dirty" : "success");

  if (state === "saving") button.textContent = "Збереження...";
  else if (state === "error") button.textContent = "Помилка";
  else if (state === "success" || !hasLocalChanges()) button.textContent = "Синхронізовано";
  else button.textContent = "Не збережено";
}
function setSyncStatus(text, isError = false) {
  if (!syncStatus) return;
  syncStatus.textContent = text;
  syncStatus.style.color = isError ? "#dc2626" : "#6b7280";
}
function showAuthScreen() {
  document.getElementById("authScreen")?.classList.remove("hidden");
  document.querySelector(".sidebar")?.classList.add("hidden");
  document.querySelector(".book")?.classList.add("hidden");
}
function showApp() {
  document.getElementById("authScreen")?.classList.add("hidden");
  document.querySelector(".sidebar")?.classList.remove("hidden");
  document.querySelector(".book")?.classList.remove("hidden");
}
function applyDemoModeUI() {
  document.body.classList.toggle("demo-mode", isDemoMode);
}
function isDemoCreateBlocked() {
  if (!isDemoMode) return false;
  alert("У демо режимі додавання категорій і питань недоступне.");
  return true;
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
  localStorage.setItem("qaShpargalkaActive", activeCategoryId);
  return true;
}
function humanizeSupabaseError(error) {
  const message = String(error?.message || "невідома помилка");
  if (message.includes("relation") && message.includes("does not exist")) return "Не знайдені нові таблиці QA у Supabase — запусти supabase-normalized-schema.sql";
  if (message.toLowerCase().includes("row-level security")) return "Перевір RLS policies для нових таблиць QA";
  return message;
}
function saveSupabaseSession(session) {
  if (session?.access_token) localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
}
function loadSupabaseSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SUPABASE_SESSION_KEY) || "null");
    if (!session?.access_token) return null;
    return session;
  } catch (error) {
    return null;
  }
}
function clearSupabaseSession() {
  localStorage.removeItem(SUPABASE_SESSION_KEY);
}
function isAuthPath(path) {
  return String(path).startsWith("/auth/v1/");
}
function shouldRefreshSession(session) {
  if (!session?.refresh_token) return false;
  const expiresAt = Number(session.expires_at || 0);
  if (!expiresAt) return false;
  return Date.now() >= (expiresAt * 1000) - 60000;
}
async function refreshSupabaseSession(session = loadSupabaseSession()) {
  if (!session?.refresh_token) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });

  if (!response.ok) {
    clearSupabaseSession();
    return null;
  }

  const refreshedSession = await response.json();
  saveSupabaseSession(refreshedSession);
  return refreshedSession;
}
async function getValidSupabaseSession(path) {
  if (isAuthPath(path)) return null;
  const session = loadSupabaseSession();
  if (!shouldRefreshSession(session)) return session;
  return await refreshSupabaseSession(session);
}
async function supabaseJson(path, options = {}, retried = false) {
  const session = await getValidSupabaseSession(path);
  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${isAuthPath(path) ? SUPABASE_ANON_KEY : (session?.access_token || SUPABASE_ANON_KEY)}`,
    ...options.headers
  };

  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    if (response.status === 401 && !retried && !isAuthPath(path)) {
      const refreshedSession = await refreshSupabaseSession();
      if (refreshedSession?.access_token) return supabaseJson(path, options, true);
    }
    const details = await response.json().catch(() => ({}));
    throw new Error(details.message || `Supabase request failed (${response.status})`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function loadRemoteState() {
  const [remoteCategories, remoteQuestions] = await Promise.all([
    supabaseJson(`/rest/v1/${SUPABASE_CATEGORIES_TABLE}?select=id,name,sort_order,updated_at&order=sort_order.asc`, { headers: { "Accept": "application/json" } }),
    supabaseJson(`/rest/v1/${SUPABASE_QUESTIONS_TABLE}?select=category_id,question,answer,study_status,sort_order,updated_at&order=sort_order.asc`, { headers: { "Accept": "application/json" } })
  ]);
  const categories = (remoteCategories || []).map(item => ({ id: item.id, name: item.name }));
  const questions = (remoteQuestions || []).map(item => ({
    categoryId: item.category_id,
    question: item.question,
    answer: item.answer,
    studyStatus: item.study_status || ""
  }));
  const updatedAt = [...(remoteCategories || []), ...(remoteQuestions || [])]
    .map(item => item.updated_at).filter(Boolean).sort().at(-1) || null;
  return categories.length || questions.length ? { state: { categories, questions, updatedAt }, updated_at: updatedAt } : null;
}
async function upsertRemoteState(state) {
  await supabaseJson(`/rest/v1/${SUPABASE_CATEGORIES_TABLE}?id=not.is.null`, { method: "DELETE", headers: { "Prefer": "return=minimal" } });
  if (state.categories.length) await supabaseJson(`/rest/v1/${SUPABASE_CATEGORIES_TABLE}`, {
    method: "POST", headers: { "Prefer": "return=minimal" },
    body: state.categories.map((item, index) => ({ id: item.id, name: item.name, sort_order: index, updated_at: state.updatedAt }))
  });
  if (state.questions.length) await supabaseJson(`/rest/v1/${SUPABASE_QUESTIONS_TABLE}`, {
    method: "POST", headers: { "Prefer": "return=minimal" },
    body: state.questions.map((item, index) => ({ id: `${item.categoryId}:${index}:${item.question}`, category_id: item.categoryId, question: item.question, answer: item.answer, study_status: item.studyStatus || "", sort_order: index, updated_at: state.updatedAt }))
  });
}
function resetLocalCoverageForDeletedAnswer(coverageValue) {
  try {
    const savedQuestions = JSON.parse(localStorage.getItem(QUESTIONS_LOCAL_KEY) || "null");
    if (!Array.isArray(savedQuestions)) return 0;

    const updatedQuestions = savedQuestions.filter(question => question.coveredBy !== coverageValue);
    const changedCount = savedQuestions.length - updatedQuestions.length;

    if (changedCount) localStorage.setItem(QUESTIONS_LOCAL_KEY, JSON.stringify(updatedQuestions));
    return changedCount;
  } catch (error) {
    console.warn("Failed to delete local linked question", error);
    return 0;
  }
}
async function resetRemoteCoverageForDeletedAnswer(coverageValue) {
  if (!currentUser) return 0;
  const query = `/rest/v1/${QUESTIONS_SUPABASE_TABLE}?covered_by=eq.${encodeURIComponent(coverageValue)}&select=id`;
  const rows = await supabaseJson(query, { headers: { "Accept": "application/json" } });
  if (!rows?.length) return 0;
  await supabaseJson(`/rest/v1/${QUESTIONS_SUPABASE_TABLE}?covered_by=eq.${encodeURIComponent(coverageValue)}`, { method: "DELETE", headers: { "Prefer": "return=minimal" } });
  return rows.length;
}
async function resetCoverageForDeletedAnswer(deletedQuestion) {
  if (!deletedQuestion?.categoryId || !deletedQuestion?.question) return;

  const coverageValue = `${deletedQuestion.categoryId}::${deletedQuestion.question}`;
  const localChangedCount = resetLocalCoverageForDeletedAnswer(coverageValue);

  try {
    const remoteChangedCount = await resetRemoteCoverageForDeletedAnswer(coverageValue);
    if (localChangedCount || remoteChangedCount) {
      setSyncStatus("Пов'язані запитання видалено");
    }
  } catch (error) {
    console.warn("Failed to delete remote linked question", error);
    if (localChangedCount) setSyncStatus("Локально пов'язані запитання видалено");
  }
}
async function authLogin() {
  const email = document.getElementById("simpleLogin")?.value.trim();
  const password = document.getElementById("simplePassword")?.value;
  const msg = document.getElementById("simpleLoginMsg");
  if (msg) msg.textContent = "";

  if (!email || !password) {
    if (msg) msg.textContent = "Введи email і пароль";
    return;
  }

  try {
    localStorage.removeItem(DEMO_MODE_KEY);
    isDemoMode = false;
    applyDemoModeUI();
    const session = await supabaseJson("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { email, password }
    });
    saveSupabaseSession(session);
    await handleAuthSession(session);
  } catch (error) {
    if (msg) msg.textContent = "Помилка входу: " + humanizeSupabaseError(error);
  }
}
async function authLogout() {
  clearSupabaseSession();
  localStorage.removeItem(DEMO_MODE_KEY);
  currentUser = null;
  isDemoMode = false;
  applyDemoModeUI();
  showAuthScreen();
}
function enterDemoMode() {
  clearSupabaseSession();
  localStorage.setItem(DEMO_MODE_KEY, "true");
  currentUser = null;
  isDemoMode = true;
  demoStudyStatuses = loadDemoStudyStatuses();
  applyDemoStudyStatuses();
  applyDemoModeUI();
  showApp();
  render();
  setSyncStatus("Демо: локальний режим без синхронізації");
  updateSaveButtonState();
  hydrateFromSupabase();
}
function bindAuthUI() {
  document.getElementById("simpleLoginBtn")?.addEventListener("click", authLogin);
  document.getElementById("simpleDemoBtn")?.addEventListener("click", enterDemoMode);
  document.getElementById("logoutBtn")?.addEventListener("click", authLogout);
  ["simpleLogin", "simplePassword"].forEach(id => {
    document.getElementById(id)?.addEventListener("keydown", event => {
      if (event.key === "Enter") authLogin();
    });
  });
}
async function hydrateFromSupabase() {
  try {
    setSyncStatus(currentUser ? "Supabase: завантаження..." : "Демо: завантаження питань...");
    const data = await loadRemoteState();

    if (data?.state && applyCloudState(data.state)) {
      isHydratingRemote = true;
      lastRemoteUpdatedAt = data.state.updatedAt || data.updated_at || null;
      if (currentUser) clearSavedLocalData();
      isHydratingRemote = false;
      activateQuestionDeepLink();
      render();
    } else if (currentUser && (hasLocalChanges() || questions.length)) {
      await syncDataToSupabase();
    }

    setSyncStatus(currentUser ? "Supabase: готово" : "Демо: питання завантажено з бази");
    updateSaveButtonState("success");
    return true;
  } catch (error) {
    console.error("Supabase load failed", error);
    setSyncStatus("Supabase: " + humanizeSupabaseError(error), true);
    updateSaveButtonState("error");
    return false;
  }
}
function scheduleSupabaseSync() {
  if (!currentUser || isHydratingRemote) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncDataToSupabase, 700);
}
async function syncDataToSupabase() {
  const button = document.getElementById("syncSupabaseBtn");
  if (!currentUser) {
    updateSaveButtonState("error");
    setSyncStatus("Supabase: увійди в акаунт", true);
    showAuthScreen();
    return;
  }

  if (button) button.disabled = true;
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
      clearSavedLocalData();
      isHydratingRemote = false;
      activateQuestionDeepLink();
      render();
      setSyncStatus("Supabase: підтягнув новіші дані");
      return;
    }

    const state = getCloudState();
    await upsertRemoteState(state);

    lastRemoteUpdatedAt = state.updatedAt;
    clearSavedLocalData();
    updateSaveButtonState("success");
    setSyncStatus("Supabase: збережено");
  } catch (error) {
    console.error("Supabase save failed", error);
    updateSaveButtonState("error");
    setSyncStatus("Supabase: " + humanizeSupabaseError(error), true);
    setTimeout(() => updateSaveButtonState(), 3000);
  } finally {
    if (button) button.disabled = false;
  }
}
async function handleAuthSession(session) {
  currentUser = session?.user || null;
  if (!currentUser) {
    showAuthScreen();
    return;
  }
  showApp();
  setSyncStatus(`Supabase: ${currentUser.email || "online"}`);
  await hydrateFromSupabase();
}
async function initSupabase() {
  setSyncStatus("Supabase: ініціалізація...");
  bindAuthUI();
  applyDemoModeUI();
  if (isDemoMode) {
    showApp();
    setSyncStatus("Демо: локальний режим без синхронізації");
    updateSaveButtonState();
    await hydrateFromSupabase();
    return;
  }
  const session = loadSupabaseSession();
  if (!session) {
    setSyncStatus("Supabase: очікує вхід");
    showAuthScreen();
    return;
  }

  await handleAuthSession(session);
}
function render() { renderStats(); renderCategories(); renderQuestions(); buildPrintBook(); applyQuestionDeepLink(); }

document.getElementById("addCategoryBtn").onclick = () => { if (isDemoCreateBlocked()) return; const name = prompt("Назва категорії:"); if (!name || !name.trim()) return; const id = makeId(name); categories.push({ id, name: name.trim() }); activeCategoryId = id; save(); render(); };
function openNewQuestion() { if (isDemoCreateBlocked()) return; editingIndex = null; document.getElementById("questionModalTitle").textContent = "Нове питання"; questionCategory.value = activeCategoryId; document.getElementById("questionInput").value = ""; setEditorHtml(""); deleteQuestionBtn.classList.add("hidden"); document.getElementById("questionModal").classList.remove("hidden"); focusEditor(); }
function openEditQuestion(index) { if (isDemoMode) return; editingIndex = index; const q = questions[index]; document.getElementById("questionModalTitle").textContent = "Редагувати питання"; questionCategory.value = q.categoryId; document.getElementById("questionInput").value = q.question; setEditorHtml(q.answer); deleteQuestionBtn.classList.remove("hidden"); document.getElementById("questionModal").classList.remove("hidden"); focusEditor(); }
document.getElementById("addQuestionBtn").addEventListener("click", openNewQuestion);
document.getElementById("printBookBtn").addEventListener("click", printFullBook);
document.getElementById("exportWordBtn").addEventListener("click", exportToWord);
document.getElementById("syncSupabaseBtn")?.addEventListener("click", syncDataToSupabase);
document.getElementById("closeQuestionModal").addEventListener("click", () => document.getElementById("questionModal").classList.add("hidden"));
document.querySelectorAll(".editor-toolbar button").forEach(button => {
  button.addEventListener("mousedown", e => e.preventDefault());
  button.addEventListener("click", () => {
    const command = button.dataset.command;
    if (command === "bold") {
      applyInlineFormat("strong");
    } else if (command === "italic") {
      applyInlineFormat("em");
    } else {
      document.execCommand(command, false, null);
      normalizeListFormatting(answerInput);
    }
    focusEditor();
  });
});
document.getElementById("saveQuestionBtn").onclick = () => { if (isDemoMode || (editingIndex === null && isDemoCreateBlocked())) return; const categoryId = questionCategory.value; const question = document.getElementById("questionInput").value.trim(); const answer = getEditorHtml(); if (!question || !answer) { alert("Заповни питання і відповідь"); return; } if (editingIndex !== null) questions[editingIndex] = { ...questions[editingIndex], categoryId, question, answer }; else questions.push({ categoryId, question, answer, studyStatus: "" }); activeCategoryId = categoryId; document.getElementById("questionModal").classList.add("hidden"); save(); render(); };
deleteQuestionBtn.onclick = () => { if (isDemoMode || editingIndex === null) return; deleteQuestion(editingIndex); document.getElementById("questionModal").classList.add("hidden"); editingIndex = null; };
function renameCategory(id) { const cat = categories.find(c => c.id === id); const name = prompt("Нова назва:", cat.name); if (!name || !name.trim()) return; cat.name = name.trim(); save(); render(); }
function deleteCategory(id) { if (questions.some(q => q.categoryId === id)) { alert("Спочатку видали або перенеси питання з цієї категорії."); return; } if (!confirm("Видалити категорію?")) return; categories = categories.filter(c => c.id !== id); activeCategoryId = categories[0]?.id || ""; save(); render(); }
async function deleteQuestion(index) {
  if (isDemoMode) return;
  if (!confirm("Видалити питання?")) return;

  const deletedQuestion = questions[index];
  questions.splice(index, 1);
  save();
  render();
  await resetCoverageForDeletedAnswer(deletedQuestion);
}
search.oninput = () => { toggleClearSearch(); renderQuestions(); };
clearSearchBtn.onclick = () => { search.value = ""; toggleClearSearch(); renderQuestions(); search.focus(); };
showLearnedBtn.addEventListener("change", () => setStudyFilter("learned"));
showNotLearnedBtn.addEventListener("change", () => setStudyFilter("not-learned"));
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); openNewQuestion(); } });
function initQuestionDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const categoryId = params.get("category");
  const question = params.get("question");
  if (!categoryId || !question) return;
  activeQuestionDeepLink = { categoryId, question };
  activateQuestionDeepLink();
}
initQuestionDeepLink();
toggleClearSearch();
applyDemoModeUI();
updateStudyFilterButtons();
updateSaveButtonState();
render();
setSyncStatus("Supabase: перевірка входу...");
setTimeout(() => {
  initSupabase().catch(error => {
    console.error(error);
    setSyncStatus("Supabase: помилка ініціалізації", true);
    showAuthScreen();
  });
}, 0);
