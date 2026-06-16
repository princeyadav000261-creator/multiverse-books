import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const p1 = "AIzaSyAXB";
const p2 = "SGCZFdkSbk-Ireoo7";
const p3 = "sRY4mLzS25nyk";

const firebaseConfig = {
    apiKey: p1 + p2 + p3,
    authDomain: "multiverse-books-2.firebaseapp.com",
    projectId: "multiverse-books-2",
    storageBucket: "multiverse-books-2.firebasestorage.app",
    messagingSenderId: "59280260709",
    appId: "1:59280260709:web:ef05fbe489ce2ee41e108c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.booksData = [];
let loadedCount = 0; 

const initialLoad = window.innerWidth >= 768 ? 24 : 8;
let isLoadingMore = false;
let activeBookSlug = ""; 
let activeBookTitle = "";

const q = query(collection(db, "books"), orderBy("createdAt", "desc"));

onSnapshot(q, (snapshot) => {
    window.booksData = [];
    snapshot.forEach((doc) => {
        let data = doc.data();
        data.id = doc.id;
        data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        window.booksData.push(data);
    });
    
    document.getElementById("bookContainer").innerHTML = "";
    loadedCount = 0;
    
    // Check if we are searching something while data loads
    const searchInput = document.getElementById('app-search-input').value;
    if(searchInput.trim() === "") {
        window.renderBooksUI(0, initialLoad);
    } else {
        performSearch(searchInput);
    }
    
    window.generateNotifications();
    
    const sBook = new URLSearchParams(window.location.search).get('book');
    if(sBook) window.openDownloadPage(sBook, true);
});

window.renderBooksUI = function(startIndex, count, customData = null) {
    const container = document.getElementById("bookContainer");
    let dataToRender = customData ? customData : window.booksData;
    let endIndex = Math.min(startIndex + count, dataToRender.length);

    // If starting fresh, clear container
    if(startIndex === 0) container.innerHTML = "";

    for(let i = startIndex; i < endIndex; i++) {
        let book = dataToRender[i];
        let langClass = book.lang.toLowerCase() === 'hindi' ? 'tag-lang-hindi' : 'tag-lang-english';
        
        container.innerHTML += `
        <div class="book-card" onclick="openDownloadPage('${book.slug}')">
            <div class="card-img-wrapper">
                <div class="badge-free">FREE</div>
                <img src="${book.image}" class="book-image" oncontextmenu="return false;" draggable="false">
            </div>
            <div class="book-details">
                <div class="book-title">${book.title}</div>
                <div class="book-author">${book.author}</div>
                <div class="tags-container">
                    <span class="book-tag tag-year">${book.year}</span>
                    <span class="book-tag ${langClass}">${book.lang}</span>
                </div>
            </div>
        </div>`;
    }
    loadedCount = endIndex;
}

window.generateNotifications = function() {
    const notiContainer = document.getElementById('dynamic-noti-container');
    notiContainer.innerHTML = ''; 
    const recentBooks = window.booksData.slice(0, 30);
    
    recentBooks.forEach((book) => {
        notiContainer.innerHTML += `
        <div class="noti-card-dynamic" onclick="openDownloadPage('${book.slug}')" style="cursor:pointer;">
            <img src="${book.image}" class="noti-card-img" alt="Book Logo">
            <div class="noti-card-content">
                <div class="noti-card-title">${book.title} Book Added ✅</div>
                <div class="noti-card-desc">New book is now available in library for download.</div>
                <div class="noti-date">${book.dateAdded || 'Recently'}</div> 
            </div>
        </div>`;
    });
}

window.openDownloadPage = function(slug, skipPushState = false) {
    const book = window.booksData.find(b => b.slug === slug);
    if(!book) return;
    document.getElementById("downloadModal").style.display = "flex";
    document.getElementById("dlPreviewImage").src = book.image;
    document.getElementById("dlBookTitle").innerText = book.title;
    document.getElementById("dlBookAuthor").innerText = book.author;
    document.getElementById("dlPdfLink").href = book.pdfLink;
    document.getElementById("dlYoutubeLink").href = book.ytLink || "#";

    let examsArray = (book.exams || "General").split(',').map(item => item.trim());
    document.getElementById("dlModalTags").innerHTML = examsArray.map(exam => `<div class="dl-modal-tag">${exam}</div>`).join('');
    
    activeBookSlug = book.slug;
    activeBookTitle = book.title;
    
    if (!skipPushState) { history.pushState({ popup: 'book' }, '', '?book=' + book.slug); }
}

window.closeDownloadPage = function() {
    if (history.state && history.state.popup === 'book') { history.back(); } 
    else { document.getElementById("downloadModal").style.display = "none"; window.history.replaceState({}, '', window.location.pathname); }
}

window.shareBook = function() {
    const shareUrl = window.location.origin + window.location.pathname + "?book=" + activeBookSlug;
    if (navigator.share) navigator.share({ title: activeBookTitle, text: "Download free book", url: shareUrl });
    else { navigator.clipboard.writeText(shareUrl); alert("Link Copied!"); }
}

// Optimized Search Function
function performSearch(searchText) {
    const term = searchText.toLowerCase();
    const filteredData = window.booksData.filter(book => 
        book.title.toLowerCase().includes(term) || 
        book.author.toLowerCase().includes(term)
    );
    
    if(filteredData.length > 0) {
        window.renderBooksUI(0, filteredData.length, filteredData); // Render all matches
        document.getElementById('no-results-msg').style.display = 'none';
    } else {
        document.getElementById("bookContainer").innerHTML = "";
        document.getElementById('no-results-msg').style.display = 'flex';
    }
}

document.getElementById('app-search-input').addEventListener('input', (e) => {
    const searchText = e.target.value;
    if(searchText.trim() === "") {
        document.getElementById('no-results-msg').style.display = 'none';
        window.renderBooksUI(0, initialLoad); // Reset to default load
    } else {
        performSearch(searchText);
    }
});

const mainElement = document.getElementById('mainContentArea');
mainElement.addEventListener('scroll', () => {
    // Only load more if search is empty
    if(document.getElementById('app-search-input').value.trim() !== "") return;

    if (mainElement.scrollTop + mainElement.clientHeight >= mainElement.scrollHeight - 50) {
        const noResultsMsg = document.getElementById('no-results-msg');
        if (loadedCount < window.booksData.length && !isLoadingMore && noResultsMsg.style.display !== 'flex') {
            isLoadingMore = true;
            document.getElementById("bottomSpinner").style.display = "flex";
            setTimeout(() => {
                window.renderBooksUI(loadedCount, 8);
                document.getElementById("bottomSpinner").style.display = "none";
                isLoadingMore = false;
            }, 1000); 
        }
    }
});

// --- CANVAS ANIMATION LOGIC ---
const canvas = document.getElementById('networkCanvas');
const ctx = canvas.getContext('2d');
let width, height;
let hexagons = [];
let animationId;

function initHex() {
    hexagons = [];
    const R = 32; 
    const X_OFFSET = R * 1.5;
    const Y_OFFSET = Math.sqrt(3) * R;
    const cols = Math.ceil(width / X_OFFSET) + 2;
    const rows = Math.ceil(height / Y_OFFSET) + 2;

    for (let q = -1; q < cols; q++) {
        for (let r = -1; r < rows; r++) {
            let x = q * X_OFFSET; let y = r * Y_OFFSET;
            if (q % 2 !== 0) y += Y_OFFSET / 2;
            let rand = Math.random();
            if (rand > 0.45) {
                hexagons.push({ x: x, y: y, type: 'main', blinkOffset: Math.random() * Math.PI * 2, blinkSpeed: 0.001 + Math.random() * 0.0015 });
            } else if (rand > 0.15) {
                hexagons.push({ x: x + 15, y: y + 15, type: 'bg', blinkOffset: Math.random() * Math.PI * 2, blinkSpeed: 0.0008 });
            }
        }
    }
}

function drawHexagon(x, y, alpha, type) {
    ctx.beginPath();
    const R = 32;
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const hx = x + R * Math.cos(angle);
        const hy = y + R * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
    }
    ctx.closePath();

    if (type === 'main') {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`; 
        ctx.lineWidth = 0.5; 
    } else {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.15})`; 
        ctx.lineWidth = 0.2;
    }
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const hx = x + R * Math.cos(angle);
        const hy = y + R * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(hx, hy, type === 'main' ? 1.5 : 0.8, 0, Math.PI * 2);
        if (type === 'main') ctx.fillStyle = ctx.strokeStyle; 
        else ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.2})`;
        ctx.fill();
    }
}

function animateHex(time) {
    ctx.clearRect(0, 0, width, height);
    hexagons.forEach(hex => {
        let alpha = 0.5 + 0.5 * Math.sin(time * hex.blinkSpeed + hex.blinkOffset);
        drawHexagon(hex.x, hex.y, alpha, hex.type);
    });
    animationId = requestAnimationFrame(animateHex);
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    initHex(); 
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
animateHex(0);

window.addEventListener("load", () => {
    setTimeout(() => {
        const loader = document.getElementById("loaderScreen");
        document.getElementById("popupOverlay").style.display = "flex";
        loader.style.opacity = "0";
        loader.style.visibility = "hidden";
        setTimeout(() => { 
            cancelAnimationFrame(animationId);
            loader.remove(); 
        }, 600); 
    }, 3000); 
});

window.closePopup = function(){ document.getElementById("popupOverlay").style.display = "none"; };
window.joinChannel = function(){ window.open('https://whatsapp.com/channel/0029Vb6NBZx1yT2GByTTVf2A', '_blank'); };

function closeActiveModals() {
    document.getElementById('search-box').classList.remove('active');
    document.getElementById('noti-panel').classList.remove('active');
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
    document.getElementById('about-dev-panel').classList.remove('active');
    document.getElementById('dmca-panel').classList.remove('active');
    document.getElementById("downloadModal").style.display = "none";
    document.getElementById("popupOverlay").style.display = "none";
    document.getElementById("no-results-msg").style.display = "none";
}

window.addEventListener('popstate', (e) => {
    closeActiveModals();
    const sBook = new URLSearchParams(window.location.search).get('book');
    if(sBook) {
        if(window.openDownloadPage) window.openDownloadPage(sBook, true); 
    } else {
        updateActiveMenuState('menu-home');
        document.getElementById('app-search-input').value = '';
        window.renderBooksUI(0, initialLoad);
    }
});

function goBack() {
    if (history.state && history.state.popup) { history.back(); } else { closeActiveModals(); }
}

const searchBtn = document.getElementById('open-search');
const closeSearchBtn = document.getElementById('close-search');
const searchBox = document.getElementById('search-box');
const liveSearchInput = document.getElementById('app-search-input');

searchBtn.addEventListener('click', () => {
    history.pushState({ popup: 'search' }, ''); 
    searchBox.classList.add('active');
    setTimeout(() => { liveSearchInput.focus(); }, 300);
});

closeSearchBtn.addEventListener('click', () => {
    liveSearchInput.value = '';
    window.renderBooksUI(0, initialLoad);
    document.getElementById('no-results-msg').style.display = 'none';
    goBack();
});

const notiBtn = document.getElementById('open-noti');
const closeNotiBtn = document.getElementById('close-noti');
const notiPanel = document.getElementById('noti-panel');

notiBtn.addEventListener('click', () => {
    history.pushState({ popup: 'noti' }, '');
    notiPanel.classList.add('active');
    document.querySelector('.blink-dot').style.display = 'none'; 
});
closeNotiBtn.addEventListener('click', goBack);

const menuBtn = document.getElementById('open-menu');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

menuBtn.addEventListener('click', () => { 
    history.pushState({ popup: 'sidebar' }, '');
    sidebar.classList.add('active'); 
    sidebarOverlay.classList.add('active'); 
});
sidebarOverlay.addEventListener('click', goBack);

const mainMenuIDs = ['menu-home', 'menu-about-dev', 'menu-contact', 'menu-dmca'];
function updateActiveMenuState(clickedId) {
    mainMenuIDs.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('active'); el.classList.add('normal'); }
    });
    const activeEl = document.getElementById(clickedId);
    if (activeEl) { activeEl.classList.remove('normal'); activeEl.classList.add('active'); }
}

const aboutDevPanel = document.getElementById('about-dev-panel');
const dmcaPanel = document.getElementById('dmca-panel');

document.getElementById('menu-home').addEventListener('click', (e) => { e.preventDefault(); goBack(); });

document.getElementById('menu-about-dev').addEventListener('click', (e) => {
    e.preventDefault();
    updateActiveMenuState('menu-about-dev');
    history.replaceState({ popup: 'dev' }, ''); 
    aboutDevPanel.classList.add('active');
    dmcaPanel.classList.remove('active');
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
});

document.getElementById('menu-dmca').addEventListener('click', (e) => {
    e.preventDefault();
    updateActiveMenuState('menu-dmca');
    history.replaceState({ popup: 'dmca' }, ''); 
    dmcaPanel.classList.add('active');
    aboutDevPanel.classList.remove('active');
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
});

const urls = { contact: "https://t.me/Multiverse_Contact_Bot", whatsapp: "https://whatsapp.com/channel/0029Vb6NBZx1yT2GByTTVf2A", telegram: "https://t.me/MultiverseBooks", instagram: "https://www.instagram.com/madxprince_3030", youtube: "https://youtube.com/@madxprince" };
document.getElementById('menu-contact').addEventListener('click', (e) => { e.preventDefault(); updateActiveMenuState('menu-contact'); window.open(urls.contact, '_blank'); goBack(); });
document.getElementById('link-whatsapp').addEventListener('click', () => { window.open(urls.whatsapp, '_blank'); });
document.getElementById('link-telegram').addEventListener('click', () => { window.open(urls.telegram, '_blank'); });
document.getElementById('link-insta').addEventListener('click', () => { window.open(urls.instagram, '_blank'); });
document.getElementById('link-youtube').addEventListener('click', () => { window.open(urls.youtube, '_blank'); });

document.getElementById('close-dev-btn').addEventListener('click', goBack);
document.getElementById('close-dmca-btn').addEventListener('click', goBack);

const quotes = [
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "All that I am, or hope to be, I owe to my angel mother.", author: "Abraham Lincoln" }
];

const todayDays = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
const currentQuoteIndex = todayDays % quotes.length;
document.getElementById('daily-quote-text').innerHTML = `<i class="fas fa-quote-left" style="color: rgba(255,255,255,0.3); margin-right:5px;"></i> ${quotes[currentQuoteIndex].text}`;
document.getElementById('daily-quote-author').innerText = `— ${quotes[currentQuoteIndex].author}`;
