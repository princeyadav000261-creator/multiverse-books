import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAXBSGCZFdkSbk-Ireoo7sRY4mLzS25nyk",
    authDomain: "multiverse-books-2.firebaseapp.com",
    projectId: "multiverse-books-2",
    storageBucket: "multiverse-books-2.firebasestorage.app",
    messagingSenderId: "59280260709",
    appId: "1:59280260709:web:ef05fbe489ce2ee41e108c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

window.booksData = [];
let loadedCount = 0; 
let isLoadingMore = false;
let activeBookSlug = ""; 
let activeBookTitle = "";

window.IS_SUPER_ADMIN = false;
const SUPER_ADMIN_EMAIL = "princeyadav000261@gmail.com"; 
let myLangChart = null; let myDownloadsChart = null;
let isAppInitialized = false;

let adminFilteredBooks = [];
let adminCurrentPage = 1;
const adminBooksPerPage = 10;
let dbLogs = []; 

// 1. ORIGINAL CANVAS LOADER
const canvas = document.getElementById('networkCanvas');
const ctx = canvas.getContext('2d');
let width, height;
let hexagons = [];
let animationId;

function initHex() {
    hexagons = [];
    const R = 32; const X_OFFSET = R * 1.5; const Y_OFFSET = Math.sqrt(3) * R;
    const cols = Math.ceil(width / X_OFFSET) + 2; const rows = Math.ceil(height / Y_OFFSET) + 2;
    for (let q = -1; q < cols; q++) {
        for (let r = -1; r < rows; r++) {
            let x = q * X_OFFSET; let y = r * Y_OFFSET;
            if (q % 2 !== 0) y += Y_OFFSET / 2;
            let rand = Math.random();
            if (rand > 0.45) { hexagons.push({ x: x, y: y, type: 'main', blinkOffset: Math.random() * Math.PI * 2, blinkSpeed: 0.001 + Math.random() * 0.0015 }); } 
            else if (rand > 0.15) { hexagons.push({ x: x + 15, y: y + 15, type: 'bg', blinkOffset: Math.random() * Math.PI * 2, blinkSpeed: 0.0008 }); }
        }
    }
}
function drawHexagon(x, y, alpha, type) {
    ctx.beginPath(); const R = 32;
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i; const hx = x + R * Math.cos(angle); const hy = y + R * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.strokeStyle = type === 'main' ? `rgba(255, 255, 255, ${alpha})` : `rgba(255, 255, 255, ${alpha * 0.15})`; 
    ctx.lineWidth = type === 'main' ? 0.5 : 0.2;
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i; const hx = x + R * Math.cos(angle); const hy = y + R * Math.sin(angle);
        ctx.beginPath(); ctx.arc(hx, hy, type === 'main' ? 1.5 : 0.8, 0, Math.PI * 2);
        ctx.fillStyle = type === 'main' ? ctx.strokeStyle : `rgba(255, 255, 255, ${alpha * 0.2})`; ctx.fill();
    }
}
function animateHex(time) {
    ctx.clearRect(0, 0, width, height);
    hexagons.forEach(hex => { let alpha = 0.5 + 0.5 * Math.sin(time * hex.blinkSpeed + hex.blinkOffset); drawHexagon(hex.x, hex.y, alpha, hex.type); });
    animationId = requestAnimationFrame(animateHex);
}
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1; width = window.innerWidth; height = window.innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr; ctx.scale(dpr, dpr); initHex(); 
}

// 2. DAILY QUOTES LOGIC
const quotes = [
    { text: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi" },
    { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas A. Edison" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Whatever you are, be a good one.", author: "Abraham Lincoln" }
];
const todayDays = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
const currentQuoteIndex = todayDays % quotes.length;
document.getElementById('daily-quote-text').innerHTML = `<i class="fas fa-quote-left" style="color: rgba(255,255,255,0.3); margin-right:5px;"></i> ${quotes[currentQuoteIndex].text}`;
document.getElementById('daily-quote-author').innerText = `— ${quotes[currentQuoteIndex].author}`;

// UPDATED LOG ACTIVITY FUNCTION (ALWAYS CATCHES CORRECT EMAIL)
async function logActivity(actionType, bookTitle, imageUrl = "", deletedBookData = null) {
    try {
        const userEmail = (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : "admin@multiverse.com";
        await addDoc(collection(db, "activity_logs"), {
            action: actionType,
            bookTitle: bookTitle,
            image: imageUrl,
            deletedData: deletedBookData,
            adminName: document.getElementById('sidebarProfileName').innerText,
            adminEmail: userEmail,
            adminPhoto: "https://i.postimg.cc/cJdGqYHG/IMG-20260524-WA0004.jpg", // Force the multiverse logo always
            timestamp: new Date().getTime(),
            dateStr: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' })
        });
    } catch(e) { console.error(e); }
}

window.addEventListener('resize', resizeCanvas); resizeCanvas(); animateHex(0);

// 3. AUTH FLOW (FIXED: NO BLACK SCREEN, NEVER OVERWRITES SIDEBAR LOGO)
let authChecked = false;
let initialLoadDone = false;

onAuthStateChanged(auth, async (user) => {
    authChecked = true;
    
    if (!initialLoadDone) {
        const loader = document.getElementById("loaderScreen");
        loader.style.opacity = "0";
        setTimeout(() => { 
            cancelAnimationFrame(animationId); 
            loader.style.display = "none"; 
        }, 600);
        initialLoadDone = true;
    }

    if (user) {
        let dName = user.displayName;
        if (!dName || dName.trim() === "") { dName = user.email.split('@')[0]; }
        document.getElementById('sidebarProfileName').innerText = dName;
        // DELIBERATELY OMITTED user.photoURL so it ALWAYS STAYS AS THE DEFAULT MULTIVERSE LOGO.
        
        document.getElementById('menu-admin-panel').style.display = 'flex';
        document.getElementById('loginOverlay').style.display = 'none'; 
        document.getElementById('mainAppWrapper').style.display = 'block'; 
        document.getElementById("popupOverlay").style.display = "flex";

        if (user.email === SUPER_ADMIN_EMAIL) {
            window.IS_SUPER_ADMIN = true;
            document.getElementById('sidebarRoleText').innerText = "Super Admin";
            
            document.getElementById('admTabManage').style.display = 'inline-flex';
            document.getElementById('admTabAnalytics').style.display = 'inline-flex';
            document.getElementById('adminTutorialEdit').style.display = 'block';
            
            const currentYearStr = new Date().getFullYear().toString();
            onSnapshot(doc(db, "download_stats", currentYearStr), (docSnap) => {
                let dlData = [0,0,0,0,0,0,0,0,0,0,0,0];
                if (docSnap.exists()) { const d = docSnap.data(); dlData = [ d.jan||0, d.feb||0, d.mar||0, d.apr||0, d.may||0, d.jun||0, d.jul||0, d.aug||0, d.sep||0, d.oct||0, d.nov||0, d.dec||0 ]; }
                updateAdminCharts(dlData);
            });

            onSnapshot(query(collection(db, "activity_logs"), orderBy("timestamp", "desc")), (snapshot) => {
                dbLogs = [];
                snapshot.forEach(doc => { let l = doc.data(); l.id = doc.id; dbLogs.push(l); });
                renderLogs();
            });

        } else {
            window.IS_SUPER_ADMIN = false;
            document.getElementById('sidebarRoleText').innerText = "Verified User";
            
            document.getElementById('admTabManage').style.display = 'none';
            document.getElementById('admTabAnalytics').style.display = 'none';
            document.getElementById('adminTutorialEdit').style.display = 'none';
            switchAdminTab('add');
        }

        onSnapshot(doc(db, "settings", "global"), (docSnap) => {
            if (docSnap.exists() && docSnap.data().tutorialVideoUrl) {
                const embedUrl = getYouTubeEmbedUrl(docSnap.data().tutorialVideoUrl);
                if(document.getElementById('tutorialIframe')) document.getElementById('tutorialIframe').src = embedUrl;
            }
        });

        const q = query(collection(db, "books"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
            window.booksData = [];
            snapshot.forEach((doc) => {
                let data = doc.data(); data.id = doc.id;
                data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                window.booksData.push(data);
            });
            loadedCount = 0;
            const searchInput = document.getElementById('app-search-input').value;
            if(searchInput.trim() === "") { window.renderBooksUI(0, getBatchSize() * 2); } else { performFuzzySearch(searchInput); }
            window.generateNotifications();
            
            adminFilteredBooks = [...window.booksData];
            document.getElementById('adminSearchBook').value = '';
            renderAdminBooksTable(); 
            
            if(window.IS_SUPER_ADMIN) updateAdminCharts();
            
            const sBook = new URLSearchParams(window.location.search).get('book');
            if(sBook) window.openDownloadPage(sBook, true);
        });
    } else {
        window.IS_SUPER_ADMIN = false;
        document.getElementById('mainAppWrapper').style.display = 'none';
        document.getElementById('loginOverlay').style.display = 'flex';
        setTimeout(() => { document.getElementById('loginOverlay').style.opacity = '1'; }, 50); 
    }
});


document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const email = document.getElementById('loginEmail').value; const pass = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn'); btn.innerHTML = `Wait...`;
    try { 
        await signInWithEmailAndPassword(auth, email, pass); 
        e.target.reset(); 
        showToast("Login Successful!"); 
        btn.innerHTML = `Login`; 
    } catch(err) { 
        showToast("Failed: Invalid Credentials!"); 
        btn.innerHTML = `Login`; 
    } 
});

document.getElementById('googleSignInBtn').addEventListener('click', async () => { 
    try { 
        await signInWithPopup(auth, provider); 
        showToast("Google Login Successful!");
    } catch(err) { 
        showToast("Failed: Google Sign-In Error. Check Rules."); 
    } 
});

document.getElementById('admin-logout-btn').addEventListener('click', () => { 
    if(confirm("Are you sure you want to logout?")) {
        signOut(auth).then(() => { 
            document.getElementById('admin-dashboard-panel').classList.remove('active');
        });
    }
});

window.closePopup = function(){ document.getElementById("popupOverlay").style.display = "none"; };
window.joinChannel = function(){ window.open('https://whatsapp.com/channel/0029Vb6NBZx1yT2GByTTVf2A', '_blank'); };

// 4. FUZZY SEARCH
let searchTimeout;
const searchInputEl = document.getElementById('app-search-input');
const closeSearchBtn = document.getElementById('close-search');

searchInputEl.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const searchText = e.target.value;
    searchTimeout = setTimeout(() => {
        if(searchText.trim() === "") { document.getElementById('no-results-msg').style.display = 'none'; window.renderBooksUI(0, getBatchSize() * 2); } 
        else { performFuzzySearch(searchText); }
    }, 300);
});

closeSearchBtn.addEventListener('click', () => {
    searchInputEl.value = ''; document.getElementById('no-results-msg').style.display = 'none'; window.renderBooksUI(0, getBatchSize() * 2); document.getElementById('search-box').classList.remove('active');
    if (history.state && history.state.popup === 'search') { history.back(); }
});

function performFuzzySearch(searchText) {
    let normalizedSearch = searchText.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    let searchTokens = normalizedSearch.split(/\s+/).filter(token => token.length > 0);
    const filteredData = window.booksData.filter(book => {
        let textToSearch = (book.title + " " + book.author).toLowerCase().replace(/[^a-z0-9\s]/g, '');
        return searchTokens.every(token => textToSearch.includes(token));
    });
    if(filteredData.length > 0) { document.getElementById('no-results-msg').style.display = 'none'; window.renderBooksUI(0, filteredData.length, filteredData); } 
    else { document.getElementById("bookContainer").innerHTML = ""; document.getElementById('no-results-msg').style.display = 'flex'; }
}

// 5. AUTO GRID BOOK LOADING
function getBatchSize() {
    let cols = 2; 
    if (window.innerWidth >= 768) {
        const container = document.getElementById("bookContainer");
        if (container && container.clientWidth) { cols = Math.floor((container.clientWidth + 25) / 225) || 1; } else { cols = 4; }
    }
    return cols * 4; 
}

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
            <div class="card-img-wrapper"><div class="badge-free">FREE</div><img src="${book.image}" class="book-image" oncontextmenu="return false;" draggable="false"></div>
            <div class="book-details"><div class="book-title">${book.title}</div><div class="book-author">${book.author}</div>
            <div class="tags-container"><span class="book-tag tag-year">${book.year}</span><span class="book-tag ${langClass}">${book.lang}</span></div></div>
        </div>`;
    }
    loadedCount = endIndex;
}
window.generateNotifications = function() {
    const notiContainer = document.getElementById('dynamic-noti-container'); notiContainer.innerHTML = ''; 
    window.booksData.slice(0, 15).forEach((book) => {
        notiContainer.innerHTML += `<div class="noti-card-dynamic" onclick="openDownloadPage('${book.slug}')" style="cursor:pointer;"><img src="${book.image}" class="noti-card-img" alt="Logo"><div class="noti-card-content"><div class="noti-card-title">${book.title} Book Added ✅</div><div class="noti-card-desc">New book is now available.</div></div></div>`;
    });
}

document.getElementById('open-search').addEventListener('click', () => { history.pushState({ popup: 'search' }, ''); document.getElementById('search-box').classList.add('active'); setTimeout(() => { searchInputEl.focus(); }, 300); });
document.getElementById('open-noti').addEventListener('click', () => { history.pushState({ popup: 'noti' }, ''); document.getElementById('noti-panel').classList.add('active'); document.querySelector('.blink-dot').style.display = 'none'; });
document.getElementById('close-noti').addEventListener('click', () => { if (history.state && history.state.popup) { history.back(); } else { document.getElementById('noti-panel').classList.remove('active'); }});

const sidebar = document.getElementById('sidebar'); const sidebarOverlay = document.getElementById('sidebar-overlay');
document.getElementById('open-menu').addEventListener('click', () => { history.pushState({ popup: 'sidebar' }, ''); sidebar.classList.add('active'); sidebarOverlay.classList.add('active'); });
sidebarOverlay.addEventListener('click', () => { history.back(); });

document.getElementById('menu-home').addEventListener('click', (e) => { e.preventDefault(); history.back(); });
document.getElementById('menu-about-dev').addEventListener('click', (e) => { e.preventDefault(); history.replaceState({ popup: 'dev' }, ''); document.getElementById('about-dev-panel').classList.add('active'); sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); });
document.getElementById('close-dev-btn').addEventListener('click', () => { history.back(); });
document.getElementById('menu-dmca').addEventListener('click', (e) => { e.preventDefault(); history.replaceState({ popup: 'dmca' }, ''); document.getElementById('dmca-panel').classList.add('active'); sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); });
document.getElementById('close-dmca-btn').addEventListener('click', () => { history.back(); });

document.getElementById('menu-admin-panel').addEventListener('click', (e) => {
    e.preventDefault();
    history.pushState({ popup: 'admin' }, '');
    document.getElementById('admin-dashboard-panel').classList.add('active');
    sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active');
});
document.getElementById('close-admin-btn').addEventListener('click', () => { history.back(); });

window.addEventListener('popstate', (e) => {
    document.getElementById('noti-panel').classList.remove('active'); document.getElementById('sidebar').classList.remove('active'); document.getElementById('sidebar-overlay').classList.remove('active'); document.getElementById('about-dev-panel').classList.remove('active'); document.getElementById('dmca-panel').classList.remove('active'); document.getElementById('admin-dashboard-panel').classList.remove('active'); document.getElementById('search-box').classList.remove('active');
    const sBook = new URLSearchParams(window.location.search).get('book');
    if(sBook) { if(window.openDownloadPage) window.openDownloadPage(sBook, true); } 
    else { document.getElementById("downloadModal").style.display = "none"; }
});

window.openDownloadPage = function(slug, skipPushState = false) {
    const book = window.booksData.find(b => b.slug === slug); if(!book) return;
    document.getElementById("downloadModal").style.display = "flex";
    document.getElementById("dlPreviewImage").src = book.image; document.getElementById("dlBookTitle").innerText = book.title; document.getElementById("dlBookAuthor").innerText = book.author;
    document.getElementById("dlPdfLinkBtn").onclick = function() { if(book.pdfLink) window.open(book.pdfLink, '_blank'); };
    document.getElementById("dlYoutubeLinkBtn").onclick = function() { if(book.ytLink && book.ytLink !== "#") { window.open(book.ytLink, '_blank'); } };

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

// 6. ADMIN FUNCTIONS & PAGINATION
function showToast(message) {
    const toast = document.getElementById('toast'); 
    if (message.toLowerCase().includes('failed') || message.toLowerCase().includes('error') || message.toLowerCase().includes('invalid')) {
        toast.style.background = '#ef4444';
        toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span id="toastMsg">${message}</span>`;
    } else {
        toast.style.background = '#10b981';
        toast.innerHTML = `<i class="fas fa-check-circle"></i> <span id="toastMsg">${message}</span>`;
    }
    toast.classList.add('show'); 
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

function getYouTubeEmbedUrl(url) {
    let videoId = "";
    try { if(url.includes("v=")) { videoId = url.split("v=")[1].split("&")[0]; } else if(url.includes("youtu.be/")) { videoId = url.split("youtu.be/")[1].split("?")[0]; } else if(url.includes("/shorts/")) { videoId = url.split("/shorts/")[1].split("?")[0]; } } catch(e) {}
    return videoId ? `https://www.youtube.com/embed/${videoId}?controls=1&rel=0&modestbranding=1` : url;
}
window.updateTutorialLink = async function() { 
    if(!window.IS_SUPER_ADMIN) return; const newUrl = document.getElementById('newTutorialUrl').value; if(!newUrl) return showToast("Failed: Enter URL!"); 
    try { 
        await setDoc(doc(db, "settings", "global"), { tutorialVideoUrl: newUrl }, { merge: true }); 
        showToast("Video Updated Successfully!"); 
        document.getElementById('newTutorialUrl').value = ''; 
    } catch(e) { 
        showToast("Failed: Check Firebase Rules or Data - " + e.message); 
    } 
}

document.getElementById('addBookForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const titleInput = document.getElementById('inTitle').value; const imgInput = document.getElementById('inImage').value;
    const newBook = { title: titleInput, author: document.getElementById('inAuthor').value, image: imgInput, year: document.getElementById('inYear').value, lang: document.getElementById('inLang').value, exams: document.getElementById('inExams').value, pdfLink: document.getElementById('inPdfUrl').value, ytLink: document.getElementById('inYtUrl').value, dateAdded: new Date().toLocaleDateString('en-GB').toUpperCase(), createdAt: new Date().getTime() };
    try { 
        await addDoc(collection(db, "books"), newBook); 
        await logActivity("ADD", titleInput, imgInput);
        showToast("Book Published!"); e.target.reset(); 
    } catch (error) { showToast("Failed: Error saving book."); } 
});

document.getElementById('adminSearchBook').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const tokens = term.split(/\s+/).filter(t => t.length > 0);
    adminFilteredBooks = window.booksData.filter(b => {
        const str = (b.title + " " + b.author).toLowerCase().replace(/[^a-z0-9\s]/g, '');
        return tokens.every(t => str.includes(t));
    });
    adminCurrentPage = 1;
    renderAdminBooksTable();
});

window.changeAdminPage = function(dir) {
    adminCurrentPage += dir;
    renderAdminBooksTable();
}

function renderAdminBooksTable() {
    if(!document.getElementById('adminBooksTableBody')) return;
    if(document.getElementById('adminSearchBook').value.trim() === "") { adminFilteredBooks = [...window.booksData]; }

    const totalPages = Math.ceil(adminFilteredBooks.length / adminBooksPerPage) || 1;
    if(adminCurrentPage > totalPages) adminCurrentPage = totalPages;
    if(adminCurrentPage < 1) adminCurrentPage = 1;

    document.getElementById('admPageInfo').innerText = `Page ${adminCurrentPage} of ${totalPages}`;
    document.getElementById('admPrevPage').disabled = adminCurrentPage === 1;
    document.getElementById('admNextPage').disabled = adminCurrentPage === totalPages;

    const startIdx = (adminCurrentPage - 1) * adminBooksPerPage;
    const paginated = adminFilteredBooks.slice(startIdx, startIdx + adminBooksPerPage);
    const tbody = document.getElementById('adminBooksTableBody');
    let htmlString = "";
    
    if(paginated.length === 0) {
         tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#a1a1aa; font-weight:800;">No books found matching search.</td></tr>`;
         return;
    }

    paginated.forEach((book) => { 
        htmlString += `<tr>
            <td><img src="${book.image}" style="width:40px; border-radius:5px;"></td>
            <td><strong style="color:#fff;">${book.title}</strong><br><span style="font-size:0.8rem; color:#a1a1aa;">${book.author}</span></td>
            <td>
                <button class="adm-btn-edit" onclick="openAdminEditModal('${book.id}')"><i class="fas fa-edit"></i></button>
                <button class="adm-btn-delete" onclick="deleteBookRecord('${book.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`; 
    });
    tbody.innerHTML = htmlString;
}

window.deleteBookRecord = async function(id) { 
    if(confirm("Delete this book permanently?")) { 
        try { 
            const book = window.booksData.find(x => x.id === id);
            await deleteDoc(doc(db, "books", id)); 
            await logActivity("DELETE", book.title, book.image, book);
            showToast("Deleted!"); 
        } catch (e) { showToast("Failed: Delete error!"); } 
    } 
}

window.openAdminEditModal = function(id) {
    const book = window.booksData.find(x => x.id === id); 
    document.getElementById('editDocId').value = book.id; 
    document.getElementById('edTitle').value = book.title; 
    document.getElementById('edAuthor').value = book.author || ""; 
    document.getElementById('edYear').value = book.year || "2026"; 
    document.getElementById('edLang').value = book.lang || "Hindi"; 
    document.getElementById('edExams').value = book.exams || ""; 
    document.getElementById('edImage').value = book.image; 
    document.getElementById('edPdfUrl').value = book.pdfLink || ""; 
    document.getElementById('edYtUrl').value = book.ytLink || ""; 
    document.getElementById('adminEditModal').style.display = 'flex';
}

document.getElementById('editBookForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const docId = document.getElementById('editDocId').value;
    const updatedData = { 
        title: document.getElementById('edTitle').value, 
        author: document.getElementById('edAuthor').value, 
        year: document.getElementById('edYear').value, 
        lang: document.getElementById('edLang').value, 
        exams: document.getElementById('edExams').value, 
        image: document.getElementById('edImage').value, 
        pdfLink: document.getElementById('edPdfUrl').value, 
        ytLink: document.getElementById('edYtUrl').value 
    };
    try { 
        await updateDoc(doc(db, "books", docId), updatedData); 
        await logActivity("EDIT", updatedData.title, updatedData.image);
        document.getElementById('adminEditModal').style.display='none'; 
        showToast("Updated Successfully!"); 
    } catch (error) { showToast("Failed: Update Error."); }
});

function updateAdminCharts(dlDataArray = [0,0,0,0,0,0,0,0,0,0,0,0]) {
    if(!window.IS_SUPER_ADMIN) return;
    const langCounts = { 'Hindi': 0, 'English': 0, 'Bilingual': 0 }; 
    window.booksData.forEach(b => { if(langCounts[b.lang] !== undefined) { langCounts[b.lang]++; } });
    Chart.defaults.color = '#a1a1aa';
    const ctxLang = document.getElementById('langChart');
    if(ctxLang) { if(myLangChart) myLangChart.destroy(); myLangChart = new Chart(ctxLang, { type: 'doughnut', data: { labels: ['Hindi', 'English', 'Bilingual'], datasets: [{ data: [langCounts.Hindi, langCounts.English, langCounts.Bilingual], backgroundColor: ['#ef4444', '#3b82f6', '#8b5cf6'], borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false } }); }
    const ctxDownloads = document.getElementById('downloadsChart');
    if(ctxDownloads) { if(myDownloadsChart) myDownloadsChart.destroy(); myDownloadsChart = new Chart(ctxDownloads, { type: 'line', data: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], datasets: [{ label: `Downloads`, data: dlDataArray, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.2)', borderWidth: 2, fill: true }] }, options: { responsive: true, maintainAspectRatio: false } }); }
}

// RESTORED & ENHANCED ACTIVITY LOGS RENDER FUNCTION
function renderLogs() {
    const tbody = document.getElementById('logsTableBody'); 
    if(!tbody) return;
    if (dbLogs.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#a1a1aa; font-weight:800;">No activity tracked yet.</td></tr>`; return; }
    let htmlString = "";
    dbLogs.forEach(log => {
        let badge = ''; let recoveryBtn = '';
        if(log.action === 'ADD') { badge = `<span class="log-badge log-add"><i class="fas fa-plus"></i> Uploaded</span>`; } 
        else if(log.action === 'EDIT') { badge = `<span class="log-badge log-edit"><i class="fas fa-pen"></i> Modified</span>`; } 
        else if(log.action === 'DELETE') { badge = `<span class="log-badge log-delete"><i class="fas fa-trash"></i> Deleted</span>`; if(log.deletedData) { recoveryBtn = `<br><button class="btn-recover" onclick="recoverBook('${log.id}')"><i class="fas fa-undo"></i> Recover Vault</button>`; } } 
        else if (log.action === 'RESTORE') { badge = `<span class="log-badge log-restore"><i class="fas fa-trash-restore"></i> Restored</span>`; }
        
        let img = log.image ? `<img src="${log.image}" class="log-table-img" onerror="this.src='https://via.placeholder.com/40x55?text=Img'">` : ''; 
        
        // Use static fallback for email if not present, but use the saved correct email if available.
        let displayEmail = log.adminEmail || "admin@multiverse.com";
        
        htmlString += `<tr>
            <td>
                <div class="log-admin-info">
                    <img src="https://i.postimg.cc/cJdGqYHG/IMG-20260524-WA0004.jpg" alt="Admin">
                    <div>
                        <div style="font-weight: 800; color: #fff; text-transform: uppercase;">${log.adminName || "Admin"}</div>
                        <div style="font-size: 10px; color: #a1a1aa; font-weight: 600;">${displayEmail}</div>
                    </div>
                </div>
            </td>
            <td>${badge}</td>
            <td style="display: flex; align-items: center;">${img}<span style="color:#fff; font-weight: 800; font-size:1.05rem;">${log.bookTitle}</span></td>
            <td><div style="color: #a1a1aa; font-size: 0.9rem; font-weight:700;"><i class="far fa-clock" style="margin-right:5px;"></i> ${log.dateStr}</div>${recoveryBtn}</td>
        </tr>`;
    }); 
    tbody.innerHTML = htmlString;
}

window.recoverBook = async function(logId) {
    if(!window.IS_SUPER_ADMIN) return;
    const log = dbLogs.find(l => l.id === logId);
    if(!log || !log.deletedData) return;
    if(confirm(`Recover "${log.bookTitle}"?`)) {
        try {
            await setDoc(doc(db, "books", log.deletedData.id), log.deletedData);
            await logActivity("RESTORE", log.bookTitle, log.image);
            showToast("Book Restored Successfully!");
        } catch(e) { showToast("Failed to restore."); }
    }
}
