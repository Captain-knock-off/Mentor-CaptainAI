"use strict";

const LOCAL_API = "http://127.0.0.1:8000";
const PRODUCTION_API = "https://mentor-captainai.onrender.com";
const API_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? LOCAL_API : PRODUCTION_API;

const STORAGE_KEY = "mentor_captainai_chats";
const UPLOAD_KEY = "mentor_captainai_uploads_";
const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const chatBox=document.getElementById("chat-box");
const userInput=document.getElementById("user-input");
const historyContainer=document.getElementById("chat-history");
const historyCount=document.getElementById("history-count");
const emptyState=document.getElementById("empty-state");
const sendButton=document.getElementById("send-button");
const charCount=document.getElementById("char-count");
const sidebar=document.getElementById("sidebar");
const mobileBackdrop=document.getElementById("mobile-backdrop");
const mobileMenuButton=document.getElementById("mobile-menu-button");
const fileInput=document.getElementById("file-input");
const composerPlus=document.getElementById("composer-plus");
const attachmentList=document.getElementById("attachment-list");
const uploadCounter=document.getElementById("upload-counter");
const status=document.getElementById("server-status");
const statusText=document.getElementById("server-status-text");

let chats=[];
let currentChat=null;
let selectedFiles=[];
let isSending=false;

let serverAwake=false;
function setStatus(kind,text){status.classList.remove("offline","checking");if(kind!=="online")status.classList.add(kind);statusText.textContent=text}
async function pingHealth(timeoutMs){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(`${API_URL}/health`,{cache:"no-store",signal:c.signal});return r.ok}catch{return false}finally{clearTimeout(t)}}
async function checkServer(){setStatus("checking","Checking server...");const ok=await pingHealth(5000);serverAwake=ok;setStatus(ok?"online":"offline",ok?"System online":"System offline")}
function startServerMonitor(){checkServer();setInterval(checkServer,30000)}
// Render's free tier sleeps after ~15 min idle; the first request afterwards can take up to a minute
// to wake back up. Poll /health with a longer budget instead of letting the real request time out.
async function wakeServer(onWaking){if(serverAwake)return true;onWaking?.();const deadline=Date.now()+55000;while(Date.now()<deadline){if(await pingHealth(8000)){serverAwake=true;setStatus("online","System online");return true}await new Promise(r=>setTimeout(r,2500))}return false}

function configureMarkdown(){if(!window.marked){console.error("Marked.js was not loaded.");return false}window.marked.setOptions({gfm:true,breaks:true});console.log("Marked.js ready.");return true}
function escapeHTML(t){const d=document.createElement("div");d.textContent=String(t);return d.innerHTML}
function renderMarkdown(t){if(!t)return"";if(!window.marked)return escapeHTML(t).replace(/\n/g,"<br>");try{return window.marked.parse(String(t))}catch(e){console.error("Markdown rendering error:",e);return escapeHTML(t).replace(/\n/g,"<br>")}}
async function renderMath(){if(!window.MathJax||typeof window.MathJax.typesetPromise!=="function")return;try{await window.MathJax.typesetPromise([chatBox])}catch(e){console.error("MathJax rendering error:",e)}}
function scrollBottom(){requestAnimationFrame(()=>chatBox.scrollTop=chatBox.scrollHeight)}
function updateEmpty(){emptyState.classList.toggle("hidden",!(currentChat&&currentChat.messages.length))}
function updateCount(){charCount.textContent=`${userInput.value.length} / ${userInput.maxLength}`}
function resizeInput(){userInput.style.height="auto";userInput.style.height=`${Math.min(userInput.scrollHeight,150)}px`}
function createChatTitle(t){const s=String(t).replace(/\s+/g," ").trim();return s.length<=30?s:`${s.slice(0,30)}...`}
function showTyping(){removeTyping();chatBox.insertAdjacentHTML("beforeend",`<div class="message bot" id="typing-indicator"><strong>CaptainAI</strong><div class="typing"><span></span><span></span><span></span></div></div>`);scrollBottom()}
function removeTyping(){document.getElementById("typing-indicator")?.remove()}
function setSendState(s){sendButton.disabled=s;sendButton.querySelector(".send-label").textContent=s?"Sending":"Send";sendButton.querySelector(".send-icon").textContent=s?"…":"↑"}

function saveChats(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(chats))}catch(e){console.error("Could not save chats:",e)}}
function loadChats(){try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const p=JSON.parse(raw);if(Array.isArray(p))chats=p}}catch(e){console.error("Could not load chats:",e);chats=[]}}
function uploadCount(){if(!currentChat)return 0;const n=Number.parseInt(localStorage.getItem(`${UPLOAD_KEY}${currentChat.id}`)||"0",10);return Number.isFinite(n)?n:0}
function setUploadCount(n){if(currentChat)localStorage.setItem(`${UPLOAD_KEY}${currentChat.id}`,String(Math.min(Math.max(n,0),MAX_FILES)));updateUploadCounter()}
function updateUploadCounter(){const n=uploadCount()+selectedFiles.length;uploadCounter.textContent=`${n} / ${MAX_FILES} files`;uploadCounter.classList.remove("warning","limit");if(n>=MAX_FILES)uploadCounter.classList.add("limit");else if(n>=MAX_FILES-2)uploadCounter.classList.add("warning")}

function renderChats(){historyContainer.innerHTML="";historyCount.textContent=String(chats.length);chats.forEach(chat=>{const item=document.createElement("div");item.className="history-item";const title=document.createElement("span");title.className="history-title";title.textContent=chat.title;title.onclick=()=>loadChat(chat.id);const del=document.createElement("button");del.className="delete-btn";del.type="button";del.textContent="×";del.title="Delete chat";del.onclick=e=>{e.stopPropagation();deleteChat(chat.id)};item.append(title,del);historyContainer.appendChild(item)})}
function newChat(){const c={id:Date.now(),title:"New Chat",messages:[]};chats.unshift(c);currentChat=c;chatBox.innerHTML="";clearSelectedFiles();updateEmpty();renderChats();saveChats();closeMobileSidebar();userInput.focus()}
function loadChat(id){const c=chats.find(x=>x.id===id);if(!c)return;currentChat=c;chatBox.innerHTML=c.messages.join("");updateUploadCounter();updateEmpty();renderChats();closeMobileSidebar();scrollBottom();renderMath()}
function deleteChat(id){chats=chats.filter(c=>c.id!==id);localStorage.removeItem(`${UPLOAD_KEY}${id}`);if(currentChat?.id===id){currentChat=null;chatBox.innerHTML=""}clearSelectedFiles();updateEmpty();renderChats();saveChats()}
function confirmClearChats(){if(!chats.length){alert("There are no chats to clear.");return}if(!confirm("Delete all chats? This cannot be undone."))return;chats=[];currentChat=null;chatBox.innerHTML="";Object.keys(localStorage).filter(k=>k.startsWith(UPLOAD_KEY)).forEach(k=>localStorage.removeItem(k));localStorage.removeItem(STORAGE_KEY);clearSelectedFiles();updateEmpty();renderChats()}

const ALLOWED_EXTENSIONS=new Set(["txt","md","markdown","csv","json","py","js","ts","html","css","xml","yaml","yml","log","ini","toml","sql","java","c","cpp","h","hpp","jsx","tsx","sh","bat","ps1","env","rtf","pdf","docx","pptx","xlsx","png","jpg","jpeg","webp","gif"]);
function ext(name){const s=String(name).toLowerCase(),i=s.lastIndexOf(".");return i===-1?"":s.slice(i+1)}
function sizeText(b){return b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(1)} MB`}
function addSelectedFiles(list){const capacity=MAX_FILES-uploadCount()-selectedFiles.length;if(capacity<=0){alert("This chat has reached the 10-file upload limit.");return}for(const f of Array.from(list||[]).slice(0,capacity)){if(f.size>MAX_FILE_SIZE){alert(`${f.name} is larger than 10 MB.`);continue}if(!ALLOWED_EXTENSIONS.has(ext(f.name))){alert(`${f.name} is not a supported file type.`);continue}if(selectedFiles.some(x=>x.file.name===f.name&&x.file.size===f.size&&x.file.lastModified===f.lastModified))continue;selectedFiles.push({id:`${Date.now()}-${Math.random()}`,file:f})}renderAttachments();updateUploadCounter()}
function renderAttachments(){attachmentList.innerHTML="";selectedFiles.forEach(item=>{const chip=document.createElement("div");chip.className="attachment-chip";const icon=document.createElement("span");icon.textContent=item.file.type.startsWith("image/")?"🖼️":"📄";const name=document.createElement("span");name.className="file-name";name.textContent=item.file.name;const type=document.createElement("span");type.className="file-type";type.textContent=ext(item.file.name);const size=document.createElement("span");size.className="file-size";size.textContent=sizeText(item.file.size);const rm=document.createElement("button");rm.className="remove-file";rm.type="button";rm.textContent="×";rm.onclick=()=>{selectedFiles=selectedFiles.filter(x=>x.id!==item.id);renderAttachments();updateUploadCounter()};chip.append(icon,name,type,size,rm);attachmentList.appendChild(chip)})}
function clearSelectedFiles(){selectedFiles=[];if(fileInput)fileInput.value="";renderAttachments();updateUploadCounter()}

function addUserMessage(text,files=[]){const filesHtml=files.length?`<div class="attached-name">${files.map(f=>`📎 ${escapeHTML(f.name)}`).join("<br>")}</div>`:"";const html=`<div class="message user"><strong>You</strong><div class="message-content">${renderMarkdown(text)}${filesHtml}</div></div>`;chatBox.insertAdjacentHTML("beforeend",html);currentChat.messages.push(html);updateEmpty();scrollBottom()}
function addBotMessage(reply){const html=`<div class="message bot"><strong>CaptainAI</strong><div class="message-content">${renderMarkdown(reply)}</div></div>`;chatBox.insertAdjacentHTML("beforeend",html);if(currentChat)currentChat.messages.push(html);saveChats();updateEmpty();scrollBottom();renderMath()}

async function sendMessage(){if(isSending)return;const message=userInput.value.trim();if(!message&&!selectedFiles.length)return;if(!currentChat)newChat();if(uploadCount()+selectedFiles.length>MAX_FILES){addBotMessage(`**Upload limit reached.** You can use at most ${MAX_FILES} files in this chat.`);return}const requestText=message||"Please inspect the attached file(s) and teach me what they contain.";if(currentChat.title==="New Chat"){currentChat.title=createChatTitle(requestText);renderChats()}const filesThis=selectedFiles.map(x=>x.file);addUserMessage(message||"Please inspect the attached file(s).",filesThis);userInput.value="";updateCount();resizeInput();showTyping();isSending=true;setSendState(true);try{const awake=await wakeServer(()=>{removeTyping();chatBox.insertAdjacentHTML("beforeend",`<div class="message bot" id="typing-indicator"><strong>CaptainAI</strong><div class="message-content">Waking up the backend — Render free tier sleeps after inactivity, this can take up to a minute...</div></div>`);scrollBottom()});removeTyping();if(!awake){setStatus("offline","System offline");addBotMessage(`**Cannot reach the backend.**\n\nSelected backend:\n\`${API_URL}\`\n\nIt didn't respond to a health check within 55s. Check that the Render service is deployed and running (not crashed/suspended) — visit \`${API_URL}/health\` directly in a new tab to confirm.`);return}showTyping();const form=new FormData();form.append("text",requestText);form.append("mode","normal");form.append("session_id",String(currentChat.id));filesThis.forEach(f=>form.append("files",f,f.name));const r=await fetch(`${API_URL}/chat`,{method:"POST",body:form});removeTyping();let data;try{data=await r.json()}catch{throw new Error(`Backend returned invalid JSON (HTTP ${r.status})`)}console.log("Backend status:",r.status,data);if(!r.ok){const detail=Array.isArray(data?.detail)?data.detail.map(x=>`${Array.isArray(x.loc)?x.loc.join("."):"request"}: ${x.msg}`).join("\n"):data?.detail||data?.response||`HTTP ${r.status}`;addBotMessage(`**Server error**\n\n${detail}`);return}const reply=data?.response;if(typeof reply!=="string"||!reply.trim()){addBotMessage("The server responded, but CaptainAI returned an empty response.");return}if(Number.isFinite(Number(data?.uploads_used)))setUploadCount(Number(data.uploads_used));setStatus("online","System online");addBotMessage(reply)}catch(e){removeTyping();setStatus("offline","System offline");serverAwake=false;console.error("Fetch error:",e);addBotMessage(e instanceof TypeError?`**Cannot connect to CaptainAI.**\n\nSelected backend:\n\`${API_URL}\`\nPage origin:\n\`${location.origin}\`\n\nThe health check just passed but this request still failed at the network level, so it's almost certainly **CORS**: the backend's allowed origins list doesn't include the origin above. Check \`allow_origins\` in \`backend/main.py\` and the CORS config on Render.`:`**Request failed.**\n\n${e.message}`)}finally{isSending=false;setSendState(false);clearSelectedFiles();saveChats();renderChats();scrollBottom()}}

function setup(){configureMarkdown();loadChats();renderChats();updateEmpty();updateCount();resizeInput();setupSuggestions();userInput.addEventListener("input",()=>{updateCount();resizeInput()});userInput.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}});composerPlus?.addEventListener("click",()=>fileInput?.click());fileInput?.addEventListener("change",e=>{addSelectedFiles(e.target.files);e.target.value=""});mobileMenuButton?.addEventListener("click",openMobileSidebar);mobileBackdrop?.addEventListener("click",closeMobileSidebar);document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();newChat()}if(e.key==="Escape")closeMobileSidebar()});startServerMonitor();console.log("Mentor.CaptainAI frontend starting...",{API_URL})}
function openMobileSidebar(){sidebar.classList.add("mobile-open");mobileBackdrop.classList.add("visible")}
function closeMobileSidebar(){sidebar.classList.remove("mobile-open");mobileBackdrop.classList.remove("visible")}
function setupSuggestions(){document.querySelectorAll(".suggestion-card").forEach(b=>b.addEventListener("click",()=>{userInput.value=b.dataset.prompt||"";updateCount();resizeInput();userInput.focus();sendMessage()}))}

setup();
