document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:5001';
    let state = { currentUser: null, instructorId: null, selectedRating: 0 };

    async function apiFetch(endpoint, options = {}) {
        const token = localStorage.getItem('piRateToken');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
        if (!response.ok) throw new Error((await response.json()).message);
        return response.json();
    }

    async function initializeProfile() {
        const params = new URLSearchParams(window.location.search);
        state.instructorId = params.get('id');
        if (!state.instructorId) {
            document.querySelector('.profile-container').innerHTML = '<h2>Instructor not found.</h2>';
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
            document.querySelector('.profile-container').innerHTML = `<h2>Error: ${error.message}</h2>`;
        }
    }

    function populateProfile(instructor) {
        document.title = `${instructor.firstName} ${instructor.lastName} | Pi-Rate Academy`;
        document.getElementById('instructor-photo').src = instructor.photoUrl || `https://placehold.co/150x150/1A1F24/3A86FF?text=${instructor.firstName[0]}${instructor.lastName[0]}`;
        document.getElementById('instructor-name').textContent = `${instructor.firstName} ${instructor.lastName}`;
        document.getElementById('instructor-role').textContent = instructor.role;
        document.getElementById('instructor-about').textContent = instructor.aboutMe || 'No biography provided.';
        
        const socialsContainer = document.getElementById('instructor-socials');
        socialsContainer.innerHTML = ''; // Clear links
        // Add social links logic here if available in instructor data

        document.getElementById('avg-rating-score').textContent = instructor.averageRating;
        document.getElementById('total-ratings').textContent = `(${instructor.totalRatings} ratings)`;
        document.getElementById('avg-stars').innerHTML = generateStarsHTML(instructor.averageRating);
    }

    function setupRatingSystem(instructor) {
        const ratingSection = document.getElementById('user-rating-section');
        if (state.currentUser?.role === 'Student') {
            ratingSection.style.display = 'block';
            document.getElementById('rating-prompt').textContent = 'Your rating:';
            renderInteractiveStars(0);
            document.getElementById('submit-rating-btn').addEventListener('click', submitRating);
        } else {
            ratingSection.style.display = 'none';
        }
    }

    // Include the interactive star functions: renderInteractiveStars, updateStarDisplay, submitRating, generateStarsHTML
    // These functions can be copied from the 'home.js' file I previously provided.
    function renderInteractiveStars(rating) { /* ... */ }
    function updateStarDisplay(rating) { /* ... */ }
    async function submitRating() { /* ... */ }
    function generateStarsHTML(rating) { /* ... */ }

    initializeProfile();
});