import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteField, 
    query, where, orderBy, limit, startAfter, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDCIRWmozT0XcEXuXtQ6RDiDo6vtT1T9mU",
  authDomain: "paikarisell-ghotimarket.firebaseapp.com",
  projectId: "paikarisell-ghotimarket",
  storageBucket: "paikarisell-ghotimarket.firebasestorage.app",
  messagingSenderId: "464086432830",
  appId: "1:464086432830:web:a10fdd9884954e380e656f",
  measurementId: "G-E3HR2F9TC5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const OWNER_EMAILS = [
    "nazrulislam887441234@gmail.com",
    "support@ghotimarket.com"
];

const COLLECTIONS = {
    RESELLER: "reseller",
    ADMINS: "admins",
    REGISTRATIONS: "registrations",
    INFORMATIONS: "informations"
};

const PAGE_LIMIT = 20;

// State Management
let currentUser = null;
let userRole = null; 
let currentFilter = 'all';
let currentSearchType = 'phone';
let currentSearchQuery = '';
let lastVisibleDoc = null;
let hasMoreData = true;
let isFetching = false;
let requestToken = 0;

// Action Lock System
const activeLocks = new Set();

// Modal Callback Reference to prevent stacking/null replaces
let currentModalConfirmCallback = null;

// DOM Elements
const resellerContainer = document.getElementById('resellerContainer');
const emptyState = document.getElementById('emptyState');
const loadMoreBox = document.getElementById('loadMoreBox');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const refreshBtn = document.getElementById('refreshBtn');
const dashboardBtn = document.getElementById('dashboardBtn');
const filterTabs = document.getElementById('filterTabs');
const searchInput = document.getElementById('searchInput');
const searchTypeSelect = document.getElementById('searchTypeSelect');
const searchSubmitBtn = document.getElementById('searchSubmitBtn');
const clearSearchBtn = document.getElementById('clearSearchBtn');

// Modals & Forms
const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');

const editModal = document.getElementById('editModal');
const editModalCloseBtn = document.getElementById('editModalCloseBtn');
const editCancelBtn = document.getElementById('editCancelBtn');
const editResellerForm = document.getElementById('editResellerForm');

// ==========================================
// 2. AUTHENTICATION & ROLE VERIFICATION
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'https://admin.ghotimarket.com/reseller/login';
        return;
    }

    currentUser = user;
    const email = user.email ? user.email.toLowerCase() : '';

    if (OWNER_EMAILS.includes(email)) {
        userRole = 'owner';
        initializeAppUI();
        return;
    }

    try {
        const adminDocRef = doc(db, COLLECTIONS.ADMINS, user.uid);
        const adminDoc = await getDoc(adminDocRef);

        if (adminDoc.exists()) {
            const data = adminDoc.data();
            if (data.uid === user.uid && data.active === true) {
                userRole = 'admin';
                initializeAppUI();
                return;
            }
        }
        
        showToast('আপনার এই পেজটি অ্যাক্সেস করার অনুমতি নেই।', 'error');
        setTimeout(() => { window.location.href = 'https://admin.ghotimarket.com/reseller/login'; }, 2000);
    } catch (error) {
        console.error("Auth verification error:", error);
        showToast('অথেন্টিকেশন যাচাই করতে সমস্যা হয়েছে।', 'error');
    }
});

function initializeAppUI() {
    loadResellers(true);
    setupEventListeners();
}

// ==========================================
// 3. EVENT LISTENERS & DELEGATION SETUP
// ==========================================
function setupEventListeners() {
    refreshBtn.addEventListener('click', () => {
        resetPagination();
        loadResellers(true);
        showToast('ডাটা রিফ্রেশ করা হয়েছে।', 'success');
    });

    dashboardBtn.addEventListener('click', () => {
        window.location.href = 'https://admin.ghotimarket.com/reseller/dashboard';
    });

    // Filter Tabs
    filterTabs.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            currentFilter = e.target.getAttribute('data-filter');
            currentSearchQuery = '';
            searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            
            resetPagination();
            loadResellers(true);
        });
    });

    // Search
    searchSubmitBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    searchInput.addEventListener('input', (e) => {
        clearSearchBtn.style.display = e.target.value.trim().length > 0 ? 'flex' : 'none';
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        currentSearchQuery = '';
        resetPagination();
        loadResellers(true);
    });

    searchTypeSelect.addEventListener('change', (e) => {
        currentSearchType = e.target.value;
        if (currentSearchType === 'phone') {
            searchInput.placeholder = '১১ ডিজিটের ফোন নাম্বার দিন...';
            searchInput.maxLength = 11;
        } else if (currentSearchType === 'email') {
            searchInput.placeholder = 'সঠিক ইমেইল ঠিকানা দিন...';
            searchInput.removeAttribute('maxlength');
        } else {
            searchInput.placeholder = 'UID দিন...';
            searchInput.removeAttribute('maxlength');
        }
    });

    loadMoreBtn.addEventListener('click', () => {
        if (!isFetching && hasMoreData) {
            loadResellers(false);
        }
    });

    // Edit Modal Close
    editModalCloseBtn.addEventListener('click', closeEditModal);
    editCancelBtn.addEventListener('click', closeEditModal);
    editResellerForm.addEventListener('submit', handleEditSubmit);

    // Global Modal Event Listeners (Attached once securely)
    modalConfirmBtn.addEventListener('click', () => {
        if (typeof currentModalConfirmCallback === 'function') {
            const cb = currentModalConfirmCallback;
            currentModalConfirmCallback = null;
            confirmModal.style.display = 'none';
            cb();
        }
    });

    modalCancelBtn.addEventListener('click', () => {
        currentModalConfirmCallback = null;
        confirmModal.style.display = 'none';
    });

    // EVENT DELEGATION FOR ALL RESELLER CARDS
    resellerContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;

        const action = btn.getAttribute('data-action');
        const docId = btn.getAttribute('data-id');
        const phone = btn.getAttribute('data-phone');

        if (action === 'copy') {
            const uid = btn.getAttribute('data-uid');
            copyUidToClipboard(uid);
        } else if (action === 'approve') {
            confirmApprove(docId, phone, btn);
        } else if (action === 'active' || action === 'inactive') {
            const currentActive = action === 'inactive';
            const alreadyActive = btn.getAttribute('data-already-active') === 'true';
            toggleActiveStatus(docId, currentActive, alreadyActive, btn);
        } else if (action === 'reject') {
            confirmReject(docId, phone, btn);
        } else if (action === 'unreject') {
            confirmUnreject(docId, phone, btn);
        } else if (action === 'edit') {
            openEditModal(docId, btn);
        }
    });
}

function resetPagination() {
    lastVisibleDoc = null;
    hasMoreData = true;
    resellerContainer.innerHTML = '';
}

// ==========================================
// 4. FIRESTORE QUERY & RENDERING WITH RACE CONDITION GUARD
// ==========================================
async function loadResellers(isInitial = false) {
    if (isFetching) return;
    isFetching = true;
    const currentToken = ++requestToken;

    if (isInitial) {
        resellerContainer.innerHTML = `
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
        `;
        emptyState.style.display = 'none';
    }

    try {
        let q;
        const resellerRef = collection(db, COLLECTIONS.RESELLER);

        if (currentSearchQuery) {
            if (currentSearchType === 'phone') {
                q = query(resellerRef, where('phone', '==', currentSearchQuery), limit(PAGE_LIMIT));
                if (lastVisibleDoc && !isInitial) q = query(resellerRef, where('phone', '==', currentSearchQuery), startAfter(lastVisibleDoc), limit(PAGE_LIMIT));
            } else if (currentSearchType === 'email') {
                q = query(resellerRef, where('email', '==', currentSearchQuery), limit(PAGE_LIMIT));
                if (lastVisibleDoc && !isInitial) q = query(resellerRef, where('email', '==', currentSearchQuery), startAfter(lastVisibleDoc), limit(PAGE_LIMIT));
            } else if (currentSearchType === 'uid') {
                q = query(resellerRef, where('uid', '==', currentSearchQuery), limit(PAGE_LIMIT));
                if (lastVisibleDoc && !isInitial) q = query(resellerRef, where('uid', '==', currentSearchQuery), startAfter(lastVisibleDoc), limit(PAGE_LIMIT));
            }
        } else {
            if (currentFilter === 'all') {
                q = query(resellerRef, orderBy('createdAt', 'desc'), limit(PAGE_LIMIT));
                if (lastVisibleDoc && !isInitial) q = query(resellerRef, orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(PAGE_LIMIT));
            } else if (currentFilter === 'verified') {
                q = query(resellerRef, where('verified', '==', true), orderBy('createdAt', 'desc'), limit(PAGE_LIMIT));
                if (lastVisibleDoc && !isInitial) q = query(resellerRef, where('verified', '==', true), orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(PAGE_LIMIT));
            } else if (currentFilter === 'unverified') {
                q = query(resellerRef, where('verified', '==', false), orderBy('createdAt', 'desc'), limit(PAGE_LIMIT));
                if (lastVisibleDoc && !isInitial) q = query(resellerRef, where('verified', '==', false), orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(PAGE_LIMIT));
            } else if (currentFilter === 'active') {
                q = query(resellerRef, where('active', '==', true), orderBy('createdAt', 'desc'), limit(PAGE_LIMIT));
                if (lastVisibleDoc && !isInitial) q = query(resellerRef, where('active', '==', true), orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(PAGE_LIMIT));
            } else if (currentFilter === 'inactive') {
                q = query(resellerRef, where('active', '==', false), orderBy('createdAt', 'desc'), limit(PAGE_LIMIT));
                if (lastVisibleDoc && !isInitial) q = query(resellerRef, where('active', '==', false), orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(PAGE_LIMIT));
            } else if (currentFilter === 'rejected') {
                q = query(resellerRef, where('reject', '==', true), orderBy('createdAt', 'desc'), limit(PAGE_LIMIT));
                if (lastVisibleDoc && !isInitial) q = query(resellerRef, where('reject', '==', true), orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(PAGE_LIMIT));
            }
        }

        const querySnapshot = await getDocs(q);

        if (currentToken !== requestToken) return;

        if (isInitial) {
            resellerContainer.innerHTML = '';
        }

        if (querySnapshot.empty && isInitial) {
            emptyState.style.display = 'block';
            loadMoreBox.style.display = 'none';
            isFetching = false;
            return;
        }

        if (querySnapshot.docs.length < PAGE_LIMIT) {
            hasMoreData = false;
            loadMoreBox.style.display = 'none';
        } else {
            loadMoreBox.style.display = 'block';
        }

        if (!querySnapshot.empty) {
            lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        }

        querySnapshot.forEach(docSnap => {
            renderResellerCard(docSnap.id, docSnap.data());
        });

    } catch (error) {
        if (currentToken === requestToken) {
            console.error("Error loading resellers:", error);
            showToast('রিসেলার ডাটা লোড করতে সমস্যা হয়েছে। ইনডেক্স চেক করুন।', 'error');
        }
    } finally {
        if (currentToken === requestToken) {
            isFetching = false;
        }
    }
}

function handleSearch() {
    const val = searchInput.value.trim();
    if (!val) {
        showToast('অনুসন্ধান করার জন্য কিছু লিখুন।', 'error');
        return;
    }
    currentSearchQuery = val;
    resetPagination();
    loadResellers(true);
}

// ==========================================
// 5. RESELLER CARD RENDERING
// ==========================================
function renderResellerCard(docId, data) {
    const name = data.name || 'নামহীন রিসেলার';
    const email = data.email || 'নাই';
    const phone = data.phone || 'নাই';
    const whatsApp = data.whatsApp || phone;
    const uid = data.uid || 'নাই';
    const balance = data.balance !== undefined ? data.balance : 0;
    const verified = data.verified === true;
    const active = data.active === true;
    const reject = data.reject === true;
    const alreadyActive = data.alreadyActive === true;
    
    let formattedDate = 'তারিখ নেই';
    if (data.createdAt && data.createdAt.toDate) {
        formattedDate = data.createdAt.toDate().toLocaleDateString('bn-BD');
    }

    const card = document.createElement('div');
    card.className = 'reseller-card';
    card.id = `card-${docId}`;
    
    card.dataset.name = name;
    card.dataset.phone = phone;
    card.dataset.whatsapp = whatsApp;
    card.dataset.uid = uid;
    card.dataset.email = email;
    card.dataset.balance = balance;
    card.dataset.verified = verified;
    card.dataset.active = active;
    card.dataset.reject = reject;

    card.innerHTML = `
        <div class="card-header-row">
            <span class="reseller-name">${escapeHtml(name)}</span>
            <div class="badges-box">
                <span class="badge ${verified ? 'badge-verified' : 'badge-unverified'}">${verified ? 'ভেরিফাইড' : 'অপরিবর্তিত'}</span>
                <span class="badge ${active ? 'badge-active' : 'badge-inactive'}">${active ? 'এক্টিভ' : 'ইনেক্টিভ'}</span>
                ${reject ? '<span class="badge badge-rejected">রিজেক্টেড</span>' : ''}
            </div>
        </div>
        <div class="card-body-details">
            <div class="detail-row"><span>ইমেইল:</span> <span class="detail-val">${escapeHtml(email)}</span></div>
            <div class="detail-row"><span>ফোন:</span> <span class="detail-val">${escapeHtml(phone)}</span></div>
            <div class="detail-row"><span>হোয়াটসঅ্যাপ:</span> <span class="detail-val">${escapeHtml(whatsApp)}</span></div>
            <div class="detail-row">
                <span>UID:</span> 
                <div class="uid-box">
                    <span class="detail-val" style="font-size: 0.8rem;">${escapeHtml(uid)}</span>
                    <button type="button" class="copy-btn" title="UID কপি করুন" data-action="copy" data-uid="${escapeHtml(uid)}">
                        <svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    </button>
                </div>
            </div>
            <div class="detail-row"><span>ব্যালেন্স:</span> <span class="detail-val">৳${balance}</span></div>
            <div class="detail-row"><span>রেজিস্ট্রেশন তারিখ:</span> <span class="detail-val">${formattedDate}</span></div>
        </div>
        <div class="card-actions">
            ${!verified ? `<button type="button" class="btn btn-primary" data-action="approve" data-id="${docId}" data-phone="${phone}">এপ্রুভ করুন</button>` : ''}
            <button type="button" class="btn ${active ? 'btn-secondary' : 'btn-primary'}" data-action="${active ? 'inactive' : 'active'}" data-id="${docId}" data-already-active="${alreadyActive}">${active ? 'ইনেক্টিভ করুন' : 'এক্টিভ করুন'}</button>
            ${!verified && !reject ? `<button type="button" class="btn btn-outline" style="color:var(--danger); border-color:var(--danger);" data-action="reject" data-id="${docId}" data-phone="${phone}">রিজেক্ট করুন</button>` : ''}
            ${reject ? `<button type="button" class="btn btn-outline" data-action="unreject" data-id="${docId}" data-phone="${phone}">আনরিজেক্ট করুন</button>` : ''}
            <button type="button" class="btn btn-outline ${verified || reject ? 'btn-full' : ''}" data-action="edit" data-id="${docId}">এডিট করুন</button>
        </div>
    `;

    resellerContainer.appendChild(card);
}

function copyUidToClipboard(uid) {
    navigator.clipboard.writeText(uid).then(() => {
        showToast('UID সফলভাবে ক্লিপবোর্ডে কপি করা হয়েছে।', 'success');
    });
}

// ==========================================
// 6 & 7. ACTION HANDLERS WITH LOADING & LOCKS
// ==========================================
function setCardButtonsState(docId, disabled, activeBtn = null, loadingText = '') {
    const card = document.getElementById(`card-${docId}`);
    if (!card) return;
    const buttons = card.querySelectorAll('button');
    buttons.forEach(b => {
        if (b === activeBtn) {
            b.disabled = disabled;
            if (disabled) {
                b.dataset.originalHtml = b.innerHTML;
                b.innerHTML = `<span class="spinner"></span> <span>${loadingText}</span>`;
            } else if (b.dataset.originalHtml) {
                b.innerHTML = b.dataset.originalHtml;
            }
        } else {
            b.disabled = disabled;
        }
    });
}

function confirmApprove(docId, phone, btn) {
    if (activeLocks.has(docId)) return;
    showCustomModal('রিসেলার এপ্রুভ নিশ্চিত করুন', 'আপনি কি এই রিসেলারকে ভেরিফাইড বা এপ্রুভ করতে চান?', async () => {
        activeLocks.add(docId);
        setCardButtonsState(docId, true, btn, 'প্রসেসিং হচ্ছে...');
        try {
            await runTransaction(db, async (transaction) => {
                const resellerRef = doc(db, COLLECTIONS.RESELLER, docId);
                const regRef = doc(db, COLLECTIONS.REGISTRATIONS, phone);
                const infoRef = doc(db, COLLECTIONS.INFORMATIONS, 'reseller');

                const resellerSnap = await transaction.get(resellerRef);
                if (!resellerSnap.exists()) throw new Error("রিসেলার পাওয়া যায়নি!");
                if (resellerSnap.data().verified === true) throw new Error("রিসেলার ইতিমধ্যে ভেরিফাইড রয়েছে!");

                const regSnap = await transaction.get(regRef);
                const infoSnap = await transaction.get(infoRef);

                transaction.update(resellerRef, { verified: true });

                if (regSnap.exists()) {
                    transaction.update(regRef, { used: true });
                } else {
                    transaction.set(regRef, { used: true });
                }

                const currentVerified = infoSnap.exists() ? (infoSnap.data().verified || 0) : 0;
                if (infoSnap.exists()) {
                    transaction.update(infoRef, { verified: currentVerified + 1 });
                } else {
                    transaction.set(infoRef, { verified: 1 });
                }
            });

            showToast('রিসেলার সফলভাবে এপ্রুভ করা হয়েছে।', 'success');
            resetPagination();
            loadResellers(true);
        } catch (error) {
            console.error("Approve error:", error);
            showToast('এপ্রুভ করতে সমস্যা হয়েছে: ' + error.message, 'error');
            setCardButtonsState(docId, false, btn);
        } finally {
            activeLocks.delete(docId);
        }
    });
}

function toggleActiveStatus(docId, currentActiveState, alreadyActive, btn) {
    if (activeLocks.has(docId)) return;
    const actionName = currentActiveState ? 'ইনেক্টিভ' : 'এক্টিভ';
    const loadingMsg = currentActiveState ? 'ইনেক্টিভ করা হচ্ছে...' : 'এক্টিভ করা হচ্ছে...';

    showCustomModal(`${actionName} নিশ্চিত করুন`, `আপনি কি এই রিসেলারটিকে ${actionName} করতে চান?`, async () => {
        activeLocks.add(docId);
        setCardButtonsState(docId, true, btn, loadingMsg);
        try {
            await runTransaction(db, async (transaction) => {
                const resellerRef = doc(db, COLLECTIONS.RESELLER, docId);
                const infoRef = doc(db, COLLECTIONS.INFORMATIONS, 'reseller');

                const resellerSnap = await transaction.get(resellerRef);
                const infoSnap = await transaction.get(infoRef);
                if (!resellerSnap.exists()) throw new Error("রিসেলার পাওয়া যায়নি!");

                let infoData = infoSnap.exists() ? infoSnap.data() : {};
                let activeCount = infoData.active || 0;
                let inactiveCount = infoData.inactive || 0;

                if (currentActiveState) {
                    transaction.update(resellerRef, { active: false });
                    activeCount = Math.max(0, activeCount - 1);
                    inactiveCount += 1;
                } else {
                    if (!alreadyActive) {
                        transaction.update(resellerRef, { active: true, alreadyActive: true });
                        activeCount += 1;
                    } else {
                        transaction.update(resellerRef, { active: true });
                        activeCount += 1;
                        inactiveCount = Math.max(0, inactiveCount - 1);
                    }
                }

                if (infoSnap.exists()) {
                    transaction.update(infoRef, { active: activeCount, inactive: inactiveCount });
                } else {
                    transaction.set(infoRef, { active: activeCount, inactive: inactiveCount });
                }
            });

            showToast(`রিসেলার সফলভাবে ${actionName} করা হয়েছে।`, 'success');
            resetPagination();
            loadResellers(true);
        } catch (error) {
            console.error("Active/Inactive error:", error);
            showToast('স্ট্যাটাস পরিবর্তন করতে সমস্যা হয়েছে।', 'error');
            setCardButtonsState(docId, false, btn);
        } finally {
            activeLocks.delete(docId);
        }
    });
}

function confirmReject(docId, phone, btn) {
    if (activeLocks.has(docId)) return;
    showCustomModal('রিসেলার রিজেক্ট নিশ্চিত করুন', 'আপনি কি নিশ্চিত যে এই রিসেলারটিকে রিজেক্ট করতে চান?', async () => {
        activeLocks.add(docId);
        setCardButtonsState(docId, true, btn, 'রিজেক্ট করা হচ্ছে...');
        try {
            const resellerRef = doc(db, COLLECTIONS.RESELLER, docId);
            const regRef = doc(db, COLLECTIONS.REGISTRATIONS, phone);

            await updateDoc(resellerRef, { reject: true });
            
            const regSnap = await getDoc(regRef);
            if (regSnap.exists()) {
                await updateDoc(regRef, { reject: true });
            } else {
                await setDoc(regRef, { reject: true });
            }

            showToast('রিসেলার সফলভাবে রিজেক্ট করা হয়েছে।', 'success');
            resetPagination();
            loadResellers(true);
        } catch (error) {
            console.error("Reject error:", error);
            showToast('রিজেক্ট করতে সমস্যা হয়েছে।', 'error');
            setCardButtonsState(docId, false, btn);
        } finally {
            activeLocks.delete(docId);
        }
    });
}

function confirmUnreject(docId, phone, btn) {
    if (activeLocks.has(docId)) return;
    showCustomModal('আনরিজেক্ট নিশ্চিত করুন', 'আপনি কি এই রিসেলারটিকে আনরিজেক্ট করতে চান?', async () => {
        activeLocks.add(docId);
        setCardButtonsState(docId, true, btn, 'আনরিজেক্ট করা হচ্ছে...');
        try {
            const resellerRef = doc(db, COLLECTIONS.RESELLER, docId);
            const regRef = doc(db, COLLECTIONS.REGISTRATIONS, phone);

            await updateDoc(resellerRef, { reject: deleteField() });
            
            const regSnap = await getDoc(regRef);
            if (regSnap.exists()) {
                await updateDoc(regRef, { reject: deleteField(), used: true });
            }

            showToast('রিসেলার আনরিজেক্ট করা হয়েছে।', 'success');
            resetPagination();
            loadResellers(true);
        } catch (error) {
            console.error("Unreject error:", error);
            showToast('আনরিজেক্ট করতে সমস্যা হয়েছে।', 'error');
            setCardButtonsState(docId, false, btn);
        } finally {
            activeLocks.delete(docId);
        }
    });
}

// ==========================================
// 11. EDIT RESELLER SYSTEM & VALIDATION
// ==========================================
function openEditModal(docId, btn) {
    const card = document.getElementById(`card-${docId}`);
    if (!card) return;

    document.getElementById('editDocId').value = docId;
    document.getElementById('editName').value = card.dataset.name;
    document.getElementById('editPhone').value = card.dataset.phone;
    document.getElementById('editWhatsApp').value = card.dataset.whatsapp;
    
    document.getElementById('viewUid').innerText = card.dataset.uid;
    document.getElementById('viewEmail').innerText = card.dataset.email;
    document.getElementById('viewBalance').innerText = card.dataset.balance;
    document.getElementById('viewVerified').innerText = card.dataset.verified === 'true' ? 'Yes' : 'No';
    document.getElementById('viewActive').innerText = card.dataset.active === 'true' ? 'Yes' : 'No';
    document.getElementById('viewReject').innerText = card.dataset.reject === 'true' ? 'Yes' : 'No';

    editModal.style.display = 'flex';
}

function closeEditModal() {
    editModal.style.display = 'none';
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('editSaveBtn');
    if (saveBtn.disabled) return;

    const docId = document.getElementById('editDocId').value;
    const name = document.getElementById('editName').value.trim();
    const phone = document.getElementById('editPhone').value.trim();
    const whatsApp = document.getElementById('editWhatsApp').value.trim();

    if (!name) {
        showToast('নাম খালি রাখা যাবে না।', 'error');
        return;
    }
    if (!/^01[0-9]{9}$/.test(phone)) {
        showToast('ফোন নাম্বার ১১ ডিজিটের এবং 01 দিয়ে শুরু হতে হবে।', 'error');
        return;
    }
    if (!/^01[0-9]{9}$/.test(whatsApp)) {
        showToast('হোয়াটসঅ্যাপ নাম্বার ১১ ডিজিটের এবং 01 দিয়ে শুরু হতে হবে।', 'error');
        return;
    }

    saveBtn.disabled = true;
    const origHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = `<span class="spinner"></span> <span>সংরক্ষণ হচ্ছে...</span>`;

    try {
        const resellerRef = doc(db, COLLECTIONS.RESELLER, docId);
        await updateDoc(resellerRef, {
            name: name,
            phone: phone,
            whatsApp: whatsApp
        });

        showToast('রিসেলারের তথ্য সফলভাবে আপডেট করা হয়েছে।', 'success');
        closeEditModal();
        resetPagination();
        loadResellers(true);
    } catch (error) {
        console.error("Edit update error:", error);
        showToast('তথ্য আপডেট করতে সমস্যা হয়েছে।', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origHtml;
    }
}

// ==========================================
// UI MODALS & TOAST UTILITIES
// ==========================================
function showCustomModal(title, message, onConfirm) {
    modalTitle.innerText = title;
    modalMessage.innerText = message;
    currentModalConfirmCallback = onConfirm;
    confirmModal.style.display = 'flex';
}

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 350);
    }, 3200);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
