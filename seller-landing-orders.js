// app.js
import { auth, db } from "./firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    getDocs, 
    getDoc, 
    doc, 
    query, 
    orderBy, 
    limit, 
    startAfter, 
    where, 
    updateDoc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const OWNER_EMAILS = ["nazrulislam887441234@gmail.com", "support@ghotimarket.com"];

// DOM Elements
const authContainer = document.getElementById("auth-container");
const dashboardContainer = document.getElementById("dashboard-container");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const authError = document.getElementById("auth-error");
const userEmailDisplay = document.getElementById("user-email-display");
const logoutBtn = document.getElementById("logout-btn");

const ordersGrid = document.getElementById("orders-grid");
const loadMoreBtn = document.getElementById("load-more-btn");
const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search-btn");
const statusFilter = document.getElementById("status-filter");
const emptyState = document.getElementById("empty-state");
const errorState = document.getElementById("error-state");
const retryBtn = document.getElementById("retry-btn");
const toast = document.getElementById("toast");

// Modals
const detailsModal = document.getElementById("details-modal");
const detailsModalBody = document.getElementById("details-modal-body");
const closeDetailsModal = document.getElementById("close-details-modal");

const editModal = document.getElementById("edit-modal");
const editOrderForm = document.getElementById("edit-order-form");
const closeEditModal = document.getElementById("close-edit-modal");

const confirmModal = document.getElementById("confirm-modal");
const confirmModalText = document.getElementById("confirm-modal-text");
const confirmYesBtn = document.getElementById("confirm-yes-btn");
const confirmNoBtn = document.getElementById("confirm-no-btn");

// State variables
let lastVisible = null;
let currentFilters = { status: "all", searchId: "" };
let isFetching = false;
let confirmCallback = null;

// Status Mapping
const statusMap = {
    "pending": { label: "নতুন অর্ডার", class: "status-pending" },
    "confirmed": { label: "অর্ডার কনফার্ম করা হয়েছে", class: "status-confirmed" },
    "processing": { label: "অর্ডার কোরিয়ার করা হয়েছে", class: "status-processing" },
    "Packaging": { label: "অর্ডার প্যাকেজ করা হয়েছে", class: "status-packaging" },
    "Packeging": { label: "অর্ডার প্যাকেজ করা হয়েছে", class: "status-packaging" },
    "Delivered": { label: "সফল ভাবে ডেলিভারি করা হয়েছে!", class: "status-delivered" },
    "Cancel": { label: "অর্ডার বাতিল করা হয়েছে!", class: "status-cancel" },
    "Returned": { label: "রিটার্ন করা হয়েছে!", class: "status-returned" }
};

// Toast Notification
function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const email = user.email ? user.email.trim().toLowerCase() : "";
        let hasAccess = false;

        if (OWNER_EMAILS.includes(email)) {
            hasAccess = true;
        } else {
            // Check Admin Document
            try {
                const adminDocRef = doc(db, "admins", user.uid);
                const adminSnap = await getDoc(adminDocRef);
                if (adminSnap.exists()) {
                    const data = adminSnap.data();
                    if (data.uid === user.uid && data.role === "admin" && data.email === user.email && data.active === true) {
                        hasAccess = true;
                    }
                }
            } catch (e) {
                console.error("Admin verification error:", e);
            }
        }

        if (hasAccess) {
            authContainer.style.display = "none";
            dashboardContainer.style.display = "block";
            userEmailDisplay.textContent = user.email;
            loadOrders(true);
            loadSummaryCounts();
        } else {
            await signOut(auth);
            authContainer.style.display = "flex";
            dashboardContainer.style.display = "none";
            authError.textContent = "আপনার এই ড্যাশবোর্ডে প্রবেশের অনুমতি নেই।";
        }
    } else {
        authContainer.style.display = "flex";
        dashboardContainer.style.display = "none";
    }
});

// Login Handler
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.textContent = "";
    try {
        await signInWithEmailAndPassword(auth, loginEmailInput.value.trim(), loginPasswordInput.value);
    } catch (error) {
        authError.textContent = "লগইন ব্যর্থ হয়েছে: " + error.message;
    }
});

logoutBtn.addEventListener("click", () => signOut(auth));

// Load Summary Counts (Approximate / Total)
async function loadSummaryCounts() {
    try {
        const snap = await getDocs(collection(db, "seller_landing_orders"));
        let total = snap.size;
        let newCount = 0;
        let procCount = 0;
        let delCount = 0;

        snap.forEach(doc => {
            const data = doc.data();
            const st = data.status || "pending";
            if (st === "pending") newCount++;
            if (st === "processing" || st === "Packaging" || st === "Packeging") procCount++;
            if (st === "Delivered") delCount++;
        });

        document.getElementById("total-orders-count").textContent = total;
        document.getElementById("new-orders-count").textContent = newCount;
        document.getElementById("processing-orders-count").textContent = procCount;
        document.getElementById("delivered-orders-count").textContent = delCount;
    } catch (e) {
        console.error("Summary count error:", e);
    }
}

// Load Orders with Pagination & Filtering
async function loadOrders(reset = false) {
    if (isFetching) return;
    isFetching = true;
    errorState.style.display = "none";

    if (reset) {
        ordersGrid.innerHTML = "";
        lastVisible = null;
    }

    try {
        let q = collection(db, "seller_landing_orders");
        let queryConstraints = [];

        // Search by Document ID
        if (currentFilters.searchId) {
            const docRef = doc(db, "seller_landing_orders", currentFilters.searchId.trim());
            const docSnap = await getDoc(docRef);
            ordersGrid.innerHTML = "";
            if (docSnap.exists()) {
                renderOrderCard(docSnap.id, docSnap.data());
                emptyState.style.display = "none";
            } else {
                emptyState.style.display = "block";
            }
            loadMoreBtn.style.display = "none";
            isFetching = false;
            return;
        }

        // Status Filter
        if (currentFilters.status !== "all") {
            queryConstraints.push(where("status", "==", currentFilters.status));
        }

        queryConstraints.push(orderBy("createdAt", "desc"));
        queryConstraints.push(limit(20));

        if (!reset && lastVisible) {
            queryConstraints.push(startAfter(lastVisible));
        }

        const qFinal = query(q, ...queryConstraints);
        const querySnapshot = await getDocs(qFinal);

        if (reset && querySnapshot.empty) {
            emptyState.style.display = "block";
            loadMoreBtn.style.display = "none";
            isFetching = false;
            return;
        }

        emptyState.style.display = "none";

        querySnapshot.forEach((docSnap) => {
            renderOrderCard(docSnap.id, docSnap.data());
        });

        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

        if (querySnapshot.docs.length < 20) {
            loadMoreBtn.style.display = "none";
        } else {
            loadMoreBtn.style.display = "inline-block";
        }

    } catch (error) {
        console.error("Error loading orders:", error);
        errorState.style.display = "block";
        document.getElementById("error-message-text").textContent = "ডেটা লোড করতে সমস্যা হয়েছে: " + error.message;
    } finally {
        isFetching = false;
    }
}

// Render Order Card Safely (XSS Prevention)
function renderOrderCard(id, data) {
    const card = document.createElement("div");
    card.className = "order-card";
    card.setAttribute("data-id", id);

    const statusObj = statusMap[data.status] || { label: "অজানা স্ট্যাটাস", class: "status-returned" };
    const isTerminal = ["Delivered", "Cancel", "Returned"].includes(data.status);
    const imgSrc = data.productImage || "";
    const prodName = data.productName || "নামবিহীন পণ্য";

    card.innerHTML = `
        <div class="order-card-header">
            <span>আইডি: ${id.substring(0, 8)}...</span>
            <span class="status-badge ${statusObj.class}">${statusObj.label}</span>
        </div>
        <div class="product-info">
            <img src="${imgSrc}" alt="Product" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236B7280\' stroke-width=\'1\\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\'/><circle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'/><path d=\'M21 15l-5-5L5 21\'/></svg>'">
            <div>
                <h4>${escapeHTML(prodName)}</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">পরিমাণ: ${data.quantity || 1} | মোট: ৳${data.total || 0}</p>
            </div>
        </div>
        <div class="status-update-wrapper">
            ${isTerminal ? `
                <div class="locked-notice">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span>স্ট্যাটাস লক করা আছে</span>
                </div>
            ` : `
                <select class="status-select" data-id="${id}">
                    <option value="pending" ${data.status === 'pending' ? 'selected' : ''}>নতুন অর্ডার</option>
                    <option value="confirmed" ${data.status === 'confirmed' ? 'selected' : ''}>অর্ডার কনফার্ম</option>
                    <option value="Packaging" ${data.status === 'Packaging' || data.status === 'Packeging' ? 'selected' : ''}>প্যাকেজ করা হয়েছে</option>
                    <option value="processing" ${data.status === 'processing' ? 'selected' : ''}>কোরিয়ার করা হয়েছে</option>
                    <option value="Delivered" ${data.status === 'Delivered' ? 'selected' : ''}>সফল ডেলিভারি</option>
                    <option value="Cancel" ${data.status === 'Cancel' ? 'selected' : ''}>বাতিল</option>
                    <option value="Returned" ${data.status === 'Returned' ? 'selected' : ''}>রিটার্ন</option>
                </select>
            `}
        </div>
        <div class="order-card-actions">
            <button class="btn-outline view-details-btn" data-id="${id}">বিস্তারিত</button>
            <button class="btn-outline edit-order-btn" data-id="${id}" ${isTerminal ? 'disabled' : ''}>এডিট</button>
            <button class="btn-danger delete-order-btn" data-id="${id}">ডিলিট</button>
        </div>
    `;

    // Event Listeners for Card Actions
    card.querySelector(".view-details-btn").addEventListener("click", () => openDetailsModal(data));
    card.querySelector(".edit-order-btn").addEventListener("click", () => openEditModal(id, data));
    card.querySelector(".delete-order-btn").addEventListener("click", () => confirmDeleteOrder(id));

    const statusSelect = card.querySelector(".status-select");
    if (statusSelect) {
        statusSelect.addEventListener("change", (e) => updateOrderStatus(id, e.target.value));
    }

    ordersGrid.appendChild(card);
}

// XSS Sanitizer helper
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Search Logic
searchInput.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (val) {
        clearSearchBtn.style.display = "block";
        currentFilters.searchId = val;
    } else {
        clearSearchBtn.style.display = "none";
        currentFilters.searchId = "";
    }
    loadOrders(true);
});

clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    currentFilters.searchId = "";
    loadOrders(true);
});

// Status Filter Change
statusFilter.addEventListener("change", (e) => {
    currentFilters.status = e.target.value;
    loadOrders(true);
});

// Load More Pagination
loadMoreBtn.addEventListener("click", () => loadOrders(false));

retryBtn.addEventListener("click", () => loadOrders(true));

// Status Update Handler
async function updateOrderStatus(orderId, newStatus) {
    showConfirmation("আপনি কি এই অর্ডারের স্ট্যাটাস পরিবর্তন করতে নিশ্চিত?", async () => {
        try {
            const docRef = doc(db, "seller_landing_orders", orderId);
            await updateDoc(docRef, { status: newStatus });
            showToast("স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে!");
            loadOrders(true);
            loadSummaryCounts();
        } catch (error) {
            console.error("Status update failed:", error);
            showToast("স্ট্যাটাস আপডেট ব্যর্থ হয়েছে: " + error.message);
            loadOrders(true);
        }
    });
}

// Details Modal
async function openDetailsModal(data) {
    let variantsHTML = "";
    if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
        variantsHTML = "<h4>ভ্যারিয়েন্টসমূহ:</h4><ul>";
        data.variants.forEach(v => {
            variantsHTML += `<li>${escapeHTML(v.name || '')}: ${escapeHTML(v.value || '')} ${v.extraPrice ? `(তারিখ অতিরিক্ত: ৳${v.extraPrice})` : ''}</li>`;
        });
        variantsHTML += "</ul>";
    } else {
        variantsHTML = "<p>কোনো ভ্যারিয়েন্ট নির্বাচন করা হয়নি</p>";
    }

    detailsModalBody.innerHTML = `
        <p><strong>কাস্টমারের নাম:</strong> ${escapeHTML(data.name || 'N/A')}</p>
        <p><strong>ফোন:</strong> <a href="tel:${escapeHTML(data.phone || '')}">${escapeHTML(data.phone || 'N/A')}</a></p>
        <p><strong>বিভাগ:</strong> ${escapeHTML(data.vibag || 'N/A')}</p>
        <p><strong>জেলা:</strong> ${escapeHTML(data.jela || 'N/A')}</p>
        <p><strong>থানা/উপজেলা:</strong> ${escapeHTML(data.upojela || 'N/A')}</p>
        ${data.note ? `<p><strong>নোট:</strong> ${escapeHTML(data.note)}</p>` : ''}
        <hr style="margin: 1rem 0; border: 0; border-top: 1px solid var(--border-color);">
        <p><strong>পণ্যের নাম:</strong> ${escapeHTML(data.productName || 'N/A')}</p>
        <p><strong>পরিমাণ:</strong> ${data.quantity || 1}</p>
        <p><strong>ডেলিভারি এলাকা:</strong> ${data.deliverySite === 'inside_dhaka' ? 'ঢাকার ভেতরে' : 'ঢাকার বাইরে'}</p>
        ${variantsHTML}
        <hr style="margin: 1rem 0; border: 0; border-top: 1px solid var(--border-color);">
        <p><strong>মূল দাম:</strong> ৳${data.productPrice || 0}</p>
        <p><strong>ভ্যারিয়েন্ট মূল্য:</strong> ৳${data.variantPrice || 0}</p>
        <p><strong>সাবটোটাল:</strong> ৳${data.subtotal || 0}</p>
        <p><strong>ডেলিভারি চার্জ:</strong> ৳${data.deliveryCharge || 0}</p>
        <p><strong>সর্বমোট প্রদেয়:</strong> ৳${data.total || 0}</p>
    `;
    detailsModal.style.display = "flex";
}

closeDetailsModal.addEventListener("click", () => detailsModal.style.display = "none");

// Edit Modal
function openEditModal(id, data) {
    document.getElementById("edit-order-id").value = id;
    document.getElementById("edit-name").value = data.name || "";
    document.getElementById("edit-phone").value = data.phone || "";
    document.getElementById("edit-vibag").value = data.vibag || "";
    document.getElementById("edit-jela").value = data.jela || "";
    document.getElementById("edit-upojela").value = data.upojela || "";
    document.getElementById("edit-quantity").value = data.quantity || 1;
    document.getElementById("edit-delivery-site").value = data.deliverySite || "inside_dhaka";
    document.getElementById("edit-note").value = data.note || "";
    editModal.style.display = "flex";
}

closeEditModal.addEventListener("click", () => editModal.style.display = "none");

editOrderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-order-id").value;
    const updatedData = {
        name: document.getElementById("edit-name").value.trim(),
        phone: document.getElementById("edit-phone").value.trim(),
        vibag: document.getElementById("edit-vibag").value.trim(),
        jela: document.getElementById("edit-jela").value.trim(),
        upojela: document.getElementById("edit-upojela").value.trim(),
        quantity: parseInt(document.getElementById("edit-quantity").value) || 1,
        deliverySite: document.getElementById("edit-delivery-site").value,
        note: document.getElementById("edit-note").value.trim()
    };

    try {
        const docRef = doc(db, "seller_landing_orders", id);
        await updateDoc(docRef, updatedData);
        showToast("অর্ডার সফলভাবে আপডেট করা হয়েছে!");
        editModal.style.display = "none";
        loadOrders(true);
    } catch (error) {
        console.error("Edit failed:", error);
        showToast("এডিট ব্যর্থ হয়েছে: " + error.message);
    }
});

// Delete Order
function confirmDeleteOrder(orderId) {
    showConfirmation(`আপনি কি নিশ্চিত যে অর্ডার আইডি (${orderId}) ডিলিট করতে চান?`, async () => {
        try {
            await deleteDoc(doc(db, "seller_landing_orders", orderId));
            showToast("অর্ডার সফলভাবে ডিলিট করা হয়েছে!");
            loadOrders(true);
            loadSummaryCounts();
        } catch (error) {
            console.error("Delete failed:", error);
            showToast("ডিলিট করতে সমস্যা হয়েছে: " + error.message);
        }
    });
}

// Confirmation Modal Helper
function showConfirmation(text, callback) {
    confirmModalText.textContent = text;
    confirmCallback = callback;
    confirmModal.style.display = "flex";
}

confirmYesBtn.addEventListener("click", () => {
    confirmModal.style.display = "none";
    if (confirmCallback) confirmCallback();
});

confirmNoBtn.addEventListener("click", () => {
    confirmModal.style.display = "none";
    confirmCallback = null;
});
