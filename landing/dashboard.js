/* ==========================================================
 * GHOTI MARKET ADMIN & OWNER DASHBOARD ENGINE
 * Modern Modular Firebase Client Integration
 * ========================================================== */

// TODO: Replace with your actual Firebase project configuration credentials
const firebaseConfig = {
  apiKey: "AIzaSyBUhNhYvuo_FTvZ5RZR6Gn-4hsUY21S0XE",
  authDomain: "ghotimarket.firebaseapp.com",
  databaseURL: "https://ghotimarket-default-rtdb.firebaseio.com",
  projectId: "ghotimarket",
  storageBucket: "ghotimarket.firebasestorage.app",
  messagingSenderId: "481257644093",
  appId: "1:481257644093:web:0dfc3699d6b3c86afeca54",
  measurementId: "G-4SR8V2EKC1"
};

// Owner Identity Whitelist
const OWNER_EMAILS = [
    "nazrulislam887441234@gmail.com",
    "support@ghotimarket.com"
];

// Import Firebase SDK modules from reliable enterprise CDNs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Initialize Firebase App Instances safely
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (error) {
    console.error("Firebase configuration initialization failed:", error);
}

// Global Application Runtime Store
const State = {
    user: null,
    role: null, // 'owner' or 'admin'
    currentRoute: window.location.hash || '#/'
};

// DOM Node References
const Elements = {
    loadingOverlay: document.getElementById('auth-loading'),
    loginView: document.getElementById('login-view'),
    dashboardApp: document.getElementById('dashboard-app'),
    loginForm: document.getElementById('login-form'),
    loginEmailInput: document.getElementById('login-email'),
    loginPasswordInput: document.getElementById('login-password'),
    loginBtn: document.getElementById('login-btn'),
    authErrorBox: document.getElementById('auth-error'),
    logoutBtn: document.getElementById('logout-btn'),
    mobileMenuToggle: document.getElementById('mobile-menu-toggle'),
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    appViewContainer: document.getElementById('app-view-container'),
    pageHeaderTitle: document.getElementById('page-header-title'),
    headerUserEmail: document.getElementById('header-user-email'),
    headerRolePill: document.getElementById('header-role-pill'),
    sidebarEmailShort: document.getElementById('sidebar-email-short'),
    sidebarRoleBadge: document.getElementById('sidebar-role-badge'),
    sidebarInitial: document.getElementById('sidebar-initial')
};

// Application Boot Sequence
document.addEventListener('DOMContentLoaded', () => {
    initAuthObserver();
    initEventListeners();
    window.addEventListener('hashchange', handleRouting);
});

// Authentication State Listener
function initAuthObserver() {
    if (!auth) {
        showLoginView();
        hideLoading();
        showAuthError("Firebase engine configuration error.");
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const rawEmail = user.email || "";
            const normalizedEmail = rawEmail.toLowerCase().trim();
            const userUid = user.uid;

            // 1. Check Owner Privileges
            if (OWNER_EMAILS.includes(normalizedEmail)) {
                State.user = user;
                State.role = 'owner';
                grantDashboardAccess();
                return;
            }

            // 2. Check Admin Database Authorization via Firestore
            try {
                const adminDocRef = doc(db, "admins", normalizedEmail);
                const adminSnap = await getDoc(adminDocRef);

                if (
                    adminSnap.exists() &&
                    adminSnap.data().email?.toLowerCase() === normalizedEmail &&
                    adminSnap.data().uid === userUid &&
                    adminSnap.data().role === 'admin' &&
                    adminSnap.data().active === true
                ) {
                    State.user = user;
                    State.role = 'admin';
                    grantDashboardAccess();
                } else {
                    triggerUnauthorizedRedirect();
                }
            } catch (err) {
                console.error("Authorization security verification failure:", err);
                triggerUnauthorizedRedirect();
            }
        } else {
            State.user = null;
            State.role = null;
            showLoginView();
            hideLoading();
        }
    });
}

// Access Granted Pipeline
function grantDashboardAccess() {
    hideLoading();
    Elements.loginView.classList.add('hidden');
    Elements.dashboardApp.classList.remove('hidden');
    
    // Bind dynamic profile credentials
    const emailStr = State.user.email || "user@ghotimarket.com";
    Elements.headerUserEmail.textContent = emailStr;
    Elements.sidebarEmailShort.textContent = emailStr;
    Elements.sidebarInitial.textContent = emailStr.charAt(0).toUpperCase();

    if (State.role === 'owner') {
        Elements.headerRolePill.textContent = "OWNER";
        Elements.headerRolePill.className = "role-pill owner";
        Elements.sidebarRoleBadge.textContent = "OWNER";
    } else {
        Elements.headerRolePill.textContent = "ADMIN";
        Elements.headerRolePill.className = "role-pill admin";
        Elements.sidebarRoleBadge.textContent = "ADMIN";
    }

    handleRouting();
}

// Unauthorized Fallback Routing
function triggerUnauthorizedRedirect() {
    Elements.loadingOverlay.innerHTML = `
        <div class="spinner-container">
            <h2>ACCESS DENIED</h2>
            <p>আপনার এই Dashboard ব্যবহারের অনুমতি নেই। Redirecting...</p>
        </div>
    `;
    Elements.loadingOverlay.classList.remove('hidden');
    
    setTimeout(() => {
        window.location.href = "https://admin.ghotimarket.com";
    }, 1800);
}

// Event Bindings
function initEventListeners() {
    // Login Submit Handler
    Elements.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAuthError();

        const email = Elements.loginEmailInput.value.trim();
        const password = Elements.loginPasswordInput.value;

        if (!email || !password) {
            showAuthError("অনুগ্রহ করে ইমেইল এবং পাসওয়ার্ড প্রদান করুন।");
            return;
        }

        setLoginLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // onAuthStateChanged takes care of subsequent permission analysis
        } catch (error) {
            setLoginLoading(false);
            handleAuthError(error.code);
        }
    });

    // Logout Action Handler
    Elements.logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = "https://admin.ghotimarket.com";
        } catch (err) {
            console.error("Sign out error:", err);
        }
    });

    // Mobile Sidebar Drawer Toggle
    Elements.mobileMenuToggle.addEventListener('click', () => {
        Elements.sidebar.classList.toggle('open');
        Elements.sidebarBackdrop.classList.toggle('open');
    });

    Elements.sidebarBackdrop.addEventListener('click', () => {
        Elements.sidebar.classList.remove('open');
        Elements.sidebarBackdrop.classList.remove('open');
    });
}

// UI State Modifiers for Login
function setLoginLoading(isLoading) {
    const btnText = Elements.loginBtn.querySelector('.btn-text');
    const spinner = Elements.loginBtn.querySelector('.btn-spinner');
    if (isLoading) {
        Elements.loginBtn.disabled = true;
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
    } else {
        Elements.loginBtn.disabled = false;
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}

function showAuthError(msg) {
    Elements.authErrorBox.textContent = msg;
    Elements.authErrorBox.classList.remove('hidden');
}

function clearAuthError() {
    Elements.authErrorBox.textContent = "";
    Elements.authErrorBox.classList.add('hidden');
}

function handleAuthError(code) {
    switch (code) {
        case 'auth/invalid-email':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            showAuthError("ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।");
            break;
        case 'auth/too-many-requests':
            showAuthError("অতিরিক্ত প্রচেষ্টার কারণে সাময়িকভাবে লগইন ব্লক করা হয়েছে। পরে চেষ্টা করুন।");
            break;
        default:
            showAuthError("লগইন করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
            break;
    }
}

function showLoginView() {
    Elements.loginView.classList.remove('hidden');
    Elements.dashboardApp.classList.add('hidden');
}

function hideLoading() {
    Elements.loadingOverlay.classList.add('hidden');
}

// Client Router Engine
function handleRouting() {
    const hash = window.location.hash || '#/';
    State.currentRoute = hash;

    // Close drawer on mobile navigation click
    Elements.sidebar.classList.remove('open');
    Elements.sidebarBackdrop.classList.remove('open');

    // Update Sidebar Navigation UI Active State
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        if (item.getAttribute('data-route') === hash.replace('#', '')) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Render View Based on Route
    switch (hash) {
        case '#/':
        case '':
            renderDashboardOverview();
            break;
        case '#/landing/all-landing':
            renderAllLandingPagesView();
            break;
        case '#/landing/banner':
            renderBannerManagementView();
            break;
        case '#/landing/users':
            renderLandingUsersView();
            break;
        default:
            renderDashboardOverview();
            break;
    }
}

/* ==========================================================
 * VIEW RENDERERS (CLEAN PLACEHOLDER SHELLS & DATA SCREENS)
 * ========================================================== */

function renderDashboardOverview() {
    Elements.pageHeaderTitle.textContent = "Dashboard Overview";
    
    Elements.appViewContainer.innerHTML = `
        <div class="view-header">
            <h2>Overview of GHOTI MARKET</h2>
            <p>Welcome back, system manager. Real-time control panels below.</p>
        </div>
        <div class="dashboard-grid">
            <!-- CARD 1 -->
            <a href="#/landing/all-landing" class="dashboard-card">
                <div class="card-icon-box">
                    <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                </div>
                <h3>All Landing Pages</h3>
                <p>Manage and view all landing pages</p>
                <div class="card-footer-action">
                    <span>Manage Pages</span>
                    <svg viewBox="0 0 24 24"><path d="M5 13h11.86l-5.6,5.6 1.42,1.42L21.34,12l-8.72-8.02-1.42,1.42 5.6,5.6H5v2z"/></svg>
                </div>
            </a>

            <!-- CARD 2 -->
            <a href="#/landing/banner" class="dashboard-card">
                <div class="card-icon-box">
                    <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                </div>
                <h3>Banner</h3>
                <p>Manage landing page banners</p>
                <div class="card-footer-action">
                    <span>Configure Banners</span>
                    <svg viewBox="0 0 24 24"><path d="M5 13h11.86l-5.6,5.6 1.42,1.42L21.34,12l-8.72-8.02-1.42,1.42 5.6,5.6H5v2z"/></svg>
                </div>
            </a>

            <!-- CARD 3 -->
            <a href="#/landing/users" class="dashboard-card">
                <div class="card-icon-box">
                    <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                </div>
                <h3>All Landing Users</h3>
                <p>View and manage landing page users</p>
                <div class="card-footer-action">
                    <span>View Users</span>
                    <svg viewBox="0 0 24 24"><path d="M5 13h11.86l-5.6,5.6 1.42,1.42L21.34,12l-8.72-8.02-1.42,1.42 5.6,5.6H5v2z"/></svg>
                </div>
            </a>

            <!-- CARD 4 -->
            <a href="https://ghotimarket.com/landing/orders" target="_blank" rel="noopener noreferrer" class="dashboard-card">
                <div class="card-icon-box">
                    <svg viewBox="0 0 24 24"><path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-1.99.9-1.99 2L3 20c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm0 10c-2.76 0-5-2.24-5-5h2c0 1.66 1.34 3 3 3s3-1.34 3-3h2c0 2.76-2.24 5-5 5z"/></svg>
                </div>
                <h3>Orders</h3>
                <p>View and manage landing orders</p>
                <div class="card-footer-action">
                    <span>Open External Portal</span>
                    <svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                </div>
            </a>
        </div>
    `;
}

function renderAllLandingPagesView() {
    Elements.pageHeaderTitle.textContent = "All Landing Pages";
    Elements.appViewContainer.innerHTML = `
        <div class="view-header">
            <h2>All Landing Pages</h2>
            <p>Manage all GHOTI MARKET landing pages</p>
        </div>
        <div class="placeholder-box">
            <div class="placeholder-toolbar">
                <input type="text" class="search-input" placeholder="Search landing pages...">
                <button class="action-btn-primary">+ Add Landing Page</button>
            </div>
            <div class="data-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Page Title</th>
                            <th>Slug / Route</th>
                            <th>Created At</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="5" class="empty-state-row">No landing pages found or collection empty.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderBannerManagementView() {
    Elements.pageHeaderTitle.textContent = "Banner Management";
    Elements.appViewContainer.innerHTML = `
        <div class="view-header">
            <h2>Banner Management</h2>
            <p>Manage landing page banners, previews, and promotional sliders</p>
        </div>
        <div class="placeholder-box">
            <div class="placeholder-toolbar">
                <input type="text" class="search-input" placeholder="Search banners...">
                <button class="action-btn-primary">Upload Banner</button>
            </div>
            <div class="data-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Banner Preview</th>
                            <th>Title / Identifier</th>
                            <th>Placement</th>
                            <th>Active Banners</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="5" class="empty-state-row">No active banners found.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderLandingUsersView() {
    Elements.pageHeaderTitle.textContent = "Landing Users";
    Elements.appViewContainer.innerHTML = `
        <div class="view-header">
            <h2>Landing Users</h2>
            <p>View and manage registered landing page leads and users</p>
        </div>
        <div class="placeholder-box">
            <div class="placeholder-toolbar">
                <input type="text" class="search-input" placeholder="Filter by email or phone...">
                <button class="action-btn-primary">Export Users</button>
            </div>
            <div class="data-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>User Email</th>
                            <th>Phone</th>
                            <th>Created At</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="5" class="empty-state-row">No user records available.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}
