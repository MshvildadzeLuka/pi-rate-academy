document.addEventListener('DOMContentLoaded', () => {
    // ======================================================
    // =============== CONFIG & API HELPERS =================
    // ======================================================
    const API_BASE_URL = ''; // Use relative paths for better portability
    const ROLES = {
        STUDENT: 'Student',
        TEACHER: 'Teacher',
        ADMIN: 'Admin'
    };

    /**
     * A robust and centralized helper function to make authenticated API requests.
     */
    async function apiFetch(endpoint, options = {}) {
        const token = localStorage.getItem('piRateToken');
        const headers = { ...options.headers };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('piRateToken');
            window.location.href = '/login/login.html';
            throw new Error('Authentication required');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `An API error occurred: ${response.statusText}`);
        }
        
        return response.status === 204 || response.headers.get('content-length') === '0' ? null : response.json();
    }

    // --- STATE MANAGEMENT ---
    let currentUser = null;
    let studentPointsHistory = [];

    // --- DOM ELEMENT SELECTORS ---
    const imgDisplay = document.getElementById('profile-img-display');
    const avatarContainer = document.getElementById('avatar-container');
    const pictureUploadInput = document.getElementById('picture-upload-input');
    const fullNameDisplay = document.getElementById('profile-full-name');
    const emailDisplay = document.getElementById('profile-email');
    const roleBadge = document.getElementById('profile-role-badge');
    const completionProgress = document.getElementById('completion-progress');
    const completionPercentage = document.getElementById('completion-percentage');
    const infoForm = document.getElementById('info-form');
    const passwordForm = document.getElementById('password-form');
    const aboutForm = document.getElementById('about-form'); // New form for 'about me'
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const newPasswordInput = document.getElementById('password-new');
    const strengthBar = document.querySelector('.strength-level');
    const strengthText = document.querySelector('.strength-text');
    const socialFields = document.getElementById('social-fields');
    const mobileField = document.getElementById('mobile-field');
    const pointsTabBtn = document.getElementById('points-tab-btn'); // Corrected ID
    const pointsSummary = document.getElementById('points-summary');
    const weeklyPointsListWrapper = document.getElementById('weekly-points-list-wrapper'); // Added wrapper
    const pointsHistoryList = document.getElementById('weekly-points-list');
    const pointsLoadingState = document.getElementById('points-loading');
    const totalPointsDisplay = document.getElementById('total-points');
    const pointsDetailModal = document.getElementById('points-detail-modal');
    const teacherAboutCard = document.getElementById('teacher-about-card'); // New about me card

    /**
     * Main initialization function
     */
    async function init() {
        try {
            currentUser = await apiFetch('/api/users/profile');
            if (currentUser) {
                populateProfileData(currentUser);
                setupEventListeners();
                if (currentUser.role === ROLES.STUDENT) {
                    pointsTabBtn.classList.remove('hidden');
                    pointsSummary.classList.remove('hidden');
                    fetchStudentPoints();
                } else {
                    socialFields.classList.remove('hidden');
                    mobileField.classList.remove('hidden');
                    teacherAboutCard.classList.remove('hidden');
                }
            } else {
                throw new Error('User not found.');
            }
        } catch (error) {
            console.error('Failed to initialize profile page:', error);
            localStorage.removeItem('piRateToken');
            window.location.href = '/login/login.html';
        }
    }

    /**
     * Fetches the student's points history.
     */
    async function fetchStudentPoints() {
        if (!currentUser || currentUser.role !== ROLES.STUDENT) return;

        pointsLoadingState.classList.remove('hidden');
        try {
            const response = await apiFetch('/api/users/profile/points');
            studentPointsHistory = response.data || [];
            renderPointsHistory();
        } catch (error) {
            console.error('Failed to fetch points history:', error);
            pointsHistoryList.innerHTML = `<p style="text-align: center; color: var(--danger-accent);">ქულების ისტორიის ჩატვირთვა ვერ მოხერხდა.</p>`;
        } finally {
            pointsLoadingState.classList.add('hidden');
        }
    }

    /**
     * Renders the student's points history on the page.
     */
    function renderPointsHistory() {
        pointsHistoryList.innerHTML = '';
        if (studentPointsHistory.length === 0) {
            pointsHistoryList.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">ქულების ისტორია არ მოიძებნა.</p>`;
            totalPointsDisplay.textContent = '0';
            return;
        }

        const totalEarned = studentPointsHistory.reduce((sum, week) => sum + week.totalPointsEarned, 0);
        const totalPossible = studentPointsHistory.reduce((sum, week) => sum + week.totalPointsPossible, 0);
        const percentage = totalPossible > 0 ? ((totalEarned / totalPossible) * 100).toFixed(0) : 0;
        
        totalPointsDisplay.textContent = `${totalEarned} / ${totalPossible} (${percentage}%)`;

        studentPointsHistory.forEach(week => {
            const weekStart = getStartOfWeekFromYearAndWeek(week._id.year, week._id.week);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);

            const item = document.createElement('div');
            item.className = 'weekly-item';
            item.dataset.weekId = `${week._id.year}-${week._id.week}`;
            item.innerHTML = `
                <div class="week-info">
                    <h4>კვირა ${week._id.week}, ${week._id.year}</h4>
                    <p>${weekStart.toLocaleDateString('ka-GE')} - ${weekEnd.toLocaleDateString('ka-GE')}</p>
                </div>
                <div class="week-total">${week.totalPointsEarned} / ${week.totalPointsPossible}</div>
            `;
            pointsHistoryList.appendChild(item);

            item.addEventListener('click', () => {
                renderWeeklyDetails(week);
            });
        });
    }

    /**
     * Renders detailed points for a specific week in a modal.
     */
    function renderWeeklyDetails(weekData) {
        const modalTitle = pointsDetailModal.querySelector('#points-modal-title');
        const detailsList = pointsDetailModal.querySelector('#weekly-details-list');

        modalTitle.textContent = `კვირა ${weekData._id.week}, ${weekData._id.year} - დეტალები`;
        detailsList.innerHTML = '';
        
        // Ensure the modal body is scrollable if content overflows
        pointsDetailModal.querySelector('.modal-body').style.overflowY = 'auto';

        weekData.activities.forEach(activity => {
            const item = document.createElement('li');
            item.className = 'activity-item';
            
            // Correctly calculate score and percentage
            const pointsEarned = activity.pointsEarned !== null ? activity.pointsEarned : 'N/A';
            const pointsPossible = activity.pointsPossible !== null ? activity.pointsPossible : 'N/A';
            const percentage = pointsPossible > 0 ? ((activity.pointsEarned / activity.pointsPossible) * 100).toFixed(0) : 0;
            
            item.innerHTML = `
                <h5>${activity.sourceTitle}</h5>
                <p class="activity-details">
                    ტიპი: ${activity.sourceType === 'assignment' ? 'დავალება' : 'ქვიზი'}<br>
                    ქულა: <span class="score">${pointsEarned} / ${pointsPossible} (${percentage}%)</span><br>
                    თარიღი: ${new Date(activity.awardedAt).toLocaleString('ka-GE')}
                </p>
            `;
            detailsList.appendChild(item);
        });
        
        pointsDetailModal.classList.remove('hidden');
    }

    /**
     * Fills all UI elements with the current user's data.
     */
    function populateProfileData(user) {
        imgDisplay.src = user.photoUrl || `https://placehold.co/150x150/121212/EAEAEA?text=${user.firstName[0]}${user.lastName[0]}`;
        fullNameDisplay.textContent = `${user.firstName} ${user.lastName}`;
        emailDisplay.textContent = user.email;
        roleBadge.textContent = user.role;
        roleBadge.className = `role-badge ${user.role.toLowerCase()}`;

        infoForm.querySelector('[name="firstName"]').value = user.firstName;
        infoForm.querySelector('[name="lastName"]').value = user.lastName;
        infoForm.querySelector('[name="email"]').value = user.email;
        infoForm.querySelector('[name="mobileNumber"]').value = user.mobileNumber || '';

        // Handle role-specific field visibility
        if (user.role === ROLES.STUDENT) {
            document.getElementById('points-tab-btn').classList.remove('hidden');
            document.getElementById('points-summary').classList.remove('hidden');
            document.getElementById('social-fields').classList.add('hidden');
            document.getElementById('mobile-field').classList.add('hidden');
            document.getElementById('teacher-about-card').classList.add('hidden');
        } else {
            document.getElementById('points-tab-btn').classList.add('hidden');
            document.getElementById('points-summary').classList.add('hidden');
            document.getElementById('social-fields').classList.remove('hidden');
            document.getElementById('mobile-field').classList.remove('hidden');
            document.getElementById('teacher-about-card').classList.remove('hidden');
            
            // Populate social links and about me
            aboutForm.querySelector('[name="aboutMe"]').value = user.aboutMe || '';
            infoForm.querySelector('[name="socials.facebook"]').value = user.socials?.facebook || '';
            infoForm.querySelector('[name="socials.instagram"]').value = user.socials?.instagram || '';
            infoForm.querySelector('[name="socials.twitter"]').value = user.socials?.twitter || '';
            infoForm.querySelector('[name="socials.linkedin"]').value = user.socials?.linkedin || '';
            infoForm.querySelector('[name="socials.github"]').value = user.socials?.github || '';
        }

        updateProfileCompletion(user);
    }

    /**
     * Attaches all necessary event listeners.
     */
    function setupEventListeners() {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
            });
        });

        avatarContainer.addEventListener('click', () => pictureUploadInput.click());
        pictureUploadInput.addEventListener('change', handlePictureUpload);
        infoForm.addEventListener('submit', handleInfoUpdate);
        passwordForm.addEventListener('submit', handlePasswordUpdate);
        aboutForm.addEventListener('submit', handleAboutMeUpdate);
        newPasswordInput.addEventListener('input', () => updatePasswordStrength(newPasswordInput.value));
        pointsDetailModal.querySelector('.close-modal-btn').addEventListener('click', () => pointsDetailModal.classList.add('hidden'));
    }

    /**
     * Handles the submission of the user information form.
     */
    async function handleInfoUpdate(e) {
        e.preventDefault();
        const formData = new FormData(infoForm);
        const updatedData = {
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            mobileNumber: formData.get('mobileNumber'),
            socials: {
                facebook: formData.get('socials.facebook'),
                instagram: formData.get('socials.instagram'),
                twitter: formData.get('socials.twitter'),
                linkedin: formData.get('socials.linkedin'),
                github: formData.get('socials.github'),
            }
        };

        try {
            const response = await apiFetch('/api/users/profile', {
                method: 'PUT',
                body: JSON.stringify(updatedData),
            });

            currentUser = { ...currentUser, ...response };
            populateProfileData(currentUser);
            showNotification('პროფილი წარმატებით განახლდა!', 'success');

            const headerName = document.querySelector('.header-container .profile-name');
            if (headerName) headerName.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
        } catch (error) {
            showNotification(`შეცდომა: ${error.message}`, 'error');
        }
    }
    
    /**
     * Handles the submission of the "About Me" form.
     */
    async function handleAboutMeUpdate(e) {
        e.preventDefault();
        const formData = new FormData(aboutForm);
        const updatedData = {
            aboutMe: formData.get('aboutMe'),
        };

        try {
            const response = await apiFetch('/api/users/profile', {
                method: 'PUT',
                body: JSON.stringify(updatedData),
            });
            currentUser = { ...currentUser, ...response };
            populateProfileData(currentUser);
            showNotification('ბიოგრაფია წარმატებით განახლდა!', 'success');
        } catch (error) {
            showNotification(`შეცდომა: ${error.message}`, 'error');
        }
    }


    /**
     * Handles the submission of the password change form.
     */
    async function handlePasswordUpdate(e) {
        e.preventDefault();
        const currentPass = document.getElementById('password-current').value;
        const newPass = newPasswordInput.value;
        const confirmPass = document.getElementById('password-confirm').value;

        if (newPass !== confirmPass) {
            return showNotification('შეცდომა: ახალი პაროლები არ ემთხვევა.', 'error');
        }
        
        // Client-side password validation
        if (newPass.length < 8) {
             return showNotification('შეცდომა: პაროლი უნდა შედგებოდეს მინიმუმ 8 სიმბოლოსგან.', 'error');
        }

        try {
            await apiFetch('/api/users/profile/password', {
                method: 'PUT',
                body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass, confirmPassword: confirmPass }),
            });
            showNotification('პაროლი წარმატებით შეიცვალა!', 'success');
            passwordForm.reset();
            updatePasswordStrength('');
        } catch (error) {
            showNotification(`შეცდომა: ${error.message}`, 'error');
        }
    }

    /**
     * Handles the file selection and uploads the profile picture.
     */
    async function handlePictureUpload(e) {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        const formData = new FormData();
        formData.append('photo', file);

        try {
            const response = await apiFetch('/api/users/profile/photo', {
                method: 'PUT',
                body: formData,
            });
            
            imgDisplay.src = response.photoUrl;
            currentUser.photoUrl = response.photoUrl;
            
            updateProfileCompletion(currentUser);
            showNotification('პროფილის სურათი განახლდა!', 'success');

            const headerImg = document.querySelector('.header-container .profile-img');
            if (headerImg) headerImg.src = response.photoUrl;
        } catch (error) {
            showNotification(`შეცდომა სურათის განახლებისას: ${error.message}`, 'error');
        }
    }
    
    /**
     * Calculates and displays the profile completion percentage.
     */
    function updateProfileCompletion(user) {
        const isTeacherOrAdmin = [ROLES.TEACHER, ROLES.ADMIN].includes(user.role);
        
        const totalPoints = isTeacherOrAdmin ? 6 : 2; // + mobile, about, socials
        let score = 0;
        
        if (user.firstName && user.lastName) score++;
        if (user.photoUrl && !user.photoUrl.includes('placehold.co')) score++;
        
        if (isTeacherOrAdmin) {
          if (user.aboutMe && user.aboutMe.trim() !== '') score++;
          if (user.mobileNumber) score++;
          
          if (user.socials) {
            if (user.socials.facebook) score++;
            if (user.socials.instagram) score++;
          }
        }
        
        const percentage = Math.round((score / totalPoints) * 100);
        if (completionProgress) completionProgress.style.width = `${percentage}%`;
        if (completionPercentage) completionPercentage.textContent = `${percentage}%`;
    }


    /**
     * Updates the password strength meter based on the input value.
     */
    function updatePasswordStrength(password) {
        let strength = 0;
        if (password.length > 0) {
            if (password.length >= 8) strength++;
            if (/[a-z]/.test(password)) strength++;
            if (/[A-Z]/.test(password)) strength++;
            if (/[0-9]/.test(password)) strength++;
            if (/[^a-zA-Z0-9]/.test(password)) strength++;
        }
        
        const levels = {
            0: { text: '', color: 'transparent', width: '0%' },
            1: { text: 'ძალიან სუსტი', color: '#e74c3c', width: '20%' },
            2: { text: 'სუსტი', color: '#f39c12', width: '40%' },
            3: { text: 'საშუალო', color: '#f1c40f', width: '60%' },
            4: { text: 'ძლიერი', color: '#2ecc71', width: '80%' },
            5: { text: 'ძალიან ძლიერი', color: '#27ae60', width: '100%' },
        };

        const level = levels[strength];
        strengthBar.style.width = level.width;
        strengthBar.style.backgroundColor = level.color;
        strengthText.textContent = password.length === 0 ? '' : `პაროლის სიძლიერე: ${level.text}`;
        strengthText.style.color = level.color;
    }

    /**
     * Displays a temporary notification on the screen.
     */
    function showNotification(message, type) {
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      notification.innerHTML = `
        <span class="icon">
          <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        </span>
        <span class="message">${message}</span>
      `;
      document.body.appendChild(notification);
      setTimeout(() => notification.classList.add('show'), 10);
      setTimeout(() => {
          notification.classList.remove('show');
          setTimeout(() => notification.remove(), 300);
      }, 3000);
    }
    
    function getStartOfWeekFromYearAndWeek(year, week) {
        const date = new Date(year, 0, 1 + (week - 1) * 7);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    }


    // --- INITIALIZE THE APP ---
    init();
});
