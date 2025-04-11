import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

// UI Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const logoutBtn = document.getElementById('logoutBtn');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const profileBtn = document.getElementById('profileBtn');
const adminBtn = document.getElementById('adminBtn');
const usernameInput = document.getElementById('registerUsername');
const usernameStatus = document.getElementById('usernameStatus');

// Username validation rules
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

// Validate username format
const isValidUsername = (username) => {
    if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
        return {
            valid: false,
            message: `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`
        };
    }
    
    if (!USERNAME_PATTERN.test(username)) {
        return {
            valid: false,
            message: 'Username can only contain letters, numbers, underscores, and hyphens'
        };
    }
    
    return { valid: true };
};

// Basic username validation without availability check
usernameInput?.addEventListener('input', (e) => {
    const username = e.target.value.trim();
    
    if (!username) {
        usernameStatus.textContent = '';
        return;
    }

    const validation = isValidUsername(username);
    usernameStatus.textContent = validation.valid ? '' : validation.message;
    usernameStatus.className = validation.valid ? '' : 'form-text unavailable';
});

// Authentication state observer
auth.onAuthStateChanged((user) => {
    if (user) {
        // User is signed in
        loginBtn.classList.add('d-none');
        registerBtn.classList.add('d-none');
        logoutBtn.classList.remove('d-none');
        profileBtn.classList.remove('d-none');
        
        // Check if user is admin
        getDoc(doc(db, 'admins', user.uid))
            .then((docSnap) => {
                if (docSnap.exists()) {
                    adminBtn.classList.remove('d-none');
                }
            });
    } else {
        // User is signed out
        loginBtn.classList.remove('d-none');
        registerBtn.classList.remove('d-none');
        logoutBtn.classList.add('d-none');
        profileBtn.classList.add('d-none');
        adminBtn.classList.add('d-none');
    }
});

// Login form handler
loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    signInWithEmailAndPassword(auth, email, password)
        .then(() => {
            $('#loginModal').modal('hide');
            loginForm.reset();
        })
        .catch((error) => {
            alert(error.message);
        });
});

// Register form handler
registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const username = document.getElementById('registerUsername').value.trim();

    // Validate username format
    const validation = isValidUsername(username);
    if (!validation.valid) {
        alert(validation.message);
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Create user profile in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            email: email,
            username: username,
            createdAt: serverTimestamp(),
            bids: [],
            wonAuctions: []
        });

        $('#registerModal').modal('hide');
        registerForm.reset();
    } catch (error) {
        alert(error.message);
    }
});

// Logout handler
logoutBtn?.addEventListener('click', () => {
    signOut(auth).catch((error) => {
        alert(error.message);
    });
});