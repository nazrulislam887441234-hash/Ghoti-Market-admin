import { auth, db } from "./config.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const ownerEmails = ["nazrulislam887441234@gmail.com", "support@ghotimarket.com"];

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const btnText = loginBtn.querySelector(".btn-text");
const spinner = loginBtn.querySelector(".spinner");
const togglePasswordBtn = document.getElementById("toggle-password");

// Password Show/Hide toggle
togglePasswordBtn.addEventListener("click", () => {
  const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
  passwordInput.setAttribute("type", type);
});

// Toast Notification Function
function showToast(message, type = "error") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Translate Firebase Errors to Bangla
function getBanglaErrorMessage(errorCode) {
  switch (errorCode) {
    case "auth/invalid-email":
      return "ইমেইল ফরম্যাট সঠিক নয়।";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "ভুল ইমেইল অথবা পাসওয়ার্ড।";
    case "auth/too-many-requests":
      return "অতিরিক্ত চেষ্টার কারণে সাময়িকভাবে ব্লক করা হয়েছে। কিছুক্ষণ পর চেষ্টা করুন।";
    case "auth/network-request-failed":
      return "নেটওয়ার্ক সংযোগ সমস্যা। ইন্টারনেট কানেকশন চেক করুন।";
    default:
      return "অথরাইজেশন চেক ব্যর্থ হয়েছে। সঠিক তথ্য প্রদান করুন।";
  }
}

// Authorization Check Logic
async function verifyAndAuthorizeUser(user) {
  const email = user.email?.trim().toLowerCase();
  
  // 1. Owner Authorization
  if (ownerEmails.includes(email)) {
    return true;
  }

  // 2. Admin Authorization via Firestore
  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);

    if (!adminSnap.exists()) {
      showToast("আপনার অ্যাকাউন্টটি Admin Dashboard ব্যবহারের জন্য অনুমোদিত নয়।", "error");
      return false;
    }

    const adminData = adminSnap.data();
    if (adminData.uid !== user.uid || adminData.active !== true) {
      showToast("আপনার অ্যাকাউন্টটি Admin Dashboard ব্যবহারের জন্য অনুমোদিত নয়।", "error");
      return false;
    }

    return true;
  } catch (error) {
    showToast("Firestore Permission Denied অথবা ডেটাবেজ সংযোগে সমস্যা।", "error");
    return false;
  }
}

// Already Logged In User Handling on Login Page
onAuthStateChanged(auth, async (user) => {
  if (user) {
    loginBtn.disabled = true;
    btnText.style.display = "none";
    spinner.style.display = "block";
    
    const isAuthorized = await verifyAndAuthorizeUser(user);
    if (isAuthorized) {
      window.location.replace("https://admin.ghotimarket.com/reseller/dashboard");
    } else {
      await signOut(auth);
      loginBtn.disabled = false;
      btnText.style.display = "inline";
      spinner.style.display = "none";
    }
  }
});

// Form Submit Handler
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!email) {
    showToast("ইমেইল খালি রাখা যাবে না।", "error");
    return;
  }
  if (!password) {
    showToast("পাসওয়ার্ড খালি রাখা যাবে না।", "error");
    return;
  }

  // Set Loading State
  loginBtn.disabled = true;
  btnText.textContent = "যাচাই করা হচ্ছে...";
  spinner.style.display = "block";

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const isAuthorized = await verifyAndAuthorizeUser(user);

    if (isAuthorized) {
      showToast("লগইন সফল হয়েছে। রিডাইরেক্ট করা হচ্ছে...", "success");
      setTimeout(() => {
        window.location.replace("/dashboard");
      }, 1000);
    } else {
      await signOut(auth);
      loginBtn.disabled = false;
      btnText.textContent = "লগইন করুন";
      spinner.style.display = "none";
    }
  } catch (error) {
    const errorMsg = getBanglaErrorMessage(error.code);
    showToast(errorMsg, "error");
    loginBtn.disabled = false;
    btnText.textContent = "লগইন করুন";
    spinner.style.display = "none";
  }
});
