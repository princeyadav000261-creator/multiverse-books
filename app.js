import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, setDoc, getDoc, increment, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
// 2. R2 PUBLIC URL (For Cover Images Only)
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

let CURRENT_ADMIN_NAME = "Guest User";
let CURRENT_ADMIN_EMAIL = "";
let CURRENT_ADMIN_PHOTO = "https://i.postimg.cc/D0BF1b77/file-000000000e847207a64f6711d825a859.png";

let savedBooks = JSON.parse(localStorage.getItem('spidy_saved_books')) || [];
let selectedCoverFile = null;
let selectedPdfFile = null;

// ==========================================
// UTILITY FUNCTIONS & TOAST NOTIFICATIONS
// ==========================================
function sanitizeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, function(match) {
        const escape = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return escape[match];
    });
}

let globalToastTimeout;
function showToast(message, type = 'success') {
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

    globalToastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function generateDeviceFingerprint() {
    const nav = window.navigator;
    const screen = window.screen;
    const str = nav.userAgent + nav.language + screen.colorDepth + screen.width + screen.height + new Date().getTimezoneOffset();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        let char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

// Particle Generator Utility
function initParticles(containerId) {
    const container = document.getElementById(containerId);
    if (!container || container.hasChildNodes()) return;
    for (let i = 0; i < 35; i++) {
        let particle = document.createElement('div');
        particle.classList.add('particle');
        let size = Math.random() * 2.2 + 1.8; 
        let posX = Math.random() * 100; 
        let delay = Math.random() * 12; 
        let duration = Math.random() * 10 + 8; 
        particle.style.width = size + 'px'; 
        particle.style.height = size + 'px';
        particle.style.left = posX + '%'; 
        particle.style.animationDelay = `-${delay}s`;
        particle.style.animationDuration = duration + 's';
        container.appendChild(particle);
    }
}

// ==========================================
// 🌟 PROMO CAROUSEL LOGIC WITH ARROWS & MINIMAL DOTS 🌟
// ==========================================
let currentPromoIndex = 0;
let promoAutoSlideInterval;

function initPromoCarousel() {
    const track = document.getElementById('promoCarouselTrack');
    const dots = document.querySelectorAll('.promo-dot');
    const prevBtn = document.getElementById('promoPrevBtn');
    const nextBtn = document.getElementById('promoNextBtn');
    const totalSlides = dots.length;

    if (!track || totalSlides === 0) return;

    function goToSlide(index) {
        currentPromoIndex = index;
        track.style.transform = `translateX(-${currentPromoIndex * 100}%)`;
        dots.forEach((dot, idx) => {
            if (idx === currentPromoIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }

    function startAutoSlide() {
        clearInterval(promoAutoSlideInterval);
        promoAutoSlideInterval = setInterval(() => {
            currentPromoIndex = (currentPromoIndex + 1) % totalSlides;
            goToSlide(currentPromoIndex);
        }, 4000);
    }

    // Dot Click Handler
    dots.forEach((dot, index) => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            goToSlide(index);
            startAutoSlide();
        });
    });

    // Arrow Buttons Handler
    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentPromoIndex = (currentPromoIndex - 1 + totalSlides) % totalSlides;
            goToSlide(currentPromoIndex);
            startAutoSlide();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentPromoIndex = (currentPromoIndex + 1) % totalSlides;
            goToSlide(currentPromoIndex);
            startAutoSlide();
        });
    }

    // Touch Swipe Support for Mobile
    let startX = 0;
    let endX = 0;
    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        clearInterval(promoAutoSlideInterval);
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        endX = e.changedTouches[0].clientX;
        let diff = startX - endX;
        if (Math.abs(diff) > 40) {
            if (diff > 0) {
                currentPromoIndex = (currentPromoIndex + 1) % totalSlides;
            } else {
                currentPromoIndex = (currentPromoIndex - 1 + totalSlides) % totalSlides;
            }
            goToSlide(currentPromoIndex);
        }
        startAutoSlide();
    }, { passive: true });

    goToSlide(0);
    startAutoSlide();
}

// ==========================================
// 🌟 PREMIUM DUAL POPUPS LOGIC 🌟
// ==========================================
let popupsInitialized = false;
function initPremiumPopups() {
    if(popupsInitialized) return; 
    popupsInitialized = true;

    const telegramPopup = document.getElementById('telegramPopup');
    const whatsappPopup = document.getElementById('whatsappPopup');
    const tgMaybeLaterBtn = document.getElementById('tgMaybeLaterBtn');
    const waMaybeLaterBtn = document.getElementById('waMaybeLaterBtn');

    const closeTgPopup = () => { if(telegramPopup) telegramPopup.classList.add('hide'); };
    const closeWaPopup = () => { if(whatsappPopup) whatsappPopup.classList.add('hide'); };

    if(tgMaybeLaterBtn) tgMaybeLaterBtn.addEventListener('click', closeTgPopup);
    if(waMaybeLaterBtn) waMaybeLaterBtn.addEventListener('click', closeWaPopup);

    if(telegramPopup) telegramPopup.addEventListener('click', (e) => { if (e.target === telegramPopup) closeTgPopup(); });
    if(whatsappPopup) whatsappPopup.addEventListener('click', (e) => { if (e.target === whatsappPopup) closeWaPopup(); });

    setTimeout(() => {
        if(telegramPopup) telegramPopup.classList.remove('hide');
    }, 30000); 

    setTimeout(() => {
        if(telegramPopup) telegramPopup.classList.add('hide'); 
        if(whatsappPopup) whatsappPopup.classList.remove('hide');
    }, 100000); 
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
let loaderInterval;

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

loaderInterval = setInterval(() => {
    if (loadingProgress < 85) {
        loadingProgress += Math.floor(Math.random() * 5) + 2; 
        if (loadingProgress > 85) loadingProgress = 85;
        updateLoaderUI(loadingProgress);
    }
}, 200);

function tryTransition() {
    if (isAppReady.auth && isAppReady.data && !hasTransitioned) {
        hasTransitioned = true;
        clearInterval(loaderInterval); 
        
        let fastLoad = setInterval(() => {
            loadingProgress += 4;
            if(loadingProgress >= 100) {
                loadingProgress = 100;
                updateLoaderUI(100);
                clearInterval(fastLoad);

                setTimeout(() => {
                    document.getElementById('mainAppWrapper').style.display = 'block';
                    initPromoCarousel();

                    if (isDeepLinkLoad && pendingBookSlug) {
                        if (isUserLoggedIn) { openDownloadPageLocal(pendingBookSlug, true); } 
                        else {
                            const loginOverlay = document.getElementById('loginOverlay');
                            loginOverlay.style.display = 'flex';
                            setTimeout(() => loginOverlay.style.opacity = '1', 10);
                        }
                    } else {
                        initPremiumPopups(); 
                    }
                    const loader = document.getElementById("loaderScreen");
                    loader.style.opacity = "0"; 
                    setTimeout(() => { loader.style.display = "none"; }, 300);
                }, 400); 
            } else {
                updateLoaderUI(loadingProgress);
            }
        }, 15);
    }
}

// ==========================================
// 🚀 CREDITS & ADVANCED SYNC SYSTEM
// ==========================================
function updateLiveCredits(recentDownloadsCount) {
    if (IS_SUPER_ADMIN) {
        document.getElementById('profile-credits').innerHTML = `<span style="font-size: 24px;">&infin;</span>`; 
        return;
    }
    let remainingCredits = 20 - recentDownloadsCount;
    if (remainingCredits < 0) remainingCredits = 0;
    document.getElementById('profile-credits').innerText = remainingCredits;
}

// Sanitize Saved Bookmarks (Only existing database books count)
function syncAndSanitizeBookmarks() {
    if (!booksData || booksData.length === 0) return;
    const existingSlugs = new Set(booksData.map(b => b.slug));
    savedBooks = savedBooks.filter(slug => existingSlugs.has(slug));
    localStorage.setItem('spidy_saved_books', JSON.stringify(savedBooks));
    const savedCountEl = document.getElementById('profile-saved');
    if (savedCountEl) savedCountEl.innerText = savedBooks.length;
}

// Dynamic Non-repeating Ranking Logic
async function syncProfileAndRankUI() {
    if (!auth.currentUser) return;
    
    document.getElementById('profile-name-ui').innerText = sanitizeHTML(CURRENT_ADMIN_NAME);
    document.getElementById('profile-email-ui').innerText = auth.currentUser.email || "No Email linked";
    document.getElementById('profile-avatar-ui').src = CURRENT_ADMIN_PHOTO;
    
    syncAndSanitizeBookmarks();

    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            let now = Date.now();
            let validDownloads = [];
            let accessedSlugs = new Set();
            (data.recentDownloads || []).forEach(item => {
                let time = typeof item === 'number' ? item : item.time;
                let slug = typeof item === 'number' ? null : item.slug;
                if (now - time < 24 * 60 * 60 * 1000) {
                    validDownloads.push(item);
                    if(slug) accessedSlugs.add(slug);
                }
            });
            let legacyCount = validDownloads.filter(i => typeof i === 'number').length;
            updateLiveCredits(accessedSlugs.size + legacyCount);

            document.getElementById('profile-downloads').innerText = data.lifetimeDownloads || 0;
        }

        const usersRef = collection(db, "users");
        const querySnapshot = await getDocs(usersRef);
        let allUsers = [];
        querySnapshot.forEach((docSnap) => {
            allUsers.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        // Fair Sort: Lifetime reads desc, then account creation time asc, then unique ID
        allUsers.sort((a, b) => {
            let readsA = parseInt(a.lifetimeDownloads) || 0;
            let readsB = parseInt(b.lifetimeDownloads) || 0;
            if (readsB !== readsA) return readsB - readsA;
            
            let timeA = parseInt(a.createdAt) || 9999999999999;
            let timeB = parseInt(b.createdAt) || 9999999999999;
            if (timeA !== timeB) return timeA - timeB;
            
            return a.id.localeCompare(b.id);
        });

        let rank = 1;
        for (let i = 0; i < allUsers.length; i++) {
            if (allUsers[i].id === auth.currentUser.uid) {
                rank = i + 1;
                break;
            }
        }

        const rankElement = document.getElementById('profile-rank');
        if (rank === 1) {
            rankElement.style.color = "#fbbf24";
            rankElement.innerHTML = `<i class="fas fa-crown"></i> #1`;
        } else if (rank <= 3) {
            rankElement.style.color = rank === 2 ? "#9ca3af" : "#b45309";
            rankElement.innerText = "#" + rank;
        } else {
            rankElement.style.color = "#ffffff";
            rankElement.innerText = "#" + rank;
        }
    } catch (error) {
        console.error("Profile rank sync error:", error);
    }
}

// ==========================================
// AUTHENTICATION OBSERVER
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        isUserLoggedIn = true;
        localStorage.setItem('isUserLoggedIn', 'true');

        let dName = user.displayName || user.email.split('@')[0];
        document.getElementById('sidebarProfileName').innerText = sanitizeHTML(dName);
        
        CURRENT_ADMIN_PHOTO = user.photoURL ? user.photoURL : "https://i.postimg.cc/D0BF1b77/file-000000000e847207a64f6711d825a859.png";
        document.getElementById('sidebarProfileImg').src = CURRENT_ADMIN_PHOTO;
        
        CURRENT_ADMIN_NAME = dName;
        CURRENT_ADMIN_EMAIL = user.email;

        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            const cleanEmail = user.email ? user.email.toLowerCase().trim() : "";
            const adminDocRef = doc(db, "admins", cleanEmail);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists()) {
                IS_SUPER_ADMIN = true;
                document.getElementById('sidebarRoleText').innerText = "Super Admin";
            } else {
                IS_SUPER_ADMIN = false;
                document.getElementById('sidebarRoleText').innerText = "Verified User";
                switchAdminTabLocal('add');
            }

            if (!userSnap.exists()) {
                await setDoc(userRef, { 
                    email: user.email, 
                    name: dName, 
                    photo: user.photoURL || "", 
                    recentDownloads: [], 
                    lifetimeDownloads: 0, 
                    createdAt: new Date().getTime() 
                }, { merge: true });
                updateLiveCredits(0); 
            }

            syncProfileAndRankUI();

        } catch (error) { 
            console.error("Verification failed:", error); 
            IS_SUPER_ADMIN = false; 
        }
    } else {
        isUserLoggedIn = false; 
        IS_SUPER_ADMIN = false; 
        localStorage.removeItem('isUserLoggedIn');
        document.getElementById('sidebarProfileName').innerText = "SPIDY BOOK HUB";
        document.getElementById('sidebarRoleText').innerText = "Please Login";
        document.getElementById('sidebarProfileImg').src = "https://i.postimg.cc/D0BF1b77/file-000000000e847207a64f6711d825a859.png";
        document.getElementById('profile-name-ui').innerText = "Guest User";
        document.getElementById('profile-email-ui').innerText = "Please login to sync progress";
        document.getElementById('profile-credits').innerText = "--";
        document.getElementById('profile-downloads').innerText = "0";
        document.getElementById('profile-saved').innerText = "0";
        document.getElementById('profile-rank').innerText = "#--";
    }

    isAppReady.auth = true; 
    tryTransition();

    // PROMPTS LISTENER
    onSnapshot(query(collection(db, "prompts"), orderBy("createdAt", "asc")), (snapshot) => {
        const container = document.getElementById('promptsContainer');
        if(!container) return;
        container.innerHTML = '';
        if(snapshot.empty) { 
            container.innerHTML = `<div style="text-align:center; padding:20px; color:#a1a1aa; font-weight:800;">No prompts available yet.</div>`; 
            return; 
        }
        snapshot.forEach(doc => {
            const data = doc.data(); 
            const id = doc.id;
            const safeText = sanitizeHTML(data.text);
            const safeInstruction = data.instruction ? sanitizeHTML(data.instruction).replace(/\n/g, "<br>") : "";
            const safeTitle = sanitizeHTML(data.title);
            let instructionHTML = '';
            if(safeInstruction) { 
                instructionHTML = `<div style="color: #ffffff; font-weight: 600; font-size: 14px; margin-bottom: 8px; margin-left: 2px; line-height: 1.5; font-family: 'Inter', sans-serif;">${safeInstruction}</div>`; 
            }
            container.innerHTML += `<div class="telegram-prompt-wrapper">${instructionHTML}<div class="telegram-prompt-card"><div class="telegram-prompt-header" style="display:flex; align-items:center;">${safeTitle}</div><div class="telegram-prompt-body">${safeText}</div><div class="telegram-prompt-footer"><button class="telegram-copy-btn" data-text="${encodeURIComponent(data.text)}" id="copy-btn-${id}"><i class="far fa-copy"></i> COPY CODE</button></div></div></div>`;
        });
    });

    // BOOKS LISTENER
    const q = query(collection(db, "books"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        booksData = [];
        snapshot.forEach((doc) => {
            let data = doc.data(); 
            data.id = doc.id;
            data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            booksData.push(data);
        });
        mainFilteredData = [...booksData]; 
        syncAndSanitizeBookmarks();
        updateDynamicFilters(); 
        applyMasterFilter(); 
        generateNotifications();
        
        isAppReady.data = true; 
        tryTransition();
    });
});

// Prompts copy handler
document.getElementById('promptsContainer').addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.telegram-copy-btn');
    if (copyBtn) {
        const textToCopy = decodeURIComponent(copyBtn.getAttribute('data-text'));
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> COPIED!';
            copyBtn.style.background = 'rgba(16, 185, 129, 0.2)';
            copyBtn.style.color = '#10b981';
            copyBtn.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            setTimeout(() => {
                copyBtn.innerHTML = originalHtml;
                copyBtn.style.background = 'transparent';
                copyBtn.style.color = '#ffffff';
                copyBtn.style.border = 'none';
            }, 2000);
        }).catch(() => { showToast("Failed to copy text!", "error"); });
    }
});

// ==========================================
// LOGIN & LOGOUT SYSTEM
// ==========================================
function closeLoginOverlayLocal() {
    const loginOverlay = document.getElementById('loginOverlay');
    loginOverlay.style.opacity = '0';
    setTimeout(() => { 
        loginOverlay.style.display = 'none'; 
        if (isDeepLinkLoad && !isUserLoggedIn) {
            isDeepLinkLoad = false;
            window.history.replaceState({}, '', window.location.pathname);
            initPremiumPopups(); 
        }
    }, 500);
}
document.getElementById('closeLoginBtn').addEventListener('click', closeLoginOverlayLocal);
document.getElementById('toggleEye').addEventListener('click', () => {
    const passInput = document.getElementById('loginPassword'); 
    const eyeIcon = document.getElementById('toggleEye');
    if (passInput.type === 'password') { 
        passInput.type = 'text'; 
        eyeIcon.classList.replace('fa-eye', 'fa-eye-slash'); 
        eyeIcon.style.color = '#00d2ff'; 
    } else { 
        passInput.type = 'password'; 
        eyeIcon.classList.replace('fa-eye-slash', 'fa-eye'); 
        eyeIcon.style.color = '#a1a1aa'; 
    }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const email = document.getElementById('loginEmail').value; 
    const pass = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn'); 
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-spinner fa-spin"></i> Authenticating...</span>`;
    try { 
        await signInWithEmailAndPassword(auth, email, pass); 
        e.target.reset(); 
        showToast("Login Successful!", "success"); 
        btn.innerHTML = originalContent; 
        closeLoginOverlayLocal();
        if (isDeepLinkLoad && pendingBookSlug) {
            document.getElementById('mainAppWrapper').style.display = 'block';
            setTimeout(() => { openDownloadPageLocal(pendingBookSlug, true); }, 300);
        }
    } catch(err) { 
        showToast("Failed: Invalid Credentials!", "error"); 
        btn.innerHTML = originalContent; 
    } 
});

document.getElementById('googleSignInBtn').addEventListener('click', async () => { 
    const btn = document.getElementById('googleSignInBtn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-spinner fa-spin"></i> Connecting...</span>`;
    try { 
        await signInWithPopup(auth, provider); 
        showToast("Google Login Successful!", "success"); 
        btn.innerHTML = originalContent; 
        closeLoginOverlayLocal();
        if (isDeepLinkLoad && pendingBookSlug) {
            document.getElementById('mainAppWrapper').style.display = 'block';
            setTimeout(() => { openDownloadPageLocal(pendingBookSlug, true); }, 300);
        }
    } catch(err) { 
        showToast("Failed: Google Sign-In Error.", "error"); 
        btn.innerHTML = originalContent; 
    } 
});

const logoutBtn = document.getElementById('admin-logout-btn');
const logoutOverlay = document.getElementById('customLogoutOverlay');
const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');
const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

if (logoutBtn) logoutBtn.addEventListener('click', () => { 
    if (logoutOverlay) { 
        logoutOverlay.style.display = 'flex'; 
        setTimeout(() => logoutOverlay.classList.add('show'), 10); 
    } 
});
if (cancelLogoutBtn) cancelLogoutBtn.addEventListener('click', () => { 
    if (logoutOverlay) { 
        logoutOverlay.classList.remove('show'); 
        setTimeout(() => logoutOverlay.style.display = 'none', 300); 
    } 
});
if (confirmLogoutBtn) {
    confirmLogoutBtn.addEventListener('click', async () => {
        confirmLogoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            await signOut(auth);
            localStorage.removeItem('isUserLoggedIn');
            window.location.reload();
        } catch (error) { 
            showToast("Error signing out!", "error"); 
        }
    });
}

// ==========================================
// ADVANCED DUAL FILTER SYSTEM
// ==========================================
const EXAM_CATEGORY_MAP = {
    "Ssc": ["SSC", "CGL", "CHSL", "MTS", "CPO", "GD", "STENOGRAPHER", "SELECTION POST"],
    "Railway": ["RAILWAY", "RRB", "NTPC", "GROUP D", "ALP", "TECHNICIAN", "RPF"],
    "Defence": ["NDA", "CDS", "AFCAT", "NAVY", "ARMY", "AIRFORCE", "AGNIVEER"],
    "Banking": ["BANK", "IBPS", "SBI", "PO", "CLERK", "RBI", "LIC"],
    "Teaching": ["CTET", "STET", "UPTET", "KVS", "NVS", "BPSC TRE", "DSSSB"],
    "Upsc": ["UPSC", "BPSC", "UPPSC", "MPPSC", "STATE PSC", "PCS", "CIVIL SERVICES"],
    "Police": ["POLICE", "UP POLICE", "DELHI POLICE", "BIHAR POLICE", "SI", "CONSTABLE", "DAROGA"],
    "Jee": ["JEE", "IIT", "MAINS", "ADVANCED", "BITSAT"],
    "Neet": ["NEET", "MEDICAL", "AIIMS"]
};

let currentSelectedCategory = "All";
let currentSelectedLanguage = "All";

function updateDynamicFilters() {
    const activeCategories = new Set();
    booksData.forEach(book => {
        if(!book.exams) return;
        let bookExamsString = book.exams.toUpperCase();
        let matchedMainCategory = false;
        for (let mainCategory in EXAM_CATEGORY_MAP) {
            let keywords = EXAM_CATEGORY_MAP[mainCategory];
            if (keywords.some(keyword => bookExamsString.includes(keyword))) { 
                activeCategories.add(mainCategory); 
                matchedMainCategory = true; 
            }
        }
        if (!matchedMainCategory) {
            book.exams.split(',').forEach(exam => {
                let cleanExam = exam.trim();
                if (cleanExam.length > 0) activeCategories.add(cleanExam.charAt(0).toUpperCase() + cleanExam.slice(1).toLowerCase());
            });
        }
    });

    const sortedCategories = Array.from(activeCategories).sort();
    const catGrid = document.getElementById('categoryFilterGrid'); 
    let html = `<div class="f-pill ${currentSelectedCategory === 'All' ? 'active' : ''}" data-category="All">All</div>`;
    sortedCategories.forEach(category => { 
        html += `<div class="f-pill ${category === currentSelectedCategory ? 'active' : ''}" data-category="${sanitizeHTML(category)}">${sanitizeHTML(category)}</div>`; 
    });
    catGrid.innerHTML = html;
}

document.getElementById('categoryFilterGrid').addEventListener('click', (e) => {
    if(e.target.classList.contains('f-pill')) {
        document.querySelectorAll('#categoryFilterGrid .f-pill').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active'); 
        currentSelectedCategory = e.target.getAttribute('data-category');
    }
});

document.getElementById('languageFilterGrid').addEventListener('click', (e) => {
    if(e.target.classList.contains('f-pill')) {
        document.querySelectorAll('#languageFilterGrid .f-pill').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active'); 
        currentSelectedLanguage = e.target.getAttribute('data-lang');
    }
});

document.getElementById('applyFiltersBtn').addEventListener('click', () => { 
    document.getElementById('filterBottomOverlay').classList.remove('active'); 
    applyMasterFilter(); 
});

function applyMasterFilter() {
    const searchInputRaw = document.getElementById('app-search-input').value.trim();
    let normalizedSearch = searchInputRaw.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    let searchTokens = normalizedSearch.split(/\s+/).filter(token => token.length > 0);

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
    
    loadedCount = 0; 
    const infiniteLoader = document.getElementById('infinite-loader');
    if(mainFilteredData.length > 0) { 
        document.getElementById('no-results-msg').style.display = 'none'; 
        if(infiniteLoader) infiniteLoader.style.display = mainFilteredData.length > getBatchSize() ? 'flex' : 'none';
        renderBooksUI(0, getBatchSize(), mainFilteredData); 
    } else { 
        document.getElementById("bookContainer").innerHTML = ""; 
        document.getElementById('no-results-msg').style.display = 'flex'; 
        if(infiniteLoader) infiniteLoader.style.display = 'none';
    }
}

const searchInputEl = document.getElementById('app-search-input'); 
let searchTimeout;
searchInputEl.addEventListener('input', () => { 
    clearTimeout(searchTimeout); 
    searchTimeout = setTimeout(() => { applyMasterFilter(); }, 300); 
});
document.getElementById('close-search').addEventListener('click', () => { 
    searchInputEl.value = ''; 
    applyMasterFilter(); 
    document.getElementById('search-box').classList.remove('active'); 
    if (history.state && history.state.popup === 'search') { history.back(); }
});
document.getElementById('openAuthorFilterBtn').addEventListener('click', () => { 
    document.getElementById('filterBottomOverlay').classList.add('active'); 
});
document.getElementById('closeAuthorFilterBtn').addEventListener('click', () => { 
    document.getElementById('filterBottomOverlay').classList.remove('active'); 
});

// ==========================================
// RENDERING UI & INFINITE SCROLL
// ==========================================
function getBatchSize() { 
    let w = window.innerWidth; 
    return (w >= 1200 ? 5 : w >= 900 ? 4 : w >= 600 ? 3 : 2) * 4; 
}

const infiniteScrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && loadedCount < mainFilteredData.length && !isLoadingMore && document.getElementById('no-results-msg').style.display !== 'flex') {
            isLoadingMore = true; 
            if(document.getElementById('infinite-loader')) document.getElementById('infinite-loader').style.display = 'flex';
            setTimeout(() => {
                renderBooksUI(loadedCount, getBatchSize(), mainFilteredData);
                if (loadedCount >= mainFilteredData.length && document.getElementById('infinite-loader')) {
                    document.getElementById('infinite-loader').style.display = 'none'; 
                }
                isLoadingMore = false;
            }, 500);
        }
    });
}, { root: document.getElementById('mainContentArea'), rootMargin: '0px 0px 200px 0px', threshold: 0.1 });

if (document.getElementById('scroll-sentinel')) infiniteScrollObserver.observe(document.getElementById('scroll-sentinel'));

function renderBooksUI(startIndex, count, customData = null) {
    const container = document.getElementById("bookContainer");
    let dataToRender = customData ? customData : mainFilteredData;
    let endIndex = Math.min(startIndex + count, dataToRender.length);
    if(startIndex === 0) container.innerHTML = "";
    let htmlChunk = "";
    for(let i = startIndex; i < endIndex; i++) {
        let book = dataToRender[i];
        let langClass = book.lang.toLowerCase() === 'hindi' ? 'tag-lang-hindi' : 'tag-lang-english';
        let isSaved = savedBooks.includes(book.slug);
        let bookmarkIcon = isSaved ? 'fas fa-bookmark' : 'far fa-bookmark';
        htmlChunk += `<div class="book-card" data-slug="${book.slug}"><div class="card-img-wrapper"><div class="badge-free">FREE</div><div class="bookmark-btn" data-action="bookmark"><i class="${bookmarkIcon}"></i></div><img src="${book.image}" loading="lazy" class="book-image" oncontextmenu="return false;" draggable="false"></div><div class="book-details"><div class="book-title">${sanitizeHTML(book.title)}</div><div class="book-author">${sanitizeHTML(book.author)}</div><div class="tags-container"><span class="book-tag tag-year">${sanitizeHTML(book.year)}</span><span class="book-tag ${langClass}">${sanitizeHTML(book.lang)}</span></div></div></div>`;
    }
    container.insertAdjacentHTML('beforeend', htmlChunk); 
    loadedCount = endIndex;
}

document.getElementById('bookContainer').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if(card) {
        const slug = card.getAttribute('data-slug');
        const bookmarkBtn = e.target.closest('.bookmark-btn');
        if(bookmarkBtn) toggleBookmarkLocal(bookmarkBtn.querySelector('i'), slug); 
        else openDownloadPageLocal(slug);
    }
});

function toggleBookmarkLocal(iconElement, slug) {
    const index = savedBooks.indexOf(slug);
    if (index === -1) { 
        savedBooks.push(slug); 
        if(iconElement) iconElement.className = "fas fa-bookmark"; 
        showToast("Saved to Bookmarks!", "success");
    } else { 
        savedBooks.splice(index, 1); 
        if(iconElement) iconElement.className = "far fa-bookmark"; 
        showToast("Removed from Bookmarks!", "success");
    }
    localStorage.setItem('spidy_saved_books', JSON.stringify(savedBooks));
    syncAndSanitizeBookmarks();
    if(document.getElementById('bookmarks-panel').classList.contains('active')) renderSavedBooksUI(); 
}

function renderSavedBooksUI() {
    syncAndSanitizeBookmarks();
    const container = document.getElementById("savedBooksContainer"); 
    const noMsg = document.getElementById("no-saved-msg");
    const savedBooksData = booksData.filter(book => savedBooks.includes(book.slug));
    
    if (savedBooksData.length === 0) { 
        container.innerHTML = ""; 
        noMsg.style.display = "flex"; 
        return; 
    }
    noMsg.style.display = "none"; 
    let htmlChunk = "";
    savedBooksData.forEach(book => {
        let langClass = book.lang.toLowerCase() === 'hindi' ? 'tag-lang-hindi' : 'tag-lang-english';
        htmlChunk += `<div class="book-card" data-slug="${book.slug}"><div class="card-img-wrapper"><div class="badge-free">FREE</div><div class="bookmark-btn" data-action="bookmark"><i class="fas fa-bookmark"></i></div><img src="${book.image}" loading="lazy" class="book-image" oncontextmenu="return false;" draggable="false"></div><div class="book-details"><div class="book-title">${sanitizeHTML(book.title)}</div><div class="book-author">${sanitizeHTML(book.author)}</div><div class="tags-container"><span class="book-tag tag-year">${sanitizeHTML(book.year)}</span><span class="book-tag ${langClass}">${sanitizeHTML(book.lang)}</span></div></div></div>`;
    });
    container.innerHTML = htmlChunk;
}

document.getElementById('savedBooksContainer').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if(card) {
        const slug = card.getAttribute('data-slug');
        const bookmarkBtn = e.target.closest('.bookmark-btn');
        if(bookmarkBtn) toggleBookmarkLocal(bookmarkBtn.querySelector('i'), slug); 
        else openDownloadPageLocal(slug); 
    }
});

function generateNotifications() {
    const notiContainer = document.getElementById('dynamic-noti-container'); 
    if(!notiContainer) return;
    notiContainer.innerHTML = ''; 
    booksData.slice(0, 45).forEach((book) => {
        let dateStr = "00/00/0000";
        if (book.dateAdded) { dateStr = sanitizeHTML(book.dateAdded); } 
        else if (book.createdAt) { 
            const d = new Date(book.createdAt); 
            dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`; 
        }
        notiContainer.innerHTML += `<div class="noti-card-dynamic" data-slug="${book.slug}" style="cursor:pointer;"><img src="${book.image}" loading="lazy" class="noti-card-img"><div class="noti-card-content"><div class="noti-card-title">${sanitizeHTML(book.title)} Book Added ✅</div><div class="noti-card-desc">New book is now available.</div><div style="font-size: 10px; color: #10b981; margin-top: 2px; font-weight: 700; display: flex; align-items: center; gap: 4px;"><i class="far fa-calendar-alt"></i> Added: ${dateStr}</div></div></div>`;
    });
}
document.getElementById('dynamic-noti-container').addEventListener('click', (e) => {
    const card = e.target.closest('.noti-card-dynamic'); 
    if(card) openDownloadPageLocal(card.getAttribute('data-slug'));
});

// ==========================================
// NAVIGATION & MODAL PANELS
// ==========================================
document.getElementById('open-search').addEventListener('click', () => { 
    history.pushState({ popup: 'search' }, ''); 
    document.getElementById('search-box').classList.add('active'); 
    setTimeout(() => { searchInputEl.focus(); }, 300); 
});
document.getElementById('open-noti').addEventListener('click', () => { 
    history.pushState({ popup: 'noti' }, ''); 
    document.getElementById('noti-panel').classList.add('active'); 
    document.querySelector('.blink-dot').style.display = 'none'; 
});

const sidebar = document.getElementById('sidebar'); 
const sidebarOverlay = document.getElementById('sidebar-overlay');
document.getElementById('open-menu').addEventListener('click', () => { 
    history.pushState({ popup: 'sidebar' }, ''); 
    sidebar.classList.add('active'); 
    sidebarOverlay.classList.add('active'); 
});
sidebarOverlay.addEventListener('click', () => { history.back(); });

document.getElementById('menu-dmca').addEventListener('click', (e) => { 
    e.preventDefault(); 
    history.pushState({ popup: 'dmca' }, ''); 
    document.getElementById('dmca-panel').classList.add('active'); 
    sidebar.classList.remove('active'); 
    sidebarOverlay.classList.remove('active'); 
});
document.getElementById('close-dmca-btn').addEventListener('click', () => { history.back(); });

document.getElementById('menu-bookmarks').addEventListener('click', (e) => { 
    e.preventDefault(); 
    history.pushState({ popup: 'bookmarks' }, ''); 
    document.getElementById('bookmarks-panel').classList.add('active'); 
    sidebar.classList.remove('active'); 
    sidebarOverlay.classList.remove('active'); 
    renderSavedBooksUI(); 
});
document.getElementById('close-bookmarks-btn').addEventListener('click', () => { history.back(); });

function switchTab(tabId) { 
    document.querySelectorAll('.app-tab').forEach(tab => { 
        tab.style.display = 'none'; 
        tab.classList.remove('active'); 
    }); 
    const target = document.getElementById(tabId); 
    if(target) { 
        target.style.display = 'flex'; 
        setTimeout(() => target.classList.add('active'), 10); 
    } 
}
function setNavActive(id) { 
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active')); 
    document.getElementById(id).classList.add('active'); 
}
function closeAllPanels() { 
    document.getElementById('noti-panel').classList.remove('active'); 
    document.getElementById('sidebar').classList.remove('active'); 
    document.getElementById('sidebar-overlay').classList.remove('active'); 
    document.getElementById('dmca-panel').classList.remove('active'); 
    document.getElementById('bookmarks-panel').classList.remove('active'); 
    document.getElementById('search-box').classList.remove('active'); 
}

// Bottom Nav Listeners
document.getElementById('nav-home').addEventListener('click', () => { 
    setNavActive('nav-home'); 
    closeAllPanels(); 
    switchTab('tab-home'); 
    window.history.replaceState({}, '', window.location.pathname); 
});

document.getElementById('nav-upload').addEventListener('click', () => {
    if(!isUserLoggedIn) { 
        document.getElementById('loginOverlay').style.display = 'flex'; 
        setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10); 
        setNavActive('nav-home'); 
        return; 
    }
    setNavActive('nav-upload'); 
    closeAllPanels(); 
    switchTab('tab-upload'); 
    setTimeout(() => { document.getElementById('uploadPopup').classList.remove('hidden'); }, 300);
});

document.getElementById('nav-dev').addEventListener('click', () => { 
    if(!isUserLoggedIn) {
        document.getElementById('loginOverlay').style.display = 'flex';
        setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10);
        return;
    }
    setNavActive('nav-dev'); 
    closeAllPanels(); 
    switchTab('tab-about'); 
    initParticles('particlesTabMe');
    syncProfileAndRankUI();
});

document.getElementById('closeUploadPopupBtn').addEventListener('click', () => { 
    document.getElementById('uploadPopup').classList.add('hidden'); 
});

window.addEventListener('popstate', () => {
    closeAllPanels(); 
    applyMasterFilter();
    const sBook = new URLSearchParams(window.location.search).get('book');
    if(sBook) { openDownloadPageLocal(sBook, true); } 
    else { document.getElementById("downloadModal").style.display = "none"; }
});

// ==========================================
// 🌟 SECURE READ ONLINE (API PROXY) & DOWNLOAD LOCK 🌟
// ==========================================
const detectTokenFromUrl = new URLSearchParams(window.location.search).get('t');
if (detectTokenFromUrl) {
    document.getElementById('tokenInput').value = detectTokenFromUrl;
    window.history.replaceState({}, document.title, window.location.pathname);
    document.getElementById('tokenModalOverlay').style.display = 'flex';
    initParticles('particles');
}

function openDownloadPageLocal(slug, skipPushState = false) {
    if(!isUserLoggedIn) {
        document.getElementById('loginOverlay').style.display = 'flex'; 
        setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10); 
        return;
    }
    const book = booksData.find(b => b.slug === slug); 
    if(!book) return;
    
    document.getElementById("downloadModal").style.display = "flex";
    
    const previewImg = document.getElementById("dlPreviewImage");
    previewImg.classList.add("image-loading-skeleton"); 
    previewImg.src = book.image; 
    previewImg.onload = () => { previewImg.classList.remove("image-loading-skeleton"); };

    document.getElementById("dlBookTitle").innerText = sanitizeHTML(book.title); 
    document.getElementById("dlBookAuthor").innerText = sanitizeHTML(book.author);
    
    // Download locked button
    const dlPdfBtn = document.getElementById("dlPdfLinkBtn");
    dlPdfBtn.style.pointerEvents = "none"; 
    dlPdfBtn.onclick = function(e) { 
        e.preventDefault(); 
        return false; 
    };

    // Read Online Button
    document.getElementById("dlReadOnlineBtn").onclick = async function() {
        if(!isUserLoggedIn || !auth.currentUser) { 
            document.getElementById('loginOverlay').style.display = 'flex'; 
            setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10); 
            return; 
        }
        
        const btn = document.getElementById("dlReadOnlineBtn"); 
        const originalText = btn.innerHTML; 

        const savedData = localStorage.getItem('spidy_secure_session');
        let hasValidToken = false;

        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                if (parsed.fp === generateDeviceFingerprint() && parsed.expiry > Date.now()) {
                    hasValidToken = true;
                }
            } catch(e) {}
        }

        if(!hasValidToken && !IS_SUPER_ADMIN) {
             document.getElementById('tokenModalOverlay').style.display = 'flex';
             initParticles('particles');
             return; 
        }
        
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Getting Secure Access...`; 
        btn.disabled = true;

        try {
            const userToken = await auth.currentUser.getIdToken(true);

            const response = await fetch('/api/get-book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    bookId: book.id, 
                    bookSlug: book.slug, 
                    userToken: userToken 
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                
                // Live Credits & Read Counter Update
                const userRef = doc(db, "users", auth.currentUser.uid);
                await updateDoc(userRef, {
                    lifetimeDownloads: increment(1)
                });

                syncProfileAndRankUI();

                // Open Secure PDF Viewer
                const pdfViewer = document.getElementById('pdfViewerOverlay');
                const iframe = document.getElementById('pdfIframe');
                const title = document.getElementById('pdfViewerTitle');
                
                title.innerText = sanitizeHTML(book.title);
                iframe.src = data.pdfLink + "&toolbar=0&navpanes=0&scrollbar=0"; 
                pdfViewer.style.display = 'flex';

            } else {
                if (response.status === 401 || (data.error && data.error.includes('Unauthorized'))) {
                    localStorage.removeItem('spidy_secure_session');
                    document.getElementById('tokenModalOverlay').style.display = 'flex';
                    initParticles('particles');
                } else {
                    showToast(data.error || "Daily limit reached or failed to load book.", "error");
                }
            }

            btn.innerHTML = originalText; 
            btn.disabled = false;

        } catch (error) { 
            showToast("Network Error: Could not load the book.", "error"); 
            btn.innerHTML = originalText; 
            btn.disabled = false; 
        }
    };

    // Close PDF Viewer
    document.getElementById("closePdfViewerBtn").onclick = function() {
        document.getElementById('pdfViewerOverlay').style.display = 'none';
        document.getElementById('pdfIframe').src = ""; 
    };

    document.getElementById("pdfContainer").addEventListener('contextmenu', event => event.preventDefault());

    let examsArray = (book.exams || "General").split(',').map(item => sanitizeHTML(item.trim()));
    document.getElementById("dlModalTags").innerHTML = examsArray.map(exam => `<div class="dl-modal-tag">${exam}</div>`).join('');
    activeBookSlug = book.slug; 
    activeBookTitle = book.title;
    
    if (!skipPushState) { 
        history.pushState({ popup: 'book' }, '', '?book=' + book.slug); 
    }
}

document.getElementById('closeDlBtn').addEventListener('click', closeDownloadPageLocal);
function closeDownloadPageLocal() {
    if (history.state && history.state.popup === 'book') { 
        history.back(); 
    } else { 
        document.getElementById("downloadModal").style.display = "none"; 
        window.history.replaceState({}, '', window.location.pathname); 
    }
    if(isDeepLinkLoad) {
        isDeepLinkLoad = false; 
        const loader = document.getElementById("loaderScreen"); 
        loader.style.display = "flex"; 
        loader.style.opacity = "1"; 
        updateLoaderUI(100);
        setTimeout(() => { 
            loader.style.opacity = "0"; 
            setTimeout(() => { 
                loader.style.display = "none"; 
                initPremiumPopups(); 
            }, 300); 
        }, 1500); 
    }
}

document.getElementById('shareBookBtn').addEventListener('click', () => {
    const shareUrl = window.location.origin + window.location.pathname + "?book=" + activeBookSlug;
    if (navigator.share) {
        navigator.share({ title: activeBookTitle, text: "Read this book online", url: shareUrl });
    } else { 
        navigator.clipboard.writeText(shareUrl); 
        showToast("Link Copied!", "success"); 
    }
});

// ==========================================
// REPORT ISSUE MODAL
// ==========================================
document.getElementById('reportLinkBtn').addEventListener('click', () => {
    document.getElementById('reportModalOverlay').classList.add('active');
});

document.getElementById('closeReportBtn').addEventListener('click', () => {
    document.getElementById('reportModalOverlay').classList.remove('active');
});

document.getElementById('reportModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('reportModalOverlay')) {
        document.getElementById('reportModalOverlay').classList.remove('active');
    }
});

const reportOptions = document.querySelectorAll('.rm-option');
const submitReportBtn = document.getElementById('submitReportBtn');

reportOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        reportOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        submitReportBtn.classList.add('enabled');
    });
});

submitReportBtn.addEventListener('click', async () => {
    const selectedOption = document.querySelector('.rm-option.selected');
    if (selectedOption) {
        const issueType = selectedOption.querySelector('span').innerText;
        
        try {
            await addDoc(collection(db, "reports"), {
                bookTitle: activeBookTitle || "Unknown",
                bookSlug: activeBookSlug || "Unknown",
                issueType: issueType,
                status: 'Pending',
                reportedBy: (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : 'Unknown User',
                createdAt: new Date().getTime()
            });
        } catch (error) {
            console.error("Failed to send report:", error);
        }

        submitReportBtn.innerHTML = '<i class="fas fa-check-circle"></i> Successfully Reported';
        submitReportBtn.style.background = '#10b981';
        submitReportBtn.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.4)';
        
        setTimeout(() => {
            document.getElementById('reportModalOverlay').classList.remove('active');
            setTimeout(() => {
                submitReportBtn.innerHTML = 'Submit Report';
                submitReportBtn.style.background = '#ef4444';
                submitReportBtn.style.boxShadow = '0 4px 15px rgba(239, 68, 68, 0.3)';
                submitReportBtn.classList.remove('enabled');
                reportOptions.forEach(o => o.classList.remove('selected'));
            }, 400);
        }, 1200);
    }
});

// ==========================================
// TOKEN VERIFICATION MODAL
// ==========================================
document.getElementById('closeTokenModalBtn').addEventListener('click', () => {
    document.getElementById('tokenModalOverlay').style.display = 'none';
});

document.getElementById('tokenInput').addEventListener('input', () => {
    document.getElementById('inputBoxWrapperToken').classList.remove('error-state', 'success-state');
});

document.getElementById('getKeyBtn').addEventListener('click', () => {
    const btn = document.getElementById('getKeyBtn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    
    setTimeout(() => {
        window.location.href = "https://arolinks.com/6RTf5";
        btn.innerHTML = originalContent;
    }, 600);
});

document.getElementById('verifyBtn').addEventListener('click', async () => {
    const tokenInput = document.getElementById('tokenInput');
    const tokenValue = tokenInput.value.trim();
    const inputBox = document.getElementById('inputBoxWrapperToken');
    const btn = document.getElementById('verifyBtn');

    inputBox.classList.remove('error-state', 'success-state');

    if (tokenValue.length < 5) {
        inputBox.classList.add('error-state');
        setTimeout(() => inputBox.classList.remove('error-state'), 2500); 
        showToast('Invalid Token Format!', 'error');
        return;
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

    const currentFingerprint = generateDeviceFingerprint();

    try {
        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenValue, fingerprint: currentFingerprint })
        });

        const data = await response.json();

        if (response.ok) {
            inputBox.classList.add('success-state');
            showToast('Access Granted! Valid for 24 Hours.', 'success');
            
            localStorage.setItem('spidy_secure_session', JSON.stringify({
                token: tokenValue,
                fp: currentFingerprint,
                expiry: Date.now() + 24 * 60 * 60 * 1000 
            }));

            setTimeout(() => {
                document.getElementById('tokenModalOverlay').style.display = 'none';
                btn.innerHTML = '<i class="fas fa-shield-halved"></i> Verify';
                document.getElementById("dlReadOnlineBtn").click();
            }, 1000);

        } else {
            inputBox.classList.add('error-state');
            showToast(data.error || 'Verification Failed', 'error');
            btn.innerHTML = '<i class="fas fa-shield-halved"></i> Verify';
        }
    } catch (err) {
        inputBox.classList.add('error-state');
        showToast('Server Error! Cannot verify token right now.', 'error');
        btn.innerHTML = '<i class="fas fa-shield-halved"></i> Verify';
    }
});

// ==========================================
// CLOUDFLARE R2 UPLOADS
// ==========================================
['fileCoverGallery', 'fileCoverBrowse'].forEach(id => {
    document.getElementById(id).addEventListener('change', function(e) {
        if(e.target.files.length > 0) {
            selectedCoverFile = e.target.files[0]; 
            e.target.closest('.uc-actions').querySelector('p').innerText = "Selected: " + selectedCoverFile.name;
        }
    });
});
['filePdfGallery', 'filePdfBrowse'].forEach(id => {
    document.getElementById(id).addEventListener('change', function(e) {
        if(e.target.files.length > 0) {
            selectedPdfFile = e.target.files[0]; 
            e.target.closest('.uc-actions').querySelector('p').innerText = "Selected: " + selectedPdfFile.name;
        }
    });
});

async function uploadFileToR2(file, type) {
    return new Promise(async (resolve, reject) => {
        const r2Overlay = document.getElementById('r2UploadOverlay');
        const progressBar = document.getElementById('r2ProgressBar');
        const progressText = document.getElementById('r2ProgressText');
        const statusText = document.getElementById('r2StatusText');
        const icon = document.getElementById('r2UploadIcon');
        const title = document.getElementById('r2UploadTitle');

        if(type === 'image') { 
            icon.className = "fas fa-image"; 
            title.innerText = "Upload Cover Image"; 
            statusText.innerText = "Generating Secure Link..."; 
        } else { 
            icon.className = "fas fa-file-pdf"; 
            title.innerText = "Upload PDF File"; 
            statusText.innerText = "Generating Secure Link..."; 
        }

        r2Overlay.style.display = 'flex'; 
        progressBar.style.width = '0%'; 
        progressText.innerText = '0%';

        try {
            const userToken = await auth.currentUser.getIdToken(true);
            const authResponse = await fetch('/api/generate-upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: file.name, fileType: file.type, userToken: userToken })
            });
            const authData = await authResponse.json();

            if (!authResponse.ok) throw new Error(authData.error || "Permission Denied");

            statusText.innerText = "Securely transferring to Cloudflare R2...";
            
            const xhr = new XMLHttpRequest(); 
            xhr.open("PUT", authData.uploadUrl, true); 
            xhr.setRequestHeader("Content-Type", file.type); 

            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) { 
                    let p = Math.round((e.loaded / e.total) * 100); 
                    progressBar.style.width = p + '%'; 
                    progressText.innerText = p + '%'; 
                }
            });

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    setTimeout(() => { r2Overlay.style.display = 'none'; }, 500); 
                    if (type === 'image') resolve(`${R2_PUBLIC_IMAGE_URL}/${authData.fileKey}`);
                    else resolve(authData.fileKey); 
                } else { 
                    r2Overlay.style.display = 'none'; 
                    reject("Upload Failed"); 
                }
            };
            xhr.onerror = function() { 
                r2Overlay.style.display = 'none'; 
                reject("Network Error"); 
            }; 
            xhr.send(file);

        } catch (error) {
            r2Overlay.style.display = 'none';
            reject(error.message || "Upload Failed");
        }
    });
}

// Publish Book Form
document.getElementById('addBookForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const btn = document.getElementById('publishBtn'); 
    const originalText = btn.innerHTML;
    
    if (!selectedCoverFile) { showToast("Please select a Cover Image!", "error"); return; }
    if (!selectedPdfFile) { showToast("Please select a PDF file!", "error"); return; }

    btn.innerHTML = `<span class="btn-text" style="display: flex; align-items: center; justify-content: center; gap: 10px;"><i class="fas fa-spinner fa-spin"></i> Publishing...</span>`; 
    btn.disabled = true;

    try {
        let coverR2Url = await uploadFileToR2(selectedCoverFile, 'image'); 
        let pdfR2Key = await uploadFileToR2(selectedPdfFile, 'pdf');
        
        const newBook = { 
            title: document.getElementById('inTitle').value, 
            author: document.getElementById('inAuthor').value, 
            year: document.getElementById('inYear').value, 
            lang: document.getElementById('inLang').value, 
            exams: document.getElementById('inExams').value, 
            image: coverR2Url, 
            pdfLink: pdfR2Key, 
            dateAdded: new Date().toLocaleDateString('en-GB').toUpperCase(), 
            createdAt: new Date().getTime(), 
            uploaderUid: auth.currentUser.uid 
        };
        await addDoc(collection(db, "books"), newBook); 
        
        showToast("Book Published Successfully!", "success"); 
        e.target.reset(); 
        selectedCoverFile = null; 
        selectedPdfFile = null;
        document.querySelectorAll('.uc-actions p').forEach(p => p.innerText = "Drag & Drop File");
    } catch (error) { 
        if(error.message && error.message.includes("Missing or insufficient permissions")) {
            showToast("Failed: Firebase Security Rules Blocked Save!", "error"); 
        } else {
            showToast("Failed: " + error, "error"); 
        }
    } finally { 
        btn.innerHTML = originalText; 
        btn.disabled = false; 
    }
});

document.querySelectorAll('.adm-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => { 
        let tab = btn.id === 'admTabPrompt' ? 'prompt' : 'add'; 
        switchAdminTabLocal(tab); 
    });
});
function switchAdminTabLocal(tabName) {
    document.querySelectorAll('.adm-section').forEach(el => el.classList.remove('active')); 
    document.querySelectorAll('.adm-tab-btn').forEach(el => el.classList.remove('active'));
    if(tabName === 'add') { 
        document.getElementById('sectionAddBook').classList.add('active'); 
        document.getElementById('admTabAdd').classList.add('active'); 
    } else if(tabName === 'prompt') { 
        document.getElementById('sectionPrompt').classList.add('active'); 
        document.getElementById('admTabPrompt').classList.add('active'); 
    }
}
