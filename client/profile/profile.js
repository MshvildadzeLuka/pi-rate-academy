document.addEventListener('DOMContentLoaded', () => {
    // ======================================================
    // =============== CONFIG & API HELPERS =================
    // ======================================================
    const API_BASE_URL = 'http://localhost:5001'; // Use relative paths for better portability

    /**
     * An intelligent helper function to make authenticated API requests.
     * It now correctly handles both JSON data and FormData for file uploads.
     */
    async function apiFetch(endpoint, options = {}) {
        const token = localStorage.getItem('piRateToken');
        const headers = { ...options.headers };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Do NOT set Content-Type for FormData; the browser does it automatically.
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'An API error occurred');
        }
        
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return null;
        }
        return response.json();
    }

    // --- STATE MANAGEMENT ---
    let currentUser = null;

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
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const newPasswordInput = document.getElementById('password-new');
    const strengthBar = document.querySelector('.strength-level');
    const strengthText = document.querySelector('.strength-text');
    const teacherFields = document.getElementById('teacher-fields');

    /**
     * Main initialization function
     */
    async function init() {
        try {
            currentUser = await apiFetch('/api/users/profile');
            if (currentUser) {
                populateProfileData(currentUser);
                setupEventListeners();
            } else {
                throw new Error('User not found.');
            }
        } catch (error) {
            console.error('Failed to initialize profile page:', error);
            localStorage.removeItem('piRateToken');
            window.location.href = '../login/login.html';
        }
    }

    /**
     * Fills all UI elements with the current user's data.
     */
    function populateProfileData(user) {
        imgDisplay.src = user.photoUrl || `https://placehold.co/150x150/2A2A2A/EAEAEA?text=${user.firstName[0]}${user.lastName[0]}`;
        fullNameDisplay.textContent = `${user.firstName} ${user.lastName}`;
        emailDisplay.textContent = user.email;
        roleBadge.textContent = user.role;
        roleBadge.className = `role-badge ${user.role.toLowerCase()}`;

        infoForm.querySelector('[name="firstName"]').value = user.firstName;
        infoForm.querySelector('[name="lastName"]').value = user.lastName;
        infoForm.querySelector('[name="email"]').value = user.email;

        if (user.role === 'Teacher' || user.role === 'Admin') {
            teacherFields.classList.remove('hidden');
            infoForm.querySelector('[name="aboutMe"]').value = user.aboutMe || '';
        } else {
            teacherFields.classList.add('hidden');
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
        newPasswordInput.addEventListener('input', () => updatePasswordStrength(newPasswordInput.value));
    }

    /**
     * Handles the submission of the user information form.
     */
    async function handleInfoUpdate(e) {
        e.preventDefault();
        const formData = new FormData(infoForm);
        const updatedData = Object.fromEntries(formData.entries());

        try {
            const updatedUser = await apiFetch('/api/users/profile', {
                method: 'PUT',
                body: JSON.stringify(updatedData),
            });

            currentUser = { ...currentUser, ...updatedUser };
            populateProfileData(currentUser);
            showNotification('Profile updated successfully!', 'success');

            const headerName = document.querySelector('.header-container .profile-name');
            if (headerName) headerName.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Handles the submission of the password change form.
     */
    async function handlePasswordUpdate(e) {
        e.preventDefault();
        const newPass = newPasswordInput.value;
        const confirmPass = document.getElementById('password-confirm').value;

        if (newPass !== confirmPass) {
            return showNotification('Error: New passwords do not match.', 'error');
        }

        try {
            await apiFetch('/api/users/profile', {
                method: 'PUT',
                body: JSON.stringify({ password: newPass }),
            });
            showNotification('Password changed successfully!', 'success');
            passwordForm.reset();
            updatePasswordStrength('');
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Handles the file selection and uploads the profile picture as a file.
     */
    async function handlePictureUpload(e) {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        const formData = new FormData();
        formData.append('photo', file);

        try {
            const updatedUser = await apiFetch('/api/users/profile/photo', {
                method: 'PUT',
                body: formData,
            });
            
            imgDisplay.src = updatedUser.photoUrl;
            currentUser.photoUrl = updatedUser.photoUrl;
            
            updateProfileCompletion(currentUser);
            showNotification('Profile picture updated!', 'success');

            const headerImg = document.querySelector('.header-container .profile-img');
            if (headerImg) headerImg.src = updatedUser.photoUrl;
        } catch (error) {
            showNotification(`Error updating picture: ${error.message}`, 'error');
        }
    }
    
    /**
     * Calculates and displays the profile completion percentage.
     */
    function updateProfileCompletion(user) {
        const totalPoints = user.role === 'Teacher' ? 3 : 2;
        let score = 0;
        if (user.firstName && user.lastName) score++;
        if (user.photoUrl && !user.photoUrl.includes('placehold.co')) score++;
        if (user.role === 'Teacher' && user.aboutMe && user.aboutMe.trim() !== '') score++;
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
            1: { text: 'Very Weak', color: '#e74c3c', width: '20%' },
            2: { text: 'Weak', color: '#f39c12', width: '40%' },
            3: { text: 'Medium', color: '#f1c40f', width: '60%' },
            4: { text: 'Strong', color: '#2ecc71', width: '80%' },
            5: { text: 'Very Strong', color: '#27ae60', width: '100%' },
        };

        const level = levels[strength];
        strengthBar.style.width = level.width;
        strengthBar.style.backgroundColor = level.color;
        strengthText.textContent = password.length === 0 ? '' : `Password strength: ${level.text}`;
        strengthText.style.color = level.color;
    }

    /**
     * Displays a temporary notification on the screen.
     */
    function showNotification(message, type) {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // --- INITIALIZE THE APP ---
    init();
});