// ===== STATIC REBELLION - Interactive JavaScript =====

document.addEventListener('DOMContentLoaded', () => {
    // Custom Cursor
    const cursor = document.querySelector('.cursor-follower');
    let mouseX = 0, mouseY = 0;
    let cursorX = 0, cursorY = 0;
    
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    
    function animateCursor() {
        const dx = mouseX - cursorX;
        const dy = mouseY - cursorY;
        
        cursorX += dx * 0.15;
        cursorY += dy * 0.15;
        
        cursor.style.left = cursorX - 10 + 'px';
        cursor.style.top = cursorY - 10 + 'px';
        
        requestAnimationFrame(animateCursor);
    }
    animateCursor();
    
    // Cursor hover effect
    const hoverElements = document.querySelectorAll('a, button, .track-item, .member-card, .merch-item');
    hoverElements.forEach(el => {
        el.addEventListener('mouseenter', () => cursor.classList.add('hovering'));
        el.addEventListener('mouseleave', () => cursor.classList.remove('hovering'));
    });
    
    // Mobile Navigation
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    
    hamburger?.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('active');
    });
    
    // Close mobile nav on link click
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            hamburger?.classList.remove('active');
            navLinks?.classList.remove('active');
        });
    });
    
    // Active nav link on scroll
    const sections = document.querySelectorAll('section[id]');
    const navLinksList = document.querySelectorAll('.nav-link');
    
    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            if (scrollY >= sectionTop) {
                current = section.getAttribute('id');
            }
        });
        
        navLinksList.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
        });
        
        // Navbar background on scroll
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(5, 5, 5, 0.98)';
        } else {
            navbar.style.background = 'rgba(10, 10, 10, 0.9)';
        }
    });
    
    // Vinyl Player Animation
    const playBtn = document.getElementById('playBtn');
    const vinyl = document.querySelector('.vinyl');
    const tonearm = document.querySelector('.tonearm');
    let isPlaying = false;
    
    playBtn?.addEventListener('click', () => {
        isPlaying = !isPlaying;
        
        if (isPlaying) {
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            vinyl?.classList.add('playing');
            tonearm?.classList.add('playing');
        } else {
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
            vinyl?.classList.remove('playing');
            tonearm?.classList.remove('playing');
        }
    });
    
    // Track list click
    document.querySelectorAll('.track-item').forEach(track => {
        track.addEventListener('click', () => {
            document.querySelectorAll('.track-item').forEach(t => t.style.background = '');
            track.style.background = 'rgba(196, 30, 58, 0.2)';
            
            // Simulate playing
            if (!isPlaying) {
                playBtn?.click();
            }
        });
    });
    
    // Glitch effect on hover
    const glitchText = document.querySelector('.glitch');
    let glitchInterval;
    
    glitchText?.addEventListener('mouseenter', () => {
        glitchInterval = setInterval(() => {
            glitchText.style.textShadow = `
                ${Math.random() * 10 - 5}px ${Math.random() * 10 - 5}px #C41E3A,
                ${Math.random() * 10 - 5}px ${Math.random() * 10 - 5}px #FFD700
            `;
        }, 50);
    });
    
    glitchText?.addEventListener('mouseleave', () => {
        clearInterval(glitchInterval);
        glitchText.style.textShadow = '';
    });
    
    // Smooth reveal on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.member-card, .track-item, .show-item, .merch-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
    
    // Newsletter form
    const newsletterForm = document.querySelector('.newsletter-form');
    newsletterForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = newsletterForm.querySelector('input');
        if (input.value) {
            alert('Welcome to the rebellion! You\'ll be the first to know about new music and shows.');
            input.value = '';
        }
    });
    
    // Progress bar animation (simulated)
    const progressBar = document.querySelector('.progress');
    let progress = 35;
    
    if (progressBar && isPlaying) {
        setInterval(() => {
            if (isPlaying && progress < 100) {
                progress += 0.5;
                progressBar.style.width = progress + '%';
            }
        }, 1000);
    }
    
    // Parallax effect on hero
    window.addEventListener('scroll', () => {
        const hero = document.querySelector('.hero-content');
        const scrolled = window.scrollY;
        if (hero && scrolled < window.innerHeight) {
            hero.style.transform = `translateY(${scrolled * 0.3}px)`;
            hero.style.opacity = 1 - (scrolled / window.innerHeight);
        }
    });
    
    // Sound wave animation sync
    const waves = document.querySelectorAll('.wave');
    waves.forEach((wave, i) => {
        wave.style.animationDelay = `${i * 0.1}s`;
    });
    
    console.log('STATIC REBELLION loaded - Stay Loud, Stay Raw, Stay Rebellious!');
});
