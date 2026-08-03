// ============================================================
// LANDING PAGE - PARTICLE ANIMATION & INTERACTIONS
// ============================================================

// ===== PARTICLE SYSTEM =====
class ParticleNetwork {
    constructor() {
        this.canvas = document.getElementById('particleCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: null, y: null };
        this.connectionDistance = 120;
        
        this.init();
        this.bindEvents();
        this.animate();
    }
    
    init() {
        // Set canvas size
        this.resize();
        
        // Create particles
        const particleCount = Math.min(
            window.innerWidth < 768 ? 80 : 120,
            120
        );
        
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * 2 + 1,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                opacity: Math.random() * 0.6 + 0.2
            });
        }
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    bindEvents() {
        window.addEventListener('resize', () => {
            this.resize();
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.x = null;
            this.mouse.y = null;
        });
        
        // Touch support
        this.canvas.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            this.mouse.x = touch.clientX;
            this.mouse.y = touch.clientY;
        }, { passive: true });
        
        this.canvas.addEventListener('touchend', () => {
            this.mouse.x = null;
            this.mouse.y = null;
        });
    }
    
    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update and draw particles
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            
            // Move
            p.x += p.vx;
            p.y += p.vy;
            
            // Bounce
            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;
            
            // Draw particle
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(100, 200, 255, ${p.opacity})`;
            this.ctx.fill();
            
            // Draw connections
            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < this.connectionDistance) {
                    const opacity = 1 - (dist / this.connectionDistance);
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = `rgba(0, 150, 255, ${opacity * 0.4})`;
                    this.ctx.lineWidth = 0.8;
                    this.ctx.stroke();
                }
            }
        }
        
        // Mouse interaction
        if (this.mouse.x !== null && this.mouse.y !== null) {
            for (const p of this.particles) {
                const dx = p.x - this.mouse.x;
                const dy = p.y - this.mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 150) {
                    const force = (150 - dist) / 150 * 1.5;
                    p.vx += (dx / dist) * force * 0.02;
                    p.vy += (dy / dist) * force * 0.02;
                }
            }
        }
        
        requestAnimationFrame(() => this.animate());
    }
}

// ===== TYPING ANIMATION =====
class TypeWriter {
    constructor(element, text, speed = 40) {
        this.element = element;
        this.text = text;
        this.speed = speed;
        this.index = 0;
        this.isDeleting = false;
    }
    
    start() {
        this.type();
    }
    
    type() {
        if (this.index <= this.text.length) {
            this.element.innerHTML = this.text.substring(0, this.index) + '<span class="cursor"></span>';
            this.index++;
            setTimeout(() => this.type(), this.speed);
        }
    }
}

// ===== FEATURE CARD ANIMATION =====
function animateFeatureCards() {
    const cards = document.querySelectorAll('.feature-card');
    
    cards.forEach((card, index) => {
        const delay = parseInt(card.dataset.delay) || 0;
        setTimeout(() => {
            card.classList.add('visible');
        }, 1400 + delay);
    });
}

// ===== STAT COUNTER ANIMATION =====
function animateStats() {
    const stats = document.querySelectorAll('.stat-number');
    
    stats.forEach((stat, index) => {
        const target = parseInt(stat.dataset.target);
        const duration = 2000;
        const startTime = performance.now() + 1800 + (index * 300);
        
        setTimeout(() => {
            stat.parentElement.classList.add('visible');
        }, 1800 + (index * 300));
        
        function updateCounter(currentTime) {
            const elapsed = currentTime - startTime;
            if (elapsed < 0) {
                requestAnimationFrame(updateCounter);
                return;
            }
            
            const progress = Math.min(elapsed / duration, 1);
            const current = Math.floor(progress * target);
            stat.textContent = current + (progress < 1 && target > 50 ? '+' : '');
            
            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            } else {
                stat.textContent = target + '%';
            }
        }
        
        requestAnimationFrame(updateCounter);
    });
}

// ===== LAUNCH APP =====
function launchApp() {
    const btn = document.getElementById('launchBtn');
    const container = document.querySelector('.landing-container');
    
    btn.disabled = true;
    btn.textContent = 'Loading...';
    
    // Add exit animation
    container.classList.add('landing-exit');
    
    // Navigate to main app
    setTimeout(() => {
        window.location.href = '/app';
    }, 600);
}

// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', function() {
    // Start particle network
    const particles = new ParticleNetwork();
    
    // Start typing animation
    const tagline = document.getElementById('typingText');
    const text = '🤖 AI-Powered Lead Scoring & Prioritization Platform';
    const typer = new TypeWriter(tagline, text, 45);
    setTimeout(() => typer.start(), 800);
    
    // Animate feature cards
    animateFeatureCards();
    
    // Animate stats
    animateStats();
    
    // Launch button
    document.getElementById('launchBtn').addEventListener('click', launchApp);
    
    // Skip animation - click anywhere to launch
    document.addEventListener('click', function(e) {
        // Only if not clicking on a link or button
        if (!e.target.closest('button') && !e.target.closest('a')) {
            // Optional: launch on click anywhere after 3 seconds
        }
    });
    
    console.log('🚀 LeadScout Landing Page loaded!');
});

// ===== PREVENT SCROLLING =====
document.addEventListener('wheel', function(e) {
    e.preventDefault();
}, { passive: false });

document.addEventListener('touchmove', function(e) {
    e.preventDefault();
}, { passive: false });