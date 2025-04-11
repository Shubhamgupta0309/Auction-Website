// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCCZdTW59NTRuoT--5cLwFhwZck5Rke7i0",
    authDomain: "auction-website-01.firebaseapp.com",
    projectId: "auction-website-01",
    storageBucket: "auction-website-01.firebasestorage.app",
    messagingSenderId: "139650210056",
    appId: "1:139650210056:web:45f4b881c65212d9f934bd",
    measurementId: "G-FP5T8QPTRL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export { app, auth, db, analytics };