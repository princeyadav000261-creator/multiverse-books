import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, setDoc, getDoc, increment, getDocs, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";

// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyASYcouPGDMx5_V9ZUZ3RcFifCxcbpcst8",
  authDomain: "spidy-book-dbe32.firebaseapp.com",
  projectId: "spidy-book-dbe32",
  storageBucket: "spidy-book-dbe32.firebasestorage.app",
  messagingSenderId: "681583149252",
  appId: "1:681583149252:web:f679d1847cd749d0a7c991",
  measurementId: "G-DKH77K3KEH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const analytics = getAnalytics(app); 

// ==========================================
// 2. R2 PUBLIC URL (For Cover Images)
// ==========================================
const R2_PUBLIC_IMAGE_URL = "https://your-cloudflare-public-domain.r2.dev"; 

// ==========================================
// GLOBAL VARIABLES
// ==========================================
let booksData = [];
let mainFilteredData = []; 
let loadedCount = 0; 
let isLoadingMore = false;
let activeBookSlug = ""; 
let activeBookTitle = "";

let IS_SUPER_ADMIN = false;
let isUserLoggedIn = false; 

let CURRENT_ADMIN_NAME = "USER";
let CURRENT_ADMIN_PHOTO = "https://i.postimg.cc/D0BF1b77/file-000000000e847207a64f6711d825a859.png";

let savedBooks = JSON.parse(localStorage.getItem('spidy_saved_books')) || [];
let selectedCoverFile = null;
let selectedPdfFile = null;

let timeTrackerInterval = null; 

// ==========================================
// UTILITY FUNCTIONS & PREMIUM TOAST
// ==========================================
function sanitizeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, function(match) {
        const escape = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return escape[match];
    });
}

let globalToastTimeout;
window.showToast = function(message, type = 'success') {
    const toast = document.getElementById('customToast');
    if(!toast) return; 
    
    clearTimeout(globalToastTimeout);
    
    toast.innerHTML = type === 'success' 
        ? `<i class="fas fa-circle-check" style="color: #10b981; font-size: 16px;"></i> ${sanitizeHTML(message)}`
        : `<i class="fas fa-circle-exclamation" style="color: #ef4444; font-size: 16px;"></i> ${sanitizeHTML(message)}`;
    
    toast.style.borderLeft = type === 'success' ? '4px solid #10b981' : '4px solid #ef4444';

    toast.classList.remove('show');
    void toast.offsetWidth; 
    toast.classList.add('show');

    globalToastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 2000);
}

function generateDeviceFingerprint() {
    const nav = window.navigator; const screen = window.screen;
    const str = nav.userAgent + nav.language + screen.colorDepth + screen.width + screen.height + new Date().getTimezoneOffset();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        let char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char; hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

// ==========================================
// 🌟 PREMIUM DUAL POPUPS LOGIC 🌟
// ==========================================
let popupsInitialized = false;
function initPremiumPopups() {
    if(popupsInitialized) return; popupsInitialized = true;
    const telegramPopup = document.getElementById('telegramPopup');
    const whatsappPopup = document.getElementById('whatsappPopup');
    const closeTgPopup = () => { if(telegramPopup) telegramPopup.classList.add('hide'); };
    const closeWaPopup = () => { if(whatsappPopup) whatsappPopup.classList.add('hide'); };

    document.getElementById('tgMaybeLaterBtn')?.addEventListener('click', closeTgPopup);
    document.getElementById('waMaybeLaterBtn')?.addEventListener('click', closeWaPopup);
    telegramPopup?.addEventListener('click', (e) => { if (e.target === telegramPopup) closeTgPopup(); });
    whatsappPopup?.addEventListener('click', (e) => { if (e.target === whatsappPopup) closeWaPopup(); });

    setTimeout(() => { if(telegramPopup) telegramPopup.classList.remove('hide'); }, 30000); 
    setTimeout(() => { if(telegramPopup) telegramPopup.classList.add('hide'); if(whatsappPopup) whatsappPopup.classList.remove('hide'); }, 100000); 
}

// ==========================================
// INITIAL LOADER & DEEP LINKING
// ==========================================
const urlParamsCheck = new URLSearchParams(window.location.search);
let isDeepLinkLoad = urlParamsCheck.has('book'); 
let pendingBookSlug = urlParamsCheck.get('book');

if (isDeepLinkLoad) {
    document.getElementById('mainAppWrapper').style.display = 'none';
    document.getElementById('downloadModal').style.display = 'none';
}

let isAppReady = { auth: false, data: false }; 
let hasTransitioned = false;
let loadingProgress = 0;

function updateLoaderUI(percent) {
    const loaderFill = document.getElementById('loaderFill');
    const loaderPercentage = document.getElementById('loaderPercentage');
    const loaderStatusText = document.getElementById('loaderStatusText');
    if (loaderFill) loaderFill.style.width = percent + "%";
    if (loaderPercentage) loaderPercentage.innerText = percent + "%";
    if (loaderStatusText) {
        if (percent < 30) loaderStatusText.innerText = "Initializing System...";
        else if (percent < 60) loaderStatusText.innerText = "Fetching Secure Data...";
        else if (percent < 95) loaderStatusText.innerText = "Preparing Content...";
        else loaderStatusText.innerText = "Ready to Launch!";
    }
}

let loaderInterval = setInterval(() => {
    if (loadingProgress < 85) {
        loadingProgress += Math.floor(Math.random() * 5) + 2; 
        if (loadingProgress > 85) loadingProgress = 85;
        updateLoaderUI(loadingProgress);
    }
}, 200);

function tryTransition() {
    if (isAppReady.auth && isAppReady.data && !hasTransitioned) {
        hasTransitioned = true; clearInterval(loaderInterval); 
        
        let fastLoad = setInterval(() => {
            loadingProgress += 4;
            if(loadingProgress >= 100) {
                loadingProgress = 100; updateLoaderUI(100); clearInterval(fastLoad);

                setTimeout(() => {
                    document.getElementById('mainAppWrapper').style.display = 'block';
                    if (isDeepLinkLoad && pendingBookSlug) {
                        if (isUserLoggedIn) { openDownloadPageLocal(pendingBookSlug, true); } 
                        else { openPanelWithHistory('loginOverlay'); }
                    } else { initPremiumPopups(); }
                    
                    const loader = document.getElementById("loaderScreen");
                    loader.style.opacity = "0"; setTimeout(() => { loader.style.display = "none"; }, 300);
                }, 400); 
            } else { updateLoaderUI(loadingProgress); }
        }, 15);
    }
}

// Quote Generator
const quotes = [
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Whatever you are, be a good one.", author: "Abraham Lincoln" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" }
];
const currentQuoteIndex = Math.floor(Date.now() / 86400000) % quotes.length;
document.getElementById('daily-quote-text').innerHTML = `<i class="fas fa-quote-left" style="color: rgba(255,255,255,0.3); margin-right:5px;"></i> ${sanitizeHTML(quotes[currentQuoteIndex].text)}`;
document.getElementById('daily-quote-author').innerText = `— ${sanitizeHTML(quotes[currentQuoteIndex].author)}`;

// ==========================================
// 🚀 CREDITS, TIME-TRACKING & ME PROFILE
// ==========================================
async function updateProfileUI() {
    if (!isUserLoggedIn || !auth.currentUser) return;
    
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            let now = Date.now();
            let accessedSlugs = new Set();
            
            (data.recentDownloads || []).forEach(item => {
                let time = typeof item === 'number' ? item : item.time;
                let slug = typeof item === 'number' ? null : item.slug;
                if (now - time < 24 * 60 * 60 * 1000) { if(slug) accessedSlugs.add(slug); }
            });

            let remainingCredits = IS_SUPER_ADMIN ? "&infin;" : Math.max(0, 20 - accessedSlugs.size);
            document.getElementById('profile-credits').innerHTML = remainingCredits;

            let booksReadCount = data.readSlugs ? data.readSlugs.length : 0;
            let totalBooksCount = booksData.length || 0;
            document.getElementById('profile-downloads').innerText = `${booksReadCount} / ${totalBooksCount}`;

            const usersRef = collection(db, "users");
            const querySnapshot = await getDocs(usersRef);
            let allUsers = [];
            querySnapshot.forEach((docSnap) => { allUsers.push({ id: docSnap.id, ...docSnap.data() }); });
            
            allUsers.sort((a, b) => (b.totalTimeSpent || 0) - (a.totalTimeSpent || 0));
            
            let rank = 1; 
            for (let i = 0; i < allUsers.length; i++) { if (allUsers[i].id === auth.currentUser.uid) { rank = i + 1; break; } }
            
            const rankElement = document.getElementById('profile-rank');
            if (rank === 1) { rankElement.style.color = "#fbbf24"; rankElement.innerHTML = `<i class="fas fa-crown"></i> #1`; } 
            else { rankElement.style.color = "#ffffff"; rankElement.innerHTML = `#${rank}`; }
        }
        
        document.getElementById('profile-saved').innerText = savedBooks.length;
    } catch (error) { console.error("Error updating profile stats", error); }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        isUserLoggedIn = true; localStorage.setItem('isUserLoggedIn', 'true');

        let dName = user.displayName || user.email.split('@')[0];
        document.getElementById('sidebarProfileName').innerText = sanitizeHTML(dName);
        document.getElementById('profile-name-ui').innerText = sanitizeHTML(dName);
        document.getElementById('profile-email-ui').innerText = sanitizeHTML(user.email);
        
        CURRENT_ADMIN_PHOTO = user.photoURL ? user.photoURL : "https://i.postimg.cc/D0BF1b77/file-000000000e847207a64f6711d825a859.png";
        document.getElementById('sidebarProfileImg').src = CURRENT_ADMIN_PHOTO;
        document.getElementById('profile-avatar-ui').src = CURRENT_ADMIN_PHOTO;

        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            const cleanEmail = user.email ? user.email.toLowerCase().trim() : "";
            const adminDocRef = doc(db, "admins", cleanEmail);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists()) {
                IS_SUPER_ADMIN = true; document.getElementById('sidebarRoleText').innerText = "Super Admin";
            } else {
                IS_SUPER_ADMIN = false; document.getElementById('sidebarRoleText').innerText = "Verified User";
                document.getElementById('sectionAddBook').classList.remove('active'); 
                document.getElementById('sectionPrompt').classList.add('active'); 
            }

            if (!userSnap.exists()) {
                await setDoc(userRef, { email: user.email, name: dName, photo: user.photoURL || "", recentDownloads: [], readSlugs: [], totalTimeSpent: 0, createdAt: new Date().getTime() }, { merge: true });
            }

            if(!timeTrackerInterval) {
                timeTrackerInterval = setInterval(async () => {
                    if (isUserLoggedIn && auth.currentUser) {
                        try { await updateDoc(doc(db, "users", auth.currentUser.uid), { totalTimeSpent: increment(1) }); } catch(e) {}
                    }
                }, 60000);
            }

            updateProfileUI();

        } catch (error) { console.error("Verification failed:", error); IS_SUPER_ADMIN = false; }
    } else {
        isUserLoggedIn = false; IS_SUPER_ADMIN = false; localStorage.removeItem('isUserLoggedIn');
        clearInterval(timeTrackerInterval); timeTrackerInterval = null;
        document.getElementById('sidebarProfileName').innerText = "Guest User";
        document.getElementById('sidebarRoleText').innerText = "Please Login";
        document.getElementById('profile-name-ui').innerText = "Please login";
        document.getElementById('profile-email-ui').innerText = "";
    }

    isAppReady.auth = true; tryTransition();

    // PROMPTS LISTENER
    onSnapshot(query(collection(db, "prompts"), orderBy("createdAt", "asc")), (snapshot) => {
        const container = document.getElementById('promptsContainer'); container.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data(); const safeText = sanitizeHTML(data.text); const safeTitle = sanitizeHTML(data.title);
            container.innerHTML += `<div class="telegram-prompt-wrapper"><div class="telegram-prompt-card"><div class="telegram-prompt-header">${safeTitle}</div><div class="telegram-prompt-body">${safeText}</div><div class="telegram-prompt-footer"><button class="telegram-copy-btn" onclick="navigator.clipboard.writeText('${encodeURIComponent(data.text)}'); showToast('Copied!');"><i class="far fa-copy"></i> COPY CODE</button></div></div></div>`;
        });
    });

    // BOOKS LISTENER
    const q = query(collection(db, "books"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        booksData = [];
        snapshot.forEach((doc) => {
            let data = doc.data(); data.id = doc.id;
            data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            booksData.push(data);
        });
        mainFilteredData = [...booksData]; 
        updateDynamicFilters(); applyMasterFilter(); 
        updateProfileUI(); 
        isAppReady.data = true; tryTransition();
    });
});

// ==========================================
// LOGIN & LOGOUT SYSTEM
// ==========================================
function closeLoginOverlayLocal() {
    handleCloseBackLogic(); 
    if (isDeepLinkLoad && !isUserLoggedIn) { isDeepLinkLoad = false; window.history.replaceState({}, '', window.location.pathname); initPremiumPopups(); }
}
document.getElementById('closeLoginBtn').addEventListener('click', closeLoginOverlayLocal);

document.getElementById('toggleEye').addEventListener('click', () => {
    const passInput = document.getElementById('loginPassword'); const eyeIcon = document.getElementById('toggleEye');
    if (passInput.type === 'password') { passInput.type = 'text'; eyeIcon.classList.replace('fa-eye', 'fa-eye-slash'); eyeIcon.style.color = '#00d2ff'; } 
    else { passInput.type = 'password'; eyeIcon.classList.replace('fa-eye-slash', 'fa-eye'); eyeIcon.style.color = '#a1a1aa'; }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const email = document.getElementById('loginEmail').value; const pass = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn'); const originalContent = btn.innerHTML;
    btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;"><div class="premium-loader"></div> Authenticating...</span>`;
    try { 
        await signInWithEmailAndPassword(auth, email, pass); e.target.reset(); showToast("Login Successful!", "success"); btn.innerHTML = originalContent; 
        closeLoginOverlayLocal();
        if (isDeepLinkLoad && pendingBookSlug) { document.getElementById('mainAppWrapper').style.display = 'block'; setTimeout(() => { openDownloadPageLocal(pendingBookSlug, true); }, 300); }
    } catch(err) { showToast("Failed: Invalid Credentials!", "error"); btn.innerHTML = originalContent; } 
});

document.getElementById('googleSignInBtn').addEventListener('click', async () => { 
    try { 
        await signInWithPopup(auth, provider); showToast("Google Login Successful!", "success"); closeLoginOverlayLocal();
        if (isDeepLinkLoad && pendingBookSlug) { document.getElementById('mainAppWrapper').style.display = 'block'; setTimeout(() => { openDownloadPageLocal(pendingBookSlug, true); }, 300); }
    } catch(err) { showToast("Failed: Google Sign-In Error.", "error"); } 
});

const logoutBtn = document.getElementById('admin-logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', () => { openPanelWithHistory('customLogoutOverlay'); });
document.getElementById('cancelLogoutBtn')?.addEventListener('click', handleCloseBackLogic);
document.getElementById('confirmLogoutBtn')?.addEventListener('click', async () => {
    try { await signOut(auth); localStorage.removeItem('isUserLoggedIn'); window.location.reload(); } catch (error) { showToast("Error signing out!", "error"); }
});

// ==========================================
// ADVANCED DUAL FILTER SYSTEM
// ==========================================
const EXAM_CATEGORY_MAP = {
    "Ssc": ["SSC", "CGL", "CHSL", "MTS", "CPO", "GD", "STENOGRAPHER"], "Railway": ["RAILWAY", "RRB", "NTPC", "GROUP D", "ALP"], "Defence": ["NDA", "CDS", "NAVY", "ARMY", "AIRFORCE"],
    "Banking": ["BANK", "IBPS", "SBI", "PO", "CLERK"], "Teaching": ["CTET", "STET", "UPTET", "KVS", "BPSC TRE"], "Upsc": ["UPSC", "BPSC", "UPPSC", "STATE PSC", "PCS"],
    "Police": ["POLICE", "UP POLICE", "DELHI POLICE", "BIHAR POLICE", "SI", "CONSTABLE"], "Jee": ["JEE", "IIT", "MAINS", "ADVANCED"], "Neet": ["NEET", "MEDICAL", "AIIMS"]
};
let currentSelectedCategory = "All"; let currentSelectedLanguage = "All";

function updateDynamicFilters() {
    const activeCategories = new Set();
    booksData.forEach(book => {
        if(!book.exams) return; let bookExamsString = book.exams.toUpperCase(); let matchedMainCategory = false;
        for (let mainCategory in EXAM_CATEGORY_MAP) {
            let keywords = EXAM_CATEGORY_MAP[mainCategory];
            if (keywords.some(keyword => bookExamsString.includes(keyword))) { activeCategories.add(mainCategory); matchedMainCategory = true; }
        }
        if (!matchedMainCategory) {
            book.exams.split(',').forEach(exam => { let cleanExam = exam.trim(); if (cleanExam.length > 0) activeCategories.add(cleanExam.charAt(0).toUpperCase() + cleanExam.slice(1).toLowerCase()); });
        }
    });

    const sortedCategories = Array.from(activeCategories).sort(); const catGrid = document.getElementById('categoryFilterGrid'); 
    let html = `<div class="f-pill ${currentSelectedCategory === 'All' ? 'active' : ''}" data-category="All">All</div>`;
    sortedCategories.forEach(category => { html += `<div class="f-pill ${category === currentSelectedCategory ? 'active' : ''}" data-category="${sanitizeHTML(category)}">${sanitizeHTML(category)}</div>`; });
    catGrid.innerHTML = html;
}

document.getElementById('categoryFilterGrid').addEventListener('click', (e) => {
    if(e.target.classList.contains('f-pill')) { document.querySelectorAll('#categoryFilterGrid .f-pill').forEach(el => el.classList.remove('active')); e.target.classList.add('active'); currentSelectedCategory = e.target.getAttribute('data-category'); }
});
document.getElementById('languageFilterGrid').addEventListener('click', (e) => {
    if(e.target.classList.contains('f-pill')) { document.querySelectorAll('#languageFilterGrid .f-pill').forEach(el => el.classList.remove('active')); e.target.classList.add('active'); currentSelectedLanguage = e.target.getAttribute('data-lang'); }
});
document.getElementById('applyFiltersBtn').addEventListener('click', () => { handleCloseBackLogic(); applyMasterFilter(); });

function applyMasterFilter() {
    const searchInputRaw = document.getElementById('app-search-input').value.trim(); const searchStr = searchInputRaw.toLowerCase();
    let normalizedSearch = searchInputRaw.toLowerCase().replace(/[^a-z0-9\s]/g, ''); let searchTokens = normalizedSearch.split(/\s+/).filter(token => token.length > 0);

    mainFilteredData = booksData.filter(book => {
        let matchesCategory = true;
        if (currentSelectedCategory !== "All") {
            let bookExamsString = (book.exams || "").toUpperCase();
            let keywordsToCheck = EXAM_CATEGORY_MAP[currentSelectedCategory] || [currentSelectedCategory.toUpperCase()];
            matchesCategory = keywordsToCheck.some(keyword => bookExamsString.includes(keyword));
        }
        let matchesLanguage = currentSelectedLanguage === "All" || (book.lang || "").toLowerCase().trim() === currentSelectedLanguage.toLowerCase().trim();
        let matchesSearch = true;
        if (searchInputRaw.length > 0) {
            let textToSearch = (book.title + " " + (book.author || "") + " " + (book.exams || "")).toLowerCase().replace(/[^a-z0-9\s]/g, '');
            if (searchTokens.length > 0) matchesSearch = searchTokens.every(token => textToSearch.includes(token)); 
        }
        return matchesCategory && matchesLanguage && matchesSearch;
    });
    
    loadedCount = 0; const infiniteLoader = document.getElementById('infinite-loader');
    if(mainFilteredData.length > 0) { 
        document.getElementById('no-results-msg').style.display = 'none'; 
        if(infiniteLoader) infiniteLoader.style.display = mainFilteredData.length > getBatchSize() ? 'flex' : 'none';
        renderBooksUI(0, getBatchSize(), mainFilteredData); 
    } else { 
        document.getElementById("bookContainer").innerHTML = ""; document.getElementById('no-results-msg').style.display = 'flex'; 
        if(infiniteLoader) infiniteLoader.style.display = 'none';
    }
}

const searchInputEl = document.getElementById('app-search-input'); let searchTimeout;
searchInputEl.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { applyMasterFilter(); }, 300); });

// ==========================================
// RENDERING UI & INFINITE SCROLL
// ==========================================
function getBatchSize() { let w = window.innerWidth; return (w >= 1200 ? 5 : w >= 900 ? 4 : w >= 600 ? 3 : 2) * 4; }
const infiniteScrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && loadedCount < mainFilteredData.length && !isLoadingMore && document.getElementById('no-results-msg').style.display !== 'flex') {
            isLoadingMore = true; if(document.getElementById('infinite-loader')) document.getElementById('infinite-loader').style.display = 'flex';
            setTimeout(() => {
                renderBooksUI(loadedCount, getBatchSize(), mainFilteredData);
                if (loadedCount >= mainFilteredData.length && document.getElementById('infinite-loader')) document.getElementById('infinite-loader').style.display = 'none'; 
                isLoadingMore = false;
            }, 500);
        }
    });
}, { root: document.getElementById('mainContentArea'), rootMargin: '0px 0px 200px 0px', threshold: 0.1 });
if (document.getElementById('scroll-sentinel')) infiniteScrollObserver.observe(document.getElementById('scroll-sentinel'));

function renderBooksUI(startIndex, count, customData = null) {
    const container = document.getElementById("bookContainer"); let dataToRender = customData ? customData : mainFilteredData;
    let endIndex = Math.min(startIndex + count, dataToRender.length);
    if(startIndex === 0) container.innerHTML = ""; let htmlChunk = "";
    for(let i = startIndex; i < endIndex; i++) {
        let book = dataToRender[i]; let langClass = book.lang.toLowerCase() === 'hindi' ? 'tag-lang-hindi' : 'tag-lang-english';
        let isSaved = savedBooks.includes(book.slug); let bookmarkIcon = isSaved ? 'fas fa-bookmark' : 'far fa-bookmark';
        htmlChunk += `<div class="book-card" data-slug="${book.slug}"><div class="card-img-wrapper"><div class="badge-free">FREE</div><div class="bookmark-btn" data-action="bookmark"><i class="${bookmarkIcon}"></i></div><img src="${book.image}" loading="lazy" class="book-image" oncontextmenu="return false;" draggable="false"></div><div class="book-details"><div class="book-title">${sanitizeHTML(book.title)}</div><div class="book-author">${sanitizeHTML(book.author)}</div><div class="tags-container"><span class="book-tag tag-year">${sanitizeHTML(book.year)}</span><span class="book-tag ${langClass}">${sanitizeHTML(book.lang)}</span></div></div></div>`;
    }
    container.insertAdjacentHTML('beforeend', htmlChunk); loadedCount = endIndex;
}

document.getElementById('bookContainer').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if(card) {
        const slug = card.getAttribute('data-slug'); const bookmarkBtn = e.target.closest('.bookmark-btn');
        if(bookmarkBtn) toggleBookmarkLocal(bookmarkBtn.querySelector('i'), slug); else openDownloadPageLocal(slug);
    }
});

function toggleBookmarkLocal(iconElement, slug) {
    const index = savedBooks.indexOf(slug);
    if (index === -1) { savedBooks.push(slug); iconElement.className = "fas fa-bookmark"; } 
    else { savedBooks.splice(index, 1); iconElement.className = "far fa-bookmark"; }
    localStorage.setItem('spidy_saved_books', JSON.stringify(savedBooks));
    updateProfileUI(); 
    if(document.getElementById('bookmarks-panel').classList.contains('active')) renderSavedBooksUI(); 
}

function renderSavedBooksUI() {
    const container = document.getElementById("savedBooksContainer"); const noMsg = document.getElementById("no-saved-msg");
    const savedBooksData = booksData.filter(book => savedBooks.includes(book.slug));
    if (savedBooksData.length === 0) { container.innerHTML = ""; noMsg.style.display = "flex"; return; }
    noMsg.style.display = "none"; let htmlChunk = "";
    savedBooksData.forEach(book => {
        let langClass = book.lang.toLowerCase() === 'hindi' ? 'tag-lang-hindi' : 'tag-lang-english';
        htmlChunk += `<div class="book-card" data-slug="${book.slug}"><div class="card-img-wrapper"><div class="badge-free">FREE</div><div class="bookmark-btn" data-action="bookmark"><i class="fas fa-bookmark"></i></div><img src="${book.image}" loading="lazy" class="book-image" oncontextmenu="return false;" draggable="false"></div><div class="book-details"><div class="book-title">${sanitizeHTML(book.title)}</div><div class="book-author">${sanitizeHTML(book.author)}</div><div class="tags-container"><span class="book-tag tag-year">${sanitizeHTML(book.year)}</span><span class="book-tag ${langClass}">${sanitizeHTML(book.lang)}</span></div></div></div>`;
    });
    container.innerHTML = htmlChunk;
}
document.getElementById('savedBooksContainer').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if(card) {
        const slug = card.getAttribute('data-slug'); const bookmarkBtn = e.target.closest('.bookmark-btn');
        if(bookmarkBtn) toggleBookmarkLocal(bookmarkBtn.querySelector('i'), slug); else openDownloadPageLocal(slug); 
    }
});

// ==========================================
// 🌟 HISTORY STATE (BACK BUTTON) MANAGER 🌟
// ==========================================
function openPanelWithHistory(panelId) {
    const el = document.getElementById(panelId);
    if (!el) return;
    
    if(panelId === 'downloadModal' || panelId === 'reportModalOverlay' || panelId === 'pdfViewerOverlay' || panelId === 'tokenModalOverlay' || panelId === 'loginOverlay' || panelId === 'uploadPopup' || panelId === 'customLogoutOverlay') {
        el.style.display = (panelId === 'tokenModalOverlay') ? 'grid' : 'flex';
        if(panelId === 'loginOverlay' || panelId === 'uploadPopup') setTimeout(() => el.style.opacity = '1', 10);
        if(panelId === 'uploadPopup') el.classList.remove('hidden');
        if(panelId === 'customLogoutOverlay') setTimeout(() => el.classList.add('show'), 10);
    } else {
        el.classList.add('active');
        if(panelId === 'contextOverlay') el.classList.add('show');
    }
    history.pushState({ popup: panelId }, '');
}

function closePanelOrModal(panelId) {
    const el = document.getElementById(panelId);
    if (!el) return;

    if(panelId === 'downloadModal' || panelId === 'reportModalOverlay' || panelId === 'pdfViewerOverlay' || panelId === 'tokenModalOverlay' || panelId === 'loginOverlay' || panelId === 'uploadPopup' || panelId === 'customLogoutOverlay') {
        if(panelId === 'loginOverlay' || panelId === 'uploadPopup') el.style.opacity = '0';
        if(panelId === 'uploadPopup') el.classList.add('hidden');
        if(panelId === 'customLogoutOverlay') el.classList.remove('show');
        setTimeout(() => el.style.display = 'none', 300);
    } else {
        el.classList.remove('active');
        el.classList.remove('show');
    }
}

function closeAllPanels() {
    const panels = ['noti-panel', 'sidebar', 'dmca-panel', 'bookmarks-panel', 'search-box', 'filterBottomOverlay', 'contextOverlay', 'downloadModal', 'reportModalOverlay', 'pdfViewerOverlay', 'tokenModalOverlay', 'loginOverlay', 'uploadPopup', 'customLogoutOverlay'];
    panels.forEach(id => closePanelOrModal(id));
    document.getElementById('sidebar-overlay')?.classList.remove('active');
}

function handleCloseBackLogic() {
    if (history.state && history.state.popup) { history.back(); } 
    else { closeAllPanels(); }
}

window.addEventListener('popstate', (e) => {
    closeAllPanels();
    const sBook = new URLSearchParams(window.location.search).get('book');
    if(sBook) { openDownloadPageLocal(sBook, true); }
});

// Bind UI Close buttons to handleCloseBackLogic
document.getElementById('close-search')?.addEventListener('click', handleCloseBackLogic);
document.getElementById('sidebar-overlay')?.addEventListener('click', handleCloseBackLogic);
document.getElementById('close-dmca-btn')?.addEventListener('click', handleCloseBackLogic);
document.getElementById('close-bookmarks-btn')?.addEventListener('click', handleCloseBackLogic);
document.getElementById('closeAuthorFilterBtn')?.addEventListener('click', handleCloseBackLogic);
document.getElementById('closeUploadPopupBtn')?.addEventListener('click', handleCloseBackLogic);
document.getElementById('closeDlBtn')?.addEventListener('click', () => {
    if(history.state && history.state.popup === 'downloadModal') history.back();
    else { document.getElementById("downloadModal").style.display = "none"; window.history.replaceState({}, '', window.location.pathname); }
});

// Trigger Opens with History State
document.getElementById('open-search').addEventListener('click', () => { openPanelWithHistory('search-box'); setTimeout(() => { searchInputEl.focus(); }, 300); });
document.getElementById('open-noti').addEventListener('click', () => { openPanelWithHistory('noti-panel'); document.querySelector('.blink-dot').style.display = 'none'; });
document.getElementById('open-menu').addEventListener('click', () => { openPanelWithHistory('sidebar'); document.getElementById('sidebar-overlay').classList.add('active'); });
document.getElementById('menu-dmca').addEventListener('click', (e) => { e.preventDefault(); closePanelOrModal('sidebar'); document.getElementById('sidebar-overlay').classList.remove('active'); openPanelWithHistory('dmca-panel'); });
document.getElementById('menu-bookmarks').addEventListener('click', (e) => { e.preventDefault(); closePanelOrModal('sidebar'); document.getElementById('sidebar-overlay').classList.remove('active'); openPanelWithHistory('bookmarks-panel'); renderSavedBooksUI(); });
document.getElementById('openAuthorFilterBtn').addEventListener('click', () => { openPanelWithHistory('filterBottomOverlay'); });

// Tabs Logic
function switchTab(tabId) { document.querySelectorAll('.app-tab').forEach(tab => { tab.style.display = 'none'; tab.classList.remove('active'); }); const target = document.getElementById(tabId); if(target) { target.style.display = 'flex'; setTimeout(() => target.classList.add('active'), 10); } }
function setNavActive(id) { document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active')); document.getElementById(id).classList.add('active'); }

document.getElementById('nav-home').addEventListener('click', () => { setNavActive('nav-home'); closeAllPanels(); switchTab('tab-home'); window.history.replaceState({}, '', window.location.pathname); });
document.getElementById('nav-upload').addEventListener('click', () => {
    if(!isUserLoggedIn) { openPanelWithHistory('loginOverlay'); setNavActive('nav-home'); return; }
    setNavActive('nav-upload'); closeAllPanels(); switchTab('tab-upload'); setTimeout(() => { openPanelWithHistory('uploadPopup'); }, 300);
});
document.getElementById('nav-dev').addEventListener('click', () => { 
    if(!isUserLoggedIn) { openPanelWithHistory('loginOverlay'); setNavActive('nav-home'); return; }
    setNavActive('nav-dev'); closeAllPanels(); switchTab('tab-about'); updateProfileUI();
});

// ==========================================
// 🌟 REAL FIREBASE NOTIFICATIONS WITH SCROLL VIEWS 🌟
// ==========================================
window.toggleInlineReaction = function(pill, event) {
    if(event) event.stopPropagation(); 
    if (pill.classList.contains('active')) { pill.style.transform = 'scale(1.1)'; setTimeout(() => pill.style.transform = 'scale(1)', 150); return; }
    const container = pill.closest('.inline-reactions');
    const currentActive = container.querySelector('.reaction-pill.active');
    let countSpan = pill.querySelector('.count'); let currentCount = parseInt(countSpan.innerText);
    if (currentActive) {
        currentActive.classList.remove('active');
        let oldSpan = currentActive.querySelector('.count'); let oldCount = parseInt(oldSpan.innerText) - 1;
        oldSpan.innerText = oldCount; if(oldCount <= 0) currentActive.remove();
    }
    pill.classList.add('active'); countSpan.innerText = currentCount + 1;
    pill.style.transform = 'scale(0.8)'; setTimeout(() => pill.style.transform = 'scale(1)', 150);
}

window.activePost = null; 
const contextOverlay = document.getElementById('contextOverlay');
contextOverlay.addEventListener('click', (e) => { if (e.target === contextOverlay) handleCloseBackLogic(); });

function openContextMenu(postEl) {
    window.activePost = postEl; openPanelWithHistory('contextOverlay'); if (navigator.vibrate) navigator.vibrate(20);
}

window.addReactionFromMenu = function(emojiSymbol) {
    if (!window.activePost) return;
    let postId = window.activePost.getAttribute('data-post-id');
    const reactionsContainer = document.getElementById(`reactions-${postId}`);
    const existingPills = reactionsContainer.querySelectorAll('.reaction-pill');
    let targetPill = null;
    existingPills.forEach(pill => { if (pill.querySelector('.emoji').innerText === emojiSymbol) { targetPill = pill; }});
    if (targetPill) {
        if (!targetPill.classList.contains('active')) toggleInlineReaction(targetPill, null);
    } else {
        const currentActive = reactionsContainer.querySelector('.reaction-pill.active');
        if(currentActive) {
            let oldSpan = currentActive.querySelector('.count'); let oldCount = parseInt(oldSpan.innerText) - 1;
            oldSpan.innerText = oldCount; currentActive.classList.remove('active');
            if(oldCount <= 0) currentActive.remove();
        }
        const newPill = document.createElement('div'); newPill.className = 'reaction-pill active';
        newPill.onclick = function(e) { toggleInlineReaction(this, e) };
        newPill.innerHTML = `<span class="emoji">${emojiSymbol}</span> <span class="count">1</span>`;
        reactionsContainer.appendChild(newPill);
    }
    handleCloseBackLogic(); window.activePost = null;
}

window.copyText = function() {
    if(!window.activePost) return;
    const textToCopy = window.activePost.querySelector('.msg-text').innerText;
    navigator.clipboard.writeText(textToCopy); showToast("Text Copied!", "success"); handleCloseBackLogic();
}

window.copyLink = function() {
    if(!window.activePost) return;
    const finalLink = `${window.location.origin}${window.location.pathname}`;
    navigator.clipboard.writeText(finalLink); showToast(`Link Copied!`, "success"); handleCloseBackLogic();
}

window.forwardPost = function() {
    if(!window.activePost) return;
    const finalLink = `${window.location.origin}${window.location.pathname}`;
    if (navigator.share) { navigator.share({ title: 'Spidy Book Hub', text: 'Check out this update:', url: finalLink }).then(() => { handleCloseBackLogic(); }); } 
    else { window.copyLink(); }
}

window.reportPost = function() {
    showToast("Post reported to Admin!", "error"); handleCloseBackLogic();
}

// SCROLL TO VIEW OBSERVER (1 View Per User)
const notiViewObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(async entry => {
        if (entry.isIntersecting) {
            const bubble = entry.target;
            const postId = bubble.getAttribute('data-post-id');
            
            if (isUserLoggedIn && auth.currentUser && postId) {
                let uid = auth.currentUser.uid;
                let viewsAttr = bubble.getAttribute('data-views');
                let viewedUsers = viewsAttr ? JSON.parse(viewsAttr) : [];
                
                if (!viewedUsers.includes(uid)) {
                    try {
                        await updateDoc(doc(db, "notifications", postId), { views: arrayUnion(uid) });
                        let viewSpan = document.getElementById(`view-count-${postId}`);
                        if(viewSpan) viewSpan.innerText = parseInt(viewSpan.innerText) + 1;
                        viewedUsers.push(uid); bubble.setAttribute('data-views', JSON.stringify(viewedUsers));
                    } catch(err) { console.error(err); }
                }
            }
            observer.unobserve(bubble); 
        }
    });
}, { threshold: 0.5 }); 

// FETCH NOTIFICATIONS FROM FIREBASE
const notiContainer = document.getElementById('dynamic-noti-container');
onSnapshot(query(collection(db, "notifications"), orderBy("createdAt", "asc")), (snapshot) => {
    notiContainer.innerHTML = '';
    let lastDate = '';

    snapshot.forEach(docSnap => {
        const data = docSnap.data(); const id = docSnap.id;
        let dateObj = data.createdAt ? new Date(data.createdAt) : new Date();
        let dateStr = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        
        if(dateStr !== lastDate) {
            notiContainer.insertAdjacentHTML('beforeend', `<div class="date-divider">${dateStr}</div>`);
            lastDate = dateStr;
        }

        let viewsArr = data.views || [];
        let viewsCount = viewsArr.length;

        let html = `
        <div class="message-bubble post-item" data-post-id="${id}" data-views='${JSON.stringify(viewsArr)}' ${data.bookSlug ? `data-slug="${data.bookSlug}"` : ''}>
            ${data.image ? `<img src="${data.image}" loading="lazy" class="msg-image">` : ''}
            ${data.quoteText ? `
                <div class="msg-quote">
                    <div class="quote-author">${sanitizeHTML(data.quoteAuthor || 'Admin')}</div>
                    <div class="quote-text">${sanitizeHTML(data.quoteText)}</div>
                </div>
            ` : ''}
            <div class="msg-text">${data.text || ''}</div>
            <div class="post-footer">
                <div class="inline-reactions" id="reactions-${id}">
                    <div class="reaction-pill" onclick="toggleInlineReaction(this, event)">
                        <span class="emoji">❤️</span> <span class="count">${data.hearts || 0}</span>
                    </div>
                </div>
                <div class="msg-meta"><i class="fas fa-eye"></i> <span id="view-count-${id}">${viewsCount}</span> &nbsp; ${dateObj.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
        </div>`;
        notiContainer.insertAdjacentHTML('beforeend', html);
    });

    const bubbles = notiContainer.querySelectorAll('.message-bubble');
    bubbles.forEach(bubble => {
        notiViewObserver.observe(bubble); 
        
        let pressTimer;
        bubble.addEventListener('contextmenu', e => { e.preventDefault(); openContextMenu(bubble); });
        bubble.addEventListener('touchstart', e => { pressTimer = setTimeout(()=>openContextMenu(bubble), 600); });
        bubble.addEventListener('touchend', e => { clearTimeout(pressTimer); });
        bubble.addEventListener('touchmove', e => { clearTimeout(pressTimer); });
        
        bubble.addEventListener('click', (e) => {
            if(e.target.closest('.reaction-pill')) return; 
            const slug = bubble.getAttribute('data-slug');
            if(slug) { openDownloadPageLocal(slug); } 
            else { openContextMenu(bubble); }
        });
    });

    notiContainer.scrollTop = notiContainer.scrollHeight;
});

// ==========================================
// 🌟 SECURE READ ONLINE & DOWNLOAD LOCK 🌟
// ==========================================

function openDownloadPageLocal(slug, skipPushState = false) {
    if(!isUserLoggedIn) { openPanelWithHistory('loginOverlay'); return; }
    const book = booksData.find(b => b.slug === slug); if(!book) return;
    
    openPanelWithHistory('downloadModal');
    
    const previewImg = document.getElementById("dlPreviewImage");
    previewImg.classList.add("image-loading-skeleton"); previewImg.src = book.image; 
    previewImg.onload = () => { previewImg.classList.remove("image-loading-skeleton"); };

    document.getElementById("dlBookTitle").innerText = sanitizeHTML(book.title); 
    document.getElementById("dlBookAuthor").innerText = sanitizeHTML(book.author);
    
    const dlPdfBtn = document.getElementById("dlPdfLinkBtn");
    dlPdfBtn.style.pointerEvents = "none"; dlPdfBtn.onclick = function(e) { e.preventDefault(); return false; };

    // READ ONLINE (SECURE PROXY VIEWER)
    document.getElementById("dlReadOnlineBtn").onclick = async function() {
        if(!isUserLoggedIn || !auth.currentUser) return;
        const btn = document.getElementById("dlReadOnlineBtn"); const originalText = btn.innerHTML; 

        const savedData = localStorage.getItem('spidy_secure_session');
        let hasValidToken = false;
        if (savedData) { try { const parsed = JSON.parse(savedData); if (parsed.fp === generateDeviceFingerprint() && parsed.expiry > Date.now()) hasValidToken = true; } catch(e) {} }

        if(!hasValidToken && !IS_SUPER_ADMIN) { openPanelWithHistory('tokenModalOverlay'); return; }
        
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Getting Secure Access...`; btn.disabled = true;

        try {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await updateDoc(userRef, { readSlugs: arrayUnion(book.slug) });
            updateProfileUI(); 

            const userToken = await auth.currentUser.getIdToken(true);
            const response = await fetch('/api/get-book', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookId: book.id, bookSlug: book.slug, userToken: userToken })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                const iframe = document.getElementById('pdfIframe');
                document.getElementById('pdfViewerTitle').innerText = sanitizeHTML(book.title);
                iframe.src = data.pdfLink + "&toolbar=0&navpanes=0&scrollbar=0"; 
                openPanelWithHistory('pdfViewerOverlay');
            } else {
                if (response.status === 401 || (data.error && data.error.includes('Unauthorized'))) { localStorage.removeItem('spidy_secure_session'); openPanelWithHistory('tokenModalOverlay'); } 
                else { showToast(data.error || "Failed to load book securely.", "error"); }
            }
            btn.innerHTML = originalText; btn.disabled = false;
        } catch (error) { showToast("Network Error: Could not load the book.", "error"); btn.innerHTML = originalText; btn.disabled = false; }
    };

    document.getElementById("closePdfViewerBtn").onclick = function() { handleCloseBackLogic(); document.getElementById('pdfIframe').src = ""; };
    document.getElementById("pdfContainer").addEventListener('contextmenu', event => event.preventDefault());

    let examsArray = (book.exams || "General").split(',').map(item => sanitizeHTML(item.trim()));
    document.getElementById("dlModalTags").innerHTML = examsArray.map(exam => `<div class="dl-modal-tag">${exam}</div>`).join('');
    activeBookSlug = book.slug; activeBookTitle = book.title;
    
    if (!skipPushState) { history.replaceState({ popup: 'downloadModal' }, '', '?book=' + book.slug); }
}

// ==========================================
// REPORT ISSUE MODAL
// ==========================================
document.getElementById('reportLinkBtn').addEventListener('click', () => { openPanelWithHistory('reportModalOverlay'); });
document.getElementById('closeReportBtn').addEventListener('click', handleCloseBackLogic);
document.getElementById('reportModalOverlay').addEventListener('click', (e) => { if (e.target === document.getElementById('reportModalOverlay')) handleCloseBackLogic(); });

const reportOptions = document.querySelectorAll('.rm-option'); const submitReportBtn = document.getElementById('submitReportBtn');
reportOptions.forEach(opt => {
    opt.addEventListener('click', () => { reportOptions.forEach(o => o.classList.remove('selected')); opt.classList.add('selected'); submitReportBtn.classList.add('enabled'); });
});

submitReportBtn.addEventListener('click', async () => {
    const selectedOption = document.querySelector('.rm-option.selected');
    if (selectedOption) {
        const issueType = selectedOption.querySelector('span').innerText;
        try {
            await addDoc(collection(db, "reports"), { bookTitle: activeBookTitle, bookSlug: activeBookSlug, issueType: issueType, status: 'Pending', reportedBy: auth.currentUser ? auth.currentUser.email : 'Unknown', createdAt: new Date().getTime() });
        } catch (error) { console.error("Report failed:", error); }

        submitReportBtn.innerHTML = '<i class="fas fa-check-circle"></i> Successfully Reported'; submitReportBtn.style.background = '#10b981';
        setTimeout(() => {
            handleCloseBackLogic();
            setTimeout(() => { submitReportBtn.innerHTML = 'Submit Report'; submitReportBtn.style.background = '#ef4444'; submitReportBtn.classList.remove('enabled'); reportOptions.forEach(o => o.classList.remove('selected')); }, 400);
        }, 1200);
    }
});

// ==========================================
// TOKEN MODAL BUTTON LOGICS
// ==========================================
document.getElementById('closeTokenModalBtn').addEventListener('click', handleCloseBackLogic);
document.getElementById('tokenInput').addEventListener('input', () => { document.getElementById('inputBoxWrapperToken').classList.remove('error-state', 'success-state'); });

document.getElementById('getKeyBtn').addEventListener('click', () => {
    const btn = document.getElementById('getKeyBtn'); const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    setTimeout(() => { window.location.href = "https://arolinks.com/6RTf5"; btn.innerHTML = originalContent; }, 600);
});

document.getElementById('verifyBtn').addEventListener('click', async () => {
    const tokenValue = document.getElementById('tokenInput').value.trim(); const inputBox = document.getElementById('inputBoxWrapperToken'); const btn = document.getElementById('verifyBtn');
    inputBox.classList.remove('error-state', 'success-state');

    if (tokenValue.length < 5) { inputBox.classList.add('error-state'); setTimeout(() => inputBox.classList.remove('error-state'), 2500); showToast('Invalid Token Format!', 'error'); return; }
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

    const currentFingerprint = generateDeviceFingerprint();
    try {
        const response = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokenValue, fingerprint: currentFingerprint }) });
        const data = await response.json();

        if (response.ok) {
            inputBox.classList.add('success-state'); showToast('Access Granted! Valid for 10 Days.', 'success');
            localStorage.setItem('spidy_secure_session', JSON.stringify({ token: tokenValue, fp: currentFingerprint, expiry: Date.now() + 10 * 24 * 60 * 60 * 1000 }));
            setTimeout(() => { handleCloseBackLogic(); btn.innerHTML = '<i class="fas fa-shield-halved"></i> Verify'; document.getElementById("dlReadOnlineBtn").click(); }, 1000);
        } else { inputBox.classList.add('error-state'); showToast(data.error || 'Verification Failed', 'error'); btn.innerHTML = '<i class="fas fa-shield-halved"></i> Verify'; }
    } catch (err) { inputBox.classList.add('error-state'); showToast('Server Error!', 'error'); btn.innerHTML = '<i class="fas fa-shield-halved"></i> Verify'; }
});

// ==========================================
// SECURE CLOUDFLARE R2 UPLOAD
// ==========================================
['fileCoverGallery', 'fileCoverBrowse'].forEach(id => { document.getElementById(id).addEventListener('change', function(e) { if(e.target.files.length > 0) { selectedCoverFile = e.target.files[0]; e.target.closest('.uc-actions').querySelector('p').innerText = "Selected: " + selectedCoverFile.name; } }); });
['filePdfGallery', 'filePdfBrowse'].forEach(id => { document.getElementById(id).addEventListener('change', function(e) { if(e.target.files.length > 0) { selectedPdfFile = e.target.files[0]; e.target.closest('.uc-actions').querySelector('p').innerText = "Selected: " + selectedPdfFile.name; } }); });

async function uploadFileToR2(file, type) {
    return new Promise(async (resolve, reject) => {
        const r2Overlay = document.getElementById('r2UploadOverlay'); const progressBar = document.getElementById('r2ProgressBar'); const progressText = document.getElementById('r2ProgressText'); const statusText = document.getElementById('r2StatusText');
        if(type === 'image') { document.getElementById('r2UploadIcon').className = "fas fa-image"; document.getElementById('r2UploadTitle').innerText = "Upload Cover Image"; } 
        else { document.getElementById('r2UploadIcon').className = "fas fa-file-pdf"; document.getElementById('r2UploadTitle').innerText = "Upload PDF File"; }
        r2Overlay.style.display = 'flex'; progressBar.style.width = '0%'; progressText.innerText = '0%';

        try {
            const userToken = await auth.currentUser.getIdToken(true);
            const authResponse = await fetch('/api/generate-upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, fileType: file.type, userToken: userToken }) });
            const authData = await authResponse.json();
            if (!authResponse.ok) throw new Error(authData.error || "Permission Denied");

            statusText.innerText = "Securely transferring to Cloudflare R2...";
            const xhr = new XMLHttpRequest(); xhr.open("PUT", authData.uploadUrl, true); xhr.setRequestHeader("Content-Type", file.type); 
            xhr.upload.addEventListener("progress", (e) => { if (e.lengthComputable) { let p = Math.round((e.loaded / e.total) * 100); progressBar.style.width = p + '%'; progressText.innerText = p + '%'; } });
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) { setTimeout(() => { r2Overlay.style.display = 'none'; }, 500); if (type === 'image') resolve(`${R2_PUBLIC_IMAGE_URL}/${authData.fileKey}`); else resolve(authData.fileKey); } 
                else { r2Overlay.style.display = 'none'; reject("Upload Failed"); }
            };
            xhr.onerror = function() { r2Overlay.style.display = 'none'; reject("Network Error"); }; xhr.send(file);
        } catch (error) { r2Overlay.style.display = 'none'; reject(error.message || "Upload Failed"); }
    });
}

document.getElementById('addBookForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('publishBtn'); const originalText = btn.innerHTML;
    if (!selectedCoverFile) { showToast("Please select a Cover Image!", "error"); return; }
    if (!selectedPdfFile) { showToast("Please select a PDF file!", "error"); return; }

    btn.innerHTML = `<span class="btn-text" style="display: flex; align-items: center; justify-content: center; gap: 10px;"><div class="premium-loader" style="border-color:#000;"></div> Publishing...</span>`; btn.disabled = true;

    try {
        let coverR2Url = await uploadFileToR2(selectedCoverFile, 'image'); let pdfR2Key = await uploadFileToR2(selectedPdfFile, 'pdf');
        const newBook = { title: document.getElementById('inTitle').value, author: document.getElementById('inAuthor').value, year: document.getElementById('inYear').value, lang: document.getElementById('inLang').value, exams: document.getElementById('inExams').value, image: coverR2Url, pdfLink: pdfR2Key, dateAdded: new Date().toLocaleDateString('en-GB').toUpperCase(), createdAt: new Date().getTime(), uploaderUid: auth.currentUser.uid, views: [] };
        await addDoc(collection(db, "books"), newBook); 
        showToast("Book Published Successfully!", "success"); e.target.reset(); selectedCoverFile = null; selectedPdfFile = null; document.querySelectorAll('.uc-actions p').forEach(p => p.innerText = "Drag & Drop File");
    } catch (error) { showToast("Failed: " + error, "error"); } finally { btn.innerHTML = originalText; btn.disabled = false; }
});

document.querySelectorAll('.adm-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.adm-section').forEach(el => el.classList.remove('active')); document.querySelectorAll('.adm-tab-btn').forEach(el => el.classList.remove('active'));
        if(btn.id === 'admTabPrompt') { document.getElementById('sectionPrompt').classList.add('active'); document.getElementById('admTabPrompt').classList.add('active'); }
        else { document.getElementById('sectionAddBook').classList.add('active'); document.getElementById('admTabAdd').classList.add('active'); }
    });
});
