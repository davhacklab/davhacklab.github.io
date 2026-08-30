/* ============================================
   HackLab — Script
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Scroll to Top Button ──
  const scrollTopBtn = document.createElement('button');
  scrollTopBtn.classList.add('scroll-to-top');
  scrollTopBtn.innerHTML = '↑';
  scrollTopBtn.title = 'Scroll to top';
  document.body.appendChild(scrollTopBtn);

  window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
  });

  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Navbar scroll effect ──
  const navbar = document.getElementById('navbar');
  const handleNavScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  };
  window.addEventListener('scroll', handleNavScroll);

  // ── Mobile menu ──
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
  });

  // Close mobile menu on link click
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navLinks.classList.remove('open');
    });
  });

  // ── Scroll reveal ──
  const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => revealObserver.observe(el));

  // ── Animated counters ──
  const statNumbers = document.querySelectorAll('.stat-number[data-target]');
  let countersAnimated = false;

  const animateCounters = () => {
    if (countersAnimated) return;
    countersAnimated = true;

    statNumbers.forEach(num => {
      const target = parseInt(num.dataset.target);
      const duration = 2000;
      const startTime = performance.now();

      const step = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        num.textContent = Math.round(target * eased) + '+';
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  const statsSection = document.querySelector('.stats-grid');
  if (statsSection) {
    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounters();
          statsObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    statsObserver.observe(statsSection);
  }

  // ── FAQ accordion ──
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const answer = item.querySelector('.faq-answer');
      const isActive = item.classList.contains('active');

      // Close all
      document.querySelectorAll('.faq-item').forEach(fi => {
        fi.classList.remove('active');
        fi.querySelector('.faq-answer').style.maxHeight = '0';
      });

      // Open clicked (if it was closed)
      if (!isActive) {
        item.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  // ── Hero vertical animated lines ──
  const heroLines = document.getElementById('heroLines');
  if (heroLines) {
    for (let i = 0; i < 12; i++) {
      const line = document.createElement('div');
      line.className = 'hero-line';
      line.style.left = (Math.random() * 100) + '%';
      line.style.height = (60 + Math.random() * 100) + 'px';
      line.style.animationDuration = (3 + Math.random() * 5) + 's';
      line.style.animationDelay = (Math.random() * 6) + 's';
      line.style.opacity = (0.15 + Math.random() * 0.25).toString();
      heroLines.appendChild(line);
    }
  }

  // ── Hero canvas particle effect ──
  const canvas = document.getElementById('hero-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId;

    const resize = () => {
      const hero = document.getElementById('hero');
      canvas.width = hero.offsetWidth;
      canvas.height = hero.offsetHeight;
    };
    resize();
    let resizeFrame = null;
    window.addEventListener('resize', () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        resize();
      });
    });

    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.5 + 0.1;
        this.hue = Math.random() > 0.5 ? 187 : 260; // teal or purple
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
          this.reset();
        }
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${this.hue}, 80%, 65%, ${this.opacity})`;
        ctx.fill();
      }
    }

    // Spawn particles
    const count = Math.min(80, Math.floor(canvas.width * canvas.height / 15000));
    for (let i = 0; i < count; i++) {
      particles.push(new Particle());
    }

    // Draw connections
    const drawConnections = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(77, 208, 225, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const animate = () => {
      if (document.hidden) {
        animationId = null;
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      drawConnections();
      animationId = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (reduceMotion || animationId) {
        return;
      }

      animate();
    };

    const stopAnimation = () => {
      if (!animationId) {
        return;
      }

      cancelAnimationFrame(animationId);
      animationId = null;
    };

    startAnimation();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopAnimation();
      } else {
        startAnimation();
      }
    });

    // Pause when hero is not visible
    const heroObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          startAnimation();
        } else {
          stopAnimation();
        }
      });
    }, { threshold: 0.05 });
    heroObserver.observe(document.getElementById('hero'));
  }

  // ── Active nav link highlight ──
  const sections = document.querySelectorAll('section[id]');
  const navAnchors = document.querySelectorAll('.nav-links a:not(.nav-cta)');

  const highlightNav = () => {
    let current = '';
    sections.forEach(sec => {
      const top = sec.offsetTop - 120;
      if (window.scrollY >= top) {
        current = sec.getAttribute('id');
      }
    });
    navAnchors.forEach(a => {
      a.style.color = '';
      if (a.getAttribute('href') === '#' + current) {
        a.style.color = 'var(--accent-teal)';
      }
    });
  };
  window.addEventListener('scroll', highlightNav);

  // ── Custom Cursor ──
  const canUseCustomCursor = typeof window.matchMedia === 'function'
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
    // Dot follows instantly
    cursorDot.style.transform = `translate(${mouseX - 4}px, ${mouseY - 4}px)`;
  });

  // Ring follows with smooth lag
  function animateRing() {
    ringX += (mouseX - ringX) * 0.12;
    ringY += (mouseY - ringY) * 0.12;
    cursorRing.style.transform = `translate(${ringX - 18}px, ${ringY - 18}px)`;
    requestAnimationFrame(animateRing);
  }
  animateRing();

  // Hover effect on interactive elements
  const hoverTargets = document.querySelectorAll('a, button, .btn-primary, .btn-secondary, .nav-cta, .project-card, .feature-card, .event-card, .faq-question, input, .toggle-btn');
  hoverTargets.forEach(el => {
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

});
