import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    deleteDoc, 
    query, 
    orderBy, 
    limit, 
    startAfter, 
    runTransaction, 
    serverTimestamp,
    setDoc
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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ownerEmails = ["nazrulislam887441234@gmail.com", "support@ghotimarket.com"];

// State Variables
let lastVisibleDoc = null;
let currentRequests = [];
let supplierCache = new Map();
let currentActiveFilter = 'all';
let currentSearchQuery = '';
let selectedRequestForAccept = null;

// DOM Elements
const adminPanelWrapper = document.getElementById('adminPanelWrapper');
const accessDeniedPage = document.getElementById('accessDeniedPage');
const headerUserEmail = document.getElementById('headerUserEmail');
const headerUserRole = document.getElementById('headerUserRole');
const requestGrid = document.getElementById('requestGrid');
const emptyState = document.getElementById('emptyState');
const loadMoreContainer = document.getElementById('loadMoreContainer');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const refreshBtn = document.getElementById('refreshBtn');
const searchInput = document.getElementById('searchInput');
const confirmModal = document.getElementById('confirmModal');
const editableAmountInput = document.getElementById('editableAmountInput');
const confirmAcceptBtn = document.getElementById('confirmAcceptBtn');

// Authentication & Authorization Check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '/login'; // Redirect to Login
        return;
    }

    const email = (user.email || '').trim().toLowerCase();
    let isAuthorized = false;
    let roleText = '';

    // 1. Owner Check
    if (ownerEmails.includes(email)) {
        isAuthorized = true;
        roleText = 'Owner';
    } else {
        // 2. Admin Check via admins/{uid}
        try {
            const adminDocRef = doc(db, 'admins', user.uid);
            const adminDocSnap = await getDoc(adminDocRef);
            if (adminDocSnap.exists()) {
                const adminData = adminDocSnap.data();
                if (adminData.uid === user.uid && adminData.active === true) {
                    isAuthorized = true;
                    roleText = 'Admin';
                }
            }
        } catch (error) {
            console.error("Admin verification error:", error);
        }
    }

    if (!isAuthorized) {
        adminPanelWrapper.classList.add('hidden');
        accessDeniedPage.classList.remove('hidden');
        return;
    }

    // Render User Header Info
    headerUserEmail.textContent = user.email;
    headerUserRole.textContent = roleText;

    // Load Initial Requests
    loadAddBalanceRequests();
});

// Logout Function
window.handleLogout = async () => {
    try {
        await signOut(auth);
        window.location.href = '/admin/login';
    } catch (error) {
        showToast('লগআউট করতে সমস্যা হয়েছে।', 'error');
    }
};

// Refresh Button Listener
refreshBtn.addEventListener('click', () => {
    lastVisibleDoc = null;
    currentRequests = [];
    supplierCache.clear();
    loadAddBalanceRequests();
    showToast('ডাটা রিফ্রেশ করা হয়েছে।', 'success');
});

// Load Add Balance Requests with Pagination
async function loadAddBalanceRequests(isLoadMore = false) {
    if (!isLoadMore) {
        requestGrid.innerHTML = `
            <div class="bg-white rounded-2xl p-6 border border-borderCustom animate-pulse"><div class="h-4 bg-gray-200 rounded w-1/3 mb-4"></div><div class="space-y-3"><div class="h-3 bg-gray-200 rounded w-3/4"></div><div class="h-3 bg-gray-200 rounded w-1/2"></div><div class="h-6 bg-gray-200 rounded w-full my-4"></div></div></div>
            <div class="bg-white rounded-2xl p-6 border border-borderCustom animate-pulse hidden md:block"><div class="h-4 bg-gray-200 rounded w-1/3 mb-4"></div><div class="space-y-3"><div class="h-3 bg-gray-200 rounded w-3/4"></div><div class="h-3 bg-gray-200 rounded w-1/2"></div><div class="h-6 bg-gray-200 rounded w-full my-4"></div></div></div>
            <div class="bg-white rounded-2xl p-6 border border-borderCustom animate-pulse hidden lg:block"><div class="h-4 bg-gray-200 rounded w-1/3 mb-4"></div><div class="space-y-3"><div class="h-3 bg-gray-200 rounded w-3/4"></div><div class="h-3 bg-gray-200 rounded w-1/2"></div><div class="h-6 bg-gray-200 rounded w-full my-4"></div></div></div>
        `;
    }

    try {
        let q = query(collection(db, "add-balance"), orderBy("createdAt", "desc"), limit(20));
        if (isLoadMore && lastVisibleDoc) {
            q = query(collection(db, "add-balance"), orderBy("createdAt", "desc"), startAfter(lastVisibleDoc), limit(20));
        }

        const querySnapshot = await getDocs(q);
        
        if (!isLoadMore) {
            currentRequests = [];
        }

        if (querySnapshot.empty && !isLoadMore) {
            requestGrid.innerHTML = '';
            emptyState.classList.remove('hidden');
            loadMoreContainer.classList.add('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

        const newDocs = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        currentRequests = isLoadMore ? [...currentRequests, ...newDocs] : newDocs;

        if (querySnapshot.docs.length < 20) {
            loadMoreContainer.classList.add('hidden');
        } else {
            loadMoreContainer.classList.remove('hidden');
        }

        renderRequests(currentRequests);
    } catch (error) {
        console.error("Error loading requests:", error);
        showToast('রিকোয়েস্ট লোড করতে সমস্যা হয়েছে।', 'error');
    }
}

loadMoreBtn.addEventListener('click', () => loadAddBalanceRequests(true));

// Optimized Supplier Email Lookup (Concurrent batches of max 5)
async function fetchSupplierEmails(requests) {
    const uidsToFetch = requests.map(r => r.uid).filter(uid => !supplierCache.has(uid));
    const uniqueUids = [...new Set(uidsToFetch)];

    for (let i = 0; i < uniqueUids.length; i += 5) {
        const batch = uniqueUids.slice(i, i + 5);
        await Promise.all(batch.map(async (uid) => {
            try {
                const supplierDoc = await getDoc(doc(db, "supplyers", uid));
                if (supplierDoc.exists()) {
                    supplierCache.set(uid, supplierDoc.data().email || 'Email not found');
                } else {
                    supplierCache.set(uid, 'Supplier not found');
                }
            } catch (err) {
                supplierCache.set(uid, 'Error fetching email');
            }
        }));
    }
}

// Render Requests UI
async function renderRequests(requests) {
    let filtered = requests.filter(req => {
        const matchesFilter = currentActiveFilter === 'all' || req.status === currentActiveFilter;
        const queryStr = currentSearchQuery.toLowerCase();
        const matchesSearch = !currentSearchQuery || 
            req.uid.toLowerCase().includes(queryStr) ||
            (req.transectionId && req.transectionId.toLowerCase().includes(queryStr)) ||
            (req.sendedNumber && req.sendedNumber.includes(queryStr)) ||
            (supplierCache.get(req.uid) && supplierCache.get(req.uid).toLowerCase().includes(queryStr));
        return matchesFilter && matchesSearch;
    });

    if (filtered.length === 0) {
        requestGrid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    await fetchSupplierEmails(filtered);

    requestGrid.innerHTML = filtered.map(req => {
        const email = supplierCache.get(req.uid) || 'Loading...';
        const dateStr = req.createdAt ? new Date(req.createdAt.seconds * 1000).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Just now';
        
        let methodLogo = '';
        let methodName = '';
        if (req.accountType === 'bkash') {
            methodLogo = 'https://paikarisell.ghotimarket.com/photo/bkash.png';
            methodName = 'বিকাশ';
        } else if (req.accountType === 'nagad') {
            methodLogo = 'https://paikarisell.ghotimarket.com/photo/nagad.png';
            methodName = 'নগদ';
        }

        return `
            <div class="bg-white rounded-2xl p-6 border border-borderCustom shadow-sm flex flex-col justify-between space-y-4 transition-all hover:shadow-md">
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full uppercase">${req.status}</span>
                        <span class="text-xs text-gray-400">${dateStr}</span>
                    </div>
                    
                    <div>
                        <p class="text-xs text-gray-500">Supplier UID</p>
                        <p class="text-sm font-mono font-medium text-dark truncate">${req.uid}</p>
                    </div>

                    <div>
                        <p class="text-xs text-gray-500">Supplier Email</p>
                        <p class="text-sm font-medium text-dark truncate">${email}</p>
                    </div>

                    <div class="bg-bgCustom p-4 rounded-xl border border-borderCustom space-y-2">
                        <div class="flex justify-between items-center">
                            <span class="text-xs text-gray-500">Request Amount</span>
                            <span class="text-lg font-bold text-primary">৳${Number(req.amount).toFixed(2)}</span>
                        </div>
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-gray-500">Transaction ID</span>
                            <span class="font-mono font-medium text-dark">${req.transectionId}</span>
                        </div>
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-gray-500">Sender Number</span>
                            <span class="font-medium text-dark">${req.sendedNumber}</span>
                        </div>
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-gray-500">Payment Method</span>
                            <div class="flex items-center space-x-1.5">
                                <img src="${methodLogo}" alt="${methodName}" class="w-4 h-4 object-contain">
                                <span class="font-medium text-dark">${methodName}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3 pt-2">
                    <button onclick="handleReject('${req.uid}')" class="bg-red-50 text-red-600 py-2.5 rounded-xl font-semibold hover:bg-red-100 transition-all text-sm">Reject</button>
                    <button onclick="openAcceptModal('${req.uid}')" class="bg-primary text-white py-2.5 rounded-xl font-semibold hover:bg-secondary transition-all text-sm shadow-sm shadow-primary/20">Accept</button>
                </div>
            </div>
        `;
    }).join('');
}

// Search & Filter Listeners
searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim();
    renderRequests(currentRequests);
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('bg-primary', 'text-white');
            b.classList.add('bg-gray-100', 'text-gray-600');
        });
        e.target.classList.remove('bg-gray-100', 'text-gray-600');
        e.target.classList.add('bg-primary', 'text-white');
        currentActiveFilter = e.target.dataset.filter;
        renderRequests(currentRequests);
    });
});

// Reject Logic
window.handleReject = async (uid) => {
    try {
        const reqRef = doc(db, "add-balance", uid);
        await deleteDoc(reqRef);
        currentRequests = currentRequests.filter(r => r.uid !== uid);
        renderRequests(currentRequests);
        showToast('রিকোয়েস্টটি Reject করা হয়েছে।', 'success');
    } catch (error) {
        console.error("Reject error:", error);
        showToast('Reject করতে সমস্যা হয়েছে।', 'error');
    }
};

// Accept Modal & Live Calculation
window.openAcceptModal = async (uid) => {
    const req = currentRequests.find(r => r.uid === uid);
    if (!req) return;
    selectedRequestForAccept = req;

    document.getElementById('modalUid').textContent = req.uid;
    document.getElementById('modalEmail').textContent = supplierCache.get(req.uid) || '-';
    document.getElementById('modalTranx').textContent = req.transectionId;
    document.getElementById('modalSender').textContent = req.sendedNumber;
    document.getElementById('modalMethod').textContent = req.accountType === 'bkash' ? 'বিকাশ' : 'নগদ';
    editableAmountInput.value = req.amount;

    // Fetch Supplier Current Balance
    try {
        const supplierSnap = await getDoc(doc(db, "supplyers", uid));
        const currentBalance = supplierSnap.exists() ? Number(supplierSnap.data().balance || 0) : 0;
        selectedRequestForAccept.currentBalance = currentBalance;
        updateLiveCalculation();
    } catch (err) {
        selectedRequestForAccept.currentBalance = 0;
        updateLiveCalculation();
    }

    confirmModal.classList.remove('hidden');
    confirmModal.classList.add('flex');
};

window.closeModal = () => {
    confirmModal.classList.remove('flex');
    confirmModal.classList.add('hidden');
    selectedRequestForAccept = null;
};

editableAmountInput.addEventListener('input', updateLiveCalculation);

function updateLiveCalculation() {
    if (!selectedRequestForAccept) return;
    const oldBalance = Number(selectedRequestForAccept.currentBalance || 0);
    const approvedAmount = Number(editableAmountInput.value || 0);
    const newBalance = oldBalance + approvedAmount;

    document.getElementById('calcOldBalance').textContent = `৳${oldBalance.toFixed(2)}`;
    document.getElementById('calcApprovedAmount').textContent = `৳${approvedAmount.toFixed(2)}`;
    document.getElementById('calcNewBalance').textContent = `৳${newBalance.toFixed(2)}`;
}

// Atomic Firestore Transaction for Accept
confirmAcceptBtn.addEventListener('click', async () => {
    if (!selectedRequestForAccept) return;
    const approvedAmount = Number(editableAmountInput.value);

    if (isNaN(approvedAmount) || approvedAmount <= 0) {
        showToast('দয়া করে একটি সঠিক পজিটিভ পরিমাণ লিখুন।', 'error');
        return;
    }

    confirmAcceptBtn.disabled = true;
    confirmAcceptBtn.textContent = 'প্রসেসিং হচ্ছে...';

    const uid = selectedRequestForAccept.uid;
    const transectionId = selectedRequestForAccept.transectionId;

    const supplierRef = doc(db, "supplyers", uid);
    const requestRef = doc(db, "add-balance", uid);
    const validTranxRef = doc(db, "valid_transaction", transectionId);
    const newTransactionRef = doc(collection(db, "transactions"));

    try {
        await runTransaction(db, async (transaction) => {
            const supplierDoc = await transaction.get(supplierRef);
            const requestDoc = await transaction.get(requestRef);
            const validTranxDoc = await transaction.get(validTranxRef);

            if (!supplierDoc.exists()) throw new Error("Supplier Document Not Found");
            if (!requestDoc.exists()) throw new Error("Request Document Not Found");
            if (validTranxDoc.exists()) throw new Error("Transaction ID Already Used");

            const reqData = requestDoc.data();
            if (reqData.status !== "pending") throw new Error("Request Already Processed");

            const oldBalance = Number(supplierDoc.data().balance || 0);
            const newBalance = oldBalance + approvedAmount;

            // 1. Update Supplier Balance
            transaction.update(supplierRef, { balance: newBalance });

            // 2. Create Transaction Record
            transaction.set(newTransactionRef, {
                uid: uid,
                oldBalance: oldBalance,
                balance: newBalance,
                name: "Add balance",
                createdAt: serverTimestamp()
            });

            // 3. Create Valid Transaction Record
            transaction.set(validTranxRef, { used: true });

            // 4. Delete Add Balance Request
            transaction.delete(requestRef);
        });

        closeModal();
        currentRequests = currentRequests.filter(r => r.uid !== uid);
        renderRequests(currentRequests);
        showToast(`ব্যালেন্স সফলভাবে যুক্ত হয়েছে! নতুন ব্যালেন্স: ৳${(selectedRequestForAccept.currentBalance + approvedAmount).toFixed(2)}`, 'success');
    } catch (error) {
        console.error("Atomic transaction failed:", error);
        showToast(`ব্যালেন্স যুক্ত করা যায়নি: ${error.message}`, 'error');
    } finally {
        confirmAcceptBtn.disabled = false;
        confirmAcceptBtn.textContent = 'নিশ্চিত করুন';
    }
});

// Toast Notification System
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center p-4 rounded-2xl shadow-xl text-white font-medium text-sm transition-all transform translate-y-2 opacity-0 ${type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
