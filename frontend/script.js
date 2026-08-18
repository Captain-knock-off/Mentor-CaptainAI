/* =========================================================
   Mentor.CaptainAI — Finished Frontend V2
   Existing backend contract preserved:
   POST /chat
   {
       text,
       mode,
       session_id
   }
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   =========================================================

   LOCAL:
       http://127.0.0.1:8000

   BEFORE PUBLISHING:
       change this to your Render backend, for example:
       https://mentor-captainai.onrender.com
*/

const API_URL = "http://127.0.0.1:8000";
const STORAGE_KEY = "mentor_captainai_chats";
const UPLOAD_COUNT_KEY_PREFIX = "mentor_captainai_uploads_";
const MAX_FILES_PER_CHAT = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/* =========================================================
   STATE
   ========================================================= */

let chats = [];
let currentChat = null;
let isSending = false;

/* =========================================================
   ELEMENTS
   ========================================================= */

const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const historyContainer = document.getElementById("chat-history");
const historyCount = document.getElementById("history-count");
const emptyState = document.getElementById("empty-state");
const sendButton = document.getElementById("send-button");
const charCount = document.getElementById("char-count");

const sidebar = document.getElementById("sidebar");
const mobileBackdrop = document.getElementById("mobile-backdrop");
const mobileMenuButton = document.getElementById("mobile-menu-button");

const fileInput = document.getElementById("file-input");
const attachmentList = document.getElementById("attachment-list");
const composerPlus = document.getElementById("composer-plus");

const serverStatusText = document.getElementById("server-status-text");
const serverStatusDot = document.getElementById("server-status-dot");
const serverStatusContainer = document.getElementById("server-status");
const uploadCounter = document.getElementById("upload-counter");

let selectedFiles = [];

/* =========================================================
   MARKDOWN
   ========================================================= */

function configureMarkdown() {
    if (!window.marked) {
        console.error("Marked.js was not loaded.");
        return false;
    }

    window.marked.setOptions({
        gfm: true,
        breaks: true
    });

    console.log("Marked.js ready.");
    return true;
}

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

/*
 * Normalizes common LaTeX delimiter variants before
 * Markdown processing so MathJax receives clean math.
 */
function normalizeMath(text) {
    if (!text) {
        return "";
    }

    let output = String(text);

    output = output.replace(/\\\[/g, "$$");
    output = output.replace(/\\\]/g, "$$");

    output = output.replace(/\\\(/g, "$");
    output = output.replace(/\\\)/g, "$");

    /*
     * Some model responses may contain:
     *
     * [
     *   equation
     * ]
     *
     * on their own lines. Convert only that pattern.
     */
    output = output.replace(
        /(^|\n)\[\s*\n([\s\S]*?)\n\](?=\n|$)/g,
        "$1$$\n$2\n$$"
    );

    return output;
}

function renderMarkdown(text) {
    if (!text) {
        return "";
    }

    const normalized = normalizeMath(text);

    if (
        !window.marked ||
        typeof window.marked.parse !== "function"
    ) {
        return escapeHTML(normalized).replace(/\n/g, "<br>");
    }

    try {
        return window.marked.parse(normalized);
    } catch (error) {
        console.error(
            "Markdown rendering error:",
            error
        );

        return escapeHTML(normalized).replace(
            /\n/g,
            "<br>"
        );
    }
}

/* =========================================================
   MATHJAX
   ========================================================= */

async function renderMath() {
    if (
        !window.MathJax ||
        typeof window.MathJax.typesetPromise !== "function"
    ) {
        console.warn("MathJax is not ready.");
        return;
    }

    try {
        await window.MathJax.typesetPromise([chatBox]);
        console.log("MathJax rendered.");
    } catch (error) {
        /*
         * A MathJax failure must never be treated as
         * a backend/API failure.
         */
        console.error(
            "MathJax rendering error:",
            error
        );
    }
}

/* =========================================================
   UI HELPERS
   ========================================================= */

function scrollBottom() {
    requestAnimationFrame(() => {
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

function updateEmptyState() {
    const hasMessages =
        Boolean(
            currentChat &&
            Array.isArray(currentChat.messages) &&
            currentChat.messages.length > 0
        );

    emptyState.classList.toggle(
        "hidden",
        hasMessages
    );
}

function updateCharCount() {
    if (!charCount) {
        return;
    }

    charCount.textContent =
        `${userInput.value.length} / ${userInput.maxLength || 5000}`;
}

function autoResizeInput() {
    userInput.style.height = "auto";

    const nextHeight =
        Math.min(
            userInput.scrollHeight,
            150
        );

    userInput.style.height =
        `${nextHeight}px`;
}

function openMobileSidebar() {
    sidebar.classList.add(
        "mobile-open"
    );

    mobileBackdrop.classList.add(
        "visible"
    );
}

function closeMobileSidebar() {
    sidebar.classList.remove(
        "mobile-open"
    );

    mobileBackdrop.classList.remove(
        "visible"
    );
}

/* =========================================================
   SERVER STATUS
   ========================================================= */

function setServerStatus(state, detail = "") {
    if (!serverStatusText || !serverStatusContainer) {
        return;
    }

    serverStatusContainer.classList.remove(
        "offline",
        "checking"
    );

    if (state === "online") {
        serverStatusText.textContent =
            detail || "System online";
    } else if (state === "offline") {
        serverStatusText.textContent =
            detail || "System offline";
        serverStatusContainer.classList.add("offline");
    } else {
        serverStatusText.textContent =
            detail || "Checking server...";
        serverStatusContainer.classList.add("checking");
    }
}

async function checkServerStatus() {
    setServerStatus("checking");

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        5000
    );

    try {
        const response = await fetch(
            `${API_URL}/`,
            {
                method: "GET",
                cache: "no-store",
                signal: controller.signal
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        setServerStatus(
            "online",
            "System online"
        );

        return true;
    } catch (error) {
        console.warn(
            "Backend health check failed:",
            error
        );

        setServerStatus(
            "offline",
            "System offline"
        );

        return false;
    } finally {
        clearTimeout(timeout);
    }
}

function startServerMonitor() {
    checkServerStatus();

    setInterval(
        checkServerStatus,
        30000
    );
}

/* =========================================================
   FILE ATTACHMENTS — V4
========================================================= */

const ALLOWED_EXTENSIONS = new Set([
    "txt", "md", "markdown", "csv", "json",
    "py", "js", "ts", "html", "css", "xml",
    "yaml", "yml", "log", "ini", "toml", "sql",
    "java", "c", "cpp", "h", "hpp", "jsx", "tsx",
    "sh", "bat", "ps1", "env", "rtf", "pdf", "docx",
    "pptx", "xlsx", "png", "jpg", "jpeg", "webp", "gif"
]);

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 1024) {
        return `${bytes || 0} B`;
    }
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    for (const unit of units) {
        if (value < 1024) {
            return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`;
        }
        value /= 1024;
    }
    return `${value.toFixed(1)} TB`;
}

function getExtension(fileName) {
    const name = String(fileName).toLowerCase();
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1);
}

function getUploadCount() {
    if (!currentChat) return 0;
    const raw = localStorage.getItem(
        `${UPLOAD_COUNT_KEY_PREFIX}${currentChat.id}`
    );
    const count = Number.parseInt(raw || "0", 10);
    return Number.isFinite(count) ? Math.max(0, Math.min(count, MAX_FILES_PER_CHAT)) : 0;
}

function setUploadCount(count) {
    if (!currentChat) return;
    const safe = Math.max(0, Math.min(Number.parseInt(count, 10) || 0, MAX_FILES_PER_CHAT));
    localStorage.setItem(
        `${UPLOAD_COUNT_KEY_PREFIX}${currentChat.id}`,
        String(safe)
    );
    updateUploadCounter();
}

function updateUploadCounter() {
    if (!uploadCounter) return;
    const used = getUploadCount();
    const pending = selectedFiles.length;
    const total = used + pending;
    uploadCounter.textContent = `${total} / ${MAX_FILES_PER_CHAT} uploads used`;
    uploadCounter.classList.remove("upload-counter-warning", "upload-counter-limit");
    if (total >= MAX_FILES_PER_CHAT) {
        uploadCounter.classList.add("upload-counter-limit");
    } else if (total >= MAX_FILES_PER_CHAT - 2) {
        uploadCounter.classList.add("upload-counter-warning");
    }
}

function addSelectedFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const used = getUploadCount();
    const available = MAX_FILES_PER_CHAT - used - selectedFiles.length;

    if (available <= 0) {
        alert(`You can attach up to ${MAX_FILES_PER_CHAT} files in this chat.`);
        return;
    }

    let accepted = 0;

    for (const file of incoming) {
        if (accepted >= available) break;

        if (file.size > MAX_FILE_SIZE) {
            alert(`${file.name} is too large. Maximum file size is 10 MB.`);
            continue;
        }

        const ext = getExtension(file.name);
        const isImage = file.type.startsWith("image/");
        if (!isImage && !ALLOWED_EXTENSIONS.has(ext)) {
            alert(`${file.name} is not a supported file type.`);
            continue;
        }

        const duplicate = selectedFiles.some(item =>
            item.file.name === file.name &&
            item.file.size === file.size &&
            item.file.lastModified === file.lastModified
        );

        if (duplicate) continue;

        selectedFiles.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file
        });
        accepted += 1;
    }

    renderAttachments();
    updateUploadCounter();
}

function removeSelectedFile(id) {
    selectedFiles = selectedFiles.filter(item => item.id !== id);
    renderAttachments();
    updateUploadCounter();
}

function clearSelectedFiles() {
    selectedFiles = [];
    if (fileInput) fileInput.value = "";
    renderAttachments();
    updateUploadCounter();
}

function renderAttachments() {
    if (!attachmentList) return;
    attachmentList.innerHTML = "";

    selectedFiles.forEach(item => {
        const chip = document.createElement("div");
        chip.className = "attachment-chip";

        const icon = document.createElement("span");
        icon.textContent = item.file.type.startsWith("image/") ? "🖼️" : "📄";
        chip.appendChild(icon);

        const name = document.createElement("span");
        name.className = "file-name";
        name.textContent = item.file.name;
        name.title = item.file.name;
        chip.appendChild(name);

        const size = document.createElement("span");
        size.className = "file-size";
        size.textContent = formatFileSize(item.file.size);
        chip.appendChild(size);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-file";
        remove.textContent = "×";
        remove.title = "Remove attachment";
        remove.addEventListener("click", () => removeSelectedFile(item.id));
        chip.appendChild(remove);

        attachmentList.appendChild(chip);
    });
}

function setupAttachments() {
    composerPlus?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", event => {
        addSelectedFiles(event.target.files);
        event.target.value = "";
    });
}

/* =========================================================
   CHAT TITLE
   ========================================================= */

function createChatTitle(text) {
    const clean =
        String(text)
            .replace(/\s+/g, " ")
            .trim();

    if (clean.length <= 30) {
        return clean;
    }

    return (
        clean.substring(0, 30) +
        "..."
    );
}

/* =========================================================
   NEW CHAT
   ========================================================= */

function newChat() {
    const chat = {
        id: Date.now(),
        title: "New Chat",
        messages: []
    };

    chats.unshift(chat);

    currentChat = chat;

    chatBox.innerHTML = "";

    updateEmptyState();
    renderChats();
    saveChats();
    updateUploadCounter();
    closeMobileSidebar();

    userInput.focus();
}

/* =========================================================
   TYPING INDICATOR
   ========================================================= */

function showTyping() {
    removeTyping();

    const typingHTML = `
        <div
            class="message bot"
            id="typing-indicator"
        >
            <strong>CaptainAI</strong>

            <div
                class="typing"
                aria-label="CaptainAI is thinking"
            >
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    chatBox.insertAdjacentHTML(
        "beforeend",
        typingHTML
    );

    scrollBottom();
}

function removeTyping() {
    document
        .getElementById(
            "typing-indicator"
        )
        ?.remove();
}

/* =========================================================
   USER MESSAGE
   ========================================================= */

function addUserMessage(message) {
    const userHTML = `
        <div class="message user">
            <strong>You</strong>

            <div class="message-content">
                ${renderMarkdown(message)}
            </div>
        </div>
    `;

    chatBox.insertAdjacentHTML(
        "beforeend",
        userHTML
    );

    if (currentChat) {
        currentChat.messages.push(
            userHTML
        );
    }

    updateEmptyState();

    scrollBottom();
}

/* =========================================================
   BOT MESSAGE
   ========================================================= */

function addBotMessage(reply) {
    const renderedHTML =
        renderMarkdown(reply);

    const botHTML = `
        <div class="message bot">
            <strong>CaptainAI</strong>

            <div class="message-content">
                ${renderedHTML}
            </div>
        </div>
    `;

    chatBox.insertAdjacentHTML(
        "beforeend",
        botHTML
    );

    if (currentChat) {
        currentChat.messages.push(
            botHTML
        );
    }

    updateEmptyState();

    saveChats();

    scrollBottom();

    /*
     * Markdown is already inserted.
     * Now MathJax can render the math.
     */
    renderMath();
}

/* =========================================================
   SEND STATE
   ========================================================= */

function setSendState(sending) {
    if (!sendButton) {
        return;
    }

    sendButton.disabled =
        sending;

    const label =
        sendButton.querySelector(
            ".send-label"
        );

    const icon =
        sendButton.querySelector(
            ".send-icon"
        );

    if (label) {
        label.textContent =
            sending
                ? "Sending"
                : "Send";
    }

    if (icon) {
        icon.textContent =
            sending
                ? "…"
                : "↑";
    }
}

/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function sendMessage() {
    if (isSending) return;

    const message = userInput.value.trim();
    if (!message && !selectedFiles.length) return;

    if (!currentChat) newChat();

    const usedBefore = getUploadCount();

    if (usedBefore + selectedFiles.length > MAX_FILES_PER_CHAT) {
        addBotMessage(`**Upload limit reached.**\n\nYou can use a maximum of ${MAX_FILES_PER_CHAT} uploaded files in one chat.`);
        return;
    }

    const visibleMessage = message || "Please inspect the attached file(s).";

    if (currentChat.title === "New Chat") {
        currentChat.title = createChatTitle(visibleMessage);
        renderChats();
    }

    const attachedNames = selectedFiles.map(item => `📎 ${item.file.name}`);

    addUserMessage(
        attachedNames.length
            ? `${visibleMessage}\n\n${attachedNames.join("\n")}`
            : message
    );

    userInput.value = "";
    updateCharCount();
    autoResizeInput();
    showTyping();

    isSending = true;
    setSendState(true);

    try {
        const formData = new FormData();
        formData.append("text", message);
        formData.append("mode", "normal");
        formData.append("session_id", String(currentChat.id));

        selectedFiles.forEach(item => {
            formData.append("files", item.file, item.file.name);
        });

        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            body: formData
        });

        removeTyping();

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`Backend returned invalid JSON (HTTP ${response.status})`);
        }

        console.log("Backend status:", response.status);
        console.log("Backend response:", data);

        if (response.status === 413) {
            addBotMessage("**Attachment too large.**\n\nEach file can be up to 10 MB.");
            return;
        }

        if (response.status === 429) {
            addBotMessage("**Upload limit reached.**\n\nYou have reached the 10-file limit for this chat.");
            return;
        }

        if (response.status === 415) {
            addBotMessage(`**Unsupported attachment.**\n\n${data?.detail || "This file type is not supported."}`);
            return;
        }

        if (response.status === 422) {
            let details = "The backend rejected the request.";
            if (Array.isArray(data?.detail)) {
                details = data.detail.map(item => {
                    const location = Array.isArray(item.loc) ? item.loc.join(".") : "request";
                    return `${location}: ${item.msg}`;
                }).join("\n");
            } else if (data?.detail) {
                details = String(data.detail);
            }
            addBotMessage(`**Request validation error**\n\n\`${details}\``);
            return;
        }

        if (!response.ok) {
            addBotMessage(`**Server error**\n\n${data?.response || data?.detail || `HTTP ${response.status}`}`);
            return;
        }

        const reply = data?.response;
        if (typeof reply !== "string" || !reply.trim()) {
            addBotMessage("The server responded, but CaptainAI returned an empty response.");
            return;
        }

        if (Number(data?.uploaded_files || 0) > 0) {
            setUploadCount(usedBefore + Number(data.uploaded_files));
        }

        addBotMessage(reply);
        setServerStatus("online", "System online");

    } catch (error) {
        removeTyping();
        console.error("Fetch error:", error);
        setServerStatus("offline", "System offline");

        addBotMessage(
            error instanceof TypeError
                ? `**Cannot connect to CaptainAI.**\n\nMake sure the backend is running at:\n\n\`${API_URL}\``
                : `**Request failed.**\n\n${error.message}`
        );
    } finally {
        isSending = false;
        setSendState(false);
        saveChats();
        renderChats();
        clearSelectedFiles();
        updateUploadCounter();
        scrollBottom();
    }
}

/* =========================================================
   LOAD CHAT
   ========================================================= */

function loadChat(id) {
    const chat =
        chats.find(
            item =>
                item.id === id
        );

    if (!chat) {
        return;
    }

    currentChat =
        chat;

    chatBox.innerHTML =
        chat.messages.join("");

    updateEmptyState();

    renderChats();

    scrollBottom();

    closeMobileSidebar();

    renderMath();
}

/* =========================================================
   DELETE CHAT
   ========================================================= */

function deleteChat(id) {
    chats =
        chats.filter(
            chat =>
                chat.id !== id
        );

    if (
        currentChat &&
        currentChat.id === id
    ) {
        currentChat =
            null;

        chatBox.innerHTML =
            "";
    }

    updateEmptyState();

    renderChats();

    saveChats();
}

/* =========================================================
   CLEAR CHATS
   ========================================================= */

function confirmClearChats() {
    if (!chats.length) {
        alert(
            "There are no chats to clear."
        );

        return;
    }

    const confirmed =
        confirm(
            "Delete all chats? This cannot be undone."
        );

    if (!confirmed) {
        return;
    }

    chats = [];

    currentChat =
        null;

    chatBox.innerHTML =
        "";

    localStorage.removeItem(
        STORAGE_KEY
    );

    updateEmptyState();

    renderChats();
}

/* =========================================================
   SIDEBAR
   ========================================================= */

function renderChats() {
    historyContainer.innerHTML =
        "";

    if (historyCount) {
        historyCount.textContent =
            String(chats.length);
    }

    chats.forEach(chat => {
        const item =
            document.createElement(
                "div"
            );

        item.className =
            "history-item";

        const title =
            document.createElement(
                "span"
            );

        title.className =
            "history-title";

        title.textContent =
            chat.title;

        title.title =
            chat.title;

        title.addEventListener(
            "click",
            () => loadChat(chat.id)
        );

        const deleteButton =
            document.createElement(
                "button"
            );

        deleteButton.className =
            "delete-btn";

        deleteButton.type =
            "button";

        deleteButton.textContent =
            "×";

        deleteButton.title =
            "Delete chat";

        deleteButton.setAttribute(
            "aria-label",
            `Delete ${chat.title}`
        );

        deleteButton.addEventListener(
            "click",
            event => {
                event.stopPropagation();

                deleteChat(
                    chat.id
                );
            }
        );

        item.append(
            title,
            deleteButton
        );

        historyContainer.appendChild(
            item
        );
    });
}

/* =========================================================
   STORAGE
   ========================================================= */

function saveChats() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(
                chats
            )
        );
    } catch (error) {
        console.error(
            "Could not save chats:",
            error
        );
    }
}

function loadSavedChats() {
    try {
        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );

        if (!saved) {
            return;
        }

        const parsed =
            JSON.parse(saved);

        if (!Array.isArray(parsed)) {
            console.warn(
                "Saved chat data is invalid."
            );

            return;
        }

        chats =
            parsed;

        renderChats();

    } catch (error) {
        console.error(
            "Could not load chats:",
            error
        );

        chats = [];
    }
}

/* =========================================================
   SUGGESTION CARDS
   ========================================================= */

function setupSuggestions() {
    document
        .querySelectorAll(
            ".suggestion-card"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    const prompt =
                        button.dataset
                            .prompt ||
                        "";

                    if (!prompt) {
                        return;
                    }

                    userInput.value =
                        prompt;

                    updateCharCount();

                    autoResizeInput();

                    userInput.focus();

                    sendMessage();
                }
            );
        });
}

/* =========================================================
   INPUT
   ========================================================= */

function setupInput() {
    userInput.addEventListener(
        "input",
        () => {
            updateCharCount();
            autoResizeInput();
        }
    );

    userInput.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {
                event.preventDefault();

                sendMessage();
            }
        }
    );

    updateCharCount();

    autoResizeInput();
}

/* =========================================================
   MOBILE
   ========================================================= */

function setupMobile() {
    mobileMenuButton?.addEventListener(
        "click",
        openMobileSidebar
    );

    mobileBackdrop?.addEventListener(
        "click",
        closeMobileSidebar
    );
}

function setupAttachments() {
    composerPlus?.addEventListener(
        "click",
        () => fileInput?.click()
    );

    fileInput?.addEventListener(
        "change",
        event => {
            addSelectedFiles(
                event.target.files
            );

            event.target.value = "";
        }
    );
}

/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

function setupKeyboard() {
    document.addEventListener(
        "keydown",
        event => {
            if (
                (event.ctrlKey ||
                    event.metaKey) &&
                event.key.toLowerCase() ===
                    "k"
            ) {
                event.preventDefault();

                newChat();
            }

            if (
                event.key === "Escape"
            ) {
                closeMobileSidebar();
            }
        }
    );
}

/* =========================================================
   INIT
   ========================================================= */

function initialize() {
    console.log(
        "Mentor.CaptainAI frontend starting..."
    );

    configureMarkdown();

    loadSavedChats();

    setupSuggestions();

    setupInput();

    setupMobile();

    setupAttachments();

    setupKeyboard();

    updateEmptyState();
    updateUploadCounter();

    startServerMonitor();

    console.log(
        "Marked:",
        typeof window.marked !==
            "undefined"
    );

    console.log(
        "MathJax:",
        typeof window.MathJax !==
            "undefined"
    );

    if (userInput) {
        userInput.focus();
    }
}

/* =========================================================
   START
   ========================================================= */

initialize();
