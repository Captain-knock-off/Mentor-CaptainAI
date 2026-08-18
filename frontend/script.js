"use strict";


/* =========================================================
   MENTOR.CAPTAINAI
   FRONTEND CHAT ENGINE
========================================================= */


/* =========================================================
   CONFIGURATION
========================================================= */


const API_URL = "https://mentor-captainai.onrender.com";


/* =========================================================
   STORAGE
========================================================= */

const STORAGE_KEY = "mentor_captainai_chats";


/* =========================================================
   STATE
========================================================= */

let chats = [];

let currentChat = null;

let isSending = false;


/* =========================================================
   ELEMENTS
========================================================= */

const chatBox =
    document.getElementById("chat-box");

const userInput =
    document.getElementById("user-input");

const historyContainer =
    document.getElementById("chat-history");

const sendButton =
    document.getElementById("send-button");


/* =========================================================
   MARKED.JS
========================================================= */

function configureMarkdown() {

    if (!window.marked) {

        console.error(
            "Marked.js was not loaded."
        );

        return false;
    }


    /*
        GitHub-style Markdown.

        breaks: true means normal line breaks
        are preserved.
    */

    marked.setOptions({

        gfm: true,

        breaks: true

    });


    console.log(
        "Marked.js ready."
    );


    return true;
}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(text) {

    const div =
        document.createElement("div");

    div.textContent =
        String(text);

    return div.innerHTML;
}


/* =========================================================
   MATH NORMALIZATION
========================================================= */

/*
    THIS IS THE IMPORTANT FIX.

    AI models can return math in several forms:

        \[ ... \]

        \( ... \)

        $$ ... $$

        $ ... $

    Marked.js can interfere with the backslashes
    in \[ and \(.

    Therefore we normalize the delimiters BEFORE
    sending the response to Marked.js.
*/

function normalizeMath(text) {

    if (!text) {
        return "";
    }


    let output =
        String(text);


    /* -----------------------------------------------------
       DISPLAY MATH

       Convert:

       \[
           equation
       \]

       into:

       $$
           equation
       $$
    ----------------------------------------------------- */

    output =
        output.replace(
            /\\\[/g,
            "$$"
        );


    output =
        output.replace(
            /\\\]/g,
            "$$"
        );


    /* -----------------------------------------------------
       INLINE MATH

       Convert:

       \(x\)

       into:

       $x$
    ----------------------------------------------------- */

    output =
        output.replace(
            /\\\(/g,
            "$"
        );


    output =
        output.replace(
            /\\\)/g,
            "$"
        );


    /*
        Some models produce:

        [
        PV = nRT
        ]

        instead of:

        \[
        PV = nRT
        \]

        Detect only brackets that occupy complete
        lines.

        This prevents normal Markdown links,
        arrays, etc. from being damaged.
    */

    output =
        output.replace(
            /(^|\n)\[\s*\n([\s\S]*?)\n\](?=\n|$)/g,
            "$1$$\n$2\n$$"
        );


    return output;
}


/* =========================================================
   MARKDOWN RENDERING
========================================================= */

function renderMarkdown(text) {

    if (!text) {
        return "";
    }


    /*
        STEP 1

        Normalize LaTeX BEFORE Markdown.
    */

    const normalized =
        normalizeMath(text);


    /*
        STEP 2

        If Marked isn't available,
        safely display plain text.
    */

    if (!window.marked) {

        console.warn(
            "Marked.js unavailable."
        );


        return escapeHTML(
            normalized
        ).replace(
            /\n/g,
            "<br>"
        );
    }


    /*
        STEP 3

        Convert Markdown → HTML.
    */

    try {

        return marked.parse(
            normalized
        );

    } catch (error) {

        console.error(
            "Markdown rendering error:",
            error
        );


        return escapeHTML(
            normalized
        ).replace(
            /\n/g,
            "<br>"
        );
    }
}


/* =========================================================
   MATHJAX
========================================================= */

async function renderMath() {

    /*
        MathJax may still be loading.

        NEVER let MathJax failure make the
        entire chat request appear to fail.
    */

    if (
        !window.MathJax ||
        typeof window.MathJax.typesetPromise !== "function"
    ) {

        console.warn(
            "MathJax is not ready."
        );

        return;
    }


    try {

        await window.MathJax.typesetPromise([
            chatBox
        ]);


        console.log(
            "MathJax rendered."
        );

    } catch (error) {

        /*
            Formula rendering failed, but the
            AI response itself is still valid.
        */

        console.error(
            "MathJax rendering error:",
            error
        );
    }
}


/* =========================================================
   SCROLL
========================================================= */

function scrollBottom() {

    if (!chatBox) {
        return;
    }


    chatBox.scrollTop =
        chatBox.scrollHeight;
}


/* =========================================================
   CREATE CHAT
========================================================= */

function newChat() {

    const chat = {

        id: Date.now(),

        title: "New Chat",

        messages: []

    };


    chats.unshift(
        chat
    );


    currentChat =
        chat;


    chatBox.innerHTML =
        "";


    renderChats();

    saveChats();


    if (userInput) {

        userInput.focus();

    }
}


/* =========================================================
   CREATE CHAT TITLE
========================================================= */

function createChatTitle(text) {

    const clean =
        text
            .replace(/\s+/g, " ")
            .trim();


    if (
        clean.length <= 30
    ) {

        return clean;

    }


    return (
        clean.substring(0, 30)
        + "..."
    );
}


/* =========================================================
   SEND MESSAGE
========================================================= */

async function sendMessage() {

    /*
        Prevent double requests.
    */

    if (isSending) {
        return;
    }


    const message =
        userInput.value.trim();


    if (!message) {
        return;
    }


    /*
        Create a chat if necessary.
    */

    if (!currentChat) {

        newChat();

    }


    /*
        Give the chat a title based
        on its first message.
    */

    if (
        currentChat.title === "New Chat"
    ) {

        currentChat.title =
            createChatTitle(
                message
            );


        renderChats();

        saveChats();
    }


    /* =====================================================
       USER MESSAGE
    ===================================================== */

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


    currentChat.messages.push(
        userHTML
    );


    userInput.value =
        "";


    scrollBottom();


    /* =====================================================
       TYPING INDICATOR
    ===================================================== */

    const typingHTML = `

        <div
            class="message bot"
            id="typing-indicator"
        >

            <strong>
                CaptainAI
            </strong>

            <div class="typing">

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


    /* =====================================================
       LOCK UI
    ===================================================== */

    isSending =
        true;


    setSendState(
        true
    );


    /* =====================================================
       API REQUEST
    ===================================================== */

    try {

        const endpoint =
            `${API_URL}/chat`;


        console.log(
            "Sending request:",
            endpoint
        );


        const response =
            await fetch(
                endpoint,
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            text:
                                message,

                            mode:
                                "normal",

                            session_id:
                                String(
                                    currentChat.id
                                )

                        })

                }
            );


        /*
            Remove typing indicator once
            the server responds.
        */

        removeTyping();


        /* =================================================
           READ JSON
        ================================================= */

        let data;


        try {

            data =
                await response.json();

        } catch (jsonError) {

            console.error(
                "Invalid JSON:",
                jsonError
            );


            throw new Error(
                `Backend returned invalid JSON (HTTP ${response.status})`
            );
        }


        console.log(
            "Backend status:",
            response.status
        );


        console.log(
            "Backend response:",
            data
        );


        /* =================================================
           422 VALIDATION ERROR
        ================================================= */

        if (
            response.status === 422
        ) {

            console.error(
                "FastAPI validation error:",
                data
            );


            let details =
                "The backend rejected the request.";


            if (
                data &&
                Array.isArray(
                    data.detail
                )
            ) {

                details =
                    data.detail
                        .map(
                            item => {

                                const location =
                                    item.loc
                                        ? item.loc.join(".")
                                        : "request";


                                return (
                                    `${location}: ${item.msg}`
                                );

                            }
                        )
                        .join("\n");

            }


            addBotMessage(
                `**Request validation error**\n\n\`${details}\``
            );


            return;
        }


        /* =================================================
           OTHER SERVER ERRORS
        ================================================= */

        if (!response.ok) {

            console.error(
                "Backend HTTP error:",
                response.status,
                data
            );


            const serverMessage =
                data?.response ||
                data?.detail ||
                `HTTP ${response.status}`;


            addBotMessage(
                `**Server error**\n\n${serverMessage}`
            );


            return;
        }


        /* =================================================
           EXTRACT AI RESPONSE
        ================================================= */

        const reply =
            data?.response;


        if (
            typeof reply !== "string" ||
            reply.trim() === ""
        ) {

            console.error(
                "Empty AI response:",
                data
            );


            addBotMessage(
                "The server responded, but CaptainAI returned an empty response."
            );


            return;
        }


        /* =================================================
           ADD AI MESSAGE
        ================================================= */

        addBotMessage(
            reply
        );


    } catch (error) {

        removeTyping();


        console.error(
            "Fetch error:",
            error
        );


        let errorMessage;


        /*
            Network failure.
        */

        if (
            error instanceof TypeError
        ) {

            errorMessage =
                `**Cannot connect to CaptainAI.**\n\n` +
                `Make sure the backend is running at:\n\n` +
                `\`${API_URL}\``;

        } else {

            errorMessage =
                `**Request failed.**\n\n` +
                `${error.message}`;

        }


        addBotMessage(
            errorMessage
        );


    } finally {

        isSending =
            false;


        setSendState(
            false
        );


        saveChats();


        scrollBottom();

    }
}


/* =========================================================
   ADD BOT MESSAGE
========================================================= */

function addBotMessage(reply) {

    /*
        AI response:

        Markdown
            ↓
        normalizeMath()
            ↓
        marked.js
            ↓
        HTML
            ↓
        MathJax
    */

    const renderedHTML =
        renderMarkdown(
            reply
        );


    const botHTML = `

        <div class="message bot">

            <strong>
                CaptainAI
            </strong>

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


    saveChats();


    scrollBottom();


    /*
        IMPORTANT:

        MathJax happens AFTER
        Markdown rendering.
    */

    renderMath();
}


/* =========================================================
   REMOVE TYPING
========================================================= */

function removeTyping() {

    const typing =
        document.getElementById(
            "typing-indicator"
        );


    if (typing) {

        typing.remove();

    }
}


/* =========================================================
   SEND BUTTON
========================================================= */

function setSendState(
    sending
) {

    if (!sendButton) {
        return;
    }


    sendButton.disabled =
        sending;


    sendButton.textContent =
        sending
            ? "Sending..."
            : "Send";
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


    scrollBottom();


    /*
        Re-render formulas from
        saved messages.
    */

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


    renderChats();

    saveChats();
}


/* =========================================================
   CLEAR ALL CHATS
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


    renderChats();
}


/* =========================================================
   SIDEBAR
========================================================= */

function renderChats() {

    if (!historyContainer) {
        return;
    }


    historyContainer.innerHTML =
        "";


    chats.forEach(
        chat => {

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


            title.onclick =
                () =>
                    loadChat(
                        chat.id
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


            deleteButton.onclick =
                event => {

                    event.stopPropagation();

                    deleteChat(
                        chat.id
                    );

                };


            item.appendChild(
                title
            );


            item.appendChild(
                deleteButton
            );


            historyContainer.appendChild(
                item
            );

        }
    );
}


/* =========================================================
   SAVE CHATS
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


/* =========================================================
   LOAD SAVED CHATS
========================================================= */

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
            JSON.parse(
                saved
            );


        if (
            !Array.isArray(parsed)
        ) {

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
            "Could not load saved chats:",
            error
        );


        chats = [];

    }
}


/* =========================================================
   ENTER KEY
========================================================= */

if (userInput) {

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

}


/* =========================================================
   INITIALIZATION
========================================================= */

function initialize() {

    console.log(
        "Mentor.CaptainAI starting..."
    );


    configureMarkdown();


    loadSavedChats();


    console.log(
        "Marked:",
        typeof window.marked !== "undefined"
    );


    console.log(
        "MathJax:",
        typeof window.MathJax !== "undefined"
    );



    window.addEventListener(
        "load",
        () => {

            console.log(
                "MathJax ready:",
                !!(
                    window.MathJax &&
                    typeof window.MathJax.typesetPromise === "function"
                )
            );

        }
    );


    if (userInput) {

        userInput.focus();

    }

}


/* =========================================================
   START
========================================================= */

initialize();
