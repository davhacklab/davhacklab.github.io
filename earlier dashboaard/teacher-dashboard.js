import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, set, get, push, remove, update, onValue, child } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyC2EOy4F6MmMDATo8sGCpmK-p2BEor3DeQ",
    authDomain: "hacklab-70033.firebaseapp.com",
    projectId: "hacklab-70033",
    storageBucket: "hacklab-70033.firebasestorage.app",
    messagingSenderId: "583481801792",
    appId: "1:583481801792:web:ba4ab54e541c415187f3a5",
    measurementId: "G-34QB0WY3LW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ============= AUTH =============
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Enforce teacher role
        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, `users/${user.uid}`));
            if (snapshot.exists()) {
                const userData = snapshot.val();
                if (userData.role === 'student') {
                    window.location.href = 'dashboard.html';
                    return;
                }
            }
        } catch (error) {
            console.error('Error fetching user role:', error);
        }
        updateUI(user);
        initSessions();
        initTasks();
    } else {
        window.location.href = 'auth.html';
    }
});

let currentUserName = "Teacher";

function updateUI(user) {
    const userNameDisplay = document.getElementById('userNameDisplay');
    const welcomeName = document.getElementById('welcomeName');
    const userAvatar = document.getElementById('userAvatar');

    const name = user.displayName || user.email.split('@')[0];
    currentUserName = name;
    userNameDisplay.textContent = name;
    welcomeName.textContent = name;

    if (user.photoURL) {
        userAvatar.src = user.photoURL;
    } else {
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c4dff&color=fff&bold=true&size=80`;
    }
}

// ============= LOGOUT =============
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'auth.html';
    });
});

// ============= TAB SWITCHING =============
const navItems = document.querySelectorAll('.nav-item[data-tab]');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = item.dataset.tab;
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        tabContents.forEach(tab => {
            tab.classList.remove('active');
            tab.style.animation = 'none';
        });
        const targetContent = document.getElementById(`tab-${targetTab}`);
        if (targetContent) {
            void targetContent.offsetWidth;
            targetContent.style.animation = '';
            targetContent.classList.add('active');
        }
        if (targetTab === 'sessions') {
            renderTeacherSessions();
        }
    });
});

// "Manage All" link switches to sessions tab
document.querySelectorAll('[data-switch="sessions"]').forEach(el => {
    el.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('[data-tab="sessions"]').click();
    });
});

// ============= DATE DISPLAY =============
function updateDateDisplay() {
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    const dateStr = now.toLocaleDateString('en-US', options);
    const parts = dateStr.split(', ');
    let formatted = dateStr;
    if (parts.length >= 2) {
        const weekday = parts[0];
        const rest = parts.slice(1).join(', ');
        formatted = `${rest} — ${weekday}`;
    }
    const el = document.getElementById('currentDate');
    if (el) el.textContent = formatted;
}
updateDateDisplay();

// ============= SESSIONS CRUD (Firebase RTDB) =============
let allSessions = [];
let sessionsUnsubscribe = null;

function initSessions() {
    const sessionsRef = ref(db, 'sessions');
    onValue(sessionsRef, (snapshot) => {
        allSessions = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.entries(data).forEach(([key, val]) => {
                allSessions.push({ ...val, _key: key });
            });
        }
        renderTeacherSessions();
        renderOverviewSessions();
        updateStats();
    });
}

function generateSessionId() {
    return 'hl-' + Math.random().toString(36).substring(2, 10);
}

// Create Session Form
const btnCreateSession = document.getElementById('btnCreateSession');
const createSessionForm = document.getElementById('createSessionForm');
const btnCancelSession = document.getElementById('btnCancelSession');
const btnSaveSession = document.getElementById('btnSaveSession');

btnCreateSession.addEventListener('click', () => {
    createSessionForm.style.display = createSessionForm.style.display === 'none' ? 'block' : 'none';
    const now = new Date();
    document.getElementById('sessionDate').value = now.toISOString().split('T')[0];
    document.getElementById('sessionTime').value = '17:00';
});

btnCancelSession.addEventListener('click', () => {
    createSessionForm.style.display = 'none';
});

btnSaveSession.addEventListener('click', async () => {
    const title = document.getElementById('sessionTitle').value.trim();
    const desc = document.getElementById('sessionDesc').value.trim();
    const date = document.getElementById('sessionDate').value;
    const time = document.getElementById('sessionTime').value;

    if (!title || !date || !time) {
        alert('Please fill in the title, date, and time.');
        return;
    }

    const sessionId = generateSessionId();
    const session = {
        id: sessionId,
        title,
        description: desc || 'No description provided.',
        date,
        time,
        createdBy: currentUserName,
        createdByUid: auth.currentUser?.uid || '',
        createdAt: new Date().toISOString(),
        status: 'upcoming',
        tasks: []
    };

    try {
        await set(ref(db, 'sessions/' + sessionId), session);
        document.getElementById('sessionTitle').value = '';
        document.getElementById('sessionDesc').value = '';
        createSessionForm.style.display = 'none';
    } catch (err) {
        console.error('Error creating session:', err);
        alert('Failed to create session. Check your connection.');
    }
});

function renderTeacherSessions() {
    const grid = document.getElementById('teacherSessionsGrid');
    const sessions = [...allSessions];

    if (sessions.length === 0) {
        grid.innerHTML = `
            <div class="session-card upcoming" style="opacity: 0.5; text-align: center; padding: 40px;">
                <p>No sessions yet. Click "Create Session" to get started.</p>
            </div>
        `;
        return;
    }

    sessions.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));

    grid.innerHTML = sessions.map(s => {
        const sessionDate = new Date(s.date + 'T' + s.time);
        const now = new Date();
        const isPast = sessionDate < now;
        const statusClass = s.status === 'live' ? 'live' : (isPast && s.status !== 'live' ? 'past' : 'upcoming');
        const statusBadge = s.status === 'live'
            ? '<div class="session-live-badge">🔴 LIVE NOW</div>'
            : (s.status === 'ended'
                ? '<div class="session-upcoming-badge">✅ Ended</div>'
                : `<div class="session-upcoming-badge">📅 ${formatSessionDate(s.date, s.time)}</div>`);

        const actionBtn = s.status === 'live'
            ? `<button class="btn-join-session" data-rejoin="${s.id}">Rejoin Session</button>`
            : (s.status === 'ended'
                ? '<button class="btn-remind" disabled>Session Ended</button>'
                : `<button class="btn-join-session" data-start="${s.id}">Start Session</button>`);

        return `
            <div class="session-card ${statusClass}" data-session-id="${s.id}">
                ${statusBadge}
                <h3>${escapeHtml(s.title)}</h3>
                <p>${escapeHtml(s.description)}</p>
                <div class="session-card-meta">
                    <span>👨‍🏫 ${escapeHtml(s.createdBy)}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    ${actionBtn}
                    <button class="btn-remind" style="background: rgba(239,68,68,0.1); color: #ef4444; border-color: rgba(239,68,68,0.2);" data-delete="${s.id}">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    // Attach event listeners
    grid.querySelectorAll('[data-start]').forEach(btn => {
        btn.addEventListener('click', () => startSession(btn.dataset.start));
    });
    grid.querySelectorAll('[data-rejoin]').forEach(btn => {
        btn.addEventListener('click', () => {
            const s = allSessions.find(x => x.id === btn.dataset.rejoin);
            if (s) window.location.href = `session.html?role=host&room=${s.id}&title=${encodeURIComponent(s.title)}&user=${encodeURIComponent(currentUserName)}`;
        });
    });
    grid.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', () => deleteSession(btn.dataset.delete));
    });
    setTimeout(animateCards, 50);
}

async function startSession(sessionId) {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    try {
        await update(ref(db, 'sessions/' + sessionId), { status: 'live' });
        window.location.href = `session.html?role=host&room=${session.id}&title=${encodeURIComponent(session.title)}&user=${encodeURIComponent(currentUserName)}`;
    } catch (err) {
        console.error('Error starting session:', err);
    }
}

async function deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
        await remove(ref(db, 'sessions/' + sessionId));
    } catch (err) {
        console.error('Error deleting session:', err);
    }
}

function renderOverviewSessions() {
    const grid = document.getElementById('overviewSessionsGrid');
    const sessions = allSessions.filter(s => s.status !== 'ended');

    if (sessions.length === 0) {
        grid.innerHTML = `
            <div class="session-card upcoming" style="opacity: 0.5; text-align: center; padding: 40px;">
                <p>No sessions created yet. Go to Sessions tab to create one.</p>
            </div>
        `;
        return;
    }

    const display = sessions.slice(0, 3);
    grid.innerHTML = display.map(s => {
        return `
            <div class="session-card ${s.status === 'live' ? 'live' : 'upcoming'}">
                ${s.status === 'live' ? '<div class="session-live-badge">🔴 LIVE NOW</div>' : `<div class="session-upcoming-badge">📅 ${formatSessionDate(s.date, s.time)}</div>`}
                <h3>${escapeHtml(s.title)}</h3>
                <p>${escapeHtml(s.description)}</p>
            </div>
        `;
    }).join('');
}

function formatSessionDate(date, time) {
    const d = new Date(date + 'T' + time);
    const options = { month: 'short', day: 'numeric' };
    const dateStr = d.toLocaleDateString('en-US', options);
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr}, ${timeStr}`;
}

// ============= TODAY'S TASKS (Firebase RTDB) =============
let allTasks = [];
const TASKS_RTDB_KEY = 'teacher_tasks';

function initTasks() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const tasksRef = ref(db, `${TASKS_RTDB_KEY}/${uid}`);
    onValue(tasksRef, (snapshot) => {
        allTasks = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (Array.isArray(data)) {
                allTasks = data;
            } else {
                Object.entries(data).forEach(([key, val]) => {
                    allTasks.push({ ...val, _key: key });
                });
            }
        }
        renderTasks();
        updateStats();
    });
}

async function saveTasksToRTDB() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
        await set(ref(db, `${TASKS_RTDB_KEY}/${uid}`), allTasks);
    } catch (err) {
        console.error('Error saving tasks:', err);
    }
}

const tasksList = document.getElementById('tasksList');
const addTaskForm = document.getElementById('addTaskForm');
const btnAddTask = document.getElementById('btnAddTask');
const taskInput = document.getElementById('taskInput');
const btnSaveTask = document.getElementById('btnSaveTask');

btnAddTask.addEventListener('click', () => {
    addTaskForm.style.display = addTaskForm.style.display === 'none' ? 'flex' : 'none';
    if (addTaskForm.style.display === 'flex') taskInput.focus();
});

btnSaveTask.addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
});

function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;
    allTasks.push({ text, done: false, id: Date.now() });
    saveTasksToRTDB();
    taskInput.value = '';
}

function toggleTask(id) {
    const task = allTasks.find(t => t.id === id);
    if (task) task.done = !task.done;
    saveTasksToRTDB();
}

function deleteTask(id) {
    allTasks = allTasks.filter(t => t.id !== id);
    saveTasksToRTDB();
}

function renderTasks() {
    if (allTasks.length === 0) {
        tasksList.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.82rem;">No tasks yet. Add one above!</div>`;
        return;
    }

    tasksList.innerHTML = allTasks.map(t => `
        <div class="task-item ${t.done ? 'done' : ''}" data-id="${t.id}">
            <button class="task-check ${t.done ? 'checked' : ''}" data-toggle="${t.id}">
                ${t.done ? '✓' : ''}
            </button>
            <span class="task-text">${escapeHtml(t.text)}</span>
            <button class="task-delete" data-del-task="${t.id}">×</button>
        </div>
    `).join('');

    tasksList.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.addEventListener('click', () => toggleTask(Number(btn.dataset.toggle)));
    });

    tasksList.querySelectorAll('[data-del-task]').forEach(btn => {
        btn.addEventListener('click', () => deleteTask(Number(btn.dataset.delTask)));
    });
}

// ============= STATS =============
function updateStats() {
    document.getElementById('statTotalSessions').textContent = allSessions.length;
    document.getElementById('statTotalStudents').textContent = allSessions.length * 12; // Mock
    document.getElementById('statTotalHours').textContent = allSessions.length * 2; // Mock
    document.getElementById('statTasksDone').textContent = allTasks.filter(t => t.done).length;
}

// ============= THREE.JS BACKGROUND =============
function initBackground() {
    const container = document.getElementById('canvas-container');
    if (!container || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const particlesGeometry = new THREE.BufferGeometry();
    const count = 400;
    const posArray = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 12;
    }
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const material = new THREE.PointsMaterial({
        size: 0.018, color: '#7c4dff', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending
    });

    const particlesMesh = new THREE.Points(particlesGeometry, material);
    scene.add(particlesMesh);
    camera.position.z = 5;

    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', (event) => {
        mouseX = (event.clientX / window.innerWidth) - 0.5;
        mouseY = (event.clientY / window.innerHeight) - 0.5;
    });

    function animate() {
        requestAnimationFrame(animate);
        const time = Date.now() * 0.0003;
        particlesMesh.rotation.y = time * 0.08;
        particlesMesh.rotation.x += mouseY * 0.03;
        particlesMesh.rotation.y += mouseX * 0.03;
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}
initBackground();

// ============= ENTRANCE ANIMATIONS =============
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -40px 0px' };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

function animateCards() {
    const cards = document.querySelectorAll('.session-card, .qstat-card, .setting-item, .task-item');
    cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = `all 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.06}s`;
        observer.observe(card);
    });
}
setTimeout(animateCards, 100);

navItems.forEach(item => {
    item.addEventListener('click', () => {
        setTimeout(animateCards, 50);
    });
});

// ============= HELPERS =============
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
