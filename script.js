let categories = JSON.parse(localStorage.getItem("qaShpargalkaCategories")) || window.PREFILLED_CATEGORIES;
let questions = JSON.parse(localStorage.getItem("qaShpargalkaQuestions")) || window.PREFILLED_QUESTIONS;
let activeCategoryId = localStorage.getItem("qaShpargalkaActive") || categories[0].id;
let editingIndex = null;
let questionClickTimer = null;
let draggedCategoryId = null;
let categoryDragMoved = false;
let activeStudyFilter = "";

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
const allowedAnswerTags = new Set(["B", "STRONG", "I", "EM", "OL", "UL", "LI", "BR", "P", "DIV"]);

function save() {
  localStorage.setItem("qaShpargalkaCategories", JSON.stringify(categories));
  localStorage.setItem("qaShpargalkaQuestions", JSON.stringify(questions));
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
  wrapper.querySelectorAll("ol").forEach(ol => {
    const fragment = document.createDocumentFragment();
    Array.from(ol.children).forEach((li, index) => {
      const p = document.createElement("p");
      p.className = "word-list-item";
      const number = document.createElement("strong");
      number.textContent = `${index + 1}. `;
      p.appendChild(number);
      p.append(...Array.from(li.childNodes));
      fragment.appendChild(p);
    });
    ol.replaceWith(fragment);
  });
  wrapper.querySelectorAll("ul").forEach(ul => {
    const fragment = document.createDocumentFragment();
    Array.from(ul.children).forEach(li => {
      const p = document.createElement("p");
      p.className = "word-list-item";
      p.append("• ");
      p.append(...Array.from(li.childNodes));
      fragment.appendChild(p);
    });
    ul.replaceWith(fragment);
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

  question.studyStatus = question.studyStatus === status ? "" : status;
  save();
  renderQuestions();
}
function updateStudyFilterButtons() {
  showLearnedBtn.classList.toggle("active", activeStudyFilter === "learned");
  showNotLearnedBtn.classList.toggle("active", activeStudyFilter === "not-learned");
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
  if (activeStudyFilter) list = list.filter(q => q.studyStatus === activeStudyFilter);
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

function renderCategories() {
  categoryList.innerHTML = ""; questionCategory.innerHTML = "";
  categories.forEach(cat => {
    const count = questions.filter(q => q.categoryId === cat.id).length;
    const btn = document.createElement("button");
    btn.className = "category-item" + (cat.id === activeCategoryId ? " active" : "");
    btn.type = "button";
    btn.draggable = true;
    btn.title = "Перетягни, щоб змінити порядок";
    btn.innerHTML = `<span>${escapeHtml(cat.name)}</span><span class="count">${count}</span>`;
    btn.onclick = () => { if (categoryDragMoved) return; activeStudyFilter = ""; activeCategoryId = cat.id; save(); render(); };
    btn.oncontextmenu = (e) => { e.preventDefault(); const action = prompt("Напиши: rename або delete", "rename"); if (action === "rename") renameCategory(cat.id); if (action === "delete") deleteCategory(cat.id); };
    btn.ondragstart = (e) => {
      draggedCategoryId = cat.id;
      categoryDragMoved = false;
      btn.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", cat.id);
    };
    btn.ondragover = (e) => {
      if (!draggedCategoryId || draggedCategoryId === cat.id) return;
      e.preventDefault();
      btn.classList.add("drag-over");
      e.dataTransfer.dropEffect = "move";
    };
    btn.ondragleave = () => btn.classList.remove("drag-over");
    btn.ondrop = (e) => {
      e.preventDefault();
      btn.classList.remove("drag-over");
      moveCategory(e.dataTransfer.getData("text/plain") || draggedCategoryId, cat.id);
    };
    btn.ondragend = () => {
      draggedCategoryId = null;
      document.querySelectorAll(".category-item.dragging, .category-item.drag-over").forEach(item => item.classList.remove("dragging", "drag-over"));
      setTimeout(() => { categoryDragMoved = false; }, 150);
    };
    categoryList.appendChild(btn);
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
    const isLearned = q.studyStatus === "learned";
    const isNotLearned = q.studyStatus === "not-learned";
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
function exportToWord() {
  const isFilteredExport = Boolean(activeStudyFilter || search.value.trim());
  const title = isFilteredExport ? getCurrentViewTitle() : "QA Handbook";
  const body = isFilteredExport ? buildVisibleCategoriesHtml(true) : buildWordCategoriesHtml();
  const filename = title.replace(/[^\wа-яіїєґ-]+/gi, "-").replace(/^-|-$/g, "") || "QA-Handbook";
  const content = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${escapeHtml(title)}</title><style>@page WordSection1{size:595.3pt 841.9pt;margin:0.8cm 0.8cm 0.8cm 0.8cm;}div.WordSection1{page:WordSection1;}body{font-family:Georgia,'Times New Roman',serif;color:#111827;margin:0;}h1{text-align:center;font-size:24pt;font-weight:400;margin-bottom:35px}.word-qa{width:100%;border-collapse:collapse;margin:0 0 24px 0;page-break-inside:avoid;mso-table-lspace:0pt;mso-table-rspace:0pt}.word-qa-row{page-break-inside:avoid}.word-qa td{border:none;padding:0;page-break-inside:avoid}.print-question{font-family:Arial,sans-serif;font-size:14pt;font-weight:800;margin:0 0 10px;page-break-after:avoid}.print-answer{font-size:12pt;line-height:1.5;margin-left:24px;margin-bottom:0;page-break-before:avoid}.print-answer p{margin:0 0 8px}.word-list-item{margin:3px 0 3px 0;text-indent:0;padding-left:0}</style></head><body><div class="WordSection1">${body}</div></body></html>`;
  const blob = new Blob(["\ufeff", content], { type: "application/msword" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${filename}.doc`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function render() { renderCategories(); renderQuestions(); buildPrintBook(); }

document.getElementById("addCategoryBtn").onclick = () => { const name = prompt("Назва категорії:"); if (!name || !name.trim()) return; const id = makeId(name); categories.push({ id, name: name.trim() }); activeCategoryId = id; save(); render(); };
function openNewQuestion() { editingIndex = null; document.getElementById("questionModalTitle").textContent = "Нове питання"; questionCategory.value = activeCategoryId; document.getElementById("questionInput").value = ""; setEditorHtml(""); deleteQuestionBtn.classList.add("hidden"); document.getElementById("questionModal").classList.remove("hidden"); focusEditor(); }
function openEditQuestion(index) { editingIndex = index; const q = questions[index]; document.getElementById("questionModalTitle").textContent = "Редагувати питання"; questionCategory.value = q.categoryId; document.getElementById("questionInput").value = q.question; setEditorHtml(q.answer); deleteQuestionBtn.classList.remove("hidden"); document.getElementById("questionModal").classList.remove("hidden"); focusEditor(); }
document.getElementById("addQuestionBtn").onclick = openNewQuestion;
document.getElementById("printBookBtn").onclick = printFullBook;
document.getElementById("exportWordBtn").onclick = exportToWord;
document.getElementById("closeQuestionModal").onclick = () => document.getElementById("questionModal").classList.add("hidden");
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
document.getElementById("saveQuestionBtn").onclick = () => { const categoryId = questionCategory.value; const question = document.getElementById("questionInput").value.trim(); const answer = getEditorHtml(); if (!question || !answer) { alert("Заповни питання і відповідь"); return; } if (editingIndex !== null) questions[editingIndex] = { ...questions[editingIndex], categoryId, question, answer }; else questions.push({ categoryId, question, answer, studyStatus: "" }); activeCategoryId = categoryId; document.getElementById("questionModal").classList.add("hidden"); save(); render(); };
deleteQuestionBtn.onclick = () => { if (editingIndex === null) return; deleteQuestion(editingIndex); document.getElementById("questionModal").classList.add("hidden"); editingIndex = null; };
function renameCategory(id) { const cat = categories.find(c => c.id === id); const name = prompt("Нова назва:", cat.name); if (!name || !name.trim()) return; cat.name = name.trim(); save(); render(); }
function deleteCategory(id) { if (questions.some(q => q.categoryId === id)) { alert("Спочатку видали або перенеси питання з цієї категорії."); return; } if (!confirm("Видалити категорію?")) return; categories = categories.filter(c => c.id !== id); activeCategoryId = categories[0]?.id || ""; save(); render(); }
function deleteQuestion(index) { if (!confirm("Видалити питання?")) return; questions.splice(index, 1); save(); render(); }
search.oninput = () => { toggleClearSearch(); renderQuestions(); };
clearSearchBtn.onclick = () => { search.value = ""; toggleClearSearch(); renderQuestions(); search.focus(); };
showLearnedBtn.onclick = () => setStudyFilter("learned");
showNotLearnedBtn.onclick = () => setStudyFilter("not-learned");
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); openNewQuestion(); } });
toggleClearSearch();
updateStudyFilterButtons();
render();
