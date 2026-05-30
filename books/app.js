const MANIFEST_FILES = ["book.json", "books.json"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "ogg", "aac"];
const DICTIONARY_DB_URLS = [
  "https://github.com/minhqnd/dictionary/releases/download/v2.0.0/dictionary.db",
  "assets/dictionary.db"
];
const SQL_WASM_PATH = "assets/sql-wasm.wasm";
const WORD_LONG_PRESS_MS = 1200;

const libraryPage = document.getElementById("libraryPage");
const readerPage = document.getElementById("readerPage");

const bookList = document.getElementById("bookList");
const continueSection = document.getElementById("continueSection");
const continueBook = document.getElementById("continueBook");
const appMessage = document.getElementById("appMessage");

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");

const storyTitle = document.getElementById("storyTitle");
const storyCategory = document.getElementById("storyCategory");
const storyText = document.getElementById("storyText");

const audio = document.getElementById("audio");

const backBtn = document.getElementById("backBtn");
const prevBtn = document.getElementById("prevBtn");
const playBtn = document.getElementById("playBtn");
const nextBtn = document.getElementById("nextBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const darkModeBtn = document.getElementById("darkModeBtn");

const progress = document.getElementById("progress");
const currentTimeLabel = document.getElementById("currentTimeLabel");
const durationLabel = document.getElementById("durationLabel");

const dictionaryOverlay = document.getElementById("dictionaryOverlay");
const dictionaryCloseBtn = document.getElementById("dictionaryCloseBtn");
const dictionaryWord = document.getElementById("dictionaryWord");
const dictionaryIpa = document.getElementById("dictionaryIpa");
const dictionaryMeaning = document.getElementById("dictionaryMeaning");

let books = [];
let currentBookIndex = -1;
let currentBook = null;

let words = [];
let storyPlainText = "";

let activeWordIndex = -1;
let isSeekingByUser = false;
let currentTime = 0;
let duration = 0;
let playbackMode = "audio";
let pendingSavedPosition = 0;

let speechUtterance = null;
let speechTimer = null;
let speechStartedAt = 0;
let speechBaseTime = 0;
let speechRate = 1;
let speechPlaying = false;
let dictionaryDbPromise = null;

init();

async function init() {
  restoreDarkMode();
  bindEvents();

  try {
    books = await loadBooks();

    buildCategoryFilter();
    renderLibrary();
    renderContinueReading();

    if (!books.length) {
      showMessage("No usable books were found. Check book.json and each book folder.");
    }
  } catch (error) {
    showMessage(error.message);
  }
}

async function loadBooks() {
  const manifest = await loadFirstJson(MANIFEST_FILES);
  const entries = Array.isArray(manifest) ? manifest : manifest.books || [];
  const normalized = entries.map(normalizeBook).filter(Boolean);
  const checked = await Promise.all(normalized.map(prepareBook));

  return checked.filter(Boolean);
}

async function loadFirstJson(urls) {
  const errors = [];

  for (const url of urls) {
    try {
      return await loadJson(url);
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error("Cannot load a book manifest. Tried: " + urls.join(", "));
}

function normalizeBook(book) {
  if (!book || !book.id) {
    return null;
  }

  const basePath = "books/" + book.id;

  return {
    id: book.id,
    title: book.title || book.id,
    category: book.category || "Story",
    text: book.text || basePath + "/story.txt",
    timing: book.timing || book.timeline || basePath + "/story.timeline.json",
    audio: book.audio || "",
    audioSources: buildAudioSources(book, basePath)
  };
}

function buildAudioSources(book, basePath) {
  const sources = [];

  if (book.audio) {
    sources.push(book.audio);
  }

  AUDIO_EXTENSIONS.forEach((extension) => {
    sources.push(basePath + "/story." + extension);
  });

  return [...new Set(sources)];
}

async function prepareBook(book) {
  try {
    const text = await loadText(book.text);
    const timing = await loadJson(book.timing);

    return {
      ...book,
      _text: text,
      _timing: timing
    };
  } catch {
    return null;
  }
}

async function loadJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Cannot load: " + url);
  }

  return response.json();
}

async function loadText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Cannot load: " + url);
  }

  return response.text();
}

async function urlExists(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

function bindEvents() {
  searchInput.addEventListener("input", renderLibrary);
  categoryFilter.addEventListener("change", renderLibrary);

  backBtn.addEventListener("click", goBackToLibrary);
  prevBtn.addEventListener("click", openPreviousBook);
  nextBtn.addEventListener("click", openNextBook);

  playBtn.addEventListener("click", togglePlay);

  progress.addEventListener("input", () => {
    isSeekingByUser = true;

    const nextTime = (Number(progress.value) / 100) * duration;
    seekTo(nextTime);
  });

  progress.addEventListener("change", () => {
    isSeekingByUser = false;
  });

  audio.addEventListener("timeupdate", onAudioTimeUpdate);
  audio.addEventListener("loadedmetadata", onAudioLoadedMetadata);
  audio.addEventListener("ended", onPlaybackEnded);
  audio.addEventListener("error", useSpeechPlayback);

  fullscreenBtn.addEventListener("click", toggleFullscreen);
  darkModeBtn.addEventListener("click", toggleDarkMode);

  dictionaryCloseBtn.addEventListener("click", closeDictionary);
  dictionaryOverlay.addEventListener("click", (event) => {
    if (event.target === dictionaryOverlay) {
      closeDictionary();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDictionary();
    }
  });

  document.querySelectorAll(".speed-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const rate = Number(button.dataset.rate);
      setPlaybackRate(rate);
    });
  });
}

function buildCategoryFilter() {
  categoryFilter.innerHTML = '<option value="all">All</option>';

  const categories = [...new Set(books.map((book) => book.category).filter(Boolean))];

  categories.forEach((category) => {
    const option = document.createElement("option");

    option.value = category;
    option.textContent = category;

    categoryFilter.appendChild(option);
  });
}

function renderLibrary() {
  const keyword = searchInput.value.trim().toLowerCase();
  const selectedCategory = categoryFilter.value;

  const filteredBooks = books.filter((book) => {
    const matchKeyword = book.title.toLowerCase().includes(keyword);
    const matchCategory =
      selectedCategory === "all" || book.category === selectedCategory;

    return matchKeyword && matchCategory;
  });

  bookList.innerHTML = "";

  filteredBooks.forEach((book) => {
    const realIndex = books.findIndex((item) => item.id === book.id);
    const card = createBookCard(book, realIndex);

    bookList.appendChild(card);
  });
}

function createBookCard(book, index, extraClass = "") {
  const card = document.createElement("div");

  card.className = "book-card " + extraClass;

  card.innerHTML = `
    <div class="book-title">${escapeHtml(book.title)}</div>
    <div class="book-meta">${escapeHtml(book.category || "Story")}</div>
  `;

  card.addEventListener("click", () => {
    openBook(index);
  });

  return card;
}

function renderContinueReading() {
  const last = getLastReading();

  if (!last || !last.bookId) {
    continueSection.classList.add("hidden");
    return;
  }

  const index = books.findIndex((book) => book.id === last.bookId);

  if (index < 0) {
    continueSection.classList.add("hidden");
    return;
  }

  continueSection.classList.remove("hidden");
  continueBook.innerHTML = "";

  const card = createBookCard(books[index], index, "continue-card");
  continueBook.appendChild(card);
}

async function openBook(index) {
  stopPlayback();

  currentBookIndex = index;
  currentBook = books[index];
  activeWordIndex = -1;
  currentTime = 0;
  pendingSavedPosition = getBookPosition(currentBook.id);

  storyTitle.textContent = currentBook.title;
  storyCategory.textContent = currentBook.category || "";

  storyPlainText = currentBook._text.trim();
  words = buildWords(storyPlainText, currentBook._timing);
  duration = getStoryDuration(words, currentBook._timing);

  renderWords();
  resetProgress();

  libraryPage.classList.add("hidden");
  readerPage.classList.remove("hidden");

  const audioSource = await findAudioSource(currentBook);

  if (audioSource) {
    useAudioPlayback(audioSource);
  } else {
    useSpeechPlayback();
  }

  playBtn.textContent = "▶";
}

function buildWords(text, timing) {
  const timedWords = normalizeTiming(timing);
  const textWords = text.trim().split(/\s+/);

  if (timedWords.length) {
    return timedWords.map((item, index) => ({
      word: textWords[index] || item.word,
      time: item.time,
      end: item.end,
      sentence: item.sentence
    }));
  }

  return textWords.map((word, index) => ({
    word,
    time: index * 0.55,
    end: (index + 1) * 0.55,
    sentence: estimateSentenceIndex(textWords, index)
  }));
}

function normalizeTiming(timing) {
  if (Array.isArray(timing)) {
    return timing.map((item, index) => ({
      word: item.word || item.text || "",
      time: Number(item.time ?? item.start ?? 0),
      end: Number(item.end ?? item.time ?? item.start ?? 0),
      sentence: Number(item.sentence ?? item.segment ?? 0)
    }));
  }

  if (timing?.segments) {
    return timing.segments.flatMap((segment, segmentIndex) =>
      (segment.words || []).map((item) => ({
        word: item.word || item.text || "",
        time: Number(item.time ?? item.start ?? segment.start ?? 0),
        end: Number(item.end ?? item.time ?? item.start ?? segment.end ?? 0),
        sentence: Number(segment.sentence ?? segmentIndex)
      }))
    );
  }

  if (Array.isArray(timing?.words)) {
    return normalizeTiming(timing.words);
  }

  return [];
}

function estimateSentenceIndex(textWords, wordIndex) {
  let sentence = 0;

  for (let i = 0; i < wordIndex; i++) {
    if (/[.!?]$/.test(textWords[i])) {
      sentence += 1;
    }
  }

  return sentence;
}

function getStoryDuration(wordList, timing) {
  if (Number.isFinite(timing?.duration)) {
    return timing.duration;
  }

  const last = wordList[wordList.length - 1];

  return Math.max(Number(last?.end || last?.time || 0) + 0.5, 1);
}

function renderWords() {
  storyText.innerHTML = "";

  words.forEach((item, index) => {
    const span = document.createElement("span");
    let longPressTimer = null;
    let longPressTriggered = false;

    span.className = "word";
    span.id = "word-" + index;
    span.textContent = item.word + " ";

    span.dataset.index = index;
    span.dataset.sentence = item.sentence;

    span.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      longPressTriggered = false;
      window.clearTimeout(longPressTimer);

      longPressTimer = window.setTimeout(() => {
        longPressTriggered = true;
        openDictionary(item.word);
      }, WORD_LONG_PRESS_MS);
    });

    span.addEventListener("pointerup", () => {
      window.clearTimeout(longPressTimer);
    });

    span.addEventListener("pointerleave", () => {
      window.clearTimeout(longPressTimer);
    });

    span.addEventListener("pointercancel", () => {
      window.clearTimeout(longPressTimer);
    });

    span.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    span.addEventListener("click", (event) => {
      if (longPressTriggered) {
        event.preventDefault();
        event.stopPropagation();
        longPressTriggered = false;
        return;
      }

      jumpToWord(index);
    });

    storyText.appendChild(span);
  });
}

async function openDictionary(rawWord) {
  const word = cleanLookupWord(rawWord);

  if (!word) {
    return;
  }

  pause();
  showDictionary(word, "", "Đang tra từ...");

  try {
    const entry = await lookupDictionary(word);

    if (!entry) {
      showDictionary(word, "", "Không tìm thấy nghĩa tiếng Việt.");
      return;
    }

    showDictionary(entry.word || word, entry.ipa, entry.meaning || "Không tìm thấy nghĩa tiếng Việt.");
  } catch {
    showDictionary(word, "", "Không tra được từ điển. Kiểm tra kết nối mạng.");
  }
}

function showDictionary(word, ipa, meaning) {
  dictionaryWord.textContent = word;
  dictionaryIpa.textContent = ipa || "";
  dictionaryMeaning.textContent = meaning || "";
  dictionaryOverlay.classList.remove("hidden");
}

function closeDictionary() {
  dictionaryOverlay.classList.add("hidden");
}

async function lookupDictionary(word) {
  const db = await loadDictionaryDb();

  for (const candidate of candidateLookupWords(word)) {
    const row = getDictionaryWordRow(db, candidate);

    if (row) {
      return buildDictionaryEntry(db, word, row);
    }
  }

  return null;
}

async function loadDictionaryDb() {
  if (dictionaryDbPromise) {
    return dictionaryDbPromise;
  }

  dictionaryDbPromise = (async () => {
    if (typeof initSqlJs !== "function") {
      throw new Error("sql.js is not loaded.");
    }

    const SQL = await initSqlJs({
      locateFile: () => SQL_WASM_PATH
    });

    const response = await fetchFirstOk(DICTIONARY_DB_URLS);

    const buffer = await response.arrayBuffer();
    return new SQL.Database(new Uint8Array(buffer));
  })();

  return dictionaryDbPromise;
}

async function fetchFirstOk(urls) {
  const errors = [];

  for (const url of urls) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return response;
      }

      errors.push(`${url} returned ${response.status}`);
    } catch (error) {
      errors.push(`${url} failed`);
    }
  }

  throw new Error("Cannot load dictionary.db. " + errors.join("; "));
}

function candidateLookupWords(word) {
  const candidates = [word];

  if (word.endsWith("'s")) {
    candidates.push(word.slice(0, -2));
  }

  if (word.endsWith("ies") && word.length > 4) {
    candidates.push(word.slice(0, -3) + "y");
  }

  if (word.endsWith("es") && word.length > 3) {
    candidates.push(word.slice(0, -2));
  }

  if (word.endsWith("s") && word.length > 3) {
    candidates.push(word.slice(0, -1));
  }

  return [...new Set(candidates)];
}

function getDictionaryWordRow(db, word) {
  const rows = selectRows(
    db,
    "select id, word from words where lower(word) = lower(?) and lang_code = 'en' order by id limit 1",
    [word]
  );

  return rows[0] || null;
}

function buildDictionaryEntry(db, lookupWord, row) {
  const ipaRows = selectRows(
    db,
    `
      select ipa from pronunciations
      where word_id = ?
      order by
        case
          when lower(coalesce(region, '')) like '%received%' then 0
          when lower(coalesce(region, '')) like '%british%' then 1
          when lower(coalesce(region, '')) like '%uk%' then 2
          else 3
        end,
        id
      limit 1
    `,
    [row.id]
  );

  const definitionRows = selectRows(
    db,
    `
      select d.definition
      from word_definitions wd
      join definitions d on d.id = wd.definition_id
      where wd.word_id = ?
        and d.definition_lang = 'vi'
        and d.definition is not null
      order by wd.id
      limit 3
    `,
    [row.id]
  );

  const translationRows = selectRows(
    db,
    "select translation from translations where word_id = ? and lang_code = 'vi' order by id limit 1",
    [row.id]
  );

  const meanings = definitionRows.map((item) => item.definition).filter(Boolean);

  if (!meanings.length && translationRows[0]?.translation) {
    meanings.push(translationRows[0].translation);
  }

  return {
    word: row.word || lookupWord,
    ipa: ipaRows[0]?.ipa || "",
    meaning: meanings.join(" ")
  };
}

function selectRows(db, sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];

  try {
    statement.bind(params);

    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }

  return rows;
}

function cleanLookupWord(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "")
    .replace(/'s$/g, "")
    .replace(/[^a-z'-]/g, "");
}

async function findAudioSource(book) {
  for (const source of book.audioSources) {
    if (await urlExists(source)) {
      return source;
    }
  }

  return "";
}

function useAudioPlayback(source) {
  playbackMode = "audio";
  audio.src = source;
  audio.load();

  audio.addEventListener(
    "loadedmetadata",
    () => {
      duration = audio.duration || duration;
      durationLabel.textContent = formatTime(duration);

      if (pendingSavedPosition && pendingSavedPosition < duration - 2) {
        seekTo(pendingSavedPosition);
      }
    },
    { once: true }
  );
}

function useSpeechPlayback() {
  if (!window.speechSynthesis) {
    showMessage("No audio file was found and this browser has no speech synthesis support.");
    return;
  }

  playbackMode = "speech";
  audio.removeAttribute("src");
  audio.load();
  durationLabel.textContent = formatTime(duration);

  if (pendingSavedPosition && pendingSavedPosition < duration - 2) {
    seekTo(pendingSavedPosition);
  }
}

function jumpToWord(index) {
  const item = words[index];

  if (!item) {
    return;
  }

  seekTo(item.time);
  updateHighlight();

  if (!isPlaying()) {
    play();
  } else if (playbackMode === "speech") {
    startSpeechFrom(currentTime);
  }
}

function togglePlay() {
  if (!currentBook) {
    return;
  }

  if (isPlaying()) {
    pause();
  } else {
    play();
  }
}

function play() {
  if (playbackMode === "audio") {
    audio.play().then(() => {
      playBtn.textContent = "⏸";
    }).catch(() => {
      useSpeechPlayback();
      play();
    });
    return;
  }

  startSpeechFrom(currentTime);
}

function pause() {
  if (playbackMode === "audio") {
    audio.pause();
  } else {
    stopSpeechTimer();
    window.speechSynthesis.cancel();
    speechPlaying = false;
  }

  playBtn.textContent = "▶";
  saveCurrentPosition();
}

function stopPlayback() {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  stopSpeechTimer();
  speechPlaying = false;
  playBtn.textContent = "▶";
}

function isPlaying() {
  return playbackMode === "audio" ? !audio.paused : speechPlaying;
}

function seekTo(time) {
  currentTime = clamp(time, 0, duration || 0);

  if (playbackMode === "audio" && audio.duration) {
    audio.currentTime = currentTime;
  }

  updateHighlight();
  updateProgress();
}

function startSpeechFrom(startTime) {
  if (!window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  stopSpeechTimer();

  speechBaseTime = clamp(startTime, 0, duration);
  speechStartedAt = performance.now();
  speechPlaying = true;

  const utterance = new SpeechSynthesisUtterance(getTextFromTime(speechBaseTime));
  utterance.lang = "en-US";
  utterance.rate = speechRate;

  utterance.onend = onPlaybackEnded;
  utterance.onerror = onPlaybackEnded;

  speechUtterance = utterance;
  window.speechSynthesis.speak(utterance);

  speechTimer = window.setInterval(onSpeechTimeUpdate, 100);
  playBtn.textContent = "⏸";
}

function getTextFromTime(time) {
  const startIndex = Math.max(findWordIndexAtTime(time), 0);

  return words.slice(startIndex).map((item) => item.word).join(" ");
}

function findWordIndexAtTime(time) {
  let index = 0;

  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].time) {
      index = i;
    } else {
      break;
    }
  }

  return index;
}

function stopSpeechTimer() {
  if (speechTimer) {
    window.clearInterval(speechTimer);
    speechTimer = null;
  }
}

function onSpeechTimeUpdate() {
  const elapsed = ((performance.now() - speechStartedAt) / 1000) * speechRate;
  currentTime = clamp(speechBaseTime + elapsed, 0, duration);

  if (currentTime >= duration) {
    onPlaybackEnded();
    return;
  }

  updateHighlight();
  updateProgress();
  saveCurrentPosition();
}

function onAudioTimeUpdate() {
  if (playbackMode !== "audio") {
    return;
  }

  currentTime = audio.currentTime;
  updateHighlight();
  updateProgress();
  saveCurrentPosition();
}

function onAudioLoadedMetadata() {
  if (playbackMode !== "audio") {
    return;
  }

  duration = audio.duration || duration;
  durationLabel.textContent = formatTime(duration);
}

function onPlaybackEnded() {
  stopSpeechTimer();
  speechPlaying = false;
  playBtn.textContent = "▶";
  saveCurrentPosition();
}

function updateHighlight() {
  if (!words.length) {
    return;
  }

  const newIndex = findWordIndexAtTime(currentTime);

  if (newIndex === activeWordIndex) {
    return;
  }

  activeWordIndex = newIndex;

  const activeSentence = words[activeWordIndex]?.sentence;

  document.querySelectorAll(".word").forEach((el) => {
    const index = Number(el.dataset.index);
    const sentence = Number(el.dataset.sentence);

    el.classList.remove("read", "active", "current-sentence");

    if (sentence === activeSentence) {
      el.classList.add("current-sentence");
    }

    if (index < activeWordIndex) {
      el.classList.add("read");
    }

    if (index === activeWordIndex) {
      el.classList.add("active");
    }
  });

  const activeElement = document.getElementById("word-" + activeWordIndex);

  if (activeElement) {
    activeElement.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

function updateProgress() {
  currentTimeLabel.textContent = formatTime(currentTime);

  if (!duration || isSeekingByUser) {
    return;
  }

  progress.value = (currentTime / duration) * 100;
}

function resetProgress() {
  currentTimeLabel.textContent = "00:00";
  durationLabel.textContent = formatTime(duration);
  progress.value = 0;
}

function openPreviousBook() {
  if (currentBookIndex <= 0) {
    return;
  }

  saveCurrentPosition();
  openBook(currentBookIndex - 1);
}

function openNextBook() {
  if (currentBookIndex >= books.length - 1) {
    return;
  }

  saveCurrentPosition();
  openBook(currentBookIndex + 1);
}

function goBackToLibrary() {
  saveCurrentPosition();
  stopPlayback();

  readerPage.classList.add("hidden");
  libraryPage.classList.remove("hidden");

  renderContinueReading();
}

function setPlaybackRate(rate) {
  speechRate = rate;
  audio.playbackRate = rate;

  if (playbackMode === "speech" && speechPlaying) {
    startSpeechFrom(currentTime);
  }

  document.querySelectorAll(".speed-btn").forEach((button) => {
    button.classList.toggle(
      "active-speed",
      Number(button.dataset.rate) === rate
    );
  });
}

function toggleFullscreen() {
  const target = document.documentElement;

  if (!document.fullscreenElement) {
    target.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function toggleDarkMode() {
  document.body.classList.toggle("dark");

  const isDark = document.body.classList.contains("dark");

  localStorage.setItem("readAlongDarkMode", isDark ? "1" : "0");

  darkModeBtn.textContent = isDark ? "☀️" : "🌙";
}

function restoreDarkMode() {
  const isDark = localStorage.getItem("readAlongDarkMode") === "1";

  document.body.classList.toggle("dark", isDark);

  darkModeBtn.textContent = isDark ? "☀️" : "🌙";
}

function saveCurrentPosition() {
  if (!currentBook || !duration) {
    return;
  }

  const data = getReadingData();

  data[currentBook.id] = {
    position: currentTime,
    updatedAt: Date.now()
  };

  localStorage.setItem("readAlongPositions", JSON.stringify(data));

  localStorage.setItem(
    "readAlongLast",
    JSON.stringify({
      bookId: currentBook.id,
      position: currentTime,
      updatedAt: Date.now()
    })
  );
}

function getBookPosition(bookId) {
  const data = getReadingData();

  return data[bookId]?.position || 0;
}

function getReadingData() {
  try {
    return JSON.parse(localStorage.getItem("readAlongPositions") || "{}");
  } catch {
    return {};
  }
}

function getLastReading() {
  try {
    return JSON.parse(localStorage.getItem("readAlongLast") || "null");
  } catch {
    return null;
  }
}

function showMessage(message) {
  if (!appMessage) {
    return;
  }

  appMessage.textContent = message;
  appMessage.classList.toggle("hidden", !message);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);

  return String(min).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
