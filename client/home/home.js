/**
 * ===================================================================
 * HOME PAGE SCRIPT (v4.0 - Georgian & Mobile Optimized)
 * for Pi-Rate Academy
 * ===================================================================
 * - Handles all dynamic content for the home page in Georgian.
 * - Enhanced mobile responsiveness and user experience.
 * - Features instructor pagination with asynchronous rating fetching.
 * - Redirects to a dedicated page for detailed instructor profiles.
 * - Implements a "Join Call" modal for student group calls.
 * - Automatically refreshes data when the page is loaded from cache.
 * ===================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('home.js script has started executing.');

    // ======================================================
    // =============== CONFIG & STATE MANAGEMENT ============
    // ======================================================
    const API_BASE_URL = '';
    const TEACHERS_PER_PAGE = 5;

    let state = {
        currentUser: null,
        teachers: [],
        myGroups: [],
        allUsers: [],
        currentPage: 1,
        totalPages: 1,
    };

    // ======================================================
    // =============== DOM ELEMENT SELECTORS ================
    // ======================================================
    const teacherGrid = document.getElementById('teacher-grid');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const pageInfo = document.getElementById('page-info');
    const joinCallBtn = document.getElementById('join-call-btn');
    const zoomModal = document.getElementById('zoom-modal');

    // ======================================================
    // =============== API HELPER ===========================
    // ======================================================
    /**
     * A robust helper function for making authenticated API requests.
     * @param {string} endpoint - The API endpoint to call.
     * @param {object} options - The options for the fetch call.
     * @returns {Promise<any>} The JSON response from the server.
     */
    async function apiFetch(endpoint, options = {}) {
        const token = localStorage.getItem('piRateToken');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'API შეცდომა მოხდა');
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
        try {
            showLoadingState();
            
            const token = localStorage.getItem('piRateToken');
            const promises = [
                apiFetch('/api/users/teachers'),
                token ? apiFetch('/api/users/profile') : Promise.resolve(null),
                token ? apiFetch('/api/groups/my-groups') : Promise.resolve([]),
                token ? apiFetch('/api/users') : Promise.resolve(null)
            ];

            const [teachers, user, groups, allUsers] = await Promise.all(promises);
            
            state.teachers = teachers;
            state.currentUser = user;
            state.myGroups = groups;
            state.allUsers = allUsers?.data || allUsers || [];
            state.totalPages = Math.ceil(teachers.length / TEACHERS_PER_PAGE) || 1;

            renderTeachersPage();
            setupEventListeners();
            setupScrollAnimations();
            
            hideLoadingState();
        } catch (error) {
            console.error('Failed to initialize home page:', error);
            hideLoadingState();
            if (teacherGrid) {
                teacherGrid.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 40px;">ინსტრუქტორების მონაცემების ჩატვირთვა ვერ მოხერხდა.</p>`;
            }
        }
    }

    function showLoadingState() {
        if (teacherGrid) {
            teacherGrid.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>იტვირთება...</p>
                </div>
            `;
        }
    }

    function hideLoadingState() {
        // Remove loading spinner if exists
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
        if (!teacherGrid) return;
        const start = (state.currentPage - 1) * TEACHERS_PER_PAGE;
        const end = start + TEACHERS_PER_PAGE;
        const paginatedTeachers = state.teachers.slice(start, end);

        if (paginatedTeachers.length === 0) {
            teacherGrid.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 40px;">ინსტრუქტორები ვერ მოიძებნა.</p>`;
            return;
        }

        teacherGrid.innerHTML = paginatedTeachers.map(teacher => {
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
        
        paginatedTeachers.forEach(t => fetchAndRenderAverageRating(t._id));
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
        if (!pageInfo || !prevPageBtn || !nextPageBtn) return;
        pageInfo.textContent = `გვერდი ${state.currentPage} / ${state.totalPages}`;
        prevPageBtn.disabled = state.currentPage === 1;
        nextPageBtn.disabled = state.currentPage === state.totalPages;
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
        prevPageBtn?.addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                renderTeachersPage();
                window.scrollTo({ top: teacherGrid.offsetTop - 100, behavior: 'smooth' });
            }
        });
        
        nextPageBtn?.addEventListener('click', () => {
            if (state.currentPage < state.totalPages) {
                state.currentPage++;
                renderTeachersPage();
                window.scrollTo({ top: teacherGrid.offsetTop - 100, behavior: 'smooth' });
            }
        });

        // Event delegation for clicking on teacher cards
        teacherGrid?.addEventListener('click', (e) => {
            const card = e.target.closest('.teacher-card');
            if (card && card.dataset.teacherId) {
                // Redirect to the dedicated instructor profile page
                window.location.href = `../instructor-profile/instructor-profile.html?id=${card.dataset.teacherId}`;
            }
        });

        // "Join Call" button and modal
        joinCallBtn?.addEventListener('click', () => {
            console.log('Join Call button clicked.');

            if (!state.currentUser) {
                return alert('გთხოვთ, ჯერ გაიაროთ ავტორიზაცია.');
            }
            
            if (!state.myGroups || state.myGroups.length === 0) {
                return alert('თქვენ არ ხართ რომელიმე ჯგუფში დარეგისტრირებული.');
            }

            if (!zoomModal) {
                console.error('Zoom modal element not found.');
                return;
            }
            
            console.log('User has groups. Filtering groups with Zoom links...');
            const groupsWithLinks = state.myGroups.filter(group => group.zoomLink);
            console.log(`Found ${groupsWithLinks.length} group(s) with Zoom links.`);

            if (groupsWithLinks.length === 0) {
                const groupList = zoomModal.querySelector('#group-list');
                if (groupList) {
                    groupList.innerHTML = `<p style="text-align:center; color: var(--text-secondary);">ამჟამად არ არის ხელმისაწვდომი ზუმის ზარები.</p>`;
                }
                console.log('No Zoom links found. Displaying empty modal with message.');
                zoomModal.classList.remove('hidden');
                return;
            }

            if (groupsWithLinks.length === 1) {
                console.log('Only one group with a Zoom link found. Redirecting directly...');
                window.open(groupsWithLinks[0].zoomLink, '_blank');
            } else {
                console.log('Multiple groups with Zoom links found. Displaying selection modal...');
                const groupList = zoomModal.querySelector('#group-list');
                groupList.innerHTML = '';

                // Add checks to prevent crashes if state.allUsers is not an array
                const adminUser = (Array.isArray(state.allUsers) ? state.allUsers.find(u => u.role === 'Admin') : null);

                groupsWithLinks.forEach(group => {
                    const btn = document.createElement('button');
                    
                    // Add a check to prevent crashes if group.users is not an array
                    const teacher = (Array.isArray(group.users) ? group.users.find(u => u.role === 'Teacher') : null) || adminUser;

                    if (teacher) {
                        btn.textContent = `ჯგუფის შეკრება: ${group.name} (${teacher.firstName} ${teacher.lastName})`;
                    } else {
                        btn.textContent = `ჯგუფის შეკრება: ${group.name}`;
                    }
                    
                    btn.onclick = () => window.open(group.zoomLink, '_blank');
                    groupList.appendChild(btn);
                });
                zoomModal.classList.remove('hidden');
            }
        });

        // Listeners for closing modals
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => { 
                if(e.target === modal) modal.classList.add('hidden'); 
            });
            modal.querySelector('.close-modal')?.addEventListener('click', () => modal.classList.add('hidden'));
        });
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
