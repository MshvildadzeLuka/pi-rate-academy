/**
 * ===================================================================
 * HOME PAGE SCRIPT (v4.2 - UPDATED AND REWRITTEN)
 * for Pi-Rate Academy
 * ===================================================================
 * - Fixed the group selection modal for multiple groups.
 * - Improved error handling for data fetching and rendering.
 * - Enhanced code readability with JSDoc comments and clear structure.
 * ===================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
    // ======================================================
    // =============== CONFIG & STATE MANAGEMENT ============
    // ======================================================
    const API_BASE_URL = '';
    const TEACHERS_PER_PAGE = 5;

    let state = {
        currentUser: null,
        teachers: [],
        myGroups: [],
        paginatedTeachers: [],
        currentPage: 1,
        totalPages: 1,
        isLoading: false,
    };

    // ======================================================
    // =============== DOM ELEMENT SELECTORS ================
    // ======================================================
    const elements = {
        teacherGrid: document.getElementById('teacher-grid'),
        prevPageBtn: document.getElementById('prev-page-btn'),
        nextPageBtn: document.getElementById('next-page-btn'),
        pageInfo: document.getElementById('page-info'),
        joinCallBtn: document.getElementById('join-call-btn'),
        zoomModal: document.getElementById('zoom-modal'),
        teacherProfileModal: document.getElementById('teacher-profile-modal'),
        main: document.querySelector('main'),
    };

    // ======================================================
    // =============== API HELPER ===========================
    // ======================================================
    /**
     * A robust helper function for making authenticated API requests.
     * @param {string} endpoint The API endpoint to call.
     * @param {object} [options={}] The options for the fetch call.
     * @returns {Promise<any>} The JSON response from the server.
     * @throws {Error} Throws an error on network failure or API error response.
     */
    async function apiFetch(endpoint, options = {}) {
        const token = localStorage.getItem('piRateToken');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
            
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('piRateToken');
                window.location.href = '/login/login.html';
                throw new Error('Authentication required');
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `API შეცდომა მოხდა: ${response.status}`);
            }
            
            return response.status === 204 ? null : response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw new Error('სერვერთან კავშირი ვერ მოხერხდა');
        }
    }

    // ======================================================
    // =============== INITIALIZATION =======================
    // ======================================================
    /**
     * Fetches all necessary data from the server and initializes the page.
     */
    async function initializeApp() {
        state.isLoading = true;
        showLoadingState();
        
        try {
            const token = localStorage.getItem('piRateToken');
            const promises = [
                apiFetch('/api/users/teachers'),
                token ? apiFetch('/api/users/profile') : Promise.resolve(null),
                token ? apiFetch('/api/groups/my-groups') : Promise.resolve([])
            ];

            const [teachers, user, groups] = await Promise.all(promises);
            
            state.teachers = teachers || [];
            state.currentUser = user;
            state.myGroups = groups || [];
            state.totalPages = Math.ceil(state.teachers.length / TEACHERS_PER_PAGE) || 1;

            renderTeachersPage();
            setupEventListeners();
            setupScrollAnimations();
            
        } catch (error) {
            console.error('Failed to initialize home page:', error);
            if (elements.teacherGrid) {
                elements.teacherGrid.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 40px;">ინსტრუქტორების მონაცემების ჩატვირთვა ვერ მოხერხდა.</p>';
            }
        } finally {
            state.isLoading = false;
            hideLoadingState();
        }
    }

    /**
     * Renders a loading spinner in the teacher grid.
     */
    function showLoadingState() {
        if (elements.teacherGrid) {
            elements.teacherGrid.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>იტვირთება...</p>
                </div>
            `;
        }
    }

    /**
     * Removes the loading spinner from the DOM.
     */
    function hideLoadingState() {
        const spinner = document.querySelector('.loading-spinner');
        if (spinner) {
            spinner.remove();
        }
    }

    // ======================================================
    // =============== RENDERING FUNCTIONS ==================
    // ======================================================
    /**
     * Renders the correct slice of instructors based on the current page.
     */
    function renderTeachersPage() {
        if (!elements.teacherGrid) return;
        
        const start = (state.currentPage - 1) * TEACHERS_PER_PAGE;
        const end = start + TEACHERS_PER_PAGE;
        state.paginatedTeachers = state.teachers.slice(start, end);

        if (state.paginatedTeachers.length === 0) {
            elements.teacherGrid.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 40px;">ინსტრუქტორები ვერ მოიძებნა.</p>';
            return;
        }

        elements.teacherGrid.innerHTML = state.paginatedTeachers.map(teacher => {
            const fullName = `${teacher.firstName} ${teacher.lastName}`;
            const photoUrl = teacher.photoUrl || `https://placehold.co/240x240/1E1E1E/00A8FF?text=${teacher.firstName[0]}${teacher.lastName[0]}`;
            return `
                <div class="teacher-card" data-teacher-id="${teacher._id}" role="button" tabindex="0">
                    <img src="${photoUrl}" alt="${fullName}-ის ფოტო" class="teacher-photo" loading="lazy">
                    <h3 class="teacher-name">${fullName}</h3>
                    <p class="teacher-role">${teacher.role}</p>
                    <div class="star-rating-summary" id="rating-summary-${teacher._id}">
                        <span class="average-rating">რეიტინგი იტვირთება...</span>
                    </div>
                </div>
            `;
        }).join('');
        
        state.paginatedTeachers.forEach(t => fetchAndRenderAverageRating(t._id));
        updatePaginationControls();
    }

    /**
     * Asynchronously fetches and renders the average rating for a single instructor.
     * @param {string} teacherId - The ID of the teacher to fetch ratings for.
     */
    async function fetchAndRenderAverageRating(teacherId) {
        try {
            const teacherData = await apiFetch(`/api/users/teacher/${teacherId}`);
            const ratingContainer = document.getElementById(`rating-summary-${teacherId}`);
            if (ratingContainer) {
                if (teacherData.totalRatings > 0) {
                    ratingContainer.innerHTML = `
                        <div class="stars">${generateStarsHTML(teacherData.averageRating)}</div>
                        <span class="average-rating">${teacherData.averageRating} (${teacherData.totalRatings} შეფასება)</span>
                    `;
                } else {
                    ratingContainer.innerHTML = `<div class="stars">${generateStarsHTML(0)}</div><span class="average-rating">ჯერ არ არის შეფასებები</span>`;
                }
            }
        } catch (error) {
            console.error(`Could not fetch rating for ${teacherId}`, error);
            const ratingContainer = document.getElementById(`rating-summary-${teacherId}`);
            if(ratingContainer) ratingContainer.innerHTML = `<span class="average-rating">რეიტინგის ჩატვირთვა ვერ მოხერხდა</span>`;
        }
    }

    /**
     * Updates the text and disabled state of the pagination controls.
     */
    function updatePaginationControls() {
        if (!elements.pageInfo || !elements.prevPageBtn || !elements.nextPageBtn) return;
        elements.pageInfo.textContent = `გვერდი ${state.currentPage} / ${state.totalPages}`;
        elements.prevPageBtn.disabled = state.currentPage === 1;
        elements.nextPageBtn.disabled = state.currentPage === state.totalPages;
    }

    /**
     * Generates the HTML for the static star rating display.
     * @param {number} rating - The average rating (e.g., 4.5).
     * @returns {string} The HTML string for the star icons.
     */
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

    // ======================================================
    // =============== EVENT LISTENERS ======================
    // ======================================================
    /**
     * Sets up all the primary event listeners for the page.
     */
    function setupEventListeners() {
        // Pagination buttons
        elements.prevPageBtn?.addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                renderTeachersPage();
                window.scrollTo({ top: elements.teacherGrid.offsetTop - 100, behavior: 'smooth' });
            }
        });
        
        elements.nextPageBtn?.addEventListener('click', () => {
            if (state.currentPage < state.totalPages) {
                state.currentPage++;
                renderTeachersPage();
                window.scrollTo({ top: elements.teacherGrid.offsetTop - 100, behavior: 'smooth' });
            }
        });

        // Event delegation for clicking on teacher cards
        elements.teacherGrid?.addEventListener('click', (e) => {
            const card = e.target.closest('.teacher-card');
            if (card && card.dataset.teacherId) {
                window.location.href = `../instructor-profile/instructor-profile.html?id=${card.dataset.teacherId}`;
            }
        });

        // "Join Call" button and modal - FIXED VERSION
        elements.joinCallBtn?.addEventListener('click', handleJoinCallClick);

        // Listeners for closing modals
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => { 
                if(e.target === modal) modal.classList.add('hidden'); 
            });
            modal.querySelector('.close-modal')?.addEventListener('click', () => modal.classList.add('hidden'));
        });
    }

    /**
     * Handles the join call button click with proper group selection.
     * This function has been updated to handle all scenarios robustly.
     */
    async function handleJoinCallClick() {
        try {
            if (!state.currentUser) {
                alert('გთხოვთ, ჯერ გაიაროთ ავტორიზაცია.');
                return;
            }
            
            if (!state.myGroups || state.myGroups.length === 0) {
                alert('თქვენ არ ხართ რომელიმე ჯგუფში დარეგისტრირებული.');
                return;
            }
            
            // Filter groups that have zoom links
            const groupsWithZoom = state.myGroups.filter(group => group.zoomLink && group.zoomLink.trim() !== '');
            
            if (groupsWithZoom.length === 0) {
                alert('თქვენს ჯგუფებს არ აქვთ Zoom ბმულები კონფიგურირებული.');
                return;
            }
            
            if (groupsWithZoom.length === 1) {
                // Directly open the single group's zoom link
                window.open(groupsWithZoom[0].zoomLink, '_blank');
            } else {
                // Show modal for multiple groups
                showGroupSelectionModal(groupsWithZoom);
            }
        } catch (error) {
            console.error('Error handling join call:', error);
            alert('ჯგუფების ჩატვირთვისას მოხდა შეცდომა.');
        }
    }

    /**
     * Shows the group selection modal with available groups.
     * This function has been corrected to explicitly remove the 'hidden' class.
     * @param {Array} groups - Array of groups with zoom links
     */
    function showGroupSelectionModal(groups) {
        if (!elements.zoomModal) return;
        
        const groupList = elements.zoomModal.querySelector('#group-list');
        groupList.innerHTML = '';

        groups.forEach(group => {
            const btn = document.createElement('button');
            
            // Find teacher for this group
            const teacher = group.users ? group.users.find(u => u.role === 'Teacher' || u.role === 'Admin') : null;
            const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : 'ინსტრუქტორი';
            
            btn.textContent = `${group.name} (${teacherName})`;
            btn.onclick = () => {
                window.open(group.zoomLink, '_blank');
                elements.zoomModal.classList.add('hidden');
            };
            groupList.appendChild(btn);
        });

        // FIX: Remove the 'hidden' class to ensure the modal is visible.
        elements.zoomModal.classList.remove('hidden');
    }
    
    /**
     * Sets up the IntersectionObserver for scroll-triggered animations.
     */
    function setupScrollAnimations() {
        const hiddenSections = document.querySelectorAll('.hidden-section');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible-section');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });
        hiddenSections.forEach((section) => observer.observe(section));
    }

    // --- Start the application ---
    initializeApp();

    /**
     * This event listener ensures that if a user navigates back to the home page,
     * the instructor data is refreshed from the server to show any updates.
     */
    window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
            console.log('Page loaded from cache. Re-fetching data...');
            initializeApp();
        }
    });
    
    // Add loading spinner styles
    const style = document.createElement('style');
    style.textContent = `
        .loading-spinner {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            grid-column: 1 / -1;
        }
        
        .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top-color: var(--primary-accent);
            animation: spin 1s ease-in-out infinite;
            margin-bottom: 15px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .loading-spinner p {
            color: var(--text-secondary);
            margin: 0;
        }
    `;
    document.head.appendChild(style);
});
""")
