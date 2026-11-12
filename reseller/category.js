// Firebase SDKs Import (Modular v10)
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
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy, 
    serverTimestamp, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration (Replace with your actual Firebase config if needed)
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

// Owner Allowed Emails
const OWNER_EMAILS = [
    "nazrulislam887441234@gmail.com",
    "support@ghotimarket.com"
];

// Global Variables
let categoriesData = [];
let isSubmitting = false;

// DOM Elements
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const userRoleDisplay = document.getElementById('userRoleDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');

// Modal Elements
const customModal = document.getElementById('customModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalIcon = document.getElementById('modalIcon');
const modalOkBtn = document.getElementById('modalOkBtn');
const modalButtons = document.getElementById('modalButtons');

// Form & Table Elements
const createCategoryForm = document.getElementById('createCategoryForm');
const categoryNameInput = document.getElementById('categoryNameInput');
const categoryImageInput = document.getElementById('categoryImageInput');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeImageBtn = document.getElementById('removeImageBtn');
const categoryTableBody = document.getElementById('categoryTableBody');
const emptyCategoryState = document.getElementById('emptyCategoryState');
const categorySearchInput = document.getElementById('categorySearchInput');

// Edit Modal Elements
const editCategoryModal = document.getElementById('editCategoryModal');
const closeEditModal = document.getElementById('closeEditModal');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const editCategoryForm = document.getElementById('editCategoryForm');
const editCategoryId = document.getElementById('editCategoryId');
const editCategoryName = document.getElementById('editCategoryName');
const editCategoryImage = document.getElementById('editCategoryImage');
const editCurrentImgPreview = document.getElementById('editCurrentImgPreview');
const existingImageUrl = document.getElementById('existingImageUrl');

// Helper: Show/Hide Loading
function showLoading(text = "অনুগ্রহ করে অপেক্ষা করুন...") {
    loadingText.innerText = text;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

// Custom Popup Alert
function showAlert(title, message, type = 'success', callback = null) {
    modalTitle.innerText = title;
    modalMessage.innerText = message;
    modalIcon.innerText = type === 'success' ? '✅' : '❌';
    modalButtons.innerHTML = `<button id="modalOkBtn" class="btn-primary">ঠিক আছে</button>`;
    customModal.classList.remove('hidden');

    document.getElementById('modalOkBtn').onclick = () => {
        customModal.classList.add('hidden');
        if (callback) callback();
    };
}

// Custom Confirmation Modal
function showConfirm(title, message, onConfirm) {
    modalTitle.innerText = title;
    modalMessage.innerText = message;
    modalIcon.innerText = '⚠️';
    modalButtons.innerHTML = `
        <button id="modalCancelBtn" class="btn-secondary">বাতিল</button>
        <button id="modalConfirmBtn" class="btn-primary">নিশ্চিত করুন</button>
    `;
    customModal.classList.remove('hidden');

    document.getElementById('modalCancelBtn').onclick = () => {
        customModal.classList.add('hidden');
    };

    document.getElementById('modalConfirmBtn').onclick = () => {
        customModal.classList.add('hidden');
        onConfirm();
    };
}

// Authentication & Authorization Guard
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'https://admin.ghotimarket.com/reseller/login';
        return;
    }

    const email = user.email;
    const uid = user.uid;
    userEmailDisplay.innerText = email;

    // Check Owner Status
    if (OWNER_EMAILS.includes(email)) {
        userRoleDisplay.innerText = "ওনার (Owner)";
        initDashboard();
        return;
    }

    // Check Admin Status in Firestore
    showLoading("অনুমতি যাচাই করা হচ্ছে...");
    try {
        const adminsRef = collection(db, "admins");
        const querySnapshot = await getDocs(adminsRef);
        let isAdminActive = false;

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.uid === uid && data.active === true) {
                isAdminActive = true;
            }
        });

        hideLoading();

        if (isAdminActive) {
            userRoleDisplay.innerText = "অ্যাডমিন (Admin)";
            initDashboard();
        } else {
            showAlert("অ্যাক্সেসDenied", "আপনার এই প্যানেলে প্রবেশ করার কোনো অনুমতি নেই।", "error", () => {
                signOut(auth).then(() => { window.location.href = 'https://admin.ghotimarket.com/reseller/login'; });
            });
        }
    } catch (error) {
        hideLoading();
        showAlert("ত্রুটি", "অনুমতি যাচাই করতে সমস্যা হয়েছে: " + error.message, "error");
    }
});

// Initialize Dashboard Functionalities
function initDashboard() {
    setupNavigation();
    loadCategoriesLive();
}

// Sidebar Navigation Switcher
function setupNavigation() {
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');
            switchSection(targetId);

            menuItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            if (window.innerWidth <= 992) {
                sidebar.classList.remove('mobile-open');
            }
        });
    });

    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
    });
}

window.switchSection = function(sectionId) {
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
}

// Logout Handler
logoutBtn.addEventListener('click', () => {
    showConfirm("লগআউট", "আপনি কি নিশ্চিত লগআউট করতে চান?", () => {
        signOut(auth).then(() => {
            window.location.href = '/login';
        });
    });
});

// Image Preview for Create Form
let selectedImageFile = null;
categoryImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        selectedImageFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
});

removeImageBtn.addEventListener('click', () => {
    categoryImageInput.value = '';
    selectedImageFile = null;
    imagePreviewContainer.classList.add('hidden');
});

// Fetch ImgBB API Key from Firestore
async function getLatestImgBBKey() {
    try {
        const imgbbRef = collection(db, "imgbb_api");
        const q = query(imgbbRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) return null;
        
        const latestDoc = snapshot.docs[0].data();
        return latestDoc.apiKey || null;
    } catch (error) {
        console.error("ImgBB API Key Fetch Error:", error);
        return null;
    }
}

// Upload Image to ImgBB with Custom Renaming
async function uploadImageToImgBB(file) {
    const apiKey = await getLatestImgBBKey();
    if (!apiKey) {
        throw new Error("ImgBB API Key পাওয়া যায়নি বা সংগ্রহ করা সম্ভব হয়নি।");
    }

    // Rename Image Rule: CurrentMillisecond + OriginalName
    const originalName = file.name;
    const renamedFileName = `${Date.now()}${originalName}`;
    
    const renamedFile = new File([file], renamedFileName, { type: file.type });

    const formData = new FormData();
    formData.append("image", renamedFile);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: "POST",
        body: formData
    });

    const data = await response.json();
    if (data.success) {
        return data.data.url;
    } else {
        throw new Error(data.error?.message || "ছবি আপলোড ব্যর্থ হয়েছে।");
    }
}

// Create Category Form Submission
createCategoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const categoryName = categoryNameInput.value.trim();
    if (!categoryName || !selectedImageFile) {
        showAlert("সতর্কতা", "দয়া করে ক্যাটাগরির নাম এবং ছবি উভয়ই দিন।", "error");
        return;
    }

    // Check duplicate name locally or via query
    const nameExists = categoriesData.some(cat => cat.categoryName.toLowerCase() === categoryName.toLowerCase());
    if (nameExists) {
        showAlert("সতর্কতা", "এই নামের ক্যাটাগরিতে ইতিমধ্যে একটি এন্ট্রি রয়েছে। অন্য নাম ব্যবহার করুন।", "error");
        return;
    }

    isSubmitting = true;
    showLoading("ক্যাটাগরি তৈরি এবং ছবি আপলোড হচ্ছে...");

    try {
        // 1. Upload Image
        const imageUrl = await uploadImageToImgBB(selectedImageFile);

        // 2. Save to Firestore
        await addDoc(collection(db, "categories"), {
            categoryName: categoryName,
            categoryImage: imageUrl,
            createdAt: serverTimestamp()
        });

        hideLoading();
        isSubmitting = false;

        showAlert("সফল!", "নতুন ক্যাটাগরি সফলভাবে তৈরি করা হয়েছে।", "success");
        createCategoryForm.reset();
        imagePreviewContainer.classList.add('hidden');
        selectedImageFile = null;
        switchSection('categoriesSection');

    } catch (error) {
        hideLoading();
        isSubmitting = false;
        showAlert("ত্রুটি", error.message, "error");
    }
});

// Live Load Categories from Firestore
function loadCategoriesLive() {
    const q = query(collection(db, "categories"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        categoriesData = [];
        snapshot.forEach((doc) => {
            categoriesData.push({ id: doc.id, ...doc.data() });
        });

        renderCategoryTable(categoriesData);
        updateDashboardOverview(categoriesData);
    }, (error) => {
        console.error("Firestore live load error:", error);
    });
}

// Render Categories Table
function renderCategoryTable(data) {
    categoryTableBody.innerHTML = "";
    
    if (data.length === 0) {
        emptyCategoryState.classList.remove('hidden');
        return;
    } else {
        emptyCategoryState.classList.add('hidden');
    }

    data.forEach((cat) => {
        const dateFormatted = cat.createdAt?.toDate ? cat.createdAt.toDate().toLocaleString('bn-BD') : 'মাত্রই';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${cat.categoryImage}" alt="${cat.categoryName}" class="table-img"></td>
            <td><strong>${cat.categoryName}</strong></td>
            <td>${dateFormatted}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-icon-action edit" onclick="openEditModal('${cat.id}')" title="সম্পাদনা">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon-action delete" onclick="confirmDeleteCategory('${cat.id}')" title="ডিলিট">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            </td>
        `;
        categoryTableBody.appendChild(tr);
    });
}

// Update Dashboard Overview Counts & Info
function updateDashboardOverview(data) {
    document.getElementById('totalCategoriesCount').innerText = data.length.toLocaleString('bn-BD');
    
    if (data.length > 0) {
        document.getElementById('lastCreatedCategory').innerText = data[0].categoryName;
        document.getElementById('lastUpdatedCategory').innerText = data[0].categoryName;
    } else {
        document.getElementById('lastCreatedCategory').innerText = 'নেই';
        document.getElementById('lastUpdatedCategory').innerText = 'নেই';
    }
}

// Search Filter
categorySearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = categoriesData.filter(cat => cat.categoryName.toLowerCase().includes(searchTerm));
    renderCategoryTable(filtered);
});

// Edit Category Modal Opener
window.openEditModal = function(id) {
    const cat = categoriesData.find(c => c.id === id);
    if (!cat) return;

    editCategoryId.value = cat.id;
    editCategoryName.value = cat.categoryName;
    existingImageUrl.value = cat.categoryImage;
    editCurrentImgPreview.src = cat.categoryImage;
    editCategoryImage.value = '';

    editCategoryModal.classList.remove('hidden');
}

closeEditModal.addEventListener('click', () => editCategoryModal.classList.add('hidden'));
cancelEditBtn.addEventListener('click', () => editCategoryModal.classList.add('hidden'));

// Edit Form Submission
editCategoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editCategoryId.value;
    const newName = editCategoryName.value.trim();
    const newImageFile = editCategoryImage.files[0];

    if (!newName) {
        showAlert("সতর্কতা", "ক্যাটাগরির নাম খালি রাখা যাবে না।", "error");
        return;
    }

    showLoading("ক্যাটাগরি আপডেট করা হচ্ছে...");

    try {
        let imageUrl = existingImageUrl.value;

        // If new image is selected, upload it
        if (newImageFile) {
            imageUrl = await uploadImageToImgBB(newImageFile);
        }

        const docRef = doc(db, "categories", id);
        await updateDoc(docRef, {
            categoryName: newName,
            categoryImage: imageUrl
            // Note: createdAt is strictly preserved and not overwritten
        });

        hideLoading();
        editCategoryModal.classList.add('hidden');
        showAlert("সফল!", "ক্যাটাগরি সফলভাবে আপডেট করা হয়েছে।", "success");

    } catch (error) {
        hideLoading();
        showAlert("ত্রুটি", error.message, "error");
    }
});

// Delete Category Handler
window.confirmDeleteCategory = function(id) {
    showConfirm("ক্যাটাগরি মুছে ফেলা", "আপনি কি সত্যিই এই ক্যাটাগরি ডিলিট করতে চান? এই প্রক্রিয়াটি আর ফিরিয়ে আনা যাবে না।", async () => {
        showLoading("ক্যাটাগরি মুছে ফেলা হচ্ছে...");
        try {
            await deleteDoc(doc(db, "categories", id));
            hideLoading();
            showAlert("সফল", "ক্যাটাগরি সফলভাবে মুছে ফেলা হয়েছে।", "success");
        } catch (error) {
            hideLoading();
            showAlert("ত্রুটি", "ক্যাটাগরি ডিলিট করতে সমস্যা হয়েছে: " + error.message, "error");
        }
    });
}
