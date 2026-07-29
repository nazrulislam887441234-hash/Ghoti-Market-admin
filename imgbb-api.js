/* ==========================================================
   ImgBB API Keys Manager - Main Application Logic (v10 Modular SDK)
   ========================================================== */

// Import Firebase SDKs (Ensure firebase.js or your project's firebase init exports auth & db)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ----------------------------------------------------------
   Firebase Configuration & Initialization
   (Replace with your project credentials if not initialized elsewhere)
   ---------------------------------------------------------- */
const firebaseConfig = {
    apiKey: "AIzaSyBUhNhYvuo_FTvZ5RZR6Gn-4hsUY21S0XE",
    authDomain: "ghotimarket.firebaseapp.com",
    projectId: "ghotimarket",
    storageBucket: "ghotimarket.appspot.com",
    messagingSenderId: "9382019283",
    appId: "1:9382019283:web:abc12345"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Target Authorized Email
const AUTHORIZED_EMAIL = "support@ghotimarket.com";

// Global State
let apiKeysCache = [];
let deleteTargetId = null;

/* ----------------------------------------------------------
   DOM Elements
   ---------------------------------------------------------- */
const authLoader = document.getElementById("auth-loader");
const dashboardWrapper = document.getElementById("dashboard-wrapper");
const userEmailDisplay = document.getElementById("user-email-display");
const logoutBtn = document.getElementById("logout-btn");
const themeToggleBtn = document.getElementById("theme-toggle");

const apiForm = document.getElementById("api-form");
const editDocIdInput = document.getElementById("edit-doc-id");
const apiNameInput = document.getElementById("api-name");
const apiKeyInput = document.getElementById("api-key-input");
const errorName = document.getElementById("error-name");
const errorKey = document.getElementById("error-key");
const saveBtn = document.getElementById("save-btn");
const clearBtn = document.getElementById("clear-btn");

const searchInput = document.getElementById("search-input");
const apiTableBody = document.getElementById("api-table-body");
const emptyState = document.getElementById("empty-state");
const tableLoader = document.getElementById("table-loader");

const confirmModal = document.getElementById("confirm-modal");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalConfirmBtn = document.getElementById("modal-confirm-btn");

/* ----------------------------------------------------------
   Authentication & Security Guards
   ---------------------------------------------------------- */
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // No user logged in -> Immediate redirect
        window.location.href = "index.html";
        return;
    }

    if (user.email !== AUTHORIZED_EMAIL) {
        // Unauthorized user -> Show toast message for 2 seconds then redirect
        showToast("Access Denied. Unauthorized account.", "error");
        setTimeout(() => {
            window.location.href = "index.html";
        }, 2000);
        return;
    }

    // Authorized user session verified successfully
    userEmailDisplay.textContent = user.email;
    authLoader.style.display = "none";
    dashboardWrapper.style.display = "flex";

    // Initialize Dashboard Data
    await fetchApiKeys();
});

/* ----------------------------------------------------------
   Theme Toggle Logic
   ---------------------------------------------------------- */
const currentTheme = localStorage.getItem("theme") || "dark";
document.documentElement.setAttribute("data-theme", currentTheme);
updateThemeIcon(currentTheme);

themeToggleBtn.addEventListener("click", () => {
    const theme = document.documentElement.getAttribute("data-theme");
    const newTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
    themeToggleBtn.innerHTML = theme === "dark" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

/* ----------------------------------------------------------
   Logout Handler
   ---------------------------------------------------------- */
logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
        await signOut(auth);
        window.location.href = "index.html";
    } catch (error) {
        showToast("Error signing out: " + error.message, "error");
    }
});

/* ----------------------------------------------------------
   Form Submission & Save / Update Logic
   ---------------------------------------------------------- */
apiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const nameVal = apiNameInput.value.trim();
    const keyVal = apiKeyInput.value.trim();
    const editId = editDocIdInput.value;

    // Validation
    let isValid = true;
    errorName.textContent = "";
    errorKey.textContent = "";

    if (!nameVal) {
        errorName.textContent = "API Name is required.";
        isValid = false;
    }
    if (!keyVal) {
        errorKey.textContent = "API Key is required.";
        isValid = false;
    }
    if (!isValid) return;

    // Check Duplicates in Cache (Name & Key)
    const duplicateName = apiKeysCache.find(item => item.name.toLowerCase() === nameVal.toLowerCase() && item.id !== editId);
    const duplicateKey = apiKeysCache.find(item => item.apiKey === keyVal && item.id !== editId);

    if (duplicateName) {
        errorName.textContent = "An API with this name already exists.";
        return;
    }
    if (duplicateKey) {
        errorKey.textContent = "This exact ImgBB API Key already exists.";
        return;
    }

    // Disable Save Button during processing
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<div class="spinner-small" style="width:16px;height:16px;border-width:2px;"></div> Saving...`;

    try {
        if (editId) {
            // Update Document
            const docRef = doc(db, "api_keys", editId);
            await updateDoc(docRef, {
                name: nameVal,
                apiKey: keyVal,
                updatedAt: serverTimestamp()
            });
            showToast("API Key updated successfully!", "success");
        } else {
            // Create New Document
            await addDoc(collection(db, "api_keys"), {
                name: nameVal,
                email: AUTHORIZED_EMAIL,
                apiKey: keyVal,
                status: "active",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            showToast("API Key saved successfully!", "success");
        }

        resetForm();
        await fetchApiKeys();
    } catch (error) {
        showToast("Error: " + error.message, "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save API Key`;
    }
});

/* Clear Form Action */
clearBtn.addEventListener("click", resetForm);

function resetForm() {
    apiForm.reset();
    editDocIdInput.value = "";
    errorName.textContent = "";
    errorKey.textContent = "";
    saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save API Key`;
}

/* ----------------------------------------------------------
   Fetch & Display Table Data (Sorted Newest First)
   ---------------------------------------------------------- */
async function fetchApiKeys() {
    tableLoader.style.display = "flex";
    apiTableBody.innerHTML = "";
    emptyState.style.display = "none";

    try {
        const q = query(collection(db, "api_keys"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        apiKeysCache = [];
        querySnapshot.forEach((docSnap) => {
            apiKeysCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        renderTable(apiKeysCache);
    } catch (error) {
        showToast("Failed to fetch records: " + error.message, "error");
    } finally {
        tableLoader.style.display = "none";
    }
}

/* Render Table Rows */
function renderTable(dataArray) {
    apiTableBody.innerHTML = "";

    if (dataArray.length === 0) {
        emptyState.style.display = "flex";
        return;
    }

    emptyState.style.display = "none";

    dataArray.forEach((item, index) => {
        const tr = document.createElement("tr");

        // Format Date safely
        let formattedDate = "N/A";
        if (item.createdAt && item.createdAt.toDate) {
            formattedDate = item.createdAt.toDate().toLocaleDateString("en-US", {
                year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
            });
        }

        const maskedKey = maskApiKey(item.apiKey);
        const statusBadge = item.status === "active" 
            ? `<span class="badge active"><i class="fa-solid fa-circle-check"></i> Active</span>` 
            : `<span class="badge inactive"><i class="fa-solid fa-circle-pause"></i> Inactive</span>`;

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td><code>${maskedKey}</code></td>
            <td>${statusBadge}</td>
            <td>${formattedDate}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit" title="Edit API" data-id="${item.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="action-btn status" title="Toggle Status" data-id="${item.id}" data-status="${item.status}"><i class="fa-solid fa-power-off"></i></button>
                    <button class="action-btn delete" title="Delete API" data-id="${item.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
        apiTableBody.appendChild(tr);
    });

    attachRowActionListeners();
}

/* Mask API Key Format: 123456******abcd */
function maskApiKey(key) {
    if (!key || key.length < 10) return "******";
    const start = key.slice(0, 6);
    const end = key.slice(-4);
    return `${start}******${end}`;
}

/* ----------------------------------------------------------
   Table Actions (Edit, Toggle Status, Delete)
   ---------------------------------------------------------- */
function attachRowActionListeners() {
    // Edit Action
    document.querySelectorAll(".action-btn.edit").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.currentTarget.getAttribute("data-id");
            const item = apiKeysCache.find(i => i.id === id);
            if (item) {
                editDocIdInput.value = item.id;
                apiNameInput.value = item.name;
                apiKeyInput.value = item.apiKey;
                saveBtn.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Update API Key`;
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        });
    });

    // Toggle Status Action
    document.querySelectorAll(".action-btn.status").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const id = e.currentTarget.getAttribute("data-id");
            const currentStatus = e.currentTarget.getAttribute("data-status");
            const newStatus = currentStatus === "active" ? "inactive" : "active";

            try {
                const docRef = doc(db, "api_keys", id);
                await updateDoc(docRef, {
                    status: newStatus,
                    updatedAt: serverTimestamp()
                });
                showToast(`Status changed to ${newStatus}`, "success");
                await fetchApiKeys();
            } catch (error) {
                showToast("Failed to update status: " + error.message, "error");
            }
        });
    });

    // Delete Action (Trigger Confirmation Modal)
    document.querySelectorAll(".action-btn.delete").forEach(btn => {
        btn.addEventListener("click", (e) => {
            deleteTargetId = e.currentTarget.getAttribute("data-id");
            confirmModal.style.display = "flex";
        });
    });
}

/* Modal Confirmation Handlers */
modalCancelBtn.addEventListener("click", () => {
    deleteTargetId = null;
    confirmModal.style.display = "none";
});

modalConfirmBtn.addEventListener("click", async () => {
    if (!deleteTargetId) return;

    try {
        await deleteDoc(doc(db, "api_keys", deleteTargetId));
        showToast("API Key deleted successfully.", "success");
        confirmModal.style.display = "none";
        deleteTargetId = null;
        await fetchApiKeys();
    } catch (error) {
        showToast("Failed to delete record: " + error.message, "error");
    }
});

/* ----------------------------------------------------------
   Instant Search Logic
   ---------------------------------------------------------- */
searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
        renderTable(apiKeysCache);
        return;
    }

    const filtered = apiKeysCache.filter(item => 
        item.name.toLowerCase().includes(term) || 
        item.apiKey.toLowerCase().includes(term)
    );
    renderTable(filtered);
});

/* ----------------------------------------------------------
   Toast Notification Helper
   ---------------------------------------------------------- */
function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    const icon = type === "success" ? "fa-circle-check" : "fa-circle-exclamation";
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

/* Utility to prevent XSS injection */
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
