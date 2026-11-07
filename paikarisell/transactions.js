import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    collection, 
    query, 
    orderBy, 
    limit, 
    getDocsFromServer, 
    startAfter 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDCIRWmozT0XcEXuXtQ6RDiDo6vtT1T9mU",
  authDomain: "paikarisell-ghotimarket.firebaseapp.com",
  projectId: "paikarisell-ghotimarket",
  storageBucket: "paikarisell-ghotimarket.firebasestorage.app",
  messagingSenderId: "464086432830",
  appId: "1:464086432830:web:a10fdd9884954e380e656f",
  measurementId: "G-E3HR2F9TC5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Owner Allowed Emails
const ownerEmails = [
    "nazrulislam887441234@gmail.com", 
    "support@ghotimarket.com"
];

// DOM Elements
const transactionsContainer = document.getElementById("transactionsContainer");
const loadMoreIndicator = document.getElementById("loadMoreIndicator");
const endOfListMessage = document.getElementById("endOfListMessage");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const errorMessageText = document.getElementById("errorMessageText");
const retryBtn = document.getElementById("retryBtn");
const refreshBtn = document.getElementById("refreshBtn");
const userEmailDisplay = document.getElementById("userEmailDisplay");
const roleBadge = document.getElementById("roleBadge");
const toast = document.getElementById("toast");

// State Variables
let lastVisibleDocument = null;
let isLoading = false;
let hasMoreData = true;
let observer = null;
let currentFetchType = 'initial'; // 'initial' or 'pagination'

// SVG Icons Constants
const ICONS = {
    up: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    down: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    neutral: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`
};

// Authentication & Authorization Check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "/login";
        return;
    }

    const email = user.email ? user.email.trim().toLowerCase() : "";
    userEmailDisplay.textContent = email || user.uid;

    // 1. Check Owner Authorization
    const isOwner = ownerEmails.includes(email);

    if (isOwner) {
        roleBadge.textContent = "Owner";
        loadInitialTransactions();
        return;
    }

    // 2. Check Admin Authorization via admins/{uid} document
    try {
        const adminDocRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminDocRef);

        if (adminSnap.exists()) {
            const adminData = adminSnap.data();
            if (adminData.uid === user.uid && adminData.active === true) {
                roleBadge.textContent = "Admin";
                loadInitialTransactions();
                return;
            }
        }

        // Unauthorized access handler
        throw new Error("অনুমোদিত অ্যাডমিন বা ওনার নন।");

    } catch (error) {
        console.error("Authorization Failed:", error);
        alert("আপনার এই পেজে প্রবেশ করার অনুমতি নেই।");
        await signOut(auth);
        window.location.href = "/login";
    }
});

// Format Bangladesh Date & Time (Asia/Dhaka)
function formatBDDateTime(timestamp) {
    if (!timestamp) return "তারিখ নেই";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    const options = {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    
    let formatted = new Intl.DateTimeFormat('bn-BD', options).format(date);
    formatted = formatted.replace('AM', 'সকাল').replace('PM', 'রাত');
    return formatted;
}

// Format Currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('bn-BD', {
        style: 'currency',
        currency: 'BDT',
        minimumFractionDigits: 2
    }).format(amount).replace('BDT', '৳');
}

// Copy UID to Clipboard helper
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        toast.classList.add("show");
        setTimeout(() => {
            toast.classList.remove("show");
        }, 2000);
    }).catch(err => {
        console.error("Copy failed:", err);
    });
}

// Render Single Transaction Card HTML
function createTransactionCardHTML(data) {
    const { uid, name, oldBalance, balance, createdAt } = data;
    
    const diff = balance - oldBalance;
    let statusClass = "neutral";
    let iconHTML = ICONS.neutral;
    let diffSign = "";
    
    if (balance > oldBalance) {
        statusClass = "increase";
        iconHTML = ICONS.up;
        diffSign = "+";
    } else if (balance < oldBalance) {
        statusClass = "decrease";
        iconHTML = ICONS.down;
        diffSign = "";
    }

    const formattedDiff = `${diffSign}${formatCurrency(diff)}`;
    const formattedTime = formatBDDateTime(createdAt);
    const shortUid = uid ? `${uid.substring(0, 8)}...` : "N/A";

    return `
        <div class="transaction-card">
            <div class="txn-indicator ${statusClass}" title="${statusClass === 'increase' ? 'ব্যালেন্স বৃদ্ধি পেয়েছে' : statusClass === 'decrease' ? 'ব্যালেন্স কমেছে' : 'ব্যালেন্স অপরিবর্তিত'}">
                ${iconHTML}
            </div>
            <div class="txn-details">
                <h4 class="txn-name">${escapeHTML(name || "লেনদেন")}</h4>
                <div class="txn-supplier-row">
                    <span>UID: <span class="supplier-uid-text" title="${uid}">${shortUid}</span></span>
                    <button class="copy-uid-btn" onclick="copyToClipboard('${uid}')" title="UID কপি করুন">
                        ${ICONS.copy}
                    </button>
                </div>
                <span class="txn-time">${formattedTime}</span>
            </div>
            <div class="txn-amounts-area">
                <div class="difference-amount ${statusClass}">${formattedDiff}</div>
                <div class="balance-meta">
                    আগের: <span>${formatCurrency(oldBalance)}</span> | পর: <span>${formatCurrency(balance)}</span>
                </div>
            </div>
        </div>
    `;
}

// XSS Protection Helper
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Load Initial Transactions (First 20)
async function loadInitialTransactions() {
    currentFetchType = 'initial';
    isLoading = true;
    errorState.style.display = "none";
    emptyState.style.display = "none";
    endOfListMessage.style.display = "none";
    
    transactionsContainer.innerHTML = `
        <div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div><div class="skeleton-line amount"></div></div>
        <div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div><div class="skeleton-line amount"></div></div>
        <div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div><div class="skeleton-line amount"></div></div>
    `;

    try {
        const firstQuery = query(
            collection(db, "transactions"),
            orderBy("createdAt", "desc"),
            limit(20)
        );

        const snapshot = await getDocsFromServer(firstQuery);
        
        transactionsContainer.innerHTML = "";

        if (snapshot.empty) {
            emptyState.style.display = "block";
            hasMoreData = false;
            isLoading = false;
            return;
        }

        let htmlContent = "";
        snapshot.forEach((doc) => {
            htmlContent += createTransactionCardHTML(doc.data());
        });

        transactionsContainer.innerHTML = htmlContent;
        lastVisibleDocument = snapshot.docs[snapshot.docs.length - 1];
        
        if (snapshot.docs.length < 20) {
            hasMoreData = false;
            endOfListMessage.style.display = "block";
        } else {
            hasMoreData = true;
            setupIntersectionObserver();
        }

    } catch (error) {
        console.error("Firestore Query Error:", error);
        transactionsContainer.innerHTML = "";
        errorMessageText.textContent = error.code === 'permission-denied' 
            ? "আপনার এই ডেটা পড়ার অনুমতি নেই (Permission Denied)।" 
            : "লেনদেনের তথ্য লোড করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।";
        errorState.style.display = "block";
    } finally {
        isLoading = false;
    }
}

// Load Next Transactions (Pagination via Infinite Scroll)
async function loadMoreTransactions() {
    if (isLoading || !hasMoreData || !lastVisibleDocument) return;

    currentFetchType = 'pagination';
    isLoading = true;
    loadMoreIndicator.style.display = "flex";

    try {
        const nextQuery = query(
            collection(db, "transactions"),
            orderBy("createdAt", "desc"),
            startAfter(lastVisibleDocument),
            limit(20)
        );

        const snapshot = await getDocsFromServer(nextQuery);

        if (snapshot.empty) {
            hasMoreData = false;
            loadMoreIndicator.style.display = "none";
            endOfListMessage.style.display = "block";
            if (observer) observer.disconnect();
            isLoading = false;
            return;
        }

        let htmlContent = "";
        snapshot.forEach((doc) => {
            htmlContent += createTransactionCardHTML(doc.data());
        });

        transactionsContainer.insertAdjacentHTML('beforeend', htmlContent);
        lastVisibleDocument = snapshot.docs[snapshot.docs.length - 1];

        if (snapshot.docs.length < 20) {
            hasMoreData = false;
            if (observer) observer.disconnect();
            endOfListMessage.style.display = "block";
        }

    } catch (error) {
        console.error("Pagination Error:", error);
    } finally {
        loadMoreIndicator.style.display = "none";
        isLoading = false;
    }
}

// Intersection Observer for Infinite Scroll
function setupIntersectionObserver() {
    if (observer) observer.disconnect();

    const options = {
        root: null,
        rootMargin: '200px',
        threshold: 0.1
    };

    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && hasMoreData && !isLoading) {
                loadMoreTransactions();
            }
        });
    }, options);

    observer.observe(loadMoreIndicator);
}

// Refresh Button Listener
refreshBtn.addEventListener("click", () => {
    lastVisibleDocument = null;
    loadInitialTransactions();
});

// Retry Button Listener
retryBtn.addEventListener("click", () => {
    if (currentFetchType === 'initial') {
        loadInitialTransactions();
    } else {
        loadMoreTransactions();
    }
});
