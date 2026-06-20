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
let isLoadingMore = false;
let activeBookSlug = ""; 
let activeBookTitle = "";

function getBatchSize() {
    let cols = 2; 
    if (window.innerWidth >= 768) {
        const container = document.getElementById("bookContainer");
        if (container && container.clientWidth) {
            cols = Math.floor((container.clientWidth + 25) / 225) || 1;
        } else {
            cols = 4; 
        }
    }
    return cols * 4; 
}

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
    
    const searchInput = document.getElementById('app-search-input').value;
    if(searchInput.trim() === "") {
        window.renderBooksUI(0, getBatchSize() * 2);
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
    
    document.getElementById("dlPdfLinkBtn").onclick = function() {
        if(book.pdfLink) window.open(book.pdfLink, '_blank');
    };

    document.getElementById("dlYoutubeLinkBtn").onclick = function() {
        if(book.ytLink && book.ytLink !== "#") {
            window.open(book.ytLink, '_blank');
        }
    };

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

function performSearch(searchText) {
    const term = searchText.toLowerCase();
    const filteredData = window.booksData.filter(book => 
        book.title.toLowerCase().includes(term) || 
        book.author.toLowerCase().includes(term)
    );
    
    if(filteredData.length > 0) {
        window.renderBooksUI(0, filteredData.length, filteredData); 
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
        window.renderBooksUI(0, getBatchSize() * 2); 
    } else {
        performSearch(searchText);
    }
});

const mainElement = document.getElementById('mainContentArea');
mainElement.addEventListener('scroll', () => {
    if(document.getElementById('app-search-input').value.trim() !== "") return;

    if (mainElement.scrollTop + mainElement.clientHeight >= mainElement.scrollHeight - 50) {
        const noResultsMsg = document.getElementById('no-results-msg');
        if (loadedCount < window.booksData.length && !isLoadingMore && noResultsMsg.style.display !== 'flex') {
            isLoadingMore = true;
            document.getElementById("bottomSpinner").style.display = "flex";
            setTimeout(() => {
                window.renderBooksUI(loadedCount, getBatchSize());
                document.getElementById("bottomSpinner").style.display = "none";
                isLoadingMore = false;
            }, 1000); 
        }
    }
});

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

// 🔥 BUG FIX 1: Jab koi bhi popup close ho, toh Active Menu hamesha 'Home' par reset ho
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
    updateActiveMenuState('menu-home'); // Ensures UI instantly resets to Home
}

window.addEventListener('popstate', (e) => {
    document.getElementById("downloadModal").style.display = "none";
    document.getElementById('noti-panel').classList.remove('active');
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
    document.getElementById('about-dev-panel').classList.remove('active');
    document.getElementById('dmca-panel').classList.remove('active');
    document.getElementById("popupOverlay").style.display = "none";

    const sBook = new URLSearchParams(window.location.search).get('book');
    if(sBook) {
        if(window.openDownloadPage) window.openDownloadPage(sBook, true); 
    } else {
        // 🔥 BUG FIX 2: Mobile device ke back button dabane par bhi Home reset hoga
        if (!e.state || (e.state && !e.state.popup)) {
            updateActiveMenuState('menu-home');
        }
        
        if (!e.state || e.state.popup !== 'search') {
            document.getElementById('search-box').classList.remove('active');
            
            const searchInput = document.getElementById('app-search-input');
            if(searchInput.value.trim() !== '') {
                searchInput.value = '';
                document.getElementById('no-results-msg').style.display = 'none';
                window.renderBooksUI(0, getBatchSize() * 2); 
            }
        }
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
    window.renderBooksUI(0, getBatchSize() * 2);
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

// 🔥 BUG FIX 3: Jab bhi Sidebar UI button se khulega, toh strictly 'Home' par hi selection hoga
menuBtn.addEventListener('click', () => { 
    updateActiveMenuState('menu-home'); // Force set Home selection
    history.pushState({ popup: 'sidebar' }, '');
    sidebar.classList.add('active'); 
    sidebarOverlay.classList.add('active'); 
});
sidebarOverlay.addEventListener('click', goBack);


const mainMenuIDs = ['menu-home', 'menu-about-dev', 'menu-contact', 'menu-dmca'];
function updateActiveMenuState(clickedId) {
    mainMenuIDs.forEach(id => {
        const el = document.getElementById(id);
        if (el) { 
            el.classList.remove('active'); 
            el.classList.add('normal'); 
        }
    });
    const activeEl = document.getElementById(clickedId);
    if (activeEl) { 
        activeEl.classList.remove('normal'); 
        activeEl.classList.add('active'); 
    }
}

// 🔥 BUG FIX 4: Home button ko manual replaceState ki jagah goBack de diya taaki history kharab na ho
document.getElementById('menu-home').addEventListener('click', (e) => { 
    e.preventDefault(); 
    updateActiveMenuState('menu-home');
    goBack(); 
});

document.getElementById('menu-about-dev').addEventListener('click', (e) => {
    e.preventDefault();
    updateActiveMenuState('menu-about-dev');
    history.replaceState({ popup: 'dev' }, ''); 
    document.getElementById('about-dev-panel').classList.add('active');
    document.getElementById('dmca-panel').classList.remove('active');
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
});

document.getElementById('menu-dmca').addEventListener('click', (e) => {
    e.preventDefault();
    updateActiveMenuState('menu-dmca');
    history.replaceState({ popup: 'dmca' }, ''); 
    document.getElementById('dmca-panel').classList.add('active');
    document.getElementById('about-dev-panel').classList.remove('active');
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
});

const urls = { contact: "https://t.me/Multiverse_Contact_Bot", whatsapp: "https://whatsapp.com/channel/0029Vb6NBZx1yT2GByTTVf2A", telegram: "https://t.me/MultiverseBooks", instagram: "https://www.instagram.com/madxprince_3030", youtube: "https://youtube.com/@madxprince" };
document.getElementById('menu-contact').addEventListener('click', (e) => { 
    e.preventDefault(); 
    updateActiveMenuState('menu-contact'); 
    window.open(urls.contact, '_blank'); 
    goBack(); 
});

document.getElementById('link-whatsapp').addEventListener('click', () => { window.open(urls.whatsapp, '_blank'); });
document.getElementById('link-telegram').addEventListener('click', () => { window.open(urls.telegram, '_blank'); });
document.getElementById('link-insta').addEventListener('click', () => { window.open(urls.instagram, '_blank'); });
document.getElementById('link-youtube').addEventListener('click', () => { window.open(urls.youtube, '_blank'); });

document.getElementById('close-dev-btn').addEventListener('click', goBack);
document.getElementById('close-dmca-btn').addEventListener('click', goBack);

const quotes = [
    { text: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi" },
    { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas A. Edison" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Whatever you are, be a good one.", author: "Abraham Lincoln" },
    { text: "The time is always right to do what is right.", author: "Martin Luther King Jr." },
    { text: "If you tell the truth, you don't have to remember anything.", author: "Mark Twain" },
    { text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
    { text: "A person who never made a mistake never tried anything new.", author: "Albert Einstein" },
    { text: "The purpose of our lives is to be happy.", author: "Dalai Lama" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    { text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
    { text: "Tough times never last, but tough people do.", author: "Robert H. Schuller" },
    { text: "Imagination is more important than knowledge.", author: "Albert Einstein" },
    { text: "That which does not kill us makes us stronger.", author: "Friedrich Nietzsche" },
    { text: "No one can make you feel inferior without your consent.", author: "Eleanor Roosevelt" },
    { text: "You only live once, but if you do it right, once is enough.", author: "Mae West" },
    { text: "A room without books is like a body without a soul.", author: "Marcus Tullius Cicero" },
    { text: "Be yourself; everyone else is already taken.", author: "Oscar Wilde" },
    { text: "Happiness depends upon ourselves.", author: "Aristotle" },
    { text: "The mind is everything. What you think you become.", author: "Buddha" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
    { text: "To love and be loved is to feel the sun from both sides.", author: "David Viscott" },
    { text: "Every moment is a fresh beginning.", author: "T.S. Eliot" },
    { text: "Never let the fear of striking out keep you from playing the game.", author: "Babe Ruth" },
    { text: "The best way to predict your future is to create it.", author: "Abraham Lincoln" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" }
];


const todayDays = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
const currentQuoteIndex = todayDays % quotes.length;
document.getElementById('daily-quote-text').innerHTML = `<i class="fas fa-quote-left" style="color: rgba(255,255,255,0.3); margin-right:5px;"></i> ${quotes[currentQuoteIndex].text}`;
document.getElementById('daily-quote-author').innerText = `— ${quotes[currentQuoteIndex].author}`;
