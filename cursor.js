/* ============================================
   HackLab — Custom Cursor
   ============================================ */

(function () {
    const canUseCustomCursor = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (!canUseCustomCursor) {
        document.documentElement.classList.add('no-custom-cursor');
        return;
    }

    const cursorDot = document.createElement('div');
    cursorDot.classList.add('cursor-dot');
    document.body.appendChild(cursorDot);

    const cursorRing = document.createElement('div');
    cursorRing.classList.add('cursor-ring');
    document.body.appendChild(cursorRing);

    let mouseX = 0, mouseY = 0;
    let ringX = 0, ringY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursorDot.style.transform = `translate(${mouseX - 4}px, ${mouseY - 4}px)`;
    });

    function animateRing() {
        ringX += (mouseX - ringX) * 0.12;
        ringY += (mouseY - ringY) * 0.12;
        cursorRing.style.transform = `translate(${ringX - 18}px, ${ringY - 18}px)`;
        requestAnimationFrame(animateRing);
    }
    animateRing();

    // Hover effect on interactive elements
    function bindHoverTargets() {
        const targets = document.querySelectorAll('a, button, .btn-primary, .btn-secondary, .nav-cta, .project-card, .feature-card, .event-card, .faq-question, input, .toggle-btn, .social-btn');
        targets.forEach(el => {
            el.style.cursor = 'none';
            el.addEventListener('mouseenter', () => {
                cursorDot.classList.add('hover');
                cursorRing.classList.add('hover');
            });
            el.addEventListener('mouseleave', () => {
                cursorDot.classList.remove('hover');
                cursorRing.classList.remove('hover');
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindHoverTargets);
    } else {
        bindHoverTargets();
    }
})();
