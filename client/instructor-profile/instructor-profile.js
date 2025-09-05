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
        
        const socialsContainer = document.getElementById('instructor-socials');
        socialsContainer.innerHTML = '';
        if (instructor.socials) {
            if (instructor.socials.twitter) {
                socialsContainer.innerHTML += `<a href="${instructor.socials.twitter}" target="_blank" aria-label="Twitter"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg></a>`;
            }
            if (instructor.socials.linkedin) {
                socialsContainer.innerHTML += `<a href="${instructor.socials.linkedin}" target="_blank" aria-label="LinkedIn"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>`;
            }
            if (instructor.socials.github) {
                socialsContainer.innerHTML += `<a href="${instructor.socials.github}" target="_blank" aria-label="GitHub"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg></a>`;
            }
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

    function renderInteractiveStars(rating) {
        const container = document.getElementById('interactive-stars');
        container.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
            const starWrapper = document.createElement('div');
            starWrapper.className = 'star-wrapper';
            starWrapper.dataset.rating = i;
            starWrapper.innerHTML = `
                <svg class="star-icon" width="32" height="32" viewBox="0 0 24 24" fill="${i <= rating ? 'var(--star-color)' : '#4a4a4a'}">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
            `;
            starWrapper.addEventListener('click', () => updateStarDisplay(i));
            starWrapper.addEventListener('mouseenter', () => updateStarDisplay(i, true));
            container.appendChild(starWrapper);
        }
        container.addEventListener('mouseleave', () => updateStarDisplay(state.selectedRating));
    }

    function updateStarDisplay(rating, isHover = false) {
        if (!isHover) state.selectedRating = rating;
        const stars = document.querySelectorAll('.star-rating-interactive .star-icon');
        stars.forEach((star, index) => {
            star.style.fill = index < rating ? 'var(--star-color)' : '#4a4a4a';
        });
        document.getElementById('submit-rating-btn').disabled = rating === 0;
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
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                starsHtml += `<svg class="star-icon" fill="#ffc107" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
            } else if (i - 0.5 <= rating) {
                starsHtml += `<svg class="star-icon" fill="#ffc107" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z" fill="#4a4a4a"/></svg>`;
            } else {
                starsHtml += `<svg class="star-icon" fill="#4a4a4a" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
            }
        }
        return starsHtml;
    }

    initializeProfile();
});