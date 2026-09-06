import { createUserWithEmailAndPassword, getAdditionalUserInfo, signInWithEmailAndPassword, GoogleAuthProvider, OAuthProvider, browserLocalPersistence, browserSessionPersistence, setPersistence, signInWithPopup, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { auth, isTeacherEmail, saveStudentProfile } from "./portal-data.js";
const AUTH_ACTIVE_TAB_STORAGE_KEY = "hacklab.auth.activeTab";
const AUTH_LOGIN_DRAFT_STORAGE_KEY = "hacklab.auth.loginDraft";
const AUTH_REGISTER_DRAFT_STORAGE_KEY = "hacklab.auth.registerDraft";
const AUTH_REMEMBER_ME_STORAGE_KEY = "hacklab.auth.rememberMe";
const DASHBOARD_WALKTHROUGH_PENDING_PREFIX = "hacklab.dashboard.walkthrough.pending.v1.";
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginSubmitButton = loginForm?.querySelector('.auth-submit');
const registerSubmitButton = registerForm?.querySelector('.auth-submit');
const loginRememberMe = document.getElementById('loginRememberMe');
const backButton = document.getElementById('backBtn');

// Social Providers
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

// Optional: Add scopes if needed
appleProvider.addScope('email');
appleProvider.addScope('name');

function readStoredJson(key, fallback = {}) {
    try {
        const rawValue = window.localStorage.getItem(key);
        return rawValue ? JSON.parse(rawValue) : fallback;
    } catch (error) {
        console.warn(`Unable to read local storage key "${key}":`, error);
        return fallback;
    }
}

function writeStoredJson(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`Unable to write local storage key "${key}":`, error);
    }
}

function setDashboardWalkthroughPending(userId, isPending = true) {
    if (!userId) return;

    try {
        const storageKey = `${DASHBOARD_WALKTHROUGH_PENDING_PREFIX}${userId}`;
        if (isPending) {
            window.localStorage.setItem(storageKey, 'pending');
            return;
        }

        window.localStorage.removeItem(storageKey);
    } catch (error) {
        console.warn('Unable to update dashboard walkthrough pending state:', error);
    }
}

function getAuthForm(formKey) {
    return formKey === 'register' ? registerForm : loginForm;
}

function getAuthMessageElement(formKey) {
    const form = getAuthForm(formKey);
    if (!form) return null;

    let messageElement = form.querySelector('.auth-message');
    if (messageElement) return messageElement;

    messageElement = document.createElement('p');
    messageElement.className = 'auth-message';

    const submitButton = form.querySelector('.auth-submit');
    if (submitButton?.parentNode) {
        submitButton.parentNode.insertBefore(messageElement, submitButton);
    } else {
        form.appendChild(messageElement);
    }

    return messageElement;
}

function setAuthMessage(formKey, text = '', tone = '') {
    const messageElement = getAuthMessageElement(formKey);
    if (!messageElement) return;

    messageElement.textContent = text;
    messageElement.classList.remove('success', 'error', 'info');

    if (tone) {
        messageElement.classList.add(tone);
    }

    messageElement.hidden = !text;
}

function getFriendlyAuthError(error, providerName = '') {
    if (!error?.code) {
        return error?.message || 'Something went wrong. Please try again.';
    }

    const providerLabel = providerName || 'this provider';
    const messageMap = {
        'auth/invalid-login-credentials': 'The email or password is incorrect.',
        'auth/user-not-found': 'No account exists for this email yet.',
        'auth/wrong-password': 'The email or password is incorrect.',
        'auth/email-already-in-use': 'This email is already registered. Log in instead.',
        'auth/weak-password': 'Use a stronger password with at least 6 characters.',
        'auth/popup-closed-by-user': `${providerLabel} sign-in was closed before completion.`,
        'auth/popup-blocked': `Allow popups to continue with ${providerLabel}.`,
        'auth/network-request-failed': 'Network request failed. Check your connection and try again.',
        'auth/too-many-requests': 'Too many attempts were made. Wait a bit and try again.',
        'auth/unauthorized-domain': 'This domain is not authorized yet. Add your GitHub Pages host (YOUR_USERNAME.github.io) in Firebase Auth > Settings > Authorized domains.'
    };

    return messageMap[error.code] || error.message || 'Something went wrong. Please try again.';
}

function setSocialButtonLoading(buttonElement, isLoading) {
    if (!buttonElement) return;

    buttonElement.disabled = isLoading;
    buttonElement.style.opacity = isLoading ? '0.55' : '1';
    buttonElement.style.pointerEvents = isLoading ? 'none' : 'auto';
    buttonElement.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

function persistAuthDrafts() {
    writeStoredJson(AUTH_LOGIN_DRAFT_STORAGE_KEY, {
        email: document.getElementById('loginEmail')?.value.trim() || ''
    });

    writeStoredJson(AUTH_REGISTER_DRAFT_STORAGE_KEY, {
        name: document.getElementById('registerName')?.value.trim() || '',
        email: document.getElementById('registerEmail')?.value.trim() || ''
    });
}

function restoreAuthDrafts() {
    const loginDraft = readStoredJson(AUTH_LOGIN_DRAFT_STORAGE_KEY);
    const registerDraft = readStoredJson(AUTH_REGISTER_DRAFT_STORAGE_KEY);

    if (typeof loginDraft.email === 'string' && document.getElementById('loginEmail')) {
        document.getElementById('loginEmail').value = loginDraft.email;
    }

    if (typeof registerDraft.name === 'string' && document.getElementById('registerName')) {
        document.getElementById('registerName').value = registerDraft.name;
    }

    if (typeof registerDraft.email === 'string' && document.getElementById('registerEmail')) {
        document.getElementById('registerEmail').value = registerDraft.email;
    }
}

function clearAuthDraft(formKey) {
    if (formKey === 'register') {
        writeStoredJson(AUTH_REGISTER_DRAFT_STORAGE_KEY, { name: '', email: '' });
        return;
    }

    writeStoredJson(AUTH_LOGIN_DRAFT_STORAGE_KEY, { email: '' });
}

function bindAuthDraftPersistence() {
    [loginForm, registerForm].forEach((form) => {
        form?.addEventListener('input', () => {
            persistAuthDrafts();
        });
    });
}

function readRememberMePreference() {
    try {
        return window.localStorage.getItem(AUTH_REMEMBER_ME_STORAGE_KEY) === 'true';
    } catch (error) {
        console.warn('Unable to read remember-me preference:', error);
        return false;
    }
}

function persistRememberMePreference(value) {
    try {
        window.localStorage.setItem(AUTH_REMEMBER_ME_STORAGE_KEY, value ? 'true' : 'false');
    } catch (error) {
        console.warn('Unable to save remember-me preference:', error);
    }
}

function restoreRememberMePreference() {
    if (!loginRememberMe) return;
    loginRememberMe.checked = readRememberMePreference();
}

function blockAuthInspectTools() {
    const isBlockedShortcut = (event) => {
        const key = String(event.key || '').toLowerCase();
        const ctrlOrMeta = event.ctrlKey || event.metaKey;

        if (key === 'f12') return true;
        if (ctrlOrMeta && key === 'u') return true;
        if (ctrlOrMeta && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) return true;

        return false;
    };

    document.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    }, { capture: true });

    window.addEventListener('keydown', (event) => {
        if (!isBlockedShortcut(event)) return;
        event.preventDefault();
        event.stopPropagation();
    }, true);
}

blockAuthInspectTools();

backButton?.addEventListener('click', (event) => {
    event.preventDefault();
    window.location.assign('./index.html');
});

async function applySelectedPersistence() {
    const shouldRemember = Boolean(loginRememberMe?.checked);
    persistRememberMePreference(shouldRemember);
    await setPersistence(auth, shouldRemember ? browserLocalPersistence : browserSessionPersistence);
}

// --- Basic UI Toggling ---

window.switchTab = function (tab) {
    const slider = document.getElementById('toggleSlider');
    const loginBtn = document.querySelectorAll('.toggle-btn')[0];
    const registerBtn = document.querySelectorAll('.toggle-btn')[1];

    if (tab === 'login') {
        slider.style.transform = 'translateX(0)';
        loginBtn.classList.add('active');
        registerBtn.classList.remove('active');

        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    } else {
        slider.style.transform = 'translateX(100%)';
        registerBtn.classList.add('active');
        loginBtn.classList.remove('active');

        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    }

    window.localStorage.setItem(AUTH_ACTIVE_TAB_STORAGE_KEY, tab === 'register' ? 'register' : 'login');
};

// --- Password Reveal Logic ---

window.togglePassword = function (inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye-off"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path></svg>';
    } else {
        input.type = 'password';
        iconElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    }
};

// --- Three.js Advanced Particle Background ---

const container = document.getElementById('canvas-container');

// Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// Particles
const particlesGeometry = new THREE.BufferGeometry();
const particlesCount = window.innerWidth < 768 ? 400 : 800;
const posArray = new Float32Array(particlesCount * 3);

for (let i = 0; i < particlesCount * 3; i++) {
    // Spread particles over a large volume
    posArray[i] = (Math.random() - 0.5) * 15;
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

// Teal color mix using materials
const material = new THREE.PointsMaterial({
    size: 0.03,
    color: '#4dd0e1',
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
});

const particlesMesh = new THREE.Points(particlesGeometry, material);
scene.add(particlesMesh);

camera.position.z = 5;

// Mouse Interaction
let mouseX = 0;
let mouseY = 0;

document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX / window.innerWidth) - 0.5;
    mouseY = (event.clientY / window.innerHeight) - 0.5;
});

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();

    // Slow continuous rotation
    particlesMesh.rotation.y = elapsedTime * 0.05;
    particlesMesh.rotation.x = elapsedTime * 0.02;

    // Mouse parallax effect
    particlesMesh.rotation.y += mouseX * 0.2;
    particlesMesh.rotation.x += mouseY * 0.2;

    // Wave movement
    const positions = particlesGeometry.attributes.position.array;
    for (let i = 0; i < particlesCount; i++) {
        const i3 = i * 3;
        const x = particlesGeometry.attributes.position.array[i3];
        particlesGeometry.attributes.position.array[i3 + 1] += Math.sin(elapsedTime + x) * 0.002;
    }
    particlesGeometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
}

animate();

// Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Helper: Redirect based on teachers/{name} email list in Firebase RTDB
function redirectBasedOnRole(role) {
    if (role === "teacher") {
        window.location.href = "teacher-dashboard.html";
    } else {
        window.location.href = "dashboard.html";
    }
}

async function resolveRoleForEmail(email) {
    return await isTeacherEmail(email) ? "teacher" : "student";
}

// EMAIL LOGIN
loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const submitBtn = e.target.querySelector('.auth-submit');

    setAuthMessage('login', 'Checking your credentials...', 'info');
    submitBtn.textContent = 'Logging in...';
    submitBtn.disabled = true;

    try {
        await applySelectedPersistence();
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const role = await resolveRoleForEmail(user.email || email);

        if (user.displayName) {
            try {
                window.localStorage.setItem('hacklab.userDisplayName', user.displayName);
            } catch (_) {}
        } else if (user.email) {
            const emailPrefix = user.email.split('@')[0];
            const formattedName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            try {
                window.localStorage.setItem('hacklab.userDisplayName', formattedName);
            } catch (_) {}
        }

        clearAuthDraft('login');
        setAuthMessage('login', '');
        redirectBasedOnRole(role);
    } catch (error) {
        console.error('Login Error:', error);
        setAuthMessage('login', getFriendlyAuthError(error), 'error');
        submitBtn.textContent = 'Login';
        submitBtn.disabled = false;
    }
});

// EMAIL REGISTER
registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    const submitBtn = e.target.querySelector('.auth-submit');
    setAuthMessage('register', 'Creating your account...', 'info');
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const trimmedName = (name || '').trim();

        if (trimmedName) {
            try {
                await updateProfile(user, { displayName: trimmedName });
            } catch (profileError) {
                console.warn('Unable to set displayName on Firebase auth user:', profileError);
            }

            try {
                window.localStorage.setItem('hacklab.userDisplayName', trimmedName);
            } catch (_) {}

            try {
                await saveStudentProfile(user.uid, {
                    displayName: trimmedName,
                    email: (user.email || email || '').trim()
                });
            } catch (saveError) {
                console.warn('Unable to save student profile on registration:', saveError);
            }
        }

        const role = await resolveRoleForEmail(email);

        setDashboardWalkthroughPending(user.uid, true);
        clearAuthDraft('register');
        setAuthMessage('register', '');
        redirectBasedOnRole(role);
    } catch (error) {
        console.error('Register Error:', error);
        setAuthMessage('register', getFriendlyAuthError(error), 'error');
        submitBtn.textContent = 'Register';
        submitBtn.disabled = false;
    }
});

// --- Social Logins ---

const handleSocialLogin = async (provider, providerName, buttonElement) => {
    const parentFormKey = buttonElement?.closest('.auth-form')?.id === 'registerForm' ? 'register' : 'login';
    setAuthMessage(parentFormKey, `Connecting with ${providerName}...`, 'info');
    setSocialButtonLoading(buttonElement, true);

    try {
        await applySelectedPersistence();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const role = await resolveRoleForEmail(user.email);
        const additionalUserInfo = getAdditionalUserInfo(result);

        if (user.displayName) {
            try {
                window.localStorage.setItem('hacklab.userDisplayName', user.displayName);
            } catch (_) {}
            try {
                await saveStudentProfile(user.uid, {
                    displayName: user.displayName,
                    email: user.email || ''
                });
            } catch (_) {}
        } else if (user.email) {
            const emailPrefix = user.email.split('@')[0];
            const formattedName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            try {
                window.localStorage.setItem('hacklab.userDisplayName', formattedName);
            } catch (_) {}
        }

        if (additionalUserInfo?.isNewUser) {
            setDashboardWalkthroughPending(user.uid, true);
        }

        setAuthMessage(parentFormKey, '');
        redirectBasedOnRole(role);
    } catch (error) {
        console.error(`${providerName} Login Error:`, error);
        setSocialButtonLoading(buttonElement, false);
        setAuthMessage(parentFormKey, getFriendlyAuthError(error, providerName), 'error');
    }
};

// Attach event listeners to social buttons
document.querySelectorAll('.btn-google').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleSocialLogin(googleProvider, 'Google', btn);
    });
});

document.querySelectorAll('.btn-apple').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleSocialLogin(appleProvider, 'Apple', btn);
    });
});

restoreAuthDrafts();
restoreRememberMePreference();
bindAuthDraftPersistence();
loginRememberMe?.addEventListener('change', () => {
    persistRememberMePreference(Boolean(loginRememberMe.checked));
});
window.switchTab(window.localStorage.getItem(AUTH_ACTIVE_TAB_STORAGE_KEY) === 'register' ? 'register' : 'login');
setAuthMessage('login', '');
setAuthMessage('register', '');
loginSubmitButton && (loginSubmitButton.disabled = false);
registerSubmitButton && (registerSubmitButton.disabled = false);

// Auto-redirect if already signed in
let isLoginInProgress = false;

[loginForm, registerForm].forEach((form) => {
    form?.addEventListener('submit', () => { isLoginInProgress = true; });
});

document.querySelectorAll('.btn-social').forEach((btn) => {
    btn.addEventListener('click', () => { isLoginInProgress = true; });
});

onAuthStateChanged(auth, async (user) => {
    if (!user || isLoginInProgress) return;

    try {
        const role = await resolveRoleForEmail(user.email);
        redirectBasedOnRole(role);
    } catch (error) {
        console.warn('Auto-redirect failed:', error);
    }
});


