document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = '';
    let state = { currentUser: null, instructorId: null, selectedRating: 0 };

    async function apiFetch(endpoint, options = {}) {
        const token = localStorage.getItem('piRateToken');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'API შეცდომა მოხდა');
            }
            return response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw new Error('სერვერთან კავშირი ვერ მოხერხდა');
        }
    }

    async function initializeProfile() {
        const params = new URLSearchParams(window.location.search);
        state.instructorId = params.get('id');
        if (!state.instructorId) {
            document.querySelector('.profile-container').innerHTML = '<h2>ინსტრუქტორი ვერ მოიძებნა.</h2>';
            return;
        }

        try {
            const token = localStorage.getItem('piRateToken');
            const userPromise = token ? apiFetch('/api/users/profile') : Promise.resolve(null);
            const instructorPromise = apiFetch(`/api/users/teacher/${state.instructorId}`);
            
            const [user, instructor] = await Promise.all([userPromise, instructorPromise]);
            state.currentUser = user;

            populateProfile(instructor);
            setupRatingSystem(instructor);
        } catch (error) {
            console.error('Failed to load profile:', error);
            document.querySelector('.profile-container').innerHTML = `<h2>შეცდომა: ${error.message}</h2>`;
        }
    }

    function populateProfile(instructor) {
        document.title = `${instructor.firstName} ${instructor.lastName} | Pi-Rate Academy`;
        document.getElementById('instructor-photo').src = instructor.photoUrl || `https://placehold.co/150x150/1A1F24/3A86FF?text=${instructor.firstName[0]}${instructor.lastName[0]}`;
        document.getElementById('instructor-name').textContent = `${instructor.firstName} ${instructor.lastName}`;
        document.getElementById('instructor-role').textContent = instructor.role;
        document.getElementById('instructor-about').textContent = instructor.aboutMe || 'ბიოგრაფია არ არის მოწოდებული.';
        
        const contactContainer = document.getElementById('instructor-contact');
        contactContainer.innerHTML = '';
        
        // Add mobile number if available
        if (instructor.mobileNumber) {
            contactContainer.innerHTML += `<a href="tel:${instructor.mobileNumber}" class="phone-link"><i class="fas fa-phone"></i> ${instructor.mobileNumber}</a>`;
        }
        
        // Add email link
        if (instructor.email) {
            contactContainer.innerHTML += `<a href="mailto:${instructor.email}" class="email-link"><i class="fas fa-envelope"></i> ${instructor.email}</a>`;
        }

        // Add social links if available
        const socials = instructor.socials || {};
        if (socials.facebook) {
            contactContainer.innerHTML += `<a href="${socials.facebook}" target="_blank" aria-label="Facebook"><i class="fab fa-facebook"></i></a>`;
        }
        if (socials.instagram) {
            contactContainer.innerHTML += `<a href="${socials.instagram}" target="_blank" aria-label="Instagram"><i class="fab fa-instagram"></i></a>`;
        }
        if (socials.twitter) {
            contactContainer.innerHTML += `<a href="${socials.twitter}" target="_blank" aria-label="Twitter"><i class="fab fa-twitter"></i></a>`;
        }
        if (socials.linkedin) {
            contactContainer.innerHTML += `<a href="${socials.linkedin}" target="_blank" aria-label="LinkedIn"><i class="fab fa-linkedin"></i></a>`;
        }
        if (socials.github) {
            contactContainer.innerHTML += `<a href="${socials.github}" target="_blank" aria-label="GitHub"><i class="fab fa-github"></i></a>`;
        }

        document.getElementById('avg-rating-score').textContent = instructor.averageRating;
        document.getElementById('total-ratings').textContent = `(${instructor.totalRatings} შეფასება)`;
        document.getElementById('avg-stars').innerHTML = generateStarsHTML(instructor.averageRating);
    }

    function setupRatingSystem(instructor) {
        const ratingSection = document.getElementById('user-rating-section');
        if (state.currentUser?.role === 'Student') {
            ratingSection.style.display = 'block';
            document.getElementById('rating-prompt').textContent = 'თქვენი შეფასება:';
            renderInteractiveStars(0);
            document.getElementById('submit-rating-btn').addEventListener('click', submitRating);
        } else {
            ratingSection.style.display = 'none';
        }
    }

    function renderInteractiveStars(rating, isHover = false) {
        const container = document.getElementById('interactive-stars');
        if (!container) return;
        
        const currentRating = isHover ? rating : state.selectedRating;
        container.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
            const starWrapper = document.createElement('div');
            starWrapper.className = 'star-wrapper';
            starWrapper.dataset.rating = i;
            starWrapper.innerHTML = `
                <svg class="star-icon" width="32" height="32" viewBox="0 0 24 24" fill="${i <= currentRating ? 'var(--star-color)' : '#4a4a4a'}">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
            `;
            if (!isHover) {
                starWrapper.addEventListener('click', () => updateStarDisplay(i));
            }
            container.appendChild(starWrapper);
        }
        container.addEventListener('mouseleave', () => updateStarDisplay(state.selectedRating));
        
        if (!isHover) {
            const stars = document.querySelectorAll('.star-rating-interactive .star-icon');
            stars.forEach((star, index) => {
                const newRating = index + 1;
                star.parentElement.addEventListener('mouseenter', () => updateStarDisplay(newRating, true));
            });
        }
    }

    function updateStarDisplay(rating, isHover = false) {
        if (!isHover) {
            state.selectedRating = rating;
        }
        const stars = document.querySelectorAll('.star-rating-interactive .star-icon');
        stars.forEach((star, index) => {
            star.style.fill = index < rating ? 'var(--star-color)' : '#4a4a4a';
        });
        document.getElementById('submit-rating-btn').disabled = state.selectedRating === 0;
    }

    async function submitRating() {
        if (state.selectedRating === 0) return;
        
        try {
            const response = await apiFetch(`/api/ratings/${state.instructorId}`, {
                method: 'POST',
                body: JSON.stringify({ rating: state.selectedRating })
            });
            
            alert('თქვენი შეფასება წარმატებით გაიგზავნა!');
            location.reload();
        } catch (error) {
            alert(`შეფასების გაგზავნა ვერ მოხერხდა: ${error.message}`);
        }
    }

    function generateStarsHTML(rating) {
        let starsHtml = `<svg width="0" height="0"><defs><linearGradient id="half-star-gradient"><stop offset="50%" stop-color="#ffc107"/><stop offset="50%" stop-color="#4a4a4a" /></linearGradient></defs></svg>`;
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                starsHtml += `<svg class="star-icon" fill="#ffc107" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
            } else if (i - 0.5 <= rating) {
                starsHtml += `<svg class="star-icon" fill="url(#half-star-gradient)" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
            } else {
                starsHtml += `<svg class="star-icon" fill="#4a4a4a" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
            }
        }
        return starsHtml;
    }

    initializeProfile();
});
