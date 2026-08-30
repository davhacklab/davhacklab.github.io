import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, get, child, onValue } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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
        // Check role to enforce access
        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, `users/${user.uid}`));
            if (snapshot.exists()) {
                const userData = snapshot.val();
                if (userData.role === 'teacher') {
                    window.location.href = 'teacher-dashboard.html';
                    return;
                }
            }
        } catch (error) {
            console.error("Error fetching user role:", error);
        }
        updateUI(user);
        initStudentSessions(user);
    } else {
        window.location.href = 'auth.html';
    }
});

function updateUI(user) {
    const userNameDisplay = document.getElementById('userNameDisplay');
    const welcomeName = document.getElementById('welcomeName');
    const userAvatar = document.getElementById('userAvatar');

    const name = user.displayName || user.email.split('@')[0];
    userNameDisplay.textContent = name;
    welcomeName.textContent = name;

    if (user.photoURL) {
        userAvatar.src = user.photoURL;
    } else {
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4dd0e1&color=fff&bold=true&size=80`;
    }
}

// ============= LOGOUT =============
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'auth.html';
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
});

// ============= STUDENT SESSIONS (RTDB) =============
let countdownInterval = null;

function initStudentSessions(user) {
    const sessionsRef = ref(db, 'sessions');
    onValue(sessionsRef, (snapshot) => {
        const sessions = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.entries(data).forEach(([key, val]) => {
                sessions.push({ ...val, _key: key });
            });
        }
        renderStudentSessions(sessions, user);
    });
}

function renderStudentSessions(sessions, user) {
    const grid = document.getElementById('studentSessionsGrid');
    if (!grid) return;

    const now = new Date();
    const filtered = sessions.filter(s => s.status !== 'ended');
    filtered.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="session-card upcoming" style="opacity: 0.5; text-align: center; padding: 40px;">
                <p>No sessions available right now. Check back later!</p>
            </div>
        `;
        return;
    }

    const userName = user.displayName || user.email.split('@')[0];

    grid.innerHTML = filtered.map(s => {
        const sessionDate = new Date(s.date + 'T' + s.time);
        const diffMs = sessionDate - now;
        const diffMin = diffMs / 60000;

        let statusBadge, actionBtn, statusClass;

        if (s.status === 'live') {
            statusClass = 'live';
            statusBadge = '<div class="session-live-badge">🔴 LIVE NOW</div>';
            actionBtn = `<button class="btn-join-session" data-join="${s.id}" data-title="${escapeAttr(s.title)}" data-user="${escapeAttr(userName)}">Join Now</button>`;
        } else if (diffMin <= 5 && diffMin > 0) {
            statusClass = 'upcoming';
            statusBadge = '<div class="session-upcoming-badge">⏳ Starting Soon</div>';
            actionBtn = `<button class="btn-join-session" data-countdown="${s.id}" data-title="${escapeAttr(s.title)}" data-time="${s.date}T${s.time}" data-user="${escapeAttr(userName)}">Join (Countdown)</button>`;
        } else if (diffMin > 5) {
            statusClass = 'upcoming';
            statusBadge = `<div class="session-upcoming-badge">📅 ${formatSessionDate(s.date, s.time)}</div>`;
            actionBtn = `<button class="btn-remind" disabled>Not available yet</button>`;
        } else {
            statusClass = 'upcoming';
            statusBadge = '<div class="session-upcoming-badge">⌛ Ended</div>';
            actionBtn = '<button class="btn-remind" disabled>Session Over</button>';
        }

        return `
            <div class="session-card ${statusClass}">
                ${statusBadge}
                <h3>${escapeHtml(s.title)}</h3>
                <p>${escapeHtml(s.description)}</p>
                <div class="session-card-meta">
                    <span>👨‍🏫 ${escapeHtml(s.createdBy)}</span>
                </div>
                ${actionBtn}
            </div>
        `;
    }).join('');

    // Attach join listeners
    grid.querySelectorAll('[data-join]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.join;
            const title = btn.dataset.title;
            const usr = btn.dataset.user;
            window.location.href = `session.html?role=student&room=${id}&title=${encodeURIComponent(title)}&user=${encodeURIComponent(usr)}`;
        });
    });

    // Attach countdown listeners
    grid.querySelectorAll('[data-countdown]').forEach(btn => {
        btn.addEventListener('click', () => {
            showCountdown(btn.dataset.countdown, btn.dataset.title, btn.dataset.time, btn.dataset.user);
        });
    });

    setTimeout(animateCards, 50);
}

function showCountdown(sessionId, title, timeStr, userName) {
    const overlay = document.getElementById('countdownOverlay');
    const timerEl = document.getElementById('countdownTimer');
    const titleEl = document.getElementById('countdownTitle');

    overlay.style.display = 'flex';
    titleEl.textContent = title;

    const targetTime = new Date(timeStr).getTime();

    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        const now = Date.now();
        const diff = targetTime - now;

        if (diff <= 0) {
            clearInterval(countdownInterval);
            window.location.href = `session.html?role=student&room=${sessionId}&title=${encodeURIComponent(title)}&user=${encodeURIComponent(userName)}`;
            return;
        }

        const min = Math.floor(diff / 60000);
        const sec = Math.floor((diff % 60000) / 1000);
        timerEl.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }, 1000);

    document.getElementById('btnCancelCountdown').onclick = () => {
        if (countdownInterval) clearInterval(countdownInterval);
        overlay.style.display = 'none';
    };
}

function formatSessionDate(date, time) {
    const d = new Date(date + 'T' + time);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr}, ${timeStr}`;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

// ============= CALENDAR =============
let calDate = new Date();

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthEl = document.getElementById('calMonth');
    const yearEl = document.getElementById('calYear');

    if (!grid) return;

    const year = calDate.getFullYear();
    const month = calDate.getMonth();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    monthEl.textContent = monthNames[month];
    yearEl.textContent = year;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    const eventDays = [5, 12, 19, 22, 28];

    let html = '';
    for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="cal-day other-month">${daysInPrevMonth - i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
        let classes = 'cal-day';
        if (isCurrentMonth && d === today.getDate()) classes += ' today';
        if (eventDays.includes(d)) classes += ' has-event';
        html += `<div class="${classes}">${d}</div>`;
    }
    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
        html += `<div class="cal-day other-month">${i}</div>`;
    }

    grid.innerHTML = html;
}

document.getElementById('calPrev')?.addEventListener('click', () => {
    calDate.setMonth(calDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById('calNext')?.addEventListener('click', () => {
    calDate.setMonth(calDate.getMonth() + 1);
    renderCalendar();
});

renderCalendar();

// ============= FILTER CHIPS =============
document.querySelectorAll('.filter-chips').forEach(container => {
    const chips = container.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
    });
});

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
        size: 0.018,
        color: '#4dd0e1',
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });

    const particlesMesh = new THREE.Points(particlesGeometry, material);
    scene.add(particlesMesh);

    camera.position.z = 5;

    let mouseX = 0;
    let mouseY = 0;

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
    const cards = document.querySelectorAll('.course-card, .qstat-card, .resource-card, .event-timeline-card, .thread-card, .session-card, .setting-item');
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
