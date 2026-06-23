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
let activeBookSlug = ""; 
let activeBookTitle = "";

window.IS_SUPER_ADMIN = false;
const SUPER_ADMIN_EMAIL = "princeyadav000261@gmail.com"; 
let myLangChart = null; let myDownloadsChart = null;

// ================= 1. CANVAS LOADER LOGIC (Original Restored) =================
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
window.addEventListener('resize', resizeCanvas); resizeCanvas(); animateHex(0);


// ================= 2. AUTHENTICATION & LOGIN FLOW =================
let isUserLoggedIn = false;

onAuthStateChanged(auth, async (user) => {
    const loginOverlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainAppWrapper');

    if (user) {
        isUserLoggedIn = true;
        loginOverlay.style.display = 'none';
        mainApp.style.display = 'flex'; // Auth done, show app behind loader
        
        document.getElementById('sidebarProfileName').innerText = user.displayName || user.email.split('@')[0];
        if(user.photoURL) document.getElementById('sidebarProfileImg').src = user.photoURL;

        if (user.email === SUPER_ADMIN_EMAIL) {
            window.IS_SUPER_ADMIN = true;
            document.getElementById('sidebarRoleText').innerText = "Super Admin";
            document.getElementById('menu-admin-panel').style.display = 'flex';
            document.getElementById('adminTutorialEdit').style.display = 'block';
            
            const currentYearStr = new Date().getFullYear().toString();
            onSnapshot(doc(db, "download_stats", currentYearStr), (docSnap) => {
                let dlData = [0,0,0,0,0,0,0,0,0,0,0,0];
                if (docSnap.exists()) { const d = docSnap.data(); dlData = [ d.jan||0, d.feb||0, d.mar||0, d.apr||0, d.may||0, d.jun||0, d.jul||0, d.aug||0, d.sep||0, d.oct||0, d.nov||0, d.dec||0 ]; }
                updateAdminCharts(dlData);
            });
        } else {
            window.IS_SUPER_ADMIN = false;
            document.getElementById('sidebarRoleText').innerText = "Verified User";
            document.getElementById('menu-admin-panel').style.display = 'none';
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
            if(searchInput.trim() === "") { window.renderBooksUI(0, 16); } else { performFuzzySearch(searchInput); }
            window.generateNotifications();
            renderAdminBooksTable(); 
            if(window.IS_SUPER_ADMIN) updateAdminCharts();
        });
    } else {
        isUserLoggedIn = false;
        mainApp.style.display = 'none';
        // Don't show login immediately, wait for loader to finish
    }
});

// Remove canvas loader after 3 seconds exactly like the original
window.addEventListener("load", () => {
    setTimeout(() => {
        const loader = document.getElementById("loaderScreen");
        loader.style.opacity = "0";
        loader.style.visibility = "hidden";
        
        setTimeout(() => { 
            cancelAnimationFrame(animationId);
            loader.remove(); 
            
            // Flow Logic: If logged in -> WhatsApp Popup. Else -> Login Screen
            if(isUserLoggedIn) {
                document.getElementById("popupOverlay").style.display = "flex";
            } else {
                document.getElementById('loginOverlay').style.display = 'flex';
                setTimeout(() => { document.getElementById('loginOverlay').style.opacity = '1'; }, 50); 
            }
        }, 600); 
    }, 3000); 
});

// Login Actions
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const email = document.getElementById('loginEmail').value; const pass = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn'); btn.innerHTML = `Wait...`;
    try { 
        await signInWithEmailAndPassword(auth, email, pass); 
        e.target.reset(); 
        showToast("Login Successful!"); 
        // Force hide login overlay, auth listener will show app
        document.getElementById('loginOverlay').style.opacity = '0';
        setTimeout(() => { document.getElementById('loginOverlay').style.display = 'none'; }, 500);
        document.getElementById("popupOverlay").style.display = "flex"; // Show whatsapp popup on manual login
    } 
    catch(err) { showToast("Error: Invalid Credentials!"); } btn.innerHTML = `Login Securely`; 
});

document.getElementById('googleSignInBtn').addEventListener('click', async () => { 
    try { 
        await signInWithPopup(auth, provider); 
        document.getElementById('loginOverlay').style.opacity = '0';
        setTimeout(() => { document.getElementById('loginOverlay').style.display = 'none'; }, 500);
        document.getElementById("popupOverlay").style.display = "flex";
    } catch(err) { showToast("Google Sign-In Failed!"); } 
});

// NEW LOGOUT BUTTON LOCATION (Inside Admin Panel Header)
document.getElementById('admin-logout-btn').addEventListener('click', () => { 
    if(confirm("Are you sure you want to logout?")) {
        signOut(auth).then(() => {
            document.getElementById('admin-dashboard-panel').classList.remove('active');
            document.getElementById('loginOverlay').style.display = 'flex';
            setTimeout(() => { document.getElementById('loginOverlay').style.opacity = '1'; }, 50); 
        });
    }
});

// Popup Functions
window.closePopup = function(){ document.getElementById("popupOverlay").style.display = "none"; };
window.joinChannel = function(){ window.open('https://whatsapp.com/channel/0029Vb6NBZx1yT2GByTTVf2A', '_blank'); };

// ================= 3. ULTRA ADVANCED FUZZY SEARCH (Debounced) =================
let searchTimeout;
const searchInputEl = document.getElementById('app-search-input');
const closeSearchBtn = document.getElementById('close-search');

searchInputEl.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const searchText = e.target.value;
    searchTimeout = setTimeout(() => {
        if(searchText.trim() === "") {
            document.getElementById('no-results-msg').style.display = 'none';
            window.renderBooksUI(0, 16); 
        } else {
            performFuzzySearch(searchText);
        }
    }, 300);
});

closeSearchBtn.addEventListener('click', () => {
    searchInputEl.value = ''; 
    document.getElementById('no-results-msg').style.display = 'none';
    window.renderBooksUI(0, 16);
    document.getElementById('search-box').classList.remove('active');
    if (history.state && history.state.popup === 'search') { history.back(); }
});

function performFuzzySearch(searchText) {
    let normalizedSearch = searchText.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    let searchTokens = normalizedSearch.split(/\s+/).filter(token => token.length > 0);

    const filteredData = window.booksData.filter(book => {
        let textToSearch = (book.title + " " + book.author).toLowerCase().replace(/[^a-z0-9\s]/g, '');
        return searchTokens.every(token => textToSearch.includes(token));
    });
    
    if(filteredData.length > 0) {
        document.getElementById('no-results-msg').style.display = 'none';
        window.renderBooksUI(0, filteredData.length, filteredData); 
    } else {
        document.getElementById("bookContainer").innerHTML = "";
        document.getElementById('no-results-msg').style.display = 'flex';
    }
}

// ================= 4. UI RENDERING & NAVIGATION =================
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

// Sidebar & Modals
document.getElementById('open-search').addEventListener('click', () => { history.pushState({ popup: 'search' }, ''); document.getElementById('search-box').classList.add('active'); setTimeout(() => { searchInputEl.focus(); }, 300); });
document.getElementById('open-noti').addEventListener('click', () => { history.pushState({ popup: 'noti' }, ''); document.getElementById('noti-panel').classList.add('active'); document.querySelector('.blink-dot').style.display = 'none'; });
document.getElementById('close-noti').addEventListener('click', () => { if (history.state && history.state.popup) { history.back(); } else { document.getElementById('noti-panel').classList.remove('active'); }});

const sidebar = document.getElementById('sidebar'); const sidebarOverlay = document.getElementById('sidebar-overlay');
document.getElementById('open-menu').addEventListener('click', () => { history.pushState({ popup: 'sidebar' }, ''); sidebar.classList.add('active'); sidebarOverlay.classList.add('active'); });
sidebarOverlay.addEventListener('click', () => { history.back(); });

document.getElementById('menu-home').addEventListener('click', (e) => { e.preventDefault(); history.back(); });
document.getElementById('menu-about-dev').addEventListener('click', (e) => { e.preventDefault(); history.replaceState({ popup: 'dev' }, ''); document.getElementById('about-dev-panel').classList.add('active'); document.getElementById('dmca-panel').classList.remove('active'); sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); });
document.getElementById('close-dev-btn').addEventListener('click', () => { history.back(); });

document.getElementById('menu-dmca').addEventListener('click', (e) => { e.preventDefault(); history.replaceState({ popup: 'dmca' }, ''); document.getElementById('dmca-panel').classList.add('active'); document.getElementById('about-dev-panel').classList.remove('active'); sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); });
document.getElementById('close-dmca-btn').addEventListener('click', () => { history.back(); });

// Admin Panel Open/Close
document.getElementById('menu-admin-panel').addEventListener('click', (e) => {
    e.preventDefault();
    history.pushState({ popup: 'admin' }, '');
    document.getElementById('admin-dashboard-panel').classList.add('active');
    sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active');
});
document.getElementById('close-admin-btn').addEventListener('click', () => { history.back(); });

window.addEventListener('popstate', (e) => {
    document.getElementById("downloadModal").style.display = "none";
    document.getElementById('noti-panel').classList.remove('active');
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
    document.getElementById('about-dev-panel').classList.remove('active');
    document.getElementById('dmca-panel').classList.remove('active');
    document.getElementById('admin-dashboard-panel').classList.remove('active');
    document.getElementById('search-box').classList.remove('active');
});

window.openDownloadPage = function(slug) {
    const book = window.booksData.find(b => b.slug === slug); if(!book) return;
    document.getElementById("downloadModal").style.display = "flex";
    document.getElementById("dlPreviewImage").src = book.image; document.getElementById("dlBookTitle").innerText = book.title; document.getElementById("dlBookAuthor").innerText = book.author;
    document.getElementById("dlPdfLinkBtn").onclick = function() { if(book.pdfLink) window.open(book.pdfLink, '_blank'); };
    history.pushState({ popup: 'book' }, '');
}
window.closeDownloadPage = function() { history.back(); }


// ================= 5. ADMIN DASHBOARD LOGIC =================
function showToast(message) {
    const toast = document.getElementById('toast'); document.getElementById('toastMsg').innerText = message;
    toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// Super Admin YouTube Link Converter (Supports Shorts & Quality params)
function getYouTubeEmbedUrl(url) {
    let videoId = "";
    try {
        if(url.includes("v=")) { videoId = url.split("v=")[1].split("&")[0]; } 
        else if(url.includes("youtu.be/")) { videoId = url.split("youtu.be/")[1].split("?")[0]; } 
        else if(url.includes("/shorts/")) { videoId = url.split("/shorts/")[1].split("?")[0]; }
    } catch(e) {}
    return videoId ? `https://www.youtube.com/embed/${videoId}?controls=1&rel=0&modestbranding=1` : url;
}

window.updateTutorialLink = async function() { 
    if(!window.IS_SUPER_ADMIN) return; 
    const newUrl = document.getElementById('newTutorialUrl').value; 
    if(!newUrl) return showToast("Enter URL!"); 
    try { 
        await setDoc(doc(db, "settings", "global"), { tutorialVideoUrl: newUrl }, { merge: true }); 
        showToast("Video Updated Successfully!"); document.getElementById('newTutorialUrl').value = ''; 
    } catch(e) { showToast("Error updating video."); } 
}

// Add Book
document.getElementById('addBookForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const titleInput = document.getElementById('inTitle').value; const imgInput = document.getElementById('inImage').value;
    const newBook = { title: titleInput, author: document.getElementById('inAuthor').value, image: imgInput, year: document.getElementById('inYear').value, lang: document.getElementById('inLang').value, exams: document.getElementById('inExams').value, pdfLink: document.getElementById('inPdfUrl').value, ytLink: document.getElementById('inYtUrl').value, dateAdded: new Date().toLocaleDateString('en-GB').toUpperCase(), createdAt: new Date().getTime() };
    try { await addDoc(collection(db, "books"), newBook); showToast("Book Published!"); e.target.reset(); } catch (error) { showToast("Error saving book."); } 
});

function renderAdminBooksTable() {
    if(!document.getElementById('adminBooksTableBody')) return;
    const tbody = document.getElementById('adminBooksTableBody');
    let htmlString = "";
    window.booksData.forEach((book) => { 
        htmlString += `<tr>
            <td><img src="${book.image}" style="width:40px; border-radius:5px;"></td>
            <td><strong style="color:#fff;">${book.title}</strong><br><span style="font-size:0.8rem; color:#a1a1aa;">${book.author}</span></td>
            <td><button style="padding:5px 10px; background:#3b82f6; color:#fff; border:none; border-radius:5px; margin-right:5px; cursor:pointer;" onclick="openAdminEditModal('${book.id}')"><i class="fas fa-edit"></i></button>
            <button style="padding:5px 10px; background:#ef4444; color:#fff; border:none; border-radius:5px; cursor:pointer;" onclick="deleteBookRecord('${book.id}')"><i class="fas fa-trash"></i></button></td>
        </tr>`; 
    });
    tbody.innerHTML = htmlString;
}

window.deleteBookRecord = async function(id) { if(confirm("Delete this book?")) { try { await deleteDoc(doc(db, "books", id)); showToast("Deleted!"); } catch (e) { showToast("Error!"); } } }

window.openAdminEditModal = function(id) {
    const book = window.booksData.find(x => x.id === id); 
    document.getElementById('editDocId').value = book.id; document.getElementById('edTitle').value = book.title; document.getElementById('edImage').value = book.image; 
    document.getElementById('editModal').style.display = 'flex';
}

document.getElementById('editBookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const docId = document.getElementById('editDocId').value;
    const updatedData = { title: document.getElementById('edTitle').value, image: document.getElementById('edImage').value };
    try { await updateDoc(doc(db, "books", docId), updatedData); document.getElementById('editModal').style.display='none'; showToast("Updated!"); } catch (error) { showToast("Error updating."); }
});

function updateAdminCharts(dlDataArray = [0,0,0,0,0,0,0,0,0,0,0,0]) {
    if(!window.IS_SUPER_ADMIN) return;
    const langCounts = { 'Hindi': 0, 'English': 0, 'Bilingual': 0 }; 
    window.booksData.forEach(b => { if(langCounts[b.lang] !== undefined) { langCounts[b.lang]++; } });
    
    Chart.defaults.color = '#a1a1aa';
    const ctxLang = document.getElementById('langChart');
    if(ctxLang) { 
        if(myLangChart) myLangChart.destroy(); 
        myLangChart = new Chart(ctxLang, { type: 'doughnut', data: { labels: ['Hindi', 'English', 'Bilingual'], datasets: [{ data: [langCounts.Hindi, langCounts.English, langCounts.Bilingual], backgroundColor: ['#ef4444', '#3b82f6', '#8b5cf6'], borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false } }); 
    }

    const ctxDownloads = document.getElementById('downloadsChart');
    if(ctxDownloads) { 
        if(myDownloadsChart) myDownloadsChart.destroy(); 
        myDownloadsChart = new Chart(ctxDownloads, { type: 'line', data: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], datasets: [{ label: `Downloads`, data: dlDataArray, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.2)', borderWidth: 2, fill: true }] }, options: { responsive: true, maintainAspectRatio: false } }); 
    }
}
