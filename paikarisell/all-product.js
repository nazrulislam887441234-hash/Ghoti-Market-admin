import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCIRWmozT0XcEXuXtQ6RDiDo6vtT1T9mU",
  authDomain: "paikarisell-ghotimarket.firebaseapp.com",
  projectId: "paikarisell-ghotimarket",
  storageBucket: "paikarisell-ghotimarket.firebasestorage.app",
  messagingSenderId: "464086432830",
  appId: "1:464086432830:web:a10fdd9884954e380e656f",
  measurementId: "G-E3HR2F9TC5"
};

const OWNER_EMAILS = [
  "nazrulislam887441234@gmail.com",
  "support@ghotimarket.com"
];

const PAGE_SIZE = 20;
const MAX_BULK_DELETE_LIMIT = 100; // Firestore 500 write limit সুরক্ষার জন্য সর্বোচ্চ ১০০টি প্রোডাক্ট

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Role & Permission Structure (ভবিষ্যতে সম্প্রসারণযোগ্য)
const ROLE_PERMISSIONS = {
  owner: {
    viewProducts: true,
    approveProduct: true,
    editProduct: true,
    deleteProduct: true,
    bulkDeleteProducts: true,
    manageOwnerSettings: true
  },
  admin: {
    viewProducts: true,
    approveProduct: true,
    editProduct: true,
    deleteProduct: true,
    bulkDeleteProducts: true,
    manageOwnerSettings: false
  }
};

// Application State
const state = {
  currentUser: null,
  role: null, // 'owner' | 'admin'
  permissions: null,
  products: [],
  loadedIds: new Set(),
  selectedIds: new Set(),
  lastVisibleDoc: null,
  hasMore: false,
  activeFilter: "all", // 'all' | 'active' | 'inactive' | 'approved' | 'not_approved' | 'free_delivery' | 'no_free_delivery'
  searchMode: null, // null | 'productId' | 'uid'
  searchType: "productId",
  searchQuery: "",
  isLoadingList: false,
  isLoadingMore: false,
  isActionBusy: false,
  editingProductId: null,
  supplierCache: new Map(), // uid -> supplierData | null
  categoryCache: new Map(), // categoryId -> categoryData | null
  pendingConfirmAction: null
};

// DOM References
const dom = {
  authGateLoader: document.getElementById("authGateLoader"),
  unauthorizedModal: document.getElementById("unauthorizedModal"),
  unauthorizedMessage: document.getElementById("unauthorizedMessage"),
  unauthorizedRedirectBtn: document.getElementById("unauthorizedRedirectBtn"),
  appShell: document.getElementById("appShell"),

  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),
  openSidebarBtn: document.getElementById("openSidebarBtn"),
  closeSidebarBtn: document.getElementById("closeSidebarBtn"),
  roleBadgeLabel: document.getElementById("roleBadgeLabel"),
  currentUserEmail: document.getElementById("currentUserEmail"),
  headerRolePill: document.getElementById("headerRolePill"),
  logoutBtn: document.getElementById("logoutBtn"),
  topRefreshBtn: document.getElementById("topRefreshBtn"),
  navRefreshAllBtn: document.getElementById("navRefreshAllBtn"),
  navQuickPendingBtn: document.getElementById("navQuickPendingBtn"),
  navQuickApprovedBtn: document.getElementById("navQuickApprovedBtn"),

  statTotalProducts: document.getElementById("statTotalProducts"),
  statApprovedProducts: document.getElementById("statApprovedProducts"),
  statPendingProducts: document.getElementById("statPendingProducts"),
  statActiveProducts: document.getElementById("statActiveProducts"),
  statInactiveProducts: document.getElementById("statInactiveProducts"),
  statFreeDeliveryProducts: document.getElementById("statFreeDeliveryProducts"),

  searchForm: document.getElementById("searchForm"),
  searchTypeSelect: document.getElementById("searchTypeSelect"),
  searchInput: document.getElementById("searchInput"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  searchSubmitBtn: document.getElementById("searchSubmitBtn"),

  filterPillsContainer: document.getElementById("filterPillsContainer"),
  selectAllCheckbox: document.getElementById("selectAllCheckbox"),
  loadedCountLabel: document.getElementById("loadedCountLabel"),

  bulkSelectionToolbar: document.getElementById("bulkSelectionToolbar"),
  selectedCountBadge: document.getElementById("selectedCountBadge"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),
  bulkDeleteBtn: document.getElementById("bulkDeleteBtn"),

  queryErrorBanner: document.getElementById("queryErrorBanner"),
  queryErrorMessage: document.getElementById("queryErrorMessage"),
  retryQueryBtn: document.getElementById("retryQueryBtn"),

  skeletonGrid: document.getElementById("skeletonGrid"),
  emptyStateBox: document.getElementById("emptyStateBox"),
  emptyStateTitle: document.getElementById("emptyStateTitle"),
  emptyStateDesc: document.getElementById("emptyStateDesc"),
  resetFiltersBtn: document.getElementById("resetFiltersBtn"),

  productsGrid: document.getElementById("productsGrid"),
  paginationContainer: document.getElementById("paginationContainer"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),

  confirmModal: document.getElementById("confirmModal"),
  confirmModalIcon: document.getElementById("confirmModalIcon"),
  confirmModalTitle: document.getElementById("confirmModalTitle"),
  confirmModalMessage: document.getElementById("confirmModalMessage"),
  confirmModalExtra: document.getElementById("confirmModalExtra"),
  confirmCancelBtn: document.getElementById("confirmCancelBtn"),
  confirmProceedBtn: document.getElementById("confirmProceedBtn"),

  editProductModal: document.getElementById("editProductModal"),
  editModalProductId: document.getElementById("editModalProductId"),
  closeEditModalBtn: document.getElementById("closeEditModalBtn"),
  cancelEditModalBtn: document.getElementById("cancelEditModalBtn"),
  editProductForm: document.getElementById("editProductForm"),
  editProductName: document.getElementById("editProductName"),
  editProductDescription: document.getElementById("editProductDescription"),
  editPrice: document.getElementById("editPrice"),
  editHighRate: document.getElementById("editHighRate"),
  editFreeDelivery: document.getElementById("editFreeDelivery"),
  editActive: document.getElementById("editActive"),
  addVariantGroupBtn: document.getElementById("addVariantGroupBtn"),
  variantsContainer: document.getElementById("variantsContainer"),
  editFormErrorBox: document.getElementById("editFormErrorBox"),
  saveEditProductBtn: document.getElementById("saveEditProductBtn"),

  toastContainer: document.getElementById("toastContainer")
};

// ==========================================
// 1. Utility & Security Helpers
// ==========================================
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isOwnerEmail(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  return OWNER_EMAILS.some((ownerMail) => ownerMail.trim().toLowerCase() === normalized);
}

function hasPermission(permissionKey) {
  return Boolean(state.permissions && state.permissions[permissionKey] === true);
}

function formatDateBn(timestamp) {
  if (!timestamp) return "তারিখ নেই";
  try {
    const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("bn-BD", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "তারিখ নেই";
  }
}

function formatPriceBn(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return "০";
  return n.toLocaleString("bn-BD");
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast-item ${type}`;

  const iconSvg =
    type === "success"
      ? `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
      : type === "error"
      ? `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
      : `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

  toast.innerHTML = `<span style="display:flex;margin-top:2px;flex-shrink:0;">${iconSvg}</span><span>${escapeHtml(message)}</span>`;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.25s ease";
    setTimeout(() => toast.remove(), 260);
  }, 4000);
}

// ==========================================
// 2. Owner & Admin Verification Flow
// ==========================================
function showUnauthorizedPopup(message) {
  dom.authGateLoader.classList.add("hidden");
  dom.appShell.classList.add("hidden");
  dom.unauthorizedMessage.textContent = message;
  dom.unauthorizedModal.classList.remove("hidden");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("/login");
    return;
  }

  state.currentUser = user;

  // Owner Check (Skip admins collection entirely for Owner)
  if (isOwnerEmail(user.email)) {
    state.role = "owner";
    state.permissions = { ...ROLE_PERMISSIONS.owner };
    initializeAuthorizedDashboard();
    return;
  }

  // Admin Check via Firestore admins/{uid}
  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);

    if (!adminSnap.exists()) {
      showUnauthorizedPopup("আপনার অ্যাডমিন অ্যাকাউন্ট খুঁজে পাওয়া যায়নি। প্রবেশাধিকার বাতিল করা হয়েছে।");
      return;
    }

    const adminData = adminSnap.data();
    if (adminData.uid === user.uid && adminData.active === true) {
      state.role = "admin";
      state.permissions = { ...ROLE_PERMISSIONS.admin };
      initializeAuthorizedDashboard();
    } else {
      showUnauthorizedPopup("আপনার অ্যাডমিন অ্যাকাউন্টটি নিষ্ক্রিয় রয়েছে অথবা তথ্য সঠিক নয়।");
    }
  } catch (err) {
    console.error("Admin verification error:", err);
    showUnauthorizedPopup("অনুমতি যাচাই করতে ব্যর্থ হয়েছে। আপনার অ্যাডমিন এক্সেস নেই।");
  }
});

async function initializeAuthorizedDashboard() {
  dom.authGateLoader.classList.add("hidden");
  dom.unauthorizedModal.classList.add("hidden");
  dom.appShell.classList.remove("hidden");

  const roleText = state.role === "owner" ? "Owner (সর্বোচ্চ ক্ষমতা)" : "Admin (অনুমোদিত)";
  dom.roleBadgeLabel.textContent = roleText;
  dom.headerRolePill.textContent = state.role === "owner" ? "ভূমিকা: Owner" : "ভূমিকা: Admin";
  dom.currentUserEmail.textContent = state.currentUser.email || state.currentUser.uid;

  await Promise.all([
    loadDashboardStatistics(),
    fetchProductsBatch({ reset: true })
  ]);
}

// ==========================================
// 3. Dashboard Statistics (No Full Collection Download)
// ==========================================
async function loadDashboardStatistics() {
  const productsCol = collection(db, "products");

  const safeCount = async (q) => {
    try {
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch {
      return null;
    }
  };

  try {
    const [
      infoDocSnap,
      totalCount,
      approvedCount,
      activeCount,
      inactiveCount,
      freeDeliveryCount
    ] = await Promise.all([
      getDoc(doc(db, "informations", "product")).catch(() => null),
      safeCount(query(productsCol)),
      safeCount(query(productsCol, where("approved", "==", true))),
      safeCount(query(productsCol, where("active", "==", true))),
      safeCount(query(productsCol, where("active", "==", false))),
      safeCount(query(productsCol, where("freeDelivery", "==", true)))
    ]);

    const infoTotal =
      infoDocSnap && infoDocSnap.exists() && Number.isFinite(Number(infoDocSnap.data().totalProduct))
        ? Number(infoDocSnap.data().totalProduct)
        : null;

    const finalTotal = totalCount !== null ? totalCount : infoTotal;
    const pendingCount =
      finalTotal !== null && approvedCount !== null ? Math.max(0, finalTotal - approvedCount) : null;

    dom.statTotalProducts.textContent = finalTotal !== null ? formatPriceBn(finalTotal) : "—";
    dom.statApprovedProducts.textContent = approvedCount !== null ? formatPriceBn(approvedCount) : "—";
    dom.statPendingProducts.textContent = pendingCount !== null ? formatPriceBn(pendingCount) : "—";
    dom.statActiveProducts.textContent = activeCount !== null ? formatPriceBn(activeCount) : "—";
    dom.statInactiveProducts.textContent = inactiveCount !== null ? formatPriceBn(inactiveCount) : "—";
    dom.statFreeDeliveryProducts.textContent = freeDeliveryCount !== null ? formatPriceBn(freeDeliveryCount) : "—";
  } catch (err) {
    console.error("Statistics load error:", err);
  }
}

// ==========================================
// 4. Caching Supplier & Category Documents
// ==========================================
async function getSupplierCached(uid) {
  if (!uid) return null;
  if (state.supplierCache.has(uid)) {
    return state.supplierCache.get(uid);
  }
  try {
    const snap = await getDoc(doc(db, "supplyers", uid));
    const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    state.supplierCache.set(uid, data);
    return data;
  } catch (err) {
    console.error("Supplier read error:", uid, err);
    return null;
  }
}

async function getCategoryCached(categoryId) {
  if (!categoryId) return null;
  if (state.categoryCache.has(categoryId)) {
    return state.categoryCache.get(categoryId);
  }
  try {
    const snap = await getDoc(doc(db, "categories", categoryId));
    const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    state.categoryCache.set(categoryId, data);
    return data;
  } catch (err) {
    console.error("Category read error:", categoryId, err);
    return null;
  }
}

async function hydrateRelatedDocs(productsList) {
  const uniqueUids = [...new Set(productsList.map((p) => p.uid).filter(Boolean))];
  const uniqueCatIds = [...new Set(productsList.map((p) => p.categoryId).filter(Boolean))];

  await Promise.all([
    ...uniqueUids.map((uid) => getSupplierCached(uid)),
    ...uniqueCatIds.map((catId) => getCategoryCached(catId))
  ]);
}

// ==========================================
// 5. Query Builder, Pagination, Filters & Search
// ==========================================
function buildProductQuery(cursorDoc = null) {
  const productsRef = collection(db, "products");
  const constraints = [];

  if (state.searchMode === "uid" && state.searchQuery) {
    constraints.push(where("uid", "==", state.searchQuery));
  } else {
    switch (state.activeFilter) {
      case "active":
        constraints.push(where("active", "==", true));
        break;
      case "inactive":
        constraints.push(where("active", "==", false));
        break;
      case "approved":
        constraints.push(where("approved", "==", true));
        break;
      case "not_approved":
        // Firestore query: approved == false (যাদের approved ফিল্ড অনুপস্থিত, সেগুলোর জন্য মাইগ্রেশন স্ক্রিপ্ট দ্বারা approved: false সেট করতে হবে)
        constraints.push(where("approved", "==", false));
        break;
      case "free_delivery":
        constraints.push(where("freeDelivery", "==", true));
        break;
      case "no_free_delivery":
        constraints.push(where("freeDelivery", "==", false));
        break;
      case "all":
      default:
        break;
    }
  }

  constraints.push(orderBy("createdAt", "desc"));
  if (cursorDoc) {
    constraints.push(startAfter(cursorDoc));
  }
  constraints.push(limit(PAGE_SIZE));

  return query(productsRef, ...constraints);
}

async function fetchProductsBatch({ reset = false } = {}) {
  if (state.isLoadingList || state.isLoadingMore) return;

  dom.queryErrorBanner.classList.add("hidden");

  if (reset) {
    state.isLoadingList = true;
    state.products = [];
    state.loadedIds.clear();
    state.selectedIds.clear();
    state.lastVisibleDoc = null;
    state.hasMore = false;
    updateBulkToolbarUI();
    dom.productsGrid.innerHTML = "";
    dom.emptyStateBox.classList.add("hidden");
    dom.paginationContainer.classList.add("hidden");
    dom.skeletonGrid.classList.remove("hidden");
  } else {
    state.isLoadingMore = true;
    dom.loadMoreBtn.disabled = true;
    dom.loadMoreBtn.querySelector("span").textContent = "লোড হচ্ছে...";
  }

  try {
    // Case A: Single Product ID Lookup (Exactly 1 Document Read)
    if (state.searchMode === "productId" && state.searchQuery) {
      const productRef = doc(db, "products", state.searchQuery);
      const productSnap = await getDoc(productRef);

      if (productSnap.exists()) {
        const prod = { id: productSnap.id, ...productSnap.data() };
        state.products = [prod];
        state.loadedIds.add(prod.id);
        await hydrateRelatedDocs([prod]);
      } else {
        state.products = [];
      }

      state.hasMore = false;
      renderProductsList();
      return;
    }

    // Case B: Paginated Query (All Products / Filter / Supplier UID)
    const q = buildProductQuery(reset ? null : state.lastVisibleDoc);
    const snapshot = await getDocs(q);

    const fetchedBatch = [];
    snapshot.forEach((docSnap) => {
      if (!state.loadedIds.has(docSnap.id)) {
        state.loadedIds.add(docSnap.id);
        fetchedBatch.push({ id: docSnap.id, ...docSnap.data() });
      }
    });

    if (snapshot.docs.length > 0) {
      state.lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    state.hasMore = snapshot.docs.length === PAGE_SIZE;
    state.products = reset ? fetchedBatch : [...state.products, ...fetchedBatch];

    await hydrateRelatedDocs(fetchedBatch);
    renderProductsList();
  } catch (err) {
    console.error("Fetch products error:", err);
    dom.queryErrorMessage.textContent =
      err?.code === "failed-precondition"
        ? "এই ফিল্টার বা সার্চের জন্য Firestore Composite Index প্রয়োজন। অনুগ্রহ করে ইনডেক্স তৈরি করুন।"
        : "পণ্য লোড করতে ব্যর্থ হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।";
    dom.queryErrorBanner.classList.remove("hidden");
    if (!reset && state.hasMore) {
      dom.paginationContainer.classList.remove("hidden");
    }
  } finally {
    state.isLoadingList = false;
    state.isLoadingMore = false;
    dom.skeletonGrid.classList.add("hidden");
    dom.loadMoreBtn.disabled = false;
    dom.loadMoreBtn.querySelector("span").textContent = "আরও দেখুন";
  }
}

// ==========================================
// 6. Badge Logic & Product Card Rendering
// ==========================================
function evaluateProductBadges(product, supplierData) {
  const badges = [];

  const isApproved = product.approved === true;
  const isActive = product.active === true;
  const isFreeDelivery = product.freeDelivery === true;

  let isSubscriptionActive = false;
  let hasValidBalance = false;

  if (supplierData) {
    const unlockedUntil = Number(supplierData.profileUnlockedUntil);
    isSubscriptionActive = Number.isFinite(unlockedUntil) && unlockedUntil > Date.now();

    const balance = Number(supplierData.balance);
    hasValidBalance = Number.isFinite(balance) && balance >= 0;
  }

  // Live Badge Logic
  if (isApproved && isSubscriptionActive && hasValidBalance) {
    badges.push({
      cls: "badge-live",
      text: "এই পণ্যটা লাইভ আছে!",
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 10 11 15 8 12"></polyline></svg>`
    });
  }

  // Active / Inactive Badge
  if (isActive) {
    badges.push({
      cls: "badge-active",
      text: "পণ্যটি এক্টিভ করা আছে!",
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`
    });
  } else {
    badges.push({
      cls: "badge-inactive",
      text: "পণ্যটি ইনএক্টিভ অবস্থায় আছে",
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`
    });
  }

  // Free Delivery Badge
  if (isFreeDelivery) {
    badges.push({
      cls: "badge-free-delivery",
      text: "এই পণ্যটাতে ফ্রি ডেলিভারি আছে!",
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`
    });
  }

  // Unapproved Status Badge
  if (!isApproved) {
    badges.push({
      cls: "badge-unapproved",
      text: "প্রোডাক্টটি এখনো অনুমোদিত নয়!",
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    });
  }

  return badges;
}

function createProductCardHTML(product) {
  const supplier = state.supplierCache.get(product.uid) || null;
  const category = state.categoryCache.get(product.categoryId) || null;

  const primaryImg =
    Array.isArray(product.images) && product.images.length > 0 && product.images[0]
      ? product.images[0]
      : "https://paikarisell.ghotimarket.com/photo/logo.png";

  const categoryName = category?.categoryName || category?.name || "ক্যাটাগরি নির্ধারিত নয়";
  const categoryImg = category?.categoryImage || "https://paikarisell.ghotimarket.com/photo/favicon.png";
  const supplierName = supplier?.shopName || supplier?.name || supplier?.ownerName || "সাপ্লায়ার তথ্য";

  const badges = evaluateProductBadges(product, supplier);
  const badgesHtml = badges
    .map((b) => `<div class="status-badge ${b.cls}">${b.icon}<span>${escapeHtml(b.text)}</span></div>`)
    .join("");

  const variantsHtml =
    Array.isArray(product.variants) && product.variants.length > 0
      ? `<div class="variants-preview">
          ${product.variants
            .map((v) => {
              const vals = Array.isArray(v.values)
                ? v.values.map((item) => `${item.value}${Number(item.extraPrice) > 0 ? ` (+৳${item.extraPrice})` : ""}`).join(", ")
                : "";
              return `<span class="variant-chip">${escapeHtml(v.name)}: ${escapeHtml(vals)}</span>`;
            })
            .join("")}
        </div>`
      : "";

  const isSelected = state.selectedIds.has(product.id);
  const isApproved = product.approved === true;

  return `
    <article class="product-card ${isSelected ? "selected" : ""}" data-product-id="${escapeHtml(product.id)}">
      <div class="card-media">
        <label class="card-select-wrap" title="প্রোডাক্ট নির্বাচন করুন">
          <input type="checkbox" class="custom-checkbox product-select-checkbox" data-id="${escapeHtml(product.id)}" ${isSelected ? "checked" : ""} />
        </label>

        <div class="card-category-chip" title="${escapeHtml(categoryName)}">
          <img src="${escapeHtml(categoryImg)}" alt="${escapeHtml(categoryName)}" loading="lazy" />
          <span>${escapeHtml(categoryName)}</span>
        </div>

        <img src="${escapeHtml(primaryImg)}" alt="${escapeHtml(product.productName)}" loading="lazy" />

        <span class="card-date-chip">${escapeHtml(formatDateBn(product.createdAt))}</span>
      </div>

      <div class="card-body">
        <div>
          <h2 class="product-title" title="${escapeHtml(product.productName)}">${escapeHtml(product.productName || "নামহীন প্রোডাক্ট")}</h2>
          <p class="product-desc">${escapeHtml(product.productDescription || "কোনো বিবরণ দেওয়া হয়নি।")}</p>
        </div>

        <div class="price-row">
          <div class="price-box">
            <span class="price-label">পাইকারি মূল্য (Price)</span>
            <span class="wholesale-price">৳ ${formatPriceBn(product.price)}</span>
          </div>
          <div class="price-box" style="text-align:right;">
            <span class="price-label">সর্বোচ্চ বিক্রয় মূল্য (High Rate)</span>
            <span class="high-rate">৳ ${formatPriceBn(product.highRate)}</span>
          </div>
        </div>

        <div class="badges-list">${badgesHtml}</div>

        ${variantsHtml}

        <div class="meta-box">
          <div class="meta-row">
            <span class="meta-key">Product ID:</span>
            <div class="meta-val-wrap">
              <span class="meta-val mono-text" title="${escapeHtml(product.id)}">${escapeHtml(product.id)}</span>
              <button type="button" class="copy-id-btn" data-copy="${escapeHtml(product.id)}" title="Product ID কপি করুন">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>

          <div class="meta-row">
            <span class="meta-key">Supplier (${escapeHtml(supplierName)}):</span>
            <div class="meta-val-wrap">
              <span class="meta-val mono-text" title="${escapeHtml(product.uid)}">${escapeHtml(product.uid || "N/A")}</span>
              ${
                product.uid
                  ? `<button type="button" class="copy-id-btn" data-copy="${escapeHtml(product.uid)}" title="Supplier UID কপি করুন">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>`
                  : ""
              }
            </div>
          </div>
        </div>
      </div>

      <div class="card-actions">
        ${
          !isApproved && hasPermission("approveProduct")
            ? `<button type="button" class="btn btn-success btn-sm approve-product-btn" data-id="${escapeHtml(product.id)}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>এপ্রুভ করুন</span>
              </button>`
            : ""
        }
        ${
          hasPermission("editProduct")
            ? `<button type="button" class="btn btn-outline-primary btn-sm edit-product-btn" data-id="${escapeHtml(product.id)}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>এডিট</span>
              </button>`
            : ""
        }
        ${
          hasPermission("deleteProduct")
            ? `<button type="button" class="btn btn-outline-danger btn-sm delete-product-btn" data-id="${escapeHtml(product.id)}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>ডিলিট</span>
              </button>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderProductsList() {
  dom.loadedCountLabel.textContent = String(state.products.length);

  if (state.products.length === 0) {
    dom.productsGrid.innerHTML = "";
    dom.paginationContainer.classList.add("hidden");
    dom.emptyStateBox.classList.remove("hidden");

    if (state.searchMode === "productId") {
      dom.emptyStateTitle.textContent = "এই Product ID-তে কোনো পণ্য পাওয়া যায়নি";
      dom.emptyStateDesc.textContent = `প্রদত্ত ID "${state.searchQuery}" ডাটাবেসে বিদ্যমান নয়।`;
    } else if (state.searchMode === "uid") {
      dom.emptyStateTitle.textContent = "এই Supplier UID-এর কোনো পণ্য পাওয়া যায়নি";
      dom.emptyStateDesc.textContent = `UID "${state.searchQuery}"-এর অধীনে কোনো প্রোডাক্ট নেই।`;
    } else {
      dom.emptyStateTitle.textContent = "কোনো পণ্য খুঁজে পাওয়া যায়নি";
      dom.emptyStateDesc.textContent = "নির্বাচিত ফিল্টার অনুযায়ী কোনো প্রোডাক্ট পাওয়া যায়নি।";
    }
    syncSelectAllCheckbox();
    return;
  }

  dom.emptyStateBox.classList.add("hidden");
  dom.productsGrid.innerHTML = state.products.map((p) => createProductCardHTML(p)).join("");

  if (state.hasMore) {
    dom.paginationContainer.classList.remove("hidden");
  } else {
    dom.paginationContainer.classList.add("hidden");
  }

  syncSelectAllCheckbox();
}

// ==========================================
// 7. Atomic Product Approval System (Transaction)
// ==========================================
function requestProductApproval(productId) {
  if (!hasPermission("approveProduct")) {
    showToast("আপনার প্রোডাক্ট অনুমোদন করার অনুমতি নেই।", "error");
    return;
  }

  openConfirmModal({
    title: "প্রোডাক্ট অনুমোদন নিশ্চিতকরণ",
    message: "আপনি কি নিশ্চিতভাবে এই প্রোডাক্টটি অনুমোদন করতে চান?",
    confirmText: "অনুমোদন করুন",
    confirmBtnClass: "btn-success",
    iconType: "success-soft",
    onConfirm: () => executeProductApprovalTransaction(productId)
  });
}

async function executeProductApprovalTransaction(productId) {
  if (state.isActionBusy) return;
  state.isActionBusy = true;
  setConfirmModalLoading(true, "অনুমোদন হচ্ছে...");

  try {
    await runTransaction(db, async (transaction) => {
      const productRef = doc(db, "products", productId);
      const productSnap = await transaction.get(productRef);

      if (!productSnap.exists()) {
        throw new Error("প্রোডাক্ট ডকুমেন্ট খুঁজে পাওয়া যায়নি।");
      }

      const productData = productSnap.data();
      if (productData.approved === true) {
        throw new Error("এই প্রোডাক্টটি ইতিমধ্যে অনুমোদিত হয়েছে।");
      }

      if (!productData.uid) {
        throw new Error("প্রোডাক্ট ডকুমেন্টে Supplier UID পাওয়া যায়নি।");
      }

      const supplierRef = doc(db, "supplyers", productData.uid);
      const infoProductRef = doc(db, "informations", "product");

      // সব Read অপারেশন Write-এর আগে সম্পন্ন করতে হবে
      const [supplierSnap, infoSnap] = await Promise.all([
        transaction.get(supplierRef),
        transaction.get(infoProductRef)
      ]);

      if (!supplierSnap.exists()) {
        throw new Error("সংশ্লিষ্ট Supplier ডকুমেন্ট পাওয়া যায়নি। অনুমোদন বাতিল করা হয়েছে।");
      }

      if (!infoSnap.exists()) {
        throw new Error(
          "informations/product ডকুমেন্টটি ডাটাবেসে তৈরি করা নেই। আগে ডকুমেন্টটি তৈরি করুন।"
        );
      }

      const supplierData = supplierSnap.data();
      const infoData = infoSnap.data();

      const currentActiveProduct = Math.max(0, Number(supplierData.activeProduct) || 0);
      const currentTotalProduct = Math.max(0, Number(infoData.totalProduct) || 0);

      // Atomic Writes
      transaction.update(productRef, { approved: true });
      transaction.update(supplierRef, { activeProduct: currentActiveProduct + 1 });
      transaction.update(infoProductRef, { totalProduct: currentTotalProduct + 1 });
    });

    // Transaction সফল হওয়ার পর UI এবং Cache আপডেট
    const idx = state.products.findIndex((p) => p.id === productId);
    if (idx !== -1) {
      state.products[idx].approved = true;
      const uid = state.products[idx].uid;
      if (uid && state.supplierCache.has(uid) && state.supplierCache.get(uid)) {
        const cachedSup = state.supplierCache.get(uid);
        cachedSup.activeProduct = (Number(cachedSup.activeProduct) || 0) + 1;
      }
      if (state.activeFilter === "not_approved") {
        state.products.splice(idx, 1);
        state.loadedIds.delete(productId);
        state.selectedIds.delete(productId);
      }
    }

    closeConfirmModal();
    renderProductsList();
    updateBulkToolbarUI();
    loadDashboardStatistics();
    showToast("প্রোডাক্টটি সফলভাবে অনুমোদিত হয়েছে!", "success");
  } catch (err) {
    console.error("Approval transaction failed:", err);
    closeConfirmModal();
    showToast(err.message || "প্রোডাক্ট অনুমোদন করতে ব্যর্থ হয়েছে।", "error");
  } finally {
    state.isActionBusy = false;
    setConfirmModalLoading(false, "অনুমোদন করুন");
  }
}

// ==========================================
// 8. Atomic Single Product Delete System
// ==========================================
function requestSingleProductDelete(productId) {
  if (!hasPermission("deleteProduct")) {
    showToast("আপনার প্রোডাক্ট ডিলিট করার অনুমতি নেই।", "error");
    return;
  }

  openConfirmModal({
    title: "প্রোডাক্ট ডিলিট নিশ্চিতকরণ",
    message: "আপনি কি নিশ্চিতভাবে এই প্রোডাক্টটি ডিলিট করতে চান? এই কাজটি স্থায়ীভাবে সম্পন্ন হবে।",
    confirmText: "ডিলিট করুন",
    confirmBtnClass: "btn-danger",
    iconType: "danger-soft",
    onConfirm: () => executeSingleDeleteTransaction(productId)
  });
}

async function executeSingleDeleteTransaction(productId) {
  if (state.isActionBusy) return;
  state.isActionBusy = true;
  setConfirmModalLoading(true, "ডিলিট হচ্ছে...");

  let deletedProductUid = null;
  let wasApproved = false;

  try {
    await runTransaction(db, async (transaction) => {
      const productRef = doc(db, "products", productId);
      const productSnap = await transaction.get(productRef);

      if (!productSnap.exists()) {
        throw new Error("প্রোডাক্ট ডকুমেন্ট খুঁজে পাওয়া যায়নি বা ইতিমধ্যে ডিলিট হয়ে গেছে।");
      }

      const productData = productSnap.data();
      deletedProductUid = productData.uid;
      wasApproved = productData.approved === true;

      if (!deletedProductUid) {
        throw new Error("প্রোডাক্ট ডকুমেন্টে Supplier UID পাওয়া যায়নি। ডিলিট বন্ধ করা হয়েছে।");
      }

      const supplierRef = doc(db, "supplyers", deletedProductUid);
      const infoProductRef = doc(db, "informations", "product");

      const [supplierSnap, infoSnap] = await Promise.all([
        transaction.get(supplierRef),
        transaction.get(infoProductRef)
      ]);

      if (!supplierSnap.exists()) {
        throw new Error("সংশ্লিষ্ট Supplier ডকুমেন্ট না থাকায় নিরাপদে ডিলিট বন্ধ করা হয়েছে।");
      }

      if (!infoSnap.exists()) {
        throw new Error("informations/product ডকুমেন্ট না থাকায় নিরাপদে ডিলিট বন্ধ করা হয়েছে।");
      }

      const supplierData = supplierSnap.data();
      const infoData = infoSnap.data();

      const oldSupplierProduct = Math.max(0, Number(supplierData.product) || 0);
      const oldSupplierActive = Math.max(0, Number(supplierData.activeProduct) || 0);
      const oldTotalProduct = Math.max(0, Number(infoData.totalProduct) || 0);

      const newSupplierProduct = Math.max(0, oldSupplierProduct - 1);
      const newTotalProduct = Math.max(0, oldTotalProduct - 1);

      const supplierUpdatePayload = {
        product: newSupplierProduct
      };

      if (wasApproved) {
        supplierUpdatePayload.activeProduct = Math.max(0, oldSupplierActive - 1);
      }

      // Atomic Writes
      transaction.delete(productRef);
      transaction.update(supplierRef, supplierUpdatePayload);
      transaction.update(infoProductRef, { totalProduct: newTotalProduct });
    });

    // সফল হলে UI ও Cache আপডেট
    state.products = state.products.filter((p) => p.id !== productId);
    state.loadedIds.delete(productId);
    state.selectedIds.delete(productId);

    if (deletedProductUid && state.supplierCache.has(deletedProductUid)) {
      const cachedSup = state.supplierCache.get(deletedProductUid);
      if (cachedSup) {
        cachedSup.product = Math.max(0, (Number(cachedSup.product) || 0) - 1);
        if (wasApproved) {
          cachedSup.activeProduct = Math.max(0, (Number(cachedSup.activeProduct) || 0) - 1);
        }
      }
    }

    closeConfirmModal();
    renderProductsList();
    updateBulkToolbarUI();
    loadDashboardStatistics();
    showToast("প্রোডাক্টটি স্থায়ীভাবে ডিলিট করা হয়েছে।", "success");
  } catch (err) {
    console.error("Single delete transaction failed:", err);
    closeConfirmModal();
    showToast(err.message || "প্রোডাক্ট ডিলিট করতে ব্যর্থ হয়েছে।", "error");
  } finally {
    state.isActionBusy = false;
    setConfirmModalLoading(false, "ডিলিট করুন");
  }
}

// ==========================================
// 9. Multiple Product Selection & Atomic Bulk Delete
// ==========================================
function updateBulkToolbarUI() {
  const count = state.selectedIds.size;
  dom.selectedCountBadge.textContent = formatPriceBn(count);

  if (count > 0) {
    dom.bulkSelectionToolbar.classList.remove("hidden");
  } else {
    dom.bulkSelectionToolbar.classList.add("hidden");
  }
  syncSelectAllCheckbox();
}

function syncSelectAllCheckbox() {
  if (state.products.length === 0) {
    dom.selectAllCheckbox.checked = false;
    dom.selectAllCheckbox.indeterminate = false;
    return;
  }

  let selectedInView = 0;
  for (const p of state.products) {
    if (state.selectedIds.has(p.id)) selectedInView++;
  }

  dom.selectAllCheckbox.checked = selectedInView === state.products.length;
  dom.selectAllCheckbox.indeterminate = selectedInView > 0 && selectedInView < state.products.length;
}

function requestBulkProductDelete() {
  if (!hasPermission("bulkDeleteProducts")) {
    showToast("আপনার একাধিক প্রোডাক্ট ডিলিট করার অনুমতি নেই।", "error");
    return;
  }

  const selectedArray = Array.from(state.selectedIds);
  if (selectedArray.length === 0) return;

  if (selectedArray.length > MAX_BULK_DELETE_LIMIT) {
    showToast("একবারে সর্বোচ্চ ১০০টি প্রোডাক্ট ডিলিট করা যাবে।", "error");
    return;
  }

  openConfirmModal({
    title: "একাধিক প্রোডাক্ট ডিলিট নিশ্চিতকরণ",
    message: "আপনি কি নিশ্চিতভাবে নির্বাচিত সব প্রোডাক্ট ডিলিট করতে চান?",
    extraText: `মোট নির্বাচিত প্রোডাক্টের সংখ্যা: ${formatPriceBn(selectedArray.length)} টি`,
    confirmText: "সব ডিলিট করুন",
    confirmBtnClass: "btn-danger",
    iconType: "danger-soft",
    onConfirm: () => executeAtomicBulkDeleteTransaction(selectedArray)
  });
}

async function executeAtomicBulkDeleteTransaction(productIds) {
  if (state.isActionBusy) return;
  if (productIds.length > MAX_BULK_DELETE_LIMIT) {
    showToast("একবারে সর্বোচ্চ ১০০টি প্রোডাক্ট ডিলিট করা যাবে।", "error");
    return;
  }

  state.isActionBusy = true;
  setConfirmModalLoading(true, "বাল্ক ডিলিট হচ্ছে...");

  try {
    await runTransaction(db, async (transaction) => {
      // ১. সব Product Document এবং informations/product একসাথে Read
      const infoProductRef = doc(db, "informations", "product");
      const productRefs = productIds.map((id) => doc(db, "products", id));

      const [infoSnap, ...productSnaps] = await Promise.all([
        transaction.get(infoProductRef),
        ...productRefs.map((ref) => transaction.get(ref))
      ]);

      if (!infoSnap.exists()) {
        throw new Error("informations/product ডকুমেন্ট না থাকায় বাল্ক ডিলিট বন্ধ করা হয়েছে।");
      }

      // প্রতিটি Supplier-এর জন্য মোট কয়টি product এবং কয়টি activeProduct কমবে তা গণনা
      const supplierDeltas = new Map(); // uid -> { totalDecrement: number, activeDecrement: number }
      const validProductRefsToDelete = [];

      for (const pSnap of productSnaps) {
        if (!pSnap.exists()) {
          throw new Error(`প্রোডাক্ট (ID: ${pSnap.id}) খুঁজে পাওয়া যায়নি। পুরো অপারেশন বাতিল করা হয়েছে।`);
        }

        const pData = pSnap.data();
        if (!pData.uid) {
          throw new Error(`প্রোডাক্ট (ID: ${pSnap.id})-এ Supplier UID নেই।`);
        }

        const currentDelta = supplierDeltas.get(pData.uid) || { totalDecrement: 0, activeDecrement: 0 };
        currentDelta.totalDecrement += 1;
        if (pData.approved === true) {
          currentDelta.activeDecrement += 1;
        }
        supplierDeltas.set(pData.uid, currentDelta);
        validProductRefsToDelete.push(pSnap.ref);
      }

      // ২. Unique Supplier Documents Read (সব Write-এর আগে)
      const uniqueUids = Array.from(supplierDeltas.keys());
      const supplierRefs = uniqueUids.map((uid) => doc(db, "supplyers", uid));
      const supplierSnaps = await Promise.all(supplierRefs.map((ref) => transaction.get(ref)));

      // Firestore 500 Write Limit যাচাই
      const totalWriteOps = validProductRefsToDelete.length + supplierSnaps.length + 1;
      if (totalWriteOps >= 500) {
        throw new Error("একবারে সর্বোচ্চ ১০০টি প্রোডাক্ট ডিলিট করা যাবে।");
      }

      const supplierUpdates = [];
      for (let i = 0; i < supplierSnaps.length; i++) {
        const sSnap = supplierSnaps[i];
        const uid = uniqueUids[i];

        if (!sSnap.exists()) {
          throw new Error(`Supplier (${uid}) ডকুমেন্ট না থাকায় বাল্ক ডিলিট বাতিল করা হয়েছে।`);
        }

        const sData = sSnap.data();
        const delta = supplierDeltas.get(uid);

        const oldProduct = Math.max(0, Number(sData.product) || 0);
        const oldActive = Math.max(0, Number(sData.activeProduct) || 0);

        const updateFields = {
          product: Math.max(0, oldProduct - delta.totalDecrement)
        };

        if (delta.activeDecrement > 0) {
          updateFields.activeProduct = Math.max(0, oldActive - delta.activeDecrement);
        }

        supplierUpdates.push({ ref: sSnap.ref, data: updateFields });
      }

      const oldGlobalTotal = Math.max(0, Number(infoSnap.data().totalProduct) || 0);
      const newGlobalTotal = Math.max(0, oldGlobalTotal - validProductRefsToDelete.length);

      // ৩. সব Atomic Write সম্পন্ন করা
      for (const pRef of validProductRefsToDelete) {
        transaction.delete(pRef);
      }

      for (const sUpd of supplierUpdates) {
        transaction.update(sUpd.ref, sUpd.data);
      }

      transaction.update(infoProductRef, { totalProduct: newGlobalTotal });
    });

    // সফল হলে UI পরিষ্কার ও রিফ্রেশ
    const deletedSet = new Set(productIds);
    state.products = state.products.filter((p) => !deletedSet.has(p.id));
    for (const id of productIds) {
      state.loadedIds.delete(id);
      state.selectedIds.delete(id);
    }

    closeConfirmModal();
    renderProductsList();
    updateBulkToolbarUI();
    loadDashboardStatistics();
    showToast(`সফলভাবে ${formatPriceBn(productIds.length)}টি প্রোডাক্ট ডিলিট করা হয়েছে!`, "success");
  } catch (err) {
    console.error("Bulk delete transaction failed:", err);
    closeConfirmModal();
    showToast(err.message || "বাল্ক ডিলিট ব্যর্থ হয়েছে। কোনো প্রোডাক্ট ডিলিট হয়নি।", "error");
  } finally {
    state.isActionBusy = false;
    setConfirmModalLoading(false, "সব ডিলিট করুন");
  }
}

// ==========================================
// 10. Product Edit System & Dynamic Variant Editor
// ==========================================
function openEditProductModal(productId) {
  if (!hasPermission("editProduct")) {
    showToast("আপনার প্রোডাক্ট এডিট করার অনুমতি নেই।", "error");
    return;
  }

  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  state.editingProductId = productId;
  dom.editModalProductId.textContent = productId;
  dom.editProductName.value = product.productName || "";
  dom.editProductDescription.value = product.productDescription || "";
  dom.editPrice.value = Number(product.price) || 0;
  dom.editHighRate.value = Number(product.highRate) || 0;
  dom.editFreeDelivery.checked = product.freeDelivery === true;
  dom.editActive.checked = product.active === true;
  dom.editFormErrorBox.classList.add("hidden");

  // Render Variants
  dom.variantsContainer.innerHTML = "";
  const variants = Array.isArray(product.variants) ? product.variants : [];
  variants.forEach((vGroup) => {
    appendVariantGroupDOM(vGroup.name || "", Array.isArray(vGroup.values) ? vGroup.values : []);
  });

  dom.editProductModal.classList.remove("hidden");
}

function closeEditProductModal() {
  state.editingProductId = null;
  dom.editProductModal.classList.add("hidden");
}

function appendVariantGroupDOM(groupName = "", values = [{ value: "", extraPrice: 0 }]) {
  const groupEl = document.createElement("div");
  groupEl.className = "variant-group-box";

  groupEl.innerHTML = `
    <div class="variant-group-top">
      <input type="text" class="form-input variant-group-name" placeholder="ভ্যারিয়েন্টের নাম (যেমন: সাইজ, রঙ)" value="${escapeHtml(groupName)}" required />
      <button type="button" class="btn btn-outline-primary btn-sm add-variant-value-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>ভ্যালু যোগ</span>
      </button>
      <button type="button" class="btn btn-outline-danger btn-sm remove-variant-group-btn" title="ভ্যারিয়েন্ট গ্রুপ মুছুন">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
    <div class="variant-values-list"></div>
  `;

  const valuesListEl = groupEl.querySelector(".variant-values-list");
  if (values.length === 0) {
    appendVariantValueRowDOM(valuesListEl, "", 0);
  } else {
    values.forEach((v) => {
      appendVariantValueRowDOM(valuesListEl, v.value || "", Number(v.extraPrice) || 0);
    });
  }

  dom.variantsContainer.appendChild(groupEl);
}

function appendVariantValueRowDOM(containerEl, valText = "", extraPrice = 0) {
  const rowEl = document.createElement("div");
  rowEl.className = "variant-value-row";
  rowEl.innerHTML = `
    <input type="text" class="form-input variant-val-input" placeholder="ভ্যালু (যেমন: XL, লাল)" value="${escapeHtml(valText)}" required />
    <input type="number" class="form-input variant-extra-price-input" placeholder="অতিরিক্ত দাম (৳)" step="any" value="${Number(extraPrice)}" required />
    <button type="button" class="icon-btn remove-variant-value-btn" title="ভ্যালু মুছুন">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;
  containerEl.appendChild(rowEl);
}

function collectAndValidateVariants() {
  const groupBoxes = dom.variantsContainer.querySelectorAll(".variant-group-box");
  if (groupBoxes.length === 0) return [];

  const parsedVariants = [];

  for (const box of groupBoxes) {
    const name = box.querySelector(".variant-group-name").value.trim();
    if (!name) {
      throw new Error("প্রতিটি ভ্যারিয়েন্টের নাম পূরণ করা বাধ্যতামূলক।");
    }

    const valueRows = box.querySelectorAll(".variant-value-row");
    if (valueRows.length === 0) {
      throw new Error(`"${name}" ভ্যারিয়েন্টে অন্তত একটি ভ্যালু যুক্ত করুন।`);
    }

    const values = [];
    for (const row of valueRows) {
      const valStr = row.querySelector(".variant-val-input").value.trim();
      const extraRaw = row.querySelector(".variant-extra-price-input").value;
      const extraNum = Number(extraRaw);

      if (!valStr) {
        throw new Error(`"${name}" ভ্যারিয়েন্টের সব ভ্যালু নাম পূরণ করুন।`);
      }
      if (!Number.isFinite(extraNum)) {
        throw new Error(`"${valStr}"-এর Extra Price অবশ্যই একটি বৈধ সংখ্যা হতে হবে।`);
      }

      values.push({
        value: valStr,
        extraPrice: extraNum
      });
    }

    parsedVariants.push({
      name,
      values
    });
  }

  return parsedVariants;
}

async function handleEditProductSubmit(e) {
  e.preventDefault();
  if (!state.editingProductId || state.isActionBusy) return;

  dom.editFormErrorBox.classList.add("hidden");

  const productName = dom.editProductName.value.trim();
  const productDescription = dom.editProductDescription.value.trim();
  const price = Number(dom.editPrice.value);
  const highRate = Number(dom.editHighRate.value);
  const freeDelivery = dom.editFreeDelivery.checked;
  const active = dom.editActive.checked;

  if (!productName) {
    showEditFormError("প্রোডাক্টের নাম লিখুন।");
    return;
  }

  if (!productDescription) {
    showEditFormError("প্রোডাক্টের বিবরণ লিখুন।");
    return;
  }

  if (!Number.isFinite(price) || price <= 0) {
    showEditFormError("সঠিক পাইকারি মূল্য (Price) লিখুন।");
    return;
  }

  if (!Number.isFinite(highRate) || highRate <= price) {
    showEditFormError("High Rate অবশ্যই Price-এর চেয়ে বেশি হতে হবে।");
    return;
  }

  let variants = [];
  try {
    variants = collectAndValidateVariants();
  } catch (validationErr) {
    showEditFormError(validationErr.message);
    return;
  }

  // শুধু অনুমোদিত ৭টি ফিল্ড আপডেট করা হবে (images, createdAt, uid, approved, categoryId অপরিবর্তিত থাকবে)
  const updatePayload = {
    productName,
    productDescription,
    price,
    highRate,
    freeDelivery,
    variants,
    active
  };

  state.isActionBusy = true;
  dom.saveEditProductBtn.disabled = true;
  dom.saveEditProductBtn.querySelector("span").textContent = "সেভ হচ্ছে...";

  try {
    const productRef = doc(db, "products", state.editingProductId);
    await updateDoc(productRef, updatePayload);

    const idx = state.products.findIndex((p) => p.id === state.editingProductId);
    if (idx !== -1) {
      state.products[idx] = {
        ...state.products[idx],
        ...updatePayload
      };
    }

    closeEditProductModal();
    renderProductsList();
    loadDashboardStatistics();
    showToast("প্রোডাক্টের তথ্য সফলভাবে আপডেট করা হয়েছে!", "success");
  } catch (err) {
    console.error("Update product error:", err);
    showEditFormError("প্রোডাক্ট আপডেট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
  } finally {
    state.isActionBusy = false;
    dom.saveEditProductBtn.disabled = false;
    dom.saveEditProductBtn.querySelector("span").textContent = "পরিবর্তন সেভ করুন";
  }
}

function showEditFormError(msg) {
  dom.editFormErrorBox.textContent = msg;
  dom.editFormErrorBox.classList.remove("hidden");
}

// ==========================================
// 11. Custom Confirmation Modal Controller
// ==========================================
function openConfirmModal({ title, message, extraText = "", confirmText, confirmBtnClass, iconType, onConfirm }) {
  dom.confirmModalTitle.textContent = title;
  dom.confirmModalMessage.textContent = message;

  if (extraText) {
    dom.confirmModalExtra.textContent = extraText;
    dom.confirmModalExtra.classList.remove("hidden");
  } else {
    dom.confirmModalExtra.classList.add("hidden");
  }

  dom.confirmModalIcon.className = `icon-circle ${iconType}`;
  dom.confirmProceedBtn.className = `btn ${confirmBtnClass}`;
  dom.confirmProceedBtn.textContent = confirmText;
  dom.confirmProceedBtn.disabled = false;
  dom.confirmCancelBtn.disabled = false;

  state.pendingConfirmAction = onConfirm;
  dom.confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
  state.pendingConfirmAction = null;
  dom.confirmModal.classList.add("hidden");
}

function setConfirmModalLoading(isLoading, labelText) {
  dom.confirmProceedBtn.disabled = isLoading;
  dom.confirmCancelBtn.disabled = isLoading;
  dom.confirmProceedBtn.textContent = labelText;
}

// ==========================================
// 12. Event Listeners Setup
// ==========================================
// Unauthorized Redirect
dom.unauthorizedRedirectBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch {}
  window.location.replace("/login");
});

// Logout
dom.logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.replace("/login");
  } catch {
    showToast("লগআউট করতে সমস্যা হয়েছে।", "error");
  }
});

// Mobile Sidebar
dom.openSidebarBtn.addEventListener("click", () => {
  dom.sidebar.classList.add("open");
  dom.sidebarOverlay.classList.remove("hidden");
});

function closeMobileSidebar() {
  dom.sidebar.classList.remove("open");
  dom.sidebarOverlay.classList.add("hidden");
}

dom.closeSidebarBtn.addEventListener("click", closeMobileSidebar);
dom.sidebarOverlay.addEventListener("click", closeMobileSidebar);

// Quick Nav & Refresh Buttons
function fullDashboardRefresh() {
  state.supplierCache.clear();
  state.categoryCache.clear();
  loadDashboardStatistics();
  fetchProductsBatch({ reset: true });
}

dom.topRefreshBtn.addEventListener("click", fullDashboardRefresh);
dom.navRefreshAllBtn.addEventListener("click", () => {
  closeMobileSidebar();
  fullDashboardRefresh();
});

dom.navQuickPendingBtn.addEventListener("click", () => {
  closeMobileSidebar();
  activateFilter("not_approved");
});

dom.navQuickApprovedBtn.addEventListener("click", () => {
  closeMobileSidebar();
  activateFilter("approved");
});

// Search Type Change (Reset Search Result & Cursor)
dom.searchTypeSelect.addEventListener("change", (e) => {
  state.searchType = e.target.value;
  dom.searchInput.placeholder =
    state.searchType === "productId"
      ? "সঠিক Product Document ID লিখুন..."
      : "সঠিক Supplier UID লিখুন...";

  if (state.searchMode !== null || dom.searchInput.value.trim() !== "") {
    dom.searchInput.value = "";
    dom.clearSearchBtn.classList.add("hidden");
    state.searchMode = null;
    state.searchQuery = "";
    fetchProductsBatch({ reset: true });
  }
});

dom.searchInput.addEventListener("input", () => {
  if (dom.searchInput.value.trim().length > 0) {
    dom.clearSearchBtn.classList.remove("hidden");
  } else {
    dom.clearSearchBtn.classList.add("hidden");
  }
});

dom.clearSearchBtn.addEventListener("click", () => {
  dom.searchInput.value = "";
  dom.clearSearchBtn.classList.add("hidden");
  if (state.searchMode !== null) {
    state.searchMode = null;
    state.searchQuery = "";
    fetchProductsBatch({ reset: true });
  }
});

dom.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const term = dom.searchInput.value.trim();
  if (!term) {
    showToast("অনুগ্রহ করে সার্চ বক্সে ID অথবা UID লিখুন।", "warning");
    return;
  }

  state.searchMode = state.searchType;
  state.searchQuery = term;
  fetchProductsBatch({ reset: true });
});

// Filter Pills
function activateFilter(filterKey) {
  state.activeFilter = filterKey;
  state.searchMode = null;
  state.searchQuery = "";
  dom.searchInput.value = "";
  dom.clearSearchBtn.classList.add("hidden");

  dom.filterPillsContainer.querySelectorAll(".filter-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filterKey);
  });

  fetchProductsBatch({ reset: true });
}

dom.filterPillsContainer.addEventListener("click", (e) => {
  const pill = e.target.closest(".filter-pill");
  if (!pill) return;
  const filterKey = pill.dataset.filter;
  if (filterKey === state.activeFilter && state.searchMode === null) return;
  activateFilter(filterKey);
});

dom.resetFiltersBtn.addEventListener("click", () => activateFilter("all"));
dom.retryQueryBtn.addEventListener("click", () => fetchProductsBatch({ reset: true }));

// Pagination ("আরও দেখুন")
dom.loadMoreBtn.addEventListener("click", () => {
  if (!state.hasMore || state.isLoadingMore) return;
  fetchProductsBatch({ reset: false });
});

// Select All & Bulk Toolbar
dom.selectAllCheckbox.addEventListener("change", (e) => {
  const checked = e.target.checked;
  if (checked) {
    state.products.forEach((p) => state.selectedIds.add(p.id));
  } else {
    state.products.forEach((p) => state.selectedIds.delete(p.id));
  }
  renderProductsList();
  updateBulkToolbarUI();
});

dom.clearSelectionBtn.addEventListener("click", () => {
  state.selectedIds.clear();
  renderProductsList();
  updateBulkToolbarUI();
});

dom.bulkDeleteBtn.addEventListener("click", requestBulkProductDelete);

// Product Card Delegated Events (Checkbox, Copy ID, Approve, Edit, Delete)
dom.productsGrid.addEventListener("change", (e) => {
  const checkbox = e.target.closest(".product-select-checkbox");
  if (!checkbox) return;

  const id = checkbox.dataset.id;
  const card = checkbox.closest(".product-card");

  if (checkbox.checked) {
    state.selectedIds.add(id);
    if (card) card.classList.add("selected");
  } else {
    state.selectedIds.delete(id);
    if (card) card.classList.remove("selected");
  }

  updateBulkToolbarUI();
});

dom.productsGrid.addEventListener("click", async (e) => {
  // Copy ID / UID
  const copyBtn = e.target.closest(".copy-id-btn");
  if (copyBtn) {
    const textToCopy = copyBtn.dataset.copy;
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast(`কপি করা হয়েছে: ${textToCopy}`, "success");
    } catch {
      showToast("কপি করতে ব্যর্থ হয়েছে।", "error");
    }
    return;
  }

  // Approve Button
  const approveBtn = e.target.closest(".approve-product-btn");
  if (approveBtn) {
    requestProductApproval(approveBtn.dataset.id);
    return;
  }

  // Edit Button
  const editBtn = e.target.closest(".edit-product-btn");
  if (editBtn) {
    openEditProductModal(editBtn.dataset.id);
    return;
  }

  // Single Delete Button
  const deleteBtn = e.target.closest(".delete-product-btn");
  if (deleteBtn) {
    requestSingleProductDelete(deleteBtn.dataset.id);
  }
});

// Confirmation Modal Events
dom.confirmCancelBtn.addEventListener("click", closeConfirmModal);
dom.confirmProceedBtn.addEventListener("click", () => {
  if (typeof state.pendingConfirmAction === "function") {
    state.pendingConfirmAction();
  }
});

// Edit Modal & Dynamic Variants Events
dom.closeEditModalBtn.addEventListener("click", closeEditProductModal);
dom.cancelEditModalBtn.addEventListener("click", closeEditProductModal);
dom.addVariantGroupBtn.addEventListener("click", () => appendVariantGroupDOM());

dom.variantsContainer.addEventListener("click", (e) => {
  const addValBtn = e.target.closest(".add-variant-value-btn");
  if (addValBtn) {
    const valuesList = addValBtn.closest(".variant-group-box").querySelector(".variant-values-list");
    appendVariantValueRowDOM(valuesList);
    return;
  }

  const removeGroupBtn = e.target.closest(".remove-variant-group-btn");
  if (removeGroupBtn) {
    removeGroupBtn.closest(".variant-group-box").remove();
    return;
  }

  const removeValBtn = e.target.closest(".remove-variant-value-btn");
  if (removeValBtn) {
    removeValBtn.closest(".variant-value-row").remove();
  }
});

dom.editProductForm.addEventListener("submit", handleEditProductSubmit);
