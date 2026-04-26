// Sample Companions Data
const companions = [
    {
        id: 1,
        name: "Sarah Mitchell",
        age: 24,
        phone: "(954) 555-0123",
        rating: 4.9,
        reviews: 127,
        price: 45,
        priceCategory: "budget",
        bio: "Outgoing foodie who loves exploring new restaurants and making every meal an adventure!",
        activities: ["dining", "exploring", "events"],
        image: "https://randomuser.me/api/portraits/women/44.jpg",
        available: true
    },
    {
        id: 2,
        name: "Mike Johnson",
        age: 28,
        phone: "(954) 555-0456",
        rating: 4.8,
        reviews: 89,
        price: 60,
        priceCategory: "standard",
        bio: "Fitness enthusiast and sports fan. Let's hit the gym, play basketball, or catch a game!",
        activities: ["sports", "events", "gaming"],
        image: "https://randomuser.me/api/portraits/men/32.jpg",
        available: true
    },
    {
        id: 3,
        name: "Emma Rodriguez",
        age: 26,
        phone: "(954) 555-0789",
        rating: 5.0,
        reviews: 203,
        price: 85,
        priceCategory: "standard",
        bio: "Professional event companion. Perfect for weddings, galas, or any social gathering!",
        activities: ["events", "dining", "exploring"],
        image: "https://randomuser.me/api/portraits/women/68.jpg",
        available: true
    },
    {
        id: 4,
        name: "James Chen",
        age: 25,
        phone: "(954) 555-1012",
        rating: 4.7,
        reviews: 64,
        price: 35,
        priceCategory: "budget",
        bio: "Gamer and tech geek. Love board games, video games, and nerdy conversations!",
        activities: ["gaming", "movies", "exploring"],
        image: "https://randomuser.me/api/portraits/men/75.jpg",
        available: true
    },
    {
        id: 5,
        name: "Olivia Taylor",
        age: 29,
        phone: "(954) 555-1345",
        rating: 4.9,
        reviews: 156,
        price: 120,
        priceCategory: "premium",
        bio: "Model and lifestyle consultant. Perfect for upscale events and VIP experiences.",
        activities: ["events", "dining", "exploring"],
        image: "https://randomuser.me/api/portraits/women/90.jpg",
        available: true
    },
    {
        id: 6,
        name: "David Kim",
        age: 27,
        phone: "(954) 555-1678",
        rating: 4.8,
        reviews: 98,
        price: 55,
        priceCategory: "standard",
        bio: "Adventure seeker! Love hiking, beach trips, and spontaneous city exploration.",
        activities: ["exploring", "sports", "dining"],
        image: "https://randomuser.me/api/portraits/men/52.jpg",
        available: true
    },
    {
        id: 7,
        name: "Sophia Martinez",
        age: 23,
        phone: "(954) 555-1901",
        rating: 4.6,
        reviews: 45,
        price: 40,
        priceCategory: "budget",
        bio: "College student with great energy! Fun conversations and always up for anything.",
        activities: ["dining", "movies", "gaming"],
        image: "https://randomuser.me/api/portraits/women/33.jpg",
        available: true
    },
    {
        id: 8,
        name: "Alex Thompson",
        age: 31,
        phone: "(954) 555-2234",
        rating: 5.0,
        reviews: 178,
        price: 150,
        priceCategory: "premium",
        bio: "Executive companion for business events. Professional, articulate, and well-connected.",
        activities: ["events", "dining", "exploring"],
        image: "https://randomuser.me/api/portraits/men/94.jpg",
        available: true
    }
];

let selectedCompanion = null;

// Render Companions
function renderCompanions(companionsToRender) {
    const grid = document.getElementById('companionsGrid');
    grid.innerHTML = companionsToRender.map(c => `
        <div class="companion-card" data-id="${c.id}">
            <div class="companion-image">
                <img src="${c.image}" alt="${c.name}">
                ${c.available ? '<span class="companion-badge">Available</span>' : ''}
            </div>
            <div class="companion-info">
                <div class="companion-header">
                    <span class="companion-name">${c.name}</span>
                    <span class="companion-rating">
                        <i class="fas fa-star"></i> ${c.rating} (${c.reviews})
                    </span>
                </div>
                <p class="companion-bio">${c.bio}</p>
                <div class="companion-activities">
                    ${c.activities.map(a => `<span class="activity-tag">${capitalizeFirst(a)}</span>`).join('')}
                </div>
                <div class="companion-footer">
                    <span class="companion-price">$${c.price}<span>/hr</span></span>
                    <button class="btn-book" onclick="bookCompanion(${c.id})">Book Now</button>
                </div>
            </div>
        </div>
    `).join('');
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Filter Companions
function filterCompanions() {
    const priceFilter = document.getElementById('priceFilter').value;
    const activityFilter = document.getElementById('activityFilter').value;
    
    let filtered = companions;
    
    if (priceFilter !== 'all') {
        filtered = filtered.filter(c => c.priceCategory === priceFilter);
    }
    
    if (activityFilter !== 'all') {
        filtered = filtered.filter(c => c.activities.includes(activityFilter));
    }
    
    renderCompanions(filtered);
}

// Book Companion
function bookCompanion(id) {
    selectedCompanion = companions.find(c => c.id === id);
    
    const paymentDetails = document.getElementById('paymentDetails');
    paymentDetails.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px; padding: 15px; background: #FFF5F0; border-radius: 10px;">
            <img src="${selectedCompanion.image}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
            <div>
                <strong style="font-size: 1.1rem;">${selectedCompanion.name}</strong>
                <p style="color: #636E72; margin: 0;">$${selectedCompanion.price}/hour</p>
            </div>
        </div>
    `;
    
    document.getElementById('hoursToBook').value = 1;
    updateTotal();
    openModal('paymentModal');
}

function updateTotal() {
    const hours = parseInt(document.getElementById('hoursToBook').value) || 1;
    const total = selectedCompanion.price * hours;
    const serviceFee = Math.round(total * 0.15);
    document.getElementById('totalAmount').textContent = '$' + (total + serviceFee).toFixed(2);
}

// Process Payment
function processPayment(event) {
    event.preventDefault();
    
    // Simulate payment processing
    const btn = event.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;
    
    setTimeout(() => {
        closeModal('paymentModal');
        btn.innerHTML = 'Pay & Get Contact';
        btn.disabled = false;
        
        // Show success with phone number
        document.getElementById('contactReveal').innerHTML = `
            <a href="tel:${selectedCompanion.phone}">${selectedCompanion.phone}</a>
            <p>Contact ${selectedCompanion.name} to plan your hangout!</p>
        `;
        
        openModal('successModal');
    }, 2000);
}

// Modal Functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    document.body.style.overflow = '';
}

function switchModal(from, to) {
    closeModal(from);
    setTimeout(() => openModal(to), 200);
}

// Form Handlers
function handleSignup(event) {
    event.preventDefault();
    alert('Account created successfully! Please login.');
    closeModal('signupModal');
}

function handleLogin(event) {
    event.preventDefault();
    alert('Logged in successfully!');
    closeModal('loginModal');
}

function handleCompanionSignup(event) {
    event.preventDefault();
    alert('Application submitted! We will review and get back to you within 24 hours.');
    closeModal('becomeCompanionModal');
}

// Scroll Functions
function scrollToCompanions() {
    document.getElementById('companions').scrollIntoView({ behavior: 'smooth' });
}

// Card number formatting
document.addEventListener('DOMContentLoaded', function() {
    renderCompanions(companions);
    
    // Format card number input
    const cardInput = document.getElementById('cardNumber');
    if (cardInput) {
        cardInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\s/g, '').replace(/\D/g, '');
            let formatted = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formatted;
        });
    }
});

// Close modal on outside click
window.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// Mobile menu toggle
function toggleMobile() {
    const navLinks = document.querySelector('.nav-links');
    navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
}
