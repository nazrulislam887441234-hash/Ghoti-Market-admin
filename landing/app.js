/**
 * GHOTI MARKET - Admin & Owner Dashboard Core Engine
 * Firebase Modular SDK Integration & Production Access Control Router
 */

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

// ==========================================
// 1. FIREBASE CONFIGURATION (INSERT YOUR CREDENTIALS)
// ==========================================
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

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. CONSTANTS & DOM REFERENCES
// ==========================================
const OWNER_EMAILS = [
    "nazrulislam887441234@gmail.com", 
    "support@ghotimarket.com"
];

const UNATHORIZED_REDIRECT_URL = "https://admin.ghotimarket.com";

// DOM Elements
const globalLoader = document.getElementById("global-loader");
const loginView = document.getElementById("login-view");
const dashboardLayout = document.getElementById("dashboard-layout");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const authErrorMsg = document.getElementById("auth-error-msg");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");

// Sidebar & Profile Elements
const sidebar = document.getElementById("sidebar");
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const sidebarUserEmail = document.getElementById("sidebar-user-email");
const sidebarRoleBadge = document.getElementById("sidebar-role-badge");
const sidebarAvatarInitial = document.getElementById("sidebar-avatar-initial");
const headerUserEmail = document.getElementById("header-user-email");
const headerRolePill = document.getElementById("header-role-pill");
const currentPageTitle = document.getElementById("current-page-title");
const currentPageSubtitle = document.getElementById("current-page-subtitle");
const appViewPort = document.getElementById("app-view-port");

// State Global Container
let currentUserState = {
    email: null,
    uid: null,
    role: null // 'owner' or 'admin'
};

// ==========================================
// 3. AUTHENTICATION & ACCESS CONTROL FLOW
// ==========================================
onAuthStateChanged(auth, async (user) => {
    showLoader(true);
    if (!user) {
        // Not Authenticated -> Show Login View
        currentUserState = { email: null, uid: null, role: null };
        showLoginView();
        showLoader(false);
        return;
    }

    try {
        const email = user.email ? user.email.toLowerCase().trim() : "";
        const uid = user.uid;

        // Rule A: Check if Owner (Exact Email Match, Case-Insensitive)
        if (OWNER_EMAILS.includes(email)) {
            currentUserState = { email, uid, role: "owner" };
            grantDashboardAccess(user);
            return;
        }

        // Rule B: Check Firestore Admin Document
        const adminDocRef = doc(db, "admins", email);
        const adminSnap = await getDoc(adminDocRef);

        if (adminSnap.exists()) {
            const adminData = adminSnap.data();
            const isValidAdmin = 
                adminData.email?.toLowerCase().trim() === email &&
                adminData.uid === uid &&
                adminData.role === "admin" &&
                adminData.active === true;

            if (isValidAdmin) {
                currentUserState = { email, uid, role: "admin" };
                grantDashboardAccess(user);
                return;
            }
        }

        // Rule C: Unauthorized User Flow
        handleUnauthorizedAccess();

    } catch (error) {
        console.error("Authorization verification error:", error);
        handleUnauthorizedAccess();
    }
});

// Handle Login Form Submission
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAuthError();
    
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
        showAuthError("দয়া করে ইমেইল এবং পাসওয়ার্ড প্রদান করুন।");
        return;
    }

    setLoginLoading(true);

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle routing automatically post-login
    } catch (error) {
        setLoginLoading(false);
        handleLoginError(error.code);
    }
});

// Logout Handler
logoutBtn.addEventListener("click", async () => {
    try {
        showLoader(true);
        await signOut(auth);
        window.location.href = UNATHORIZED_REDIRECT_URL;
    } catch (error) {
        console.error("Logout error:", error);
        window.location.reload();
    }
});

// ==========================================
// 4. VIEW ROUTING & APP SHELL RENDERERS
// ==========================================
function grantDashboardAccess(user) {
    hideLoginView();
    populateUserProfile(user);
    initRouter();
    showLoader(false);
}

function handleUnauthorizedAccess() {
    showLoader(true);
    authErrorMsg.textContent = "আপনার এই Dashboard ব্যবহারের অনুমতি নেই। Redirecting...";
    authErrorMsg.classList.remove("hidden");
    setTimeout(() => {
        window.location.href = UNATHORIZED_REDIRECT_URL;
    }, 1200);
}

function populateUserProfile(user) {
    const email = user.email;
    const isOwner = currentUserState.role === "owner";

    // Sidebar Data
    sidebarUserEmail.textContent = email;
    sidebarAvatarInitial.textContent = email.charAt(0).toUpperCase();
    sidebarRoleBadge.textContent = isOwner ? "OWNER" : "ADMIN";
    sidebarRoleBadge.className = `badge-pill ${isOwner ? 'owner' : 'admin'}`;

    // Header Data
    headerUserEmail.textContent = email;
    headerRolePill.textContent = isOwner ? "OWNER" : "ADMIN";
    headerRolePill.className = `role-pill ${isOwner ? 'owner' : 'admin'}`;
}

// ==========================================
// 5. CLIENT-SIDE ROUTER & TEMPLATES
// ==========================================
function initRouter() {
    window.addEventListener("hashchange", handleRouting);
    handleRouting(); // Initial run
}

function handleRouting() {
    const hash = window.location.hash || "#/";
    const path = hash.replace("#", "");

    // Update active state in sidebar navigation links
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
        if (item.getAttribute("data-route") === path) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Close mobile drawer on navigation
    closeMobileSidebar();

    // Render respective views
    switch(path) {
        case "/":
            renderOverviewDashboard();
            break;
        case "/landing/all-landing":
            renderAllLandingPagesView();
            break;
        case "/landing/banner":
            renderBannerManagementView();
            break;
        case "/landing/users":
            renderLandingUsersView();
            break;
        default:
            renderOverviewDashboard();
            break;
    }
}

// --- VIEW 1: OVERVIEW DASHBOARD CARDS ---
function renderOverviewDashboard() {
    currentPageTitle.textContent = "Dashboard Overview";
    currentPageSubtitle.textContent = "Overview of GHOTI MARKET control center";

    appViewPort.innerHTML = `
        <div class="dashboard-grid">
            <!-- CARD 1 -->
            <a href="#/landing/all-landing" class="dash-card">
                <div class="card-icon-box">
                    <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 9h16"/></svg>
                </div>
                <div class="card-content">
                    <h3>All Landing Pages</h3>
                    <p>Manage and view all landing pages</p>
                </div>
                <div class="card-footer">
                    <span>Manage Pages</span>
                    <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>
            </a>

            <!-- CARD 2 -->
            <a href="#/landing/banner" class="dash-card">
                <div class="card-icon-box">
                    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <div class="card-content">
                    <h3>Banner</h3>
                    <p>Manage landing page banners</p>
                </div>
                <div class="card-footer">
                    <span>Configure Banners</span>
                    <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>
            </a>

            <!-- CARD 3 -->
            <a href="#/landing/users" class="dash-card">
                <div class="card-icon-box">
                    <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div class="card-content">
                    <h3>All Landing Users</h3>
                    <p>View and manage landing page users</p>
                </div>
                <div class="card-footer">
                    <span>View Users</span>
                    <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>
            </a>

            <!-- CARD 4 -->
            <a href="https://ghotimarket.com/landing/orders" target="_blank" rel="noopener noreferrer" class="dash-card">
                <div class="card-icon-box">
                    <svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                </div>
                <div class="card-content">
                    <h3>Orders</h3>
                    <p>View and manage landing orders</p>
                </div>
                <div class="card-footer">
                    <span>Open External Portal</span>
                    <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </div>
            </a>
        </div>
    `;
}

// --- VIEW 2: ALL LANDING PAGES PLACEHOLDER ---
function renderAllLandingPagesView() {
    currentPageTitle.textContent = "All Landing Pages";
    currentPageSubtitle.textContent = "Manage all GHOTI MARKET landing pages";

    appViewPort.innerHTML = `
        <div class="page-container">
            <div class="page-header-row">
                <div>
                    <h3>Landing Pages Directory</h3>
                    <p class="page-subtitle" style="margin-top:2px;">Active campaign endpoints</p>
                </div>
                <div class="action-toolbar">
                    <input type="text" class="search-input" placeholder="Search pages...">
                    <button class="btn-primary" style="width:auto; padding: 10px 16px; font-size:13px;">+ Add Landing Page</button>
                </div>
            </div>
            <div class="table-placeholder">
                <div class="table-head">
                    <span>Page Title / Slug</span>
                    <span>Status</span>
                    <span>Created At</span>
                    <span>Actions</span>
                </div>
                <div class="empty-state">
                    No landing pages registered or data syncing pending.
                </div>
            </div>
        </div>
    `;
}

// --- VIEW 3: BANNER MANAGEMENT PLACEHOLDER ---
function renderBannerManagementView() {
    currentPageTitle.textContent = "Banner Management";
    currentPageSubtitle.textContent = "Configure high-impact promotional assets";

    appViewPort.innerHTML = `
        <div class="page-container">
            <div class="page-header-row">
                <div>
                    <h3>Active Banners & Previews</h3>
                    <p class="page-subtitle" style="margin-top:2px;">Manage landing hero graphics</p>
                </div>
                <div class="action-toolbar">
                    <button class="btn-primary" style="width:auto; padding: 10px 16px; font-size:13px;">Upload Banner</button>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
                <div style="border: 1px dashed var(--border); border-radius: 12px; padding: 40px; text-align: center; color: var(--muted); background: var(--bg);">
                    <p style="font-size: 13px;">No banner assets uploaded.</p>
                </div>
            </div>
        </div>
    `;
}

// --- VIEW 4: LANDING USERS PLACEHOLDER ---
function renderLandingUsersView() {
    currentPageTitle.textContent = "Landing Users";
    currentPageSubtitle.textContent = "View and filter consumer acquisition accounts";

    appViewPort.innerHTML = `
        <div class="page-container">
            <div class="page-header-row">
                <div>
                    <h3>Acquisition Directory</h3>
                    <p class="page-subtitle" style="margin-top:2px;">Audits and consumer mapping</p>
                </div>
                <div class="action-toolbar">
                    <input type="text" class="search-input" placeholder="Search by email or phone...">
                </div>
            </div>
            <div class="table-placeholder">
                <div class="table-head">
                    <span>User Email</span>
                    <span>Phone</span>
                    <span>Status</span>
                    <span>Created At</span>
                </div>
                <div class="empty-state">
                    No consumer data found.
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// 6. UI HELPER & ERROR FUNCTIONS
// ==========================================
function showLoader(show) {
    if (show) {
        globalLoader.classList.remove("hidden");
    } else {
        globalLoader.classList.add("hidden");
    }
}

function showLoginView() {
    loginView.classList.remove("hidden");
    dashboardLayout.classList.add("hidden");
}

function hideLoginView() {
    loginView.classList.add("hidden");
    dashboardLayout.classList.remove("hidden");
}

function showAuthError(message) {
    authErrorMsg.textContent = message;
    authErrorMsg.classList.remove("hidden");
}

function hideAuthError() {
    authErrorMsg.classList.add("hidden");
}

function setLoginLoading(loading) {
    const btnText = loginBtn.querySelector(".btn-text");
    const btnLoader = loginBtn.querySelector(".btn-loader");
    if (loading) {
        loginBtn.disabled = true;
        btnText.classList.add("hidden");
        btnLoader.classList.remove("hidden");
        btnLoader.className = "spinner"; // apply simple CSS spinner inline state
    } else {
        loginBtn.disabled = false;
        btnText.classList.remove("hidden");
        btnLoader.classList.add("hidden");
    }
}

function handleLoginError(errorCode) {
    let msg = "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।";
    if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        msg = "ইমেইল অথবা পাসওয়ার্ড ভুল দেওয়া হয়েছে।";
    } else if (errorCode === 'auth/too-many-requests') {
        msg = "অনেক বেশি ভুল চেষ্টার কারণে সাময়িকভাবে অ্যাকাউন্ট ব্লক করা হয়েছে।";
    }
    showAuthError(msg);
}

// Mobile Sidebar Drawer toggles
sidebarToggleBtn?.addEventListener("click", () => {
    sidebar.classList.add("mobile-open");
    sidebarBackdrop.classList.add("active");
});

function closeMobileSidebar() {
    sidebar.classList.remove("mobile-open");
    sidebarBackdrop.classList.remove("active");
}

sidebarCloseBtn?.addEventListener("click", closeMobileSidebar);
sidebarBackdrop?.addEventListener("click", closeMobileSidebar);
