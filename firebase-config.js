// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = { 
            apiKey: "AIzaSyBUhNhYvuo_FTvZ5RZR6Gn-4hsUY21S0XE", 
            authDomain: "ghotimarket.firebaseapp.com", 
            projectId: "ghotimarket", 
            storageBucket: "ghotimarket.firebasestorage.app", 
            messagingSenderId: "481257644093", 
            appId: "1:481257644093:web:0dfc3699d6b3c86afeca54" 
        };
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
