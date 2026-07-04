const testQuestions = [
  {
    question: "Що таке баг?",
    answers: [
      "Це нова функція, яку додали в продукт",
      "Це помилка або невідповідність фактичної поведінки очікуваній",
      "Це документ з вимогами до продукту",
      "Це тест-кейс, який успішно пройшов"
    ],
    correctIndex: 1,
    explanation: "Баг - це дефект або розбіжність між очікуваною та реальною поведінкою системи."
  },
  {
    question: "Що таке тест-кейс?",
    answers: [
      "Опис кроків, даних і очікуваного результату для перевірки",
      "Звіт про знайдений дефект",
      "Список усіх розробників у команді",
      "Автоматичне оновлення застосунку"
    ],
    correctIndex: 0,
    explanation: "Тест-кейс фіксує умови, кроки і очікуваний результат перевірки."
  },
  {
    question: "Що таке regression testing?",
    answers: [
      "Перевірка тільки нового дизайну",
      "Повторна перевірка, що зміни не зламали існуючу функціональність",
      "Тестування без вимог",
      "Перевірка швидкості інтернету"
    ],
    correctIndex: 1,
    explanation: "Регресія допомагає знайти побічні дефекти після змін у продукті."
  },
  {
    question: "Що таке expected result?",
    answers: [
      "Будь-який результат після натискання кнопки",
      "Фактичний результат, який побачив тестувальник",
      "Результат, який система має показати за вимогами",
      "Коментар від розробника"
    ],
    correctIndex: 2,
    explanation: "Expected result описує очікувану поведінку системи."
  },
  {
    question: "Що таке severity?",
    answers: [
      "Терміновість виправлення дефекту для бізнесу",
      "Технічний вплив дефекту на систему",
      "Кількість тест-кейсів у наборі",
      "Дата релізу продукту"
    ],
    correctIndex: 1,
    explanation: "Severity показує, наскільки сильно дефект впливає на роботу продукту."
  },
  {
    question: "Що таке priority?",
    answers: [
      "Важливість і терміновість виправлення дефекту для бізнесу",
      "Кількість кроків у тест-кейсі",
      "Тип браузера, де знайдено дефект",
      "Рівень доступу тестувальника"
    ],
    correctIndex: 0,
    explanation: "Priority допомагає вирішити, коли саме треба виправити дефект."
  },
  {
    question: "Що таке smoke testing?",
    answers: [
      "Глибоке тестування всіх edge cases",
      "Швидка перевірка базової працездатності збірки",
      "Перевірка тільки UI-кольорів",
      "Тестування без документації"
    ],
    correctIndex: 1,
    explanation: "Smoke testing показує, чи достатньо стабільна збірка для подальшого тестування."
  },
  {
    question: "Що таке retesting?",
    answers: [
      "Перевірка старих функцій після нової фічі",
      "Повторна перевірка конкретного дефекту після виправлення",
      "Тестування продуктивності",
      "Перевірка без очікуваного результату"
    ],
    correctIndex: 1,
    explanation: "Retesting підтверджує, що конкретний виправлений дефект більше не відтворюється."
  },
  {
    question: "Що таке checklist?",
    answers: [
      "Короткий список перевірок без детальних кроків",
      "Файл з паролями користувачів",
      "Автоматичний скрипт деплою",
      "Список тільки критичних багів"
    ],
    correctIndex: 0,
    explanation: "Checklist зручний для швидких перевірок, коли детальні тест-кейси не потрібні."
  },
  {
    question: "Що таке test plan?",
    answers: [
      "План тестування: що, як, коли і ким буде тестуватись",
      "Окремий баг-репорт",
      "Список стилів сторінки",
      "Коментар у коді"
    ],
    correctIndex: 0,
    explanation: "Test plan описує стратегію, обсяг, ресурси, ризики і підхід до тестування."
  },
  {
    question: "Що таке requirement?",
    answers: [
      "Очікування або умова, яку має виконувати продукт",
      "Будь-який знайдений дефект",
      "Тільки дизайн-макет",
      "Результат автотесту"
    ],
    correctIndex: 0,
    explanation: "Requirement описує, що система має робити або яким критеріям відповідати."
  },
  {
    question: "Що таке acceptance criteria?",
    answers: [
      "Критерії, за якими фіча вважається прийнятою",
      "Кількість тестувальників у команді",
      "Назва гілки в Git",
      "Список браузерів користувача"
    ],
    correctIndex: 0,
    explanation: "Acceptance criteria допомагають зрозуміти, коли задача готова з точки зору очікуваної поведінки."
  },
  {
    question: "Що таке boundary value analysis?",
    answers: [
      "Тест-дизайн техніка для перевірки значень на межах діапазонів",
      "Перевірка тільки позитивних сценаріїв",
      "Метод написання SQL-запитів",
      "Тестування кольору кнопок"
    ],
    correctIndex: 0,
    explanation: "На межах діапазонів часто виникають дефекти, тому їх варто перевіряти окремо."
  },
  {
    question: "Що таке equivalence partitioning?",
    answers: [
      "Поділ даних на класи, де значення мають поводитись однаково",
      "Порівняння двох дизайнерських макетів",
      "Перевірка всіх можливих символів",
      "Вид тестування API"
    ],
    correctIndex: 0,
    explanation: "Equivalence partitioning зменшує кількість тестів без втрати важливого покриття."
  },
  {
    question: "Що таке API?",
    answers: [
      "Інтерфейс, через який системи або компоненти взаємодіють між собою",
      "Тільки графічна кнопка на сторінці",
      "Файл зі скріншотами",
      "Тип баг-репорту"
    ],
    correctIndex: 0,
    explanation: "API визначає правила обміну запитами і відповідями між системами."
  },
  {
    question: "Що таке status code 404?",
    answers: [
      "Запит успішний",
      "Ресурс не знайдено",
      "Помилка авторизації",
      "Сервер недоступний через перевантаження"
    ],
    correctIndex: 1,
    explanation: "HTTP 404 означає, що запитаний ресурс не знайдено."
  },
  {
    question: "Що таке позитивний тест?",
    answers: [
      "Перевірка системи з валідними даними і очікуваним успішним результатом",
      "Перевірка тільки помилок сервера",
      "Тест без очікуваного результату",
      "Перевірка після релізу"
    ],
    correctIndex: 0,
    explanation: "Позитивний тест перевіряє, що система працює правильно у валідному сценарії."
  },
  {
    question: "Що таке негативний тест?",
    answers: [
      "Перевірка з невалідними даними або некоректними діями",
      "Тест, який завжди має впасти",
      "Перевірка тільки зелених кнопок",
      "Тест без користувача"
    ],
    correctIndex: 0,
    explanation: "Негативний тест перевіряє, як система обробляє помилки і неправильні вхідні дані."
  },
  {
    question: "Що таке exploratory testing?",
    answers: [
      "Одночасне вивчення продукту, проєктування і виконання тестів",
      "Тестування тільки за готовими автотестами",
      "Перевірка тільки документації",
      "Вид SQL-запиту"
    ],
    correctIndex: 0,
    explanation: "Exploratory testing корисне, коли треба швидко дослідити поведінку продукту."
  },
  {
    question: "Що таке test data?",
    answers: [
      "Дані, які використовуються для виконання перевірок",
      "Дата створення тест-плану",
      "Назва тестового сервера",
      "Тільки email користувача"
    ],
    correctIndex: 0,
    explanation: "Test data потрібні для відтворення сценаріїв і перевірки очікуваної поведінки."
  }
];

let currentIndex = 0;
let selectedIndex = null;
let answered = false;
let correctCount = 0;

const questionProgress = document.getElementById("questionProgress");
const correctCountEl = document.getElementById("correctCount");
const progressFill = document.getElementById("progressFill");
const questionText = document.getElementById("questionText");
const answersList = document.getElementById("answersList");
const feedback = document.getElementById("feedback");
const answerBtn = document.getElementById("answerBtn");

function renderQuestion() {
  const item = testQuestions[currentIndex];
  selectedIndex = null;
  answered = false;

  questionProgress.textContent = `Питання ${currentIndex + 1} / ${testQuestions.length}`;
  correctCountEl.textContent = correctCount;
  progressFill.style.width = `${((currentIndex + 1) / testQuestions.length) * 100}%`;
  questionText.textContent = item.question;
  feedback.className = "feedback hidden";
  feedback.textContent = "";
  answerBtn.textContent = "Відповісти";
  answerBtn.disabled = true;

  answersList.innerHTML = item.answers.map((answer, index) => `
    <button class="answer-option" type="button" data-index="${index}">
      <span class="answer-mark" aria-hidden="true"></span>
      <span>${answer}</span>
    </button>
  `).join("");
}

function selectAnswer(index) {
  if (answered) return;
  selectedIndex = index;
  answerBtn.disabled = false;
  answersList.querySelectorAll(".answer-option").forEach(button => {
    button.classList.toggle("selected", Number(button.dataset.index) === index);
  });
}

function submitAnswer() {
  const item = testQuestions[currentIndex];
  if (selectedIndex === null) return;

  if (answered) {
    currentIndex += 1;
    if (currentIndex >= testQuestions.length) {
      renderResult();
    } else {
      renderQuestion();
    }
    return;
  }

  answered = true;
  const isCorrect = selectedIndex === item.correctIndex;
  if (isCorrect) correctCount += 1;

  correctCountEl.textContent = correctCount;
  answersList.querySelectorAll(".answer-option").forEach(button => {
    const index = Number(button.dataset.index);
    button.classList.toggle("correct", index === item.correctIndex);
    button.classList.toggle("wrong", index === selectedIndex && !isCorrect);
  });

  feedback.className = `feedback${isCorrect ? "" : " error"}`;
  feedback.textContent = `${isCorrect ? "Правильно." : "Неправильно."} ${item.explanation}`;
  answerBtn.textContent = currentIndex === testQuestions.length - 1 ? "Завершити" : "Наступне питання";
}

function renderResult() {
  questionProgress.textContent = "Тест завершено";
  progressFill.style.width = "100%";
  questionText.textContent = `Результат: ${correctCount} / ${testQuestions.length}`;
  answersList.innerHTML = "";
  feedback.className = "feedback";
  feedback.textContent = correctCount === testQuestions.length
    ? "Супер, всі відповіді правильні."
    : "Можеш пройти тест ще раз і закріпити слабкі місця.";
  answerBtn.textContent = "Пройти ще раз";
  answerBtn.disabled = false;
  answered = true;
  selectedIndex = 0;
  currentIndex = 0;
  correctCount = 0;
}

answersList.addEventListener("click", event => {
  const button = event.target.closest(".answer-option");
  if (!button) return;
  selectAnswer(Number(button.dataset.index));
});

answerBtn.addEventListener("click", () => {
  if (questionProgress.textContent === "Тест завершено") {
    renderQuestion();
    return;
  }
  submitAnswer();
});

renderQuestion();
