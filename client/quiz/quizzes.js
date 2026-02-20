// quizzes.js (Enhanced Version)
// Comprehensive solution for Pi-Rate Academy Quiz System
// =========================================================================

// Constants
const QUIZ_ACTIONS = {
    CLOSE_MODAL: 'close-modal',
    VIEW_DETAIL: 'view-detail',
    BACK_TO_LIST: 'back-to-list',
    CREATE_QUIZ: 'create-quiz',
    EDIT_QUIZ: 'edit-quiz',
    DELETE_QUIZ: 'delete-quiz',
    CHANGE_TAB: 'change-tab',
    START_QUIZ: 'start-quiz',
    NEXT_QUESTION: 'next-question',
    PREV_QUESTION: 'prev-question',
    FINISH_QUIZ: 'finish-quiz',
    SELECT_OPTION: 'select-option',
    ADD_QUESTION: 'add-question',
    DELETE_QUESTION: 'delete-question',
    MOVE_QUESTION_UP: 'move-question-up',
    MOVE_QUESTION_DOWN: 'move-question-down',
    ADD_OPTION: 'add-option',
    DELETE_OPTION: 'delete-option',
    VIEW_STUDENT_ATTEMPT: 'view-student-attempt',
    VIEW_INSTRUCTIONS: 'view-instructions',
    ADD_FROM_BANK: 'add-from-bank',
    REQUEST_RETAKE: 'request-retake',
    REVIEW_QUIZ: 'review-quiz',
    SELECT_QUIZ_FROM_BANK: 'select-quiz-from-bank',
    DUPLICATE_QUIZ: 'duplicate-quiz', // NEW: Added
    RETAKE_QUIZ: 'retake-quiz' // NEW: Added
};

const QUIZ_STATUS = {
    UPCOMING: 'upcoming',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    PAST_DUE: 'past-due',
    GRADED: 'graded',
    'NOT ATTEMPTED': 'not attempted',
    'IN_PROGRESS': 'in-progress'
};

const ROLES = {
    TEACHER: 'Teacher',
    ADMIN: 'Admin',
    STUDENT: 'Student'
};

const API_BASE_URL = '/api';

// State management with validation
const state = {
    currentUser: null,
    groups: [],
    studentQuizzes: [],
    activeTab: 'active',
    isLoading: true,
    currentView: 'list',
    detailedQuiz: null,
    selectedGroupId: null,
    activeQuizAttempt: null,
    currentQuestionIndex: 0,
    activeSubView: 'quizzes',
    questionBanks: [],
    quizTimer: null,
    quizBank: [],
    modalStack: [] // For handling layered modals
};

// DOM Elements with null checks
const elements = {
    get container() { return document.querySelector('.quizzes-container'); },
    get teacherControls() { return document.getElementById('teacher-admin-controls'); },
    get groupSelect() { return document.getElementById('group-select'); },
    get createBtn() { return document.getElementById('create-quiz-btn'); },
    get tabsNav() { return document.getElementById('tabs-nav'); },
    get listView() { return document.getElementById('quiz-list-view'); },
    get detailView() { return document.getElementById('quiz-detail-view'); },
    get modalBackdrop() { return document.getElementById('modal-backdrop'); },
    get globalLoading() { return document.getElementById('global-loading'); }
};

// Utility Functions with enhanced error handling
const utils = {

    /**
     * A robust and centralized function to tell MathJax to render formulas
     * within a specific HTML element. This is the key to rendering LaTeX
     * in dynamically added content.
     * @param {HTMLElement} element The parent element containing the new content to be rendered.
     */
    renderMath(element) {
        if (window.MathJax && window.MathJax.typesetPromise) {
            // This clears any previous typesetting on the element before re-rendering.
            // It prevents potential issues with content that changes rapidly.
            window.MathJax.startup.promise = window.MathJax.startup.promise
                .then(() => window.MathJax.typesetPromise([element]))
                .catch((err) => console.error('MathJax typeset error:', err));
        }
    },


    // Calculate quiz status with improved logic
    calculateQuizStatus(quiz) {
        try {
            if (!quiz) return QUIZ_STATUS['NOT ATTEMPTED'];
            
            const now = new Date();
            let startTime, endTime;
            
            // Determine the source of dates based on quiz structure
            if (quiz.startTime && quiz.endTime) {
                // Direct dates (template)
                startTime = new Date(quiz.startTime);
                endTime = new Date(quiz.endTime);
            } else if (quiz.templateId && quiz.templateId.startTime && quiz.templateId.endTime) {
                // Dates from template
                startTime = new Date(quiz.templateId.startTime);
                endTime = new Date(quiz.templateId.endTime);
            } else if (quiz.dueDate) {
                // Student quiz with due date
                startTime = new Date(quiz.startTime || now);
                endTime = new Date(quiz.dueDate);
            } else {
                console.error('Quiz missing date information:', quiz);
                return QUIZ_STATUS['NOT ATTEMPTED'];
            }
            
            // Validate dates
            if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
                console.error('Invalid quiz dates:', quiz);
                return QUIZ_STATUS['NOT ATTEMPTED'];
            }
            
            // For students, check their specific status first
            if (state.currentUser.role === ROLES.STUDENT) {
                if (quiz.status && Object.values(QUIZ_STATUS).includes(quiz.status)) {
                    return quiz.status;
                }
                
                if (quiz.grade && quiz.grade.score !== undefined && quiz.grade.score !== null) {
                    return QUIZ_STATUS.GRADED;
                }
                
                if (quiz.submission && quiz.submission.submittedAt) {
                    return QUIZ_STATUS.COMPLETED;
                }
                
                if (quiz.currentAttempt && quiz.currentAttempt.status === 'in-progress') {
                    return QUIZ_STATUS.IN_PROGRESS;
                }
            }
            
            // Status based on time
            if (now < startTime) return QUIZ_STATUS.UPCOMING;
            if (now > endTime) {
                return state.currentUser.role === ROLES.STUDENT ? 
                    QUIZ_STATUS.PAST_DUE : QUIZ_STATUS.COMPLETED;
            }
            
            return QUIZ_STATUS.ACTIVE;
        } catch (error) {
            console.error('Error calculating quiz status:', error);
            return QUIZ_STATUS['NOT ATTEMPTED'];
        }
    },
    
    // Format datetime for input fields
    formatDateTimeLocal(date) {
        try {
            if (!(date instanceof Date)) date = new Date(date);
            if (isNaN(date.getTime())) return '';
            
            const pad = (num) => num.toString().padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        } catch (error) {
            console.error('Error formatting date:', error);
            return '';
        }
    },
    
    // Format date for display
    formatDate(dateStr) {
        try {
            if (!dateStr) return 'Invalid Date';
            
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'Invalid Date';
            
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting date for display:', error);
            return 'Invalid Date';
        }
    },
    
    // Safe HTML escaping
    escapeHTML(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    
    // Sanitize HTML with DOMPurify
    sanitizeHTML(str) {
        if (typeof str !== 'string') return '';
        try {
            return DOMPurify.sanitize(str);
        } catch (error) {
            console.error('Error sanitizing HTML:', error);
            return this.escapeHTML(str);
        }
    },
    
    // Validate quiz data with comprehensive checks
    validateQuizData(quizData) {
        const errors = [];

        // --- Top-Level Quiz Validation ---
        if (!quizData.title || quizData.title.trim() === '') {
            errors.push('Quiz title is required.');
        }
        if (!quizData.groupId) {
            errors.push('A group must be selected.');
        }
        if (!quizData.startTime || !quizData.endTime) {
            errors.push('Both a start and end time are required.');
        } else {
            const startDate = new Date(quizData.startTime);
            const endDate = new Date(quizData.endTime);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                errors.push('The start or end time is not a valid date.');
            } else if (endDate <= startDate) {
                errors.push('End time must be after start time.');
            }
        }

        // --- Detailed Question Validation ---
        if (!quizData.questions || quizData.questions.length === 0) {
            errors.push('A quiz must have at least one question.');
        } else {
            quizData.questions.forEach((question, index) => {
                if (!question.text || question.text.trim() === '') {
                    errors.push(`Question #${index + 1} text cannot be empty.`);
                }
                if (!question.options || question.options.length < 2) {
                    errors.push(`Question #${index + 1} must have at least two answer options.`);
                } else if (!question.options.some(opt => opt.isCorrect)) {
                    errors.push(`Question #${index + 1} must have one correct answer selected.`);
                }
                if (isNaN(parseInt(question.points)) || question.points < 0) {
                    errors.push(`Question #${index + 1} must have a valid, non-negative point value.`);
                }
            });
        }
        
        return errors;
    },
    
    // Format score display
    formatScore(score, total) {
        if (score === undefined || score === null || total === undefined || total === null) {
            return 'N/A';
        }
        
        const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
        return `${score}/${total} (${percentage}%)`;
    },
    
    // Start timer with robust error handling
    startTimer(duration, onTick, onComplete) {
        try {
            let timeLeft = duration;
            onTick(timeLeft);
            
            return setInterval(() => {
                timeLeft--;
                onTick(timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(state.quizTimer);
                    onComplete();
                }
            }, 1000);
        } catch (error) {
            console.error('Error starting timer:', error);
            return null;
        }
    },
    
    // Shuffle array (Fisher-Yates algorithm)
    shuffleArray(array) {
        try {
            const newArray = [...array];
            for (let i = newArray.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
            }
            return newArray;
        } catch (error) {
            console.error('Error shuffling array:', error);
            return array;
        }
    },
    
    // Validate MongoDB ObjectId
    isValidObjectId(id) {
        return id && typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/);
    },
    
    // Debounce function for performance
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Generate a unique ID for temporary elements
    generateTempId() {
        return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
};

// API Service with enhanced error handling and retry logic
const apiService = {
    // Generic fetch with retry logic
    async fetch(endpoint, options = {}) {
        try {
            const token = localStorage.getItem('piRateToken');
            if (!token) {
                window.location.href = '/client/login/login.html';
                throw new Error('No authentication token found');
            }
            
            const headers = {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            };

            if (options.body && !(options.body instanceof FormData)) {
                headers['Content-Type'] = 'application/json';
            }

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                headers
            });

            if (response.status === 401) {
                localStorage.removeItem('piRateToken');
                window.location.href = '/client/login/login.html';
                throw new Error('Session expired. Please log in again.');
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `HTTP error ${response.status}` }));
                const error = new Error(errorData.message || 'An unknown error occurred');
                error.status = response.status;
                error.data = errorData;
                throw error;
            }

            return response.status === 204 ? null : response.json();
        } catch (error) {
            console.error(`API request to ${endpoint} failed:`, error);
            throw error; 
        }
    },
    
    // Fetch initial data with error handling
    async fetchInitialData() {
        try {
            // Promise.allSettled is great because it won't fail completely if one request fails.
            const [userResult, groupsResult] = await Promise.allSettled([
                this.fetch('/users/profile'),
                this.fetch('/groups')
            ]);
            
            if (userResult.status === 'rejected') {
                // If fetching the user fails, it's a critical error.
                throw new Error(`Failed to fetch user profile: ${userResult.reason.message}`);
            }
            
            // ✅ Robustness: Explicitly assign the user object. The /users/profile route returns it directly.
            const user = userResult.value; 

            // ✅ Robustness: Safely handle the groups response, which might have a .data wrapper.
            const groupsResponse = groupsResult.status === 'fulfilled' ? groupsResult.value : { data: [] };
            const groups = groupsResponse.data || groupsResponse || [];

            return { user, groups };
        } catch (error) {
            console.error('Failed to fetch initial data:', error);
            // This will trigger the redirect to login if the token is invalid
            if (error.message.includes('Session expired')) {
                return { user: null, groups: [] };
            }
            // Return empty state on other errors
            return { user: null, groups: [] };
        }
    },
    
    // Fetch student quizzes with status filtering
    async fetchStudentQuizzes(status) {
        try {
            let endpoint = '/quizzes/student';
            if (status && status !== 'all') {
                endpoint += `?status=${status}`;
            }
            const response = await this.fetch(endpoint);
            return response.data || response;
        } catch (error) {
            console.error('Failed to fetch student quizzes:', error);
            return [];
        }
    },
    
    // Fetch quizzes for a specific group (teacher view)
    async fetchQuizzesForGroup(groupId, status) {
        try {
            if (!utils.isValidObjectId(groupId)) {
                throw new Error('Invalid group ID');
            }
            
            let endpoint = `/quizzes/teacher/${groupId}`;
            if (status && status !== 'all') {
                endpoint += `?status=${status}`;
            }
            const response = await this.fetch(endpoint);
            return response.data || response;
        } catch (error) {
            console.error('Failed to fetch quizzes for group:', error);
            return [];
        }
    },
    
    // Fetch quiz by ID with validation
    async fetchQuizById(quizId, getRawResponse = false) {
        // This helper function works perfectly with the new fetch function.
        return this.fetch(`/quizzes/${quizId}`, {}, getRawResponse);
    },
    
    // Create a new quiz
    async createQuiz(quizData) {
        try {
            const validationErrors = utils.validateQuizData(quizData);
            if (validationErrors.length > 0) {
                throw new Error(validationErrors[0]);
            }
            
            // Calculate total points
            quizData.totalPoints = quizData.questions.reduce((sum, question) => {
                return sum + (parseInt(question.points) || 0);
            }, 0);
            
            const response = await this.fetch('/quizzes', {
                method: 'POST',
                body: JSON.stringify(quizData)
            });
            return response.data || response;
        } catch (error) {
            console.error('Failed to create quiz:', error);
            throw error;
        }
    },
    
    // Update an existing quiz
    async updateQuiz(quizId, quizData) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('Invalid quiz ID format');
            }
            
            const validationErrors = utils.validateQuizData(quizData);
            if (validationErrors.length > 0) {
                throw new Error(validationErrors[0]);
            }
            
            // Calculate total points
            quizData.totalPoints = quizData.questions.reduce((sum, question) => {
                return sum + (parseInt(question.points) || 0);
            }, 0);
            
            const response = await this.fetch(`/quizzes/${quizId}`, {
                method: 'PUT',
                body: JSON.stringify(quizData)
            });
            return response.data || response;
        } catch (error) {
            console.error('Failed to update quiz:', error);
            throw error;
        }
    },
    
    // Delete a quiz
    async deleteQuiz(quizId) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('Invalid quiz ID format');
            }
            
            const response = await this.fetch(`/quizzes/${quizId}`, { method: 'DELETE' });
            return response.data || response;
        } catch (error) {
            console.error('Failed to delete quiz:', error);
            throw error;
        }
    },

    // NEW LOGIC: Duplicate Quiz
    async duplicateQuiz(quizId, groupId) {
        try {
            const response = await this.fetch(`/quizzes/${quizId}/duplicate`, {
                method: 'POST',
                body: JSON.stringify({ groupId })
            });
            return response.data || response;
        } catch (error) {
            console.error('Failed to duplicate quiz:', error);
            throw error;
        }
    },

    // NEW LOGIC: Retake Quiz
    async retakeQuiz(studentQuizId) {
        try {
            const response = await this.fetch(`/quizzes/${studentQuizId}/retake`, {
                method: 'POST'
            });
            return response.data || response;
        } catch (error) {
            console.error('Failed to request retake:', error);
            throw error;
        }
    },

    // NEW LOGIC: Auto Save Answers
    async autoSaveAnswers(attemptId, answers) {
        try {
            return await this.fetch(`/quizzes/attempt/${attemptId}/autosave`, {
                method: 'PUT',
                body: JSON.stringify({ answers })
            });
        } catch (error) {
            console.warn('Auto-save failed silently in background:', error);
            // Don't throw to avoid disrupting UI
        }
    },
    
    // Start a quiz attempt
    async startQuizAttempt(quizId, password = null) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('Invalid quiz ID format');
            }
            
            const body = password ? { password } : {};
            const response = await this.fetch(`/quizzes/${quizId}/start`, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            return response.data || response;
        } catch (error) {
            console.error('Failed to start quiz attempt:', error);
            throw error;
        }
    },
    
    // Submit an answer (Legacy for single question, kept for safety)
    async submitAnswer(attemptId, questionId, selectedOptionIndex) {
        try {
            if (!utils.isValidObjectId(attemptId) || !utils.isValidObjectId(questionId)) {
                throw new Error('Invalid ID format');
            }
            
            const response = await this.fetch(`/quizzes/attempt/${attemptId}/answer`, {
                method: 'POST',
                body: JSON.stringify({
                    questionId,
                    selectedOptionIndex
                })
            });
            return response.data || response;
        } catch (error) {
            console.error('Failed to submit answer:', error);
            throw error;
        }
    },
    
    // Submit a quiz attempt
    async submitQuizAttempt(attemptId, answers) {
        try {
            if (!utils.isValidObjectId(attemptId)) {
                throw new Error('Invalid attempt ID format');
            }
            
            return this.fetch(`/quizzes/attempt/${attemptId}/submit`, {
                method: 'POST',
                body: JSON.stringify({ answers })
            });
        } catch (error) {
            console.error('Failed to submit quiz attempt:', error);
            throw error;
        }
    },
    
    // Fetch quiz results
    async fetchQuizResults(attemptId) {
        try {
            if (!utils.isValidObjectId(attemptId)) {
                throw new Error('Invalid attempt ID format');
            }
            
            const response = await this.fetch(`/quizzes/attempt/${attemptId}/results`);
            return response.data || response;
        } catch (error) {
            console.error('Failed to fetch quiz results:', error);
            throw error;
        }
    },
    
    // Fetch quiz analytics
    async fetchQuizAnalytics(quizId) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('Invalid quiz ID format');
            }
            
            const response = await this.fetch(`/quizzes/${quizId}/analytics`);
            return response.data || response;
        } catch (error) {
            console.error('Failed to fetch quiz analytics:', error);
            throw error;
        }
    },
    
    // Upload question image
    async uploadQuestionImage(file) {
        try {
            if (!file || !(file instanceof File)) {
                throw new Error('Invalid file provided');
            }
            
            const formData = new FormData();
            formData.append('image', file);
            
            const response = await this.fetch('/quizzes/questions/image-upload', {
                method: 'POST',
                body: formData
            });
            return response.data || response;
        } catch (error) {
            console.error('Failed to upload question image:', error);
            throw error;
        }
    },
    
    // Fetch question banks
    async fetchQuestionBanks(groupId) {
        try {
            if (!utils.isValidObjectId(groupId)) {
                throw new Error('Invalid group ID format');
            }
            
            const response = await this.fetch(`/quizzes/question-banks/${groupId}`);
            return response.data || response;
        } catch (error) {
            console.error('Failed to fetch question banks:', error);
            throw error;
        }
    },
    
    // Request a retake
    async requestRetake(quizId, reason) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('Invalid quiz ID format');
            }
            
            const response = await this.fetch('/assignments/requests', {
                method: 'POST',
                body: JSON.stringify({
                    requestableId: quizId,
                    requestableType: 'Quiz',
                    reason: reason
                })
            });
            return response.data || response;
        } catch (error) {
            console.error('Failed to request retake:', error);
            throw error;
        }
    },
    
    // Fetch quiz bank
    async fetchQuizBank() {
        try {
            const response = await this.fetch('/quizzes/bank');
            return response.data || response;
        } catch (error) {
            console.error('Failed to fetch quiz bank:', error);
            throw error;
        }
    },

    async fetchQuizTemplatesForGroup(groupId, status) {
        try {
            if (!utils.isValidObjectId(groupId)) throw new Error('Invalid group ID');
            const response = await this.fetch(`/quizzes/templates/${groupId}?status=${status}`);
            return response.data || [];
        } catch (error) {
            console.error('Failed to fetch quiz templates:', error);
            return [];
        }
    },

    async fetchRetakeRequests() {
        try {
            const response = await this.fetch('/assignments/requests?type=Quiz');
            return response.data || [];
        } catch (error) {
            console.error('Failed to fetch retake requests:', error);
            return [];
        }
    },
};

// UI Renderer with enhanced functionality
const uiRenderer = {
    // Initialize the UI based on user role
    init() {
        try {
            if (!state.currentUser) {
                console.error('Current user not set in state, cannot initialize UI.');
                return;
            }
            
            if (elements.container) {
                elements.container.classList.add(`role-${state.currentUser.role.toLowerCase()}`);
            }

            if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
                this.renderTeacherAdminUI();
            } 
            
            this.renderTabs();
            this.updateView();
        } catch (error) {
            console.error('Error initializing UI:', error);
        }
    },

    // Render teacher/admin specific UI
    renderTeacherAdminUI() {
        try {
            if (!elements.teacherControls) {
                console.error('Teacher controls element not found in HTML.');
                return;
            }
            
            elements.teacherControls.style.display = 'flex';
            
            const relevantGroups = state.currentUser.role === ROLES.ADMIN 
                ? state.groups 
                : state.groups.filter(g => g.users?.some(u => u._id?.toString() === state.currentUser._id.toString()));

            if (elements.groupSelect) {
                elements.groupSelect.innerHTML = `<option value="">Choose a Group</option>` +
                    relevantGroups.map(g => `
                        <option value="${g._id}" ${g._id === state.selectedGroupId ? 'selected' : ''}>
                            ${utils.escapeHTML(g.name)}
                        </option>
                    `).join('');
            }
        } catch (error) {
            console.error('Error rendering teacher admin UI:', error);
        }
    },

    // Render student specific UI
    renderStudentUI() {
        try {
            this.renderTabs();
        } catch (error) {
            console.error('Error rendering student UI:', error);
        }
    },

    // Render navigation tabs
    renderTabs() {
        try {
            if (!state.currentUser || !elements.tabsNav) return;

            const isTeacher = [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role);
            
            // Show or hide the requests tab based on role
            const requestsTab = document.getElementById('requests-tab');
            if (requestsTab) {
                requestsTab.style.display = isTeacher ? 'inline-block' : 'none';
            }
            
            // Highlight the correct active tab
            elements.tabsNav.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
            });
        } catch (error) {
            console.error('Error rendering tabs:', error);
        }
    },

    renderQuizItem(quiz) {
        try {
            const isTeacher = [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role);
            
            const title = quiz.templateTitle || (quiz.templateId && quiz.templateId.title) || 'Untitled Quiz';
            const id = quiz._id;
            const status = quiz.status; 
            const statusClass = status.toLowerCase().replace(/\s+/g, '-');
            
            // This logic correctly displays the score for completed/graded quizzes
            let statusDisplay = `<span class="quiz-item-status status-badge ${statusClass}">${status}</span>`;
            if ((status === 'completed' || status === 'graded') && quiz.grade && typeof quiz.grade.score === 'number') {
                const scoreText = `${quiz.grade.score}/${quiz.templatePoints}`;
                statusDisplay = `<span class="quiz-item-status score-badge completed">${scoreText}</span>`;
            }

            return `
                <div class="quiz-item" data-id="${id}" data-action="${QUIZ_ACTIONS.VIEW_DETAIL}" role="button" tabindex="0">
                    <i class="fas fa-file-alt quiz-item-icon"></i>
                    <div class="quiz-item-info">
                        <span class="quiz-item-title">${utils.escapeHTML(title)}</span>
                        <span class="quiz-item-meta">Due: ${utils.formatDate(quiz.dueDate)}</span>
                        ${isTeacher ? `<span class="quiz-item-meta">Student: ${utils.escapeHTML(quiz.studentId.firstName)} ${utils.escapeHTML(quiz.studentId.lastName)}</span>` : ''}
                    </div>
                    ${statusDisplay}
                </div>
            `;
        } catch (error) {
            console.error('Error rendering quiz item:', error, quiz);
            return `<div class="quiz-item error"><p>Error loading quiz item.</p></div>`;
        }
    },

    // Render the requests list
    renderRequestsList(requests) {
        const container = elements.listView;
        if (!container) return;

        if (requests.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>No pending retake requests.</p></div>`;
            return;
        }

        container.innerHTML = requests.map(req => `
            <div class="request-item">
                <div class="request-info">
                    <strong>${utils.escapeHTML(req.studentId.firstName)} ${utils.escapeHTML(req.studentId.lastName)}</strong>
                    requested a retake for quiz:
                    <em>${utils.escapeHTML(req.requestableId.title)}</em>
                    <p class="request-reason">Reason: "${utils.escapeHTML(req.reason)}"</p>
                </div>
                <div class="request-actions">
                    <button class="btn btn-success" data-action="approve-request" data-request-id="${req._id}">Approve</button>
                    <button class="btn btn-danger" data-action="deny-request" data-request-id="${req._id}">Deny</button>
                </div>
            </div>
        `).join('');
    },

    // Update the current view based on state
    updateView() {
        try {
            if (!state.currentUser) return;
            
            this.renderTabs();
            
            // Show/hide list and detail views
            if (elements.listView) {
                elements.listView.style.display = state.currentView === 'list' ? 'block' : 'none';
            }
            
            if (elements.detailView) {
                elements.detailView.style.display = state.currentView === 'detail' ? 'block' : 'none';
            }
            
            // Render the appropriate view
            if (state.currentView === 'list') {
                this.renderListView();
            } else if (state.currentView === 'detail') {
                this.renderDetailView();
            }
        } catch (error) {
            console.error('Error updating view:', error);
        }
    },

    // Render the list view of quizzes
    renderListView() {
        const container = elements.listView;
        if (!container) return;

        if (state.isLoading) {
            container.innerHTML = `<div class="loading-spinner"></div>`;
            return;
        }

        if (!state.studentQuizzes || state.studentQuizzes.length === 0) {
            let message = 'No quizzes to display in this view.';
            if (state.currentUser.role !== ROLES.STUDENT && !state.selectedGroupId) {
                message = 'Please select a group to see its quizzes.';
            }
            container.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><p>${message}</p></div>`;
            return;
        }

        container.innerHTML = state.studentQuizzes
            .map(item => this.renderQuizItem(item))
            .join('');
    },

    // Render the detailed view of a quiz
    renderDetailView() {
        try {
            if (!state.detailedQuiz) {
                elements.detailView.innerHTML = `
                    <div class="error-message">
                        <p>Failed to load quiz details. Please go back and try again.</p>
                        <button class="btn btn-primary" data-action="back-to-list">
                            Back to List
                        </button>
                    </div>`;
                return;
            }
            
            const quiz = state.detailedQuiz;
            const status = quiz.status;
            
            // This logic routes to the correct view based on the quiz status.
            if (status === 'completed' || status === 'graded') {
                this.renderUnifiedResultsView(quiz);
            } else {
                this.renderInstructionsView(quiz);
            }
        } catch (error)
        {
            console.error('Error rendering detail view:', error);
            elements.detailView.innerHTML = `<div class="error-message"><p>A critical error occurred while displaying quiz details.</p></div>`;
        }
    },
    
    // Render student-specific detail view
    async renderUnifiedResultsView(quiz) {
        const uniqueAnalyticsId = `analytics-${quiz.templateId._id}`;
        
        elements.detailView.innerHTML = `
            <div class="detail-panel results-dashboard">
                 <div class="detail-panel-header">
                    <button class="btn back-btn" data-action="${QUIZ_ACTIONS.BACK_TO_LIST}"><i class="fas fa-arrow-left"></i> Back</button>
                    <h2 class="quiz-title-detail">${utils.escapeHTML(quiz.templateTitle)}</h2>
                </div>
                <div class="results-grid">
                    <div class="stat-card">
                        <div class="stat-label">Student</div>
                        <div class="stat-value student-name">${utils.escapeHTML(quiz.studentId?.firstName)} ${utils.escapeHTML(quiz.studentId?.lastName)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Student's Score</div>
                        <div class="stat-value score-value">${quiz.grade?.score ?? 'N/A'} / ${quiz.templatePoints} (${(quiz.templatePoints > 0 && quiz.grade?.score != null) ? ((quiz.grade.score / quiz.templatePoints) * 100).toFixed(0) : 0}%)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Class Average</div>
                        <div class="stat-value class-average" id="${uniqueAnalyticsId}"><i class="fas fa-spinner fa-spin"></i></div>
                    </div>
                </div>
                <div class="results-actions">
                    ${(quiz.templateId?.allowRetakes) ? `<button class="btn btn-warning" data-action="${QUIZ_ACTIONS.RETAKE_QUIZ}" data-quiz-id="${quiz._id}" style="margin-right:10px;"><i class="fas fa-redo"></i> Retake Quiz</button>` : ''}
                    
                    ${quiz.lastAttemptId ? `<button class="btn btn-primary" data-action="${QUIZ_ACTIONS.REVIEW_QUIZ}" data-attempt-id="${quiz.lastAttemptId}">Review Answers</button>` : ''}
                </div>
            </div>
        `;
        
        const analytics = await apiService.fetchQuizAnalytics(quiz.templateId._id);
        const analyticsElement = document.getElementById(uniqueAnalyticsId);
        if (analyticsElement) {
            analyticsElement.textContent = `${analytics.classAveragePercentage}%`;
        }
    },

    renderInstructionsView(quiz) {
        try {
            const quizTitle = utils.escapeHTML(quiz.templateTitle);
            const isStudent = state.currentUser.role === ROLES.STUDENT;
            
            const startTime = quiz.templateId?.startTime || quiz.startTime;
            const endTime = quiz.templateId?.endTime || quiz.dueDate;
            const timeLimit = quiz.templateId?.timeLimit || 'No time limit';
            const totalPoints = quiz.templatePoints || 0;
            const description = quiz.templateId?.description || 'No description provided';
            
            // NEW LOGIC: Use the actual `isProtected` value
            const isProtected = quiz.templateId?.isProtected || false;

            const instructionsInGeorgian = `
                <h3 style="color: var(--warning-accent);">ყურადღება! მნიშვნელოვანი ინსტრუქციები</h3>
                <ul class="instructions-list">
                    ${isProtected ? `
                        <li><i class="fas fa-arrows-alt"></i> ქვიზის დაწყებისას, გვერდი გადავა სრულ ეკრანზე.</li>
                        <li><i class="fas fa-sign-out-alt"></i> სრული ეკრანიდან გასვლა ან სხვა ფანჯარაში გადასვლა გამოიწვევს ქვიზის ავტომატურ დასრულებას.</li>
                        <li><i class="fas fa-camera"></i> სქრინშოთის გადაღება და კოპირება აკრძალულია.</li>
                    ` : `
                        <li><i class="fas fa-info-circle"></i> ეს არის ღია ქვიზი. შეგიძლიათ გამოიყენოთ სხვა რესურსები, მაგრამ დაიცავით აკადემიური კეთილსინდისიერება.</li>
                    `}
                    <li><i class="fas fa-clock"></i> ქვიზი ავტომატურად დასრულდება დროის ამოწურვისას.</li>
                </ul>
            `;

            elements.detailView.innerHTML = `
                <div class="detail-panel">
                    <div class="detail-panel-header">
                        <button class="btn back-btn" data-action="${QUIZ_ACTIONS.BACK_TO_LIST}"><i class="fas fa-arrow-left"></i> Back</button>
                        <h2 class="quiz-title-detail">${quizTitle}</h2>
                        
                        ${!isStudent ? `
                            <button class="btn btn-secondary duplicate-quiz-btn" data-action="${QUIZ_ACTIONS.DUPLICATE_QUIZ}" data-quiz-id="${quiz.templateId?._id || quiz._id}" style="margin-left:auto;">
                                <i class="fas fa-copy"></i> Duplicate
                            </button>
                        ` : ''}
                    </div>
                    <div class="quiz-instructions-content" style="padding: 20px;">
                        ${!isStudent ? `<p><strong>Student:</strong> ${utils.escapeHTML(quiz.studentId?.firstName)} ${utils.escapeHTML(quiz.studentId?.lastName)}</p>` : ''}
                        
                        <div class="quiz-info-card" style="background-color: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border-color);">
                            <h3 style="margin-top: 0; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Quiz Information</h3>
                            <p><strong>Status:</strong> <span class="status-badge ${quiz.status.toLowerCase()}">${quiz.status}</span></p>
                            <p><strong>Description:</strong> ${utils.sanitizeHTML(description)}</p>
                            <p><strong>Total Points:</strong> ${totalPoints}</p>
                            <p><strong>Time Limit:</strong> ${timeLimit} ${typeof timeLimit === 'number' ? 'minutes' : ''}</p>
                            <p><strong>Available From:</strong> ${utils.formatDate(startTime)}</p>
                            <p><strong>Due Date:</strong> ${utils.formatDate(endTime)}</p>
                            <p><strong>Security:</strong> ${isProtected ? '<span style="color:red">Protected (Anti-Cheat ON)</span>' : '<span style="color:green">Open (Anti-Cheat OFF)</span>'}</p>
                        </div>
                        
                        ${instructionsInGeorgian}
                        
                        ${isStudent && quiz.status === 'active' ? `
                            <div class="agreement-section" style="margin-top: 20px;">
                                <label class="agreement-checkbox">
                                    <input type="checkbox" id="quiz-agreement">
                                    <span class="checkmark"></span>
                                    ვეთანხმები და მესმის ყველა პირობა
                                </label>
                            </div>
                            <div class="modal-footer" style="padding-top: 15px;">
                                <button class="btn btn-primary" id="start-quiz-btn-main" data-action="${QUIZ_ACTIONS.START_QUIZ}" disabled>ქვიზის დაწყება</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            
            if (isStudent && quiz.status === 'active') {
                const agreementCheckbox = elements.detailView.querySelector('#quiz-agreement');
                const startButton = elements.detailView.querySelector('#start-quiz-btn-main');
                if (agreementCheckbox && startButton) {
                    agreementCheckbox.addEventListener('change', (e) => {
                        startButton.disabled = !e.target.checked;
                    });
                }
            }
        } catch (error) {
            console.error('Error in renderInstructionsView:', error);
        }
    },

    // NEW LOGIC: COMPLETELY REWRITTEN TO USE YOUR NATIVE CSS CLASSES FOR A SCROLLABLE FEED
    setupQuizTakingModal(modalElement) {
        try {
            const quiz = state.detailedQuiz;
            const attempt = state.activeQuizAttempt;
            const questions = quiz.templateId?.questions || [];
            
            if (questions.length === 0) {
                this.showNotification('Quiz data is incomplete.', 'error');
                this.closeModal();
                return;
            }

            // Set the main title
            const titleEl = modalElement.querySelector('.quiz-title-taking');
            if (titleEl) titleEl.textContent = quiz.templateTitle;

            // We need a container to hold ALL questions, bypassing the old single-question pagination.
            // Let's create a wrapper or use the existing container and inject all HTML directly into it.
            let scrollableContainer = modalElement.querySelector('#active-quiz-questions-container');
            
            // If they are using the old HTML, find the parent of `.question-text-taking`
            if (!scrollableContainer) {
                const textElement = modalElement.querySelector('.question-text-taking');
                if (textElement) {
                    scrollableContainer = textElement.parentElement;
                }
            }

            if (!scrollableContainer) {
                console.error("Could not find a container to render the quiz feed.");
                return;
            }

            // Clean the container and make sure it handles scrolling gracefully
            scrollableContainer.innerHTML = '';
            scrollableContainer.style.overflowY = 'auto';
            scrollableContainer.style.height = '100%';
            scrollableContainer.style.maxHeight = '75vh'; // Keep it within modal bounds
            scrollableContainer.style.padding = '10px 20px'; // Give it breathing room
            
            // Loop through and render EVERY question
            questions.forEach((question, index) => {
                // We wrap each question in a div to separate them
                const questionBlock = document.createElement('div');
                questionBlock.className = 'quiz-question-block';
                questionBlock.style.marginBottom = '40px'; // Space between questions
                questionBlock.style.paddingBottom = '30px';
                questionBlock.style.borderBottom = '1px solid var(--border-color)';

                // Image handling
                let imageHtml = '';
                if (question.imageUrl) {
                    imageHtml = `
                    <div class="question-image-container" style="display: flex; justify-content: center; margin: 15px 0;">
                        <img src="${question.imageUrl}" alt="Question Image" style="max-width: 100%; border-radius: 8px;">
                    </div>`;
                }

                // Options handling using your exact native classes
                let optionsHtml = '<div class="options-container-taking">';
                (question.options || []).forEach((opt, optIndex) => {
                    const existingAnswer = attempt.answers?.find(a => a.question?.toString() === question._id.toString());
                    const isSelected = existingAnswer && existingAnswer.selectedOptionIndex === optIndex ? 'selected' : '';
                    
                    optionsHtml += `
                        <div class="option-taking ${isSelected}" data-question-id="${question._id}" data-option-index="${optIndex}">
                            <span class="option-letter">${String.fromCharCode(65 + optIndex)}</span>
                            <span class="option-text">${opt.text}</span>
                        </div>
                    `;
                });
                optionsHtml += '</div>';

                // Assemble the full block, including the explicitly written Points
                questionBlock.innerHTML = `
                    <div class="question-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">კითხვა ${index + 1}</h3>
                        <span class="question-points" style="font-weight: bold; background: var(--background-secondary); padding: 5px 10px; border-radius: 5px;">${question.points} ქულა</span>
                    </div>
                    <div class="question-text-taking" style="margin-bottom: 20px;">${question.text}</div>
                    ${imageHtml}
                    ${optionsHtml}
                `;
                
                scrollableContainer.appendChild(questionBlock);
            });

            // Bind click events to all options in the feed
            const allOptions = scrollableContainer.querySelectorAll('.option-taking');
            allOptions.forEach(opt => {
                opt.addEventListener('click', (e) => {
                    const target = e.currentTarget;
                    const qId = target.dataset.questionId;
                    const optIdx = parseInt(target.dataset.optionIndex);
                    
                    // Remove 'selected' from siblings in the SAME question
                    const parentContainer = target.closest('.options-container-taking');
                    parentContainer.querySelectorAll('.option-taking').forEach(sibling => {
                        sibling.classList.remove('selected');
                    });
                    
                    // Add 'selected' to clicked option
                    target.classList.add('selected');
                    
                    // Trigger the background autosave logic
                    eventHandlers.handleSelectOptionFeed(qId, optIdx);
                });
            });

            // Hide old pagination buttons
            const nextBtn = modalElement.querySelector('.next-question-btn');
            const prevBtn = modalElement.querySelector('.prev-question-btn');
            if (nextBtn) nextBtn.style.display = 'none';
            if (prevBtn) prevBtn.style.display = 'none';

            // Ensure the finish button is visible at the bottom of the modal
            const finishBtn = modalElement.querySelector('.finish-quiz-btn');
            if (finishBtn) {
                finishBtn.style.display = 'block';
                // Clone and replace to prevent duplicate listeners if reopened
                const newFinishBtn = finishBtn.cloneNode(true);
                finishBtn.parentNode.replaceChild(newFinishBtn, finishBtn);
                newFinishBtn.addEventListener('click', () => {
                    if(confirm("დარწმუნებული ხართ რომ გსურთ ქვიზის დასრულება?")) {
                        eventHandlers.handleFinishQuiz();
                    }
                });
            }

            // Update MathJax for everything inside the scrollable container
            utils.renderMath(scrollableContainer);

        } catch (error) {
            console.error('Error setting up quiz taking modal:', error);
        }
    },

    // Setup question bank modal
    setupQuestionBankModal(modalElement) {
        try {
            const groupSelect = document.querySelector('#quiz-group');
            if (!groupSelect) {
                this.showNotification('Please select a group first', 'error');
                this.closeModal();
                return;
            }
            
            const groupId = groupSelect.value;
            if (!groupId) {
                this.showNotification('Please select a group first', 'error');
                this.closeModal();
                return;
            }

            // Fetch question banks
            apiService.fetchQuestionBanks(groupId)
                .then(banks => {
                    state.questionBanks = banks;
                    
                    const banksContainer = modalElement.querySelector('.quiz-bank-list');
                    if (!banksContainer) return;
                    
                    banksContainer.innerHTML = '';
                    
                    if (banks.length === 0) {
                        banksContainer.innerHTML = '<p class="empty-state">No question banks available for this group.</p>';
                        return;
                    }
                    
                    // Render question banks
                    banks.forEach(bank => {
                        const bankElement = document.createElement('div');
                        bankElement.className = 'question-bank-item';
                        bankElement.innerHTML = `
                            <h4>${utils.escapeHTML(bank.name)}</h4>
                            <p>${utils.escapeHTML(bank.description || 'No description')}</p>
                            <div class="bank-questions">
                                ${bank.questions.map(q => `
                                    <div class="bank-question" data-question-id="${q._id}">
                                        <input type="checkbox" id="q-${q._id}">
                                        <label for="q-${q._id}">${utils.escapeHTML(q.text)}</label>
                                    </div>
                                `).join('')}
                            </div>
                        `;
                        banksContainer.appendChild(bankElement);
                    });
                })
                .catch(error => {
                    console.error('Failed to load question banks:', error);
                    this.showNotification('Failed to load question banks', 'error');
                });
        } catch (error) {
            console.error('Error setting up question bank modal:', error);
        }
    },

    // Update LaTeX preview
    updateLatexPreview(inputElement) {
        try {
            const previewElement = inputElement.nextElementSibling;
            if (previewElement && previewElement.classList.contains('latex-preview')) {
                // MathJax needs the raw, un-escaped LaTeX string to process it.
                previewElement.innerHTML = inputElement.value;
                utils.renderMath(previewElement);
            }
        } catch (error) {
            console.error('Error updating LaTeX preview:', error);
        }
    },
    
    // Add a new question to the form
    addNewQuestion(modalElement) {
        try {
            const questionsContainer = modalElement.querySelector('#questions-container');
            const questionTemplate = document.getElementById('template-question-item');
            
            if (!questionTemplate || !questionsContainer) {
                console.error('Question item template or container not found');
                return;
            }

            // Clone question template
            const questionClone = questionTemplate.content.cloneNode(true);
            const questionItem = questionClone.querySelector('.question-item');

            // Set question number
            const questionNumber = questionsContainer.children.length + 1;
            questionItem.querySelector('.question-number').textContent = `Question #${questionNumber}`;
            
            // Setup image uploader
            const uploader = questionItem.querySelector('.question-image-uploader');
            const input = questionItem.querySelector('.question-image-input');
            const preview = questionItem.querySelector('.question-image-preview');
            const removeBtn = questionItem.querySelector('.remove-image-btn');
            
            if (uploader && input && preview && removeBtn) {
                uploader.addEventListener('click', () => input.click());
                uploader.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploader.classList.add('drag-over');
                });
                uploader.addEventListener('dragleave', () => {
                    uploader.classList.remove('drag-over');
                });
                uploader.addEventListener('drop', (e) => {
                    e.preventDefault();
                    uploader.classList.remove('drag-over');
                    if (e.dataTransfer.files.length) {
                        input.files = e.dataTransfer.files;
                        this.handleImageUpload(input, preview);
                    }
                });
                
                input.addEventListener('change', () => this.handleImageUpload(input, preview));
                removeBtn.addEventListener('click', () => this.removeImage(input, preview));
            }
            
            // Add to container
            questionsContainer.appendChild(questionClone);
            
            // Add default options
            const optionsContainer = questionItem.querySelector('.options-container');
            if (optionsContainer) {
                for (let i = 0; i < 4; i++) {
                    this.addNewOption(optionsContainer);
                }
            }

            // Renumber questions
            this.renumberQuestions(questionsContainer);
        } catch (error) {
            console.error('Error adding new question:', error);
        }
    },
    
    // Handle image upload
    async handleImageUpload(input, preview) {
        try {
            const file = input.files[0];
            if (!file) return;
            
            // Validate file type
            if (!file.type.startsWith('image/')) {
                this.showNotification('Please select an image file', 'error');
                return;
            }
            
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                this.showNotification('Image must be less than 5MB', 'error');
                return;
            }
            
            const result = await apiService.uploadQuestionImage(file);
            if (preview && preview.querySelector('img')) {
                preview.querySelector('img').src = result.imageUrl;
                preview.style.display = 'block';
                this.showNotification('Image uploaded successfully');
            }
        } catch (error) {
            console.error('Failed to upload image:', error);
            this.showNotification('Failed to upload image', 'error');
        }
    },
    
    // Remove image
    removeImage(input, preview) {
        try {
            input.value = '';
            if (preview) {
                preview.style.display = 'none';
            }
        } catch (error) {
            console.error('Error removing image:', error);
        }
    },

    // Add a new option to a question
    addNewOption(optionsContainer) {
        try {
            const optionTemplate = document.getElementById('template-option-item');
            if (!optionTemplate || !optionsContainer) {
                console.error('Option item template or container not found');
                return;
            }
            
            const optionClone = optionTemplate.content.cloneNode(true);
            optionsContainer.appendChild(optionClone);
            this.reletterOptions(optionsContainer);
        } catch (error) {
            console.error('Error adding new option:', error);
        }
    },

    // Update option letters
    reletterOptions(container) {
        try {
            const questionItem = container.closest('.question-item');
            if (!questionItem) return;
            
            const questionIndex = questionItem.dataset.questionIndex;
            const optionItems = container.querySelectorAll('.option-item');
            
            optionItems.forEach((item, index) => {
                const letter = item.querySelector('.option-letter');
                const radio = item.querySelector('.correct-option-radio');
                
                if (letter) letter.textContent = String.fromCharCode(65 + index);
                if (radio) radio.name = `correct-option-${questionIndex}`;
            });
        } catch (error) {
            console.error('Error relettering options:', error);
        }
    },

    // Render questions in the form
    renderQuestions(questions, modalElement) {
        try {
            const questionsContainer = modalElement.querySelector('#questions-container');
            if (!questionsContainer) return;
            
            questionsContainer.innerHTML = '';
            
            if (questions && questions.length > 0) {
                questions.forEach((question, index) => {
                    this.addNewQuestion(modalElement);
                    const questionElement = questionsContainer.children[index];
                    
                    if (questionElement) {
                        questionElement.querySelector('.question-text').value = question.text || '';
                        questionElement.querySelector('.question-points').value = question.points || 1;
                        questionElement.querySelector('.question-solution').value = question.solution || '';
                        
                        // Handle image
                        if (question.imageUrl) {
                            const preview = questionElement.querySelector('.question-image-preview');
                            const img = preview.querySelector('img');
                            img.src = question.imageUrl;
                            preview.style.display = 'block';
                        }

                        // Handle options
                        const optionsContainer = questionElement.querySelector('.options-container');
                        if (optionsContainer && question.options) {
                            optionsContainer.innerHTML = '';

                            question.options.forEach((option, optIndex) => {
                                const optionTemplate = document.getElementById('template-option-item');
                                const optionClone = optionTemplate.content.cloneNode(true);
                                optionClone.querySelector('.option-text').value = option.text || '';
                                
                                if (option.isCorrect) {
                                    optionClone.querySelector('.correct-option-radio').checked = true;
                                }
                                
                                optionsContainer.appendChild(optionClone);
                            });

                            this.reletterOptions(optionsContainer);
                        }
                    }
                });
            } else {
                this.addNewQuestion(modalElement);
            }
        } catch (error) {
            console.error('Error rendering questions:', error);
        }
    },

    // Renumber questions
    renumberQuestions(questionsContainer) {
        try {
            Array.from(questionsContainer.children).forEach((question, index) => {
                const numberElement = question.querySelector('.question-number');
                if (numberElement) numberElement.textContent = `Question #${index + 1}`;
                
                question.dataset.questionIndex = index;
                const optionsContainer = question.querySelector('.options-container');
                if (optionsContainer) this.reletterOptions(optionsContainer);
            });
        } catch (error) {
            console.error('Error renumbering questions:', error);
        }
    },

    // Render quiz results
    renderQuizResults(results) {
        try {
            const template = document.getElementById('template-quiz-results');
            if (!template) return;
            
            const clone = template.content.cloneNode(true);
            const quizTemplate = results.template;
            if (!quizTemplate) return;
            
            clone.querySelector('.quiz-title-results').textContent = quizTemplate.title;
            clone.querySelector('.score-value').textContent = results.score || 0;
            clone.querySelector('.score-total').textContent = `/ ${quizTemplate.points || 0}`;
            
            const percentage = quizTemplate.points > 0 ? ((results.score / quizTemplate.points) * 100).toFixed(0) : 0;
            clone.querySelector('.score-percentage').textContent = `${percentage}%`;
            clone.querySelector('.score-circle')?.style.setProperty('--percentage', `${percentage}%`);
            
            // NEW LOGIC: Show Retake Button if allowed
            const retakeBtn = clone.querySelector('#retake-quiz-btn');
            if (retakeBtn && quizTemplate.allowRetakes) {
                retakeBtn.style.display = 'inline-block';
                retakeBtn.dataset.quizId = results.studentQuiz || state.detailedQuiz._id;
            }

            const reviewContainer = clone.querySelector('.questions-review');
            if (reviewContainer && quizTemplate.questions) {
                quizTemplate.questions.forEach((question, index) => {
                    const reviewItemTemplate = document.getElementById('template-question-review');
                    if (!reviewItemTemplate) return;
                    
                    const reviewClone = reviewItemTemplate.content.cloneNode(true);
                    const studentAnswer = results.answers.find(ans => ans.question?.toString() === question._id.toString());

                    reviewClone.querySelector('.question-number-review').textContent = `Question ${index + 1}`;
                    reviewClone.querySelector('.question-points-review').textContent = `${studentAnswer ? studentAnswer.pointsAwarded : 0} / ${question.points} Points`;
                    reviewClone.querySelector('.question-text-review').innerHTML = question.text;
                    reviewClone.querySelector('.solution-text').innerHTML = question.solution || 'No solution explanation was provided.';

                    if (question.imageUrl) {
                        const imageContainer = reviewClone.querySelector('.question-image-review');
                        imageContainer.style.display = 'block';
                        imageContainer.querySelector('img').src = question.imageUrl;
                    }

                    const optionsContainer = reviewClone.querySelector('.options-review');
                    if (optionsContainer && question.options) {
                        question.options.forEach((option, optIndex) => {
                            const optionElement = document.createElement('div');
                            let optionClass = 'option-review';
                            if (option.isCorrect) optionClass += ' correct';
                            if (studentAnswer && studentAnswer.selectedOptionIndex === optIndex) {
                                optionClass += ' selected';
                                if (!option.isCorrect) optionClass += ' incorrect';
                            }
                            optionElement.className = optionClass;
                            optionElement.innerHTML = `
                                <div class="option-letter">${String.fromCharCode(65 + optIndex)}</div>
                                <div class="option-text">${option.text}</div>
                            `;
                            optionsContainer.appendChild(optionElement);
                        });
                    }
                    reviewContainer.appendChild(reviewClone);
                });
            }

            elements.detailView.innerHTML = '';
            elements.detailView.appendChild(clone);
            
            utils.renderMath(elements.detailView);
            
        } catch (error) {
            console.error('Error rendering quiz results:', error);
        }
    },

    // Show notification
    showNotification(message, type = 'success') {
        try {
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.innerHTML = `
                <span class="notification-icon">
                    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                </span>
                <span class="notification-message">${utils.escapeHTML(message)}</span>
                <button class="notification-close" onclick="this.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            document.body.appendChild(notification);
            
            // Auto remove after 5 seconds
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 5000);
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    },

    // Prefill quiz form from template
    prefillQuizForm(quizData) {
        try {
            const modal = document.querySelector('#modal-create-edit-quiz');
            if (!modal) {
                this.showNotification('Could not find the quiz form to prefill.', 'error');
                return;
            }

            // Prefill basic fields
            modal.querySelector('#quiz-title').value = (quizData.title || '') + ' (Copy)';
            modal.querySelector('#quiz-description').value = quizData.description || '';
            modal.querySelector('#quiz-time-limit').value = quizData.timeLimit || 60;
            
            // NEW LOGIC: Prefill new settings
            if (modal.querySelector('#is-protected')) modal.querySelector('#is-protected').checked = quizData.isProtected || false;
            if (modal.querySelector('#allow-retakes')) modal.querySelector('#allow-retakes').checked = quizData.allowRetakes || false;
            if (modal.querySelector('#retake-policy')) modal.querySelector('#retake-policy').value = quizData.retakePolicy || 'highest';

            // Render questions
            this.renderQuestions(quizData.questions, modal);
        } catch (error) {
            console.error('Error prefilling quiz form:', error);
        }
    },

    // Setup quiz bank modal
    async setupQuizBankModal(modalElement) {
        try {
            const listContainer = modalElement.querySelector('.quiz-bank-list');
            if (!listContainer) return;
            
            listContainer.innerHTML = '<div class="loading-spinner"></div>';
            
            try {
                const quizBankTemplates = await apiService.fetchQuizBank();
                listContainer.innerHTML = '';

                if (quizBankTemplates.length === 0) {
                    listContainer.innerHTML = '<p>No saved quiz templates found.</p>';
                    return;
                }

                // Create list items
                listContainer.innerHTML = quizBankTemplates.map(quiz => `
                    <div class="quiz-item" data-action="${QUIZ_ACTIONS.SELECT_QUIZ_FROM_BANK}" data-quiz-id="${quiz._id}">
                        <i class="fas fa-file-alt quiz-item-icon"></i>
                        <div class="quiz-item-info">
                            <span class="quiz-item-title">${utils.escapeHTML(quiz.title)}</span>
                            <span class="quiz-item-meta">${quiz.questions.length} questions</span>
                        </div>
                    </div>
                `).join('');

                // Save to state
                state.quizBank = quizBankTemplates;
            } catch (error) {
                console.error('Failed to load quiz bank:', error);
                listContainer.innerHTML = '<p>Could not load quiz bank.</p>';
            }
        } catch (error) {
            console.error('Error setting up quiz bank modal:', error);
        }
    }
};

// Event Handlers with robust error handling
const eventHandlers = {
    // Initialize event handlers
    init() {
        try {
            if (!state.currentUser) return;
            
            // Teacher/admin specific handlers
            if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
                if (elements.groupSelect) {
                    elements.groupSelect.addEventListener('change', this.handleGroupChange.bind(this));
                }
                if (elements.createBtn) {
                    elements.createBtn.addEventListener('click', () => {
                        uiRenderer.openModal('create-edit-quiz');
                    });
                }
            }
            
            // Tab navigation
            if (elements.tabsNav) {
                elements.tabsNav.addEventListener('click', this.handleTabClick.bind(this));
            }
            
            // Global click handler
            document.body.addEventListener('click', this.handleGlobalClick.bind(this));
            
            // Keyboard shortcuts
            document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
        } catch (error) {
            console.error('Error initializing event handlers:', error);
        }
    },

    // Handle group change
    async handleGroupChange(e) {
        try {
            const groupId = e.target.value;
            state.selectedGroupId = groupId;
            await this.loadQuizzes();
        } catch (error) {
            console.error('Error handling group change:', error);
        }
    },

    // Handle tab click
    async handleTabClick(e) {
        try {
            const tabBtn = e.target.closest('.tab-btn');
            if (!tabBtn) return;
            
            const tab = tabBtn.dataset.tab;
            state.activeSubView = 'quizzes';
            state.activeTab = tab;
            state.currentView = 'list';
            await this.loadQuizzes();
        } catch (error) {
            console.error('Error handling tab click:', error);
        }
    },

    // Handle view detail
    async handleViewDetail(quizId) {
        try {
            if (!quizId) {
                console.error('handleViewDetail was called with an invalid ID.');
                uiRenderer.showNotification('Cannot load quiz: The ID is missing.', 'error');
                return;
            }

            state.isLoading = true;
            uiRenderer.updateView();
            
            const responseData = await apiService.fetchQuizById(quizId);
            const quiz = responseData.data;

            if (!quiz) {
                throw new Error('Quiz data not found in server response.');
            }
            
            state.detailedQuiz = quiz;
            state.currentView = 'detail';
            
            state.isLoading = false;
            uiRenderer.updateView();
        } catch (error) {
            console.error('Failed to fetch quiz details:', error);
            uiRenderer.showNotification('Failed to load quiz details', 'error');
            state.isLoading = false;
            uiRenderer.updateView();
        }
    },

    // Handle review quiz
    async handleReviewQuiz(attemptId) {
        try {
            const results = await apiService.fetchQuizResults(attemptId);
            uiRenderer.renderQuizResults(results);
        } catch (error) {
            console.error('Failed to fetch quiz results:', error);
            uiRenderer.showNotification('Failed to load quiz results', 'error');
        }
    },

    // Handle back to list
    handleBackToList() {
        try {
            state.currentView = 'list';
            state.detailedQuiz = null;
            state.activeQuizAttempt = null;
            state.currentQuestionIndex = 0;
            
            // Clear timer if exists
            if (state.quizTimer) {
                clearInterval(state.quizTimer);
                state.quizTimer = null;
            }
            
            uiRenderer.updateView();
        } catch (error) {
            console.error('Error handling back to list:', error);
        }
    },

    // Handle edit quiz
    async handleEditQuiz(quizId) {
        try {
            const quiz = await apiService.fetchQuizById(quizId);
            uiRenderer.openModal('create-edit-quiz', quiz.data);
        } catch (error) {
            console.error('Failed to fetch quiz for editing:', error);
            uiRenderer.showNotification('Failed to load quiz for editing', 'error');
        }
    },

    // Handle delete quiz
    async handleDeleteQuiz(quizId) {
        try {
            const confirmed = confirm('Are you sure you want to delete this quiz? This action cannot be undone.');
            if (!confirmed) return;
            
            await apiService.deleteQuiz(quizId);
            uiRenderer.showNotification('Quiz deleted successfully');
            await this.loadQuizzes();
            this.handleBackToList();
        } catch (error) {
            console.error('Failed to delete quiz:', error);
            uiRenderer.showNotification('Failed to delete quiz', 'error');
        }
    },

    // NEW LOGIC: Duplicate Quiz
    async handleDuplicateQuiz(templateId) {
        try {
            if (!state.selectedGroupId) {
                uiRenderer.showNotification('Please select a target group from the dropdown first to duplicate the quiz into.', 'error');
                return;
            }
            const confirmed = confirm('Are you sure you want to duplicate this quiz for the currently selected group?');
            if (!confirmed) return;

            await apiService.duplicateQuiz(templateId, state.selectedGroupId);
            uiRenderer.showNotification('Quiz duplicated successfully!');
            await this.loadQuizzes();
            this.handleBackToList();
        } catch (error) {
            console.error('Failed to duplicate quiz:', error);
            uiRenderer.showNotification('Failed to duplicate quiz', 'error');
        }
    },

    // NEW LOGIC: Retake Quiz
    async handleRetakeQuiz(studentQuizId) {
        try {
            const confirmed = confirm('Are you sure you want to clear your previous answers and restart this quiz?');
            if (!confirmed) return;

            await apiService.retakeQuiz(studentQuizId);
            uiRenderer.showNotification('Quiz reset. Ready to start again!');
            
            // Reload the detail view
            await this.handleViewDetail(studentQuizId);
        } catch (error) {
            console.error('Failed to process retake:', error);
            uiRenderer.showNotification(error.data?.message || 'Failed to restart quiz', 'error');
        }
    },

    // Handle start quiz
    async handleStartQuiz(quizId) {
        try {
            const isProtected = state.detailedQuiz?.templateId?.isProtected || state.detailedQuiz?.isProtected || false;
            
            if (isProtected) {
                const quizWrapper = document.getElementById('quiz-wrapper');
                if (quizWrapper.requestFullscreen) {
                    await quizWrapper.requestFullscreen();
                } else if (quizWrapper.webkitRequestFullscreen) { /* Safari */
                    await quizWrapper.webkitRequestFullscreen();
                }
            }
            await this.handleRealStartQuiz(quizId, null);
        } catch (error) {
            console.error('Failed to enter fullscreen or start quiz:', error);
            uiRenderer.showNotification('Could not start protected quiz. Please allow fullscreen mode.', 'error');
        }
    },

    // Handle real start quiz (with password)
    async handleRealStartQuiz(quizId, password = null) {
        try {
            const attempt = await apiService.startQuizAttempt(quizId, password);
            state.activeQuizAttempt = attempt;
            state.currentQuestionIndex = 0;
            
            setTimeout(() => {
                uiRenderer.openModal('quiz-taking');
                
                const timeLimit = state.detailedQuiz.templateId?.timeLimit;
                const deadline = state.detailedQuiz.dueDate;
                
                if (timeLimit && Number(timeLimit) > 0) {
                    this.startQuizTimers(Number(timeLimit), deadline);
                } else {
                    const countdownElement = document.querySelector('#quiz-countdown');
                    if (countdownElement) {
                       countdownElement.parentElement.style.display = 'none';
                    }
                }
            }, 100);
        } catch (error) {
            uiRenderer.showNotification(error.data?.message || 'Failed to start quiz', 'error');
        }
    },

    // Start quiz timer
    startQuizTimers(durationInMinutes, deadlineDate) {
        if (state.quizTimer) clearInterval(state.quizTimer);
        if (state.quizDeadlineTimer) clearTimeout(state.quizDeadlineTimer);

        const countdownElement = document.querySelector('#quiz-countdown');

        if (!countdownElement) {
            console.error('CRITICAL: Could not find the #quiz-countdown element to display the timer.');
            return;
        }
        
        countdownElement.parentElement.style.display = 'flex';

        let timeLeftInSeconds = durationInMinutes * 60;

        const updateTimerDisplay = () => {
            if (timeLeftInSeconds < 0) timeLeftInSeconds = 0;
            const minutes = Math.floor(timeLeftInSeconds / 60);
            const seconds = timeLeftInSeconds % 60;
            countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            if (timeLeftInSeconds <= 60) {
                countdownElement.parentElement.classList.add('critical');
            }
        };

        updateTimerDisplay();

        // 1. Countdown Timer (updates every second)
        state.quizTimer = setInterval(() => {
            timeLeftInSeconds--;
            updateTimerDisplay();
            if (timeLeftInSeconds <= 0) {
                this.handleFinishQuiz();
            }
        }, 1000);

        // 2. Hard Deadline Timer
        const timeUntilDeadline = new Date(deadlineDate) - new Date();
        if (timeUntilDeadline > 0) {
            state.quizDeadlineTimer = setTimeout(() => {
                uiRenderer.showNotification("The quiz deadline has passed. Submitting automatically.", 'warning');
                this.handleFinishQuiz();
            }, timeUntilDeadline);
        }
        
        // 3. Anti-Cheating Event Listeners (NEW LOGIC: Conditional)
        const isProtected = state.detailedQuiz?.templateId?.isProtected || state.detailedQuiz?.isProtected || false;
        
        if (isProtected) {
            this.beforeUnloadListener = (e) => { e.preventDefault(); e.returnValue = ''; };
            this.visibilityChangeListener = () => {
                if (document.hidden) {
                    uiRenderer.showNotification("You have left the page. The quiz will be submitted.", 'error');
                    this.handleFinishQuiz();
                }
            };
            this.fullscreenChangeListener = () => {
                if (!document.fullscreenElement) {
                    uiRenderer.showNotification("You have exited fullscreen. The quiz will be submitted.", 'error');
                    this.handleFinishQuiz();
                }
            };

            window.addEventListener('beforeunload', this.beforeUnloadListener);
            document.addEventListener('visibilitychange', this.visibilityChangeListener);
            document.addEventListener('fullscreenchange', this.fullscreenChangeListener);
        }
    },

    // Handle select option (Legacy function kept safe)
    async handleSelectOption(optionIndex) {
        try {
            const quiz = state.detailedQuiz;
            const attempt = state.activeQuizAttempt;
            const questions = quiz.templateId?.questions || [];
            
            if (questions.length === 0) return;
            
            const question = questions[state.currentQuestionIndex];
            if (!question || !question._id) return;
            
            await apiService.submitAnswer(attempt._id, question._id, optionIndex);
            
            const existingAnswerIndex = attempt.answers.findIndex(a => 
                a.question && a.question.toString() === question._id.toString()
            );
            
            if (existingAnswerIndex !== -1) {
                attempt.answers[existingAnswerIndex] = {
                    question: question._id,
                    selectedOptionIndex: optionIndex,
                    answeredAt: new Date()
                };
            } else {
                attempt.answers.push({
                    question: question._id,
                    selectedOptionIndex: optionIndex,
                    answeredAt: new Date()
                });
            }
            
            const options = document.querySelectorAll('.option-taking');
            options.forEach(opt => opt.classList.remove('selected'));
            
            const selectedOption = document.querySelector(`.option-taking[data-option-index="${optionIndex}"]`);
            if (selectedOption) selectedOption.classList.add('selected');
            
        } catch (error) {
            console.error('Failed to submit answer:', error);
            uiRenderer.showNotification('Failed to submit answer', 'error');
        }
    },

    // NEW LOGIC: Handle Select Option for Scrollable Feed (Autosave)
    async handleSelectOptionFeed(questionId, optionIndex) {
        try {
            const attempt = state.activeQuizAttempt;
            
            // Update local state immediately
            const existingAnswerIndex = attempt.answers.findIndex(a => 
                a.question && a.question.toString() === questionId.toString()
            );
            
            if (existingAnswerIndex !== -1) {
                attempt.answers[existingAnswerIndex] = {
                    question: questionId,
                    selectedOptionIndex: optionIndex,
                    answeredAt: new Date()
                };
            } else {
                attempt.answers.push({
                    question: questionId,
                    selectedOptionIndex: optionIndex,
                    answeredAt: new Date()
                });
            }
            
            // Background autosave
            apiService.autoSaveAnswers(attempt._id, attempt.answers);
            
        } catch (error) {
            console.error('Failed to auto-save answer:', error);
        }
    },

    // Handle next question
    async handleNextQuestion() {
        try {
            const questions = state.detailedQuiz?.templateId?.questions || [];
            if (state.currentQuestionIndex < questions.length - 1) {
                state.currentQuestionIndex++;
                const modal = document.querySelector('.quiz-taking-container');
                if (modal) {
                    uiRenderer.setupQuizTakingModal(modal);
                }
            }
        } catch (error) {
            console.error('Error handling next question:', error);
        }
    },

    // Handle previous question
    async handlePrevQuestion() {
        try {
            if (state.currentQuestionIndex > 0) {
                state.currentQuestionIndex--;
                const modal = document.querySelector('.quiz-taking-container');
                if (modal) {
                    uiRenderer.setupQuizTakingModal(modal);
                }
            }
        } catch (error) {
            console.error('Error handling previous question:', error);
        }
    },

    // Save current answer
    async saveCurrentAnswer() {
        try {
            const quiz = state.detailedQuiz;
            const attempt = state.activeQuizAttempt;
            const questions = quiz.templateId?.questions || [];
            
            if (questions.length === 0 || state.currentQuestionIndex >= questions.length) {
                return; // No questions or invalid index
            }
            
            const currentQuestion = questions[state.currentQuestionIndex];
            const selectedOption = document.querySelector('.option-taking.selected');
            
            if (selectedOption && currentQuestion && currentQuestion._id) {
                const selectedIndex = parseInt(selectedOption.dataset.optionIndex);
                
                // Submit answer to server
                await apiService.submitAnswer(attempt._id, currentQuestion._id, selectedIndex);
                
                // Also update local attempt state
                const existingAnswerIndex = attempt.answers.findIndex(a => 
                    a.question && a.question.toString() === currentQuestion._id.toString()
                );
                
                if (existingAnswerIndex !== -1) {
                    attempt.answers[existingAnswerIndex] = {
                        question: currentQuestion._id,
                        selectedOptionIndex: selectedIndex,
                        answeredAt: new Date()
                    };
                } else {
                    attempt.answers.push({
                        question: currentQuestion._id,
                        selectedOptionIndex: selectedIndex,
                        answeredAt: new Date()
                    });
                }
            }
        } catch (error) {
            console.error('Error saving current answer:', error);
        }
    },

    // Handle finish quiz
    async handleFinishQuiz() {
        try {
            console.log('Finishing quiz...');
            
            // Cleanup anti-cheating listeners
            window.removeEventListener('beforeunload', this.beforeUnloadListener);
            document.removeEventListener('visibilitychange', this.visibilityChangeListener);
            document.removeEventListener('fullscreenchange', this.fullscreenChangeListener);

            // Cleanup timers
            if (state.quizTimer) clearInterval(state.quizTimer);
            if (state.quizDeadlineTimer) clearTimeout(state.quizDeadlineTimer);
            state.quizTimer = null;
            state.quizDeadlineTimer = null;

            // Exit fullscreen if still in it
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }

            const finishBtn = document.querySelector('.finish-quiz-btn');
            if (finishBtn) {
                finishBtn.disabled = true;
                finishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            }
            
            const attempt = state.activeQuizAttempt;
            const submissionResult = await apiService.submitQuizAttempt(attempt._id);
            const attemptId = submissionResult.data?._id || attempt._id;
            const results = await apiService.fetchQuizResults(attemptId);
            
            uiRenderer.closeModal();
            state.currentView = 'detail';
            uiRenderer.renderQuizResults(results);
            await this.loadQuizzes();
        } catch (error) {
            console.error('Failed to finish quiz:', error);
            uiRenderer.showNotification(error.data?.message || 'Failed to submit quiz', 'error');
            
            const finishBtn = document.querySelector('.finish-quiz-btn');
            if (finishBtn) {
                finishBtn.disabled = false;
                finishBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Quiz';
            }
        }
    },

    // Handle add question
    handleAddQuestion(buttonElement) {
        try {
            // Find the modal relative to the button that was clicked
            const modal = buttonElement.closest('.modal');
            if (!modal) {
                console.error('Could not find the create quiz modal to add a question to.');
                uiRenderer.showNotification('Error: Could not find the quiz form.', 'error');
                return;
            }
            uiRenderer.addNewQuestion(modal);
        } catch (error) {
            console.error('Error handling add question:', error);
        }
    },

    // Handle delete question
    handleDeleteQuestion(questionElement) {
        try {
            if (!questionElement) return;
            
            const questionsContainer = questionElement.parentElement;
            if (questionsContainer.children.length <= 1) {
                uiRenderer.showNotification('A quiz must have at least one question', 'error');
                return;
            }
            
            questionElement.remove();
            uiRenderer.renumberQuestions(questionsContainer);
        } catch (error) {
            console.error('Error handling delete question:', error);
        }
    },

    // Handle move question up
    handleMoveQuestionUp(questionElement) {
        try {
            const questionsContainer = questionElement.parentElement;
            const prevElement = questionElement.previousElementSibling;
            if (prevElement) {
                questionsContainer.insertBefore(questionElement, prevElement);
                uiRenderer.renumberQuestions(questionsContainer);
            }
        } catch (error) {
            console.error('Error handling move question up:', error);
        }
    },

    // Handle move question down
    handleMoveQuestionDown(questionElement) {
        try {
            const questionsContainer = questionElement.parentElement;
            const nextElement = questionElement.nextElementSibling;
            if (nextElement) {
                questionsContainer.insertBefore(nextElement, questionElement);
                uiRenderer.renumberQuestions(questionsContainer);
            }
        } catch (error) {
            console.error('Error handling move question down:', error);
        }
    },

    // Handle add option
    handleAddOption(optionsContainer) {
        try {
            uiRenderer.addNewOption(optionsContainer);
        } catch (error) {
            console.error('Error handling add option:', error);
        }
    },

    // Handle delete option
    handleDeleteOption(optionElement) {
        try {
            const optionsContainer = optionElement.parentElement;
            if (optionsContainer.children.length <= 2) {
                uiRenderer.showNotification('A question must have at least two options', 'error');
                return;
            }
            
            optionElement.remove();
            uiRenderer.reletterOptions(optionsContainer);
        } catch (error) {
            console.error('Error handling delete option:', error);
        }
    },

    // Handle view student attempt
    async handleViewStudentAttempt(attemptId) {
        try {
            const results = await apiService.fetchQuizResults(attemptId);
            
            const modal = document.createElement('div');
            modal.className = 'modal student-attempt-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Student Attempt Details</h3>
                        <button class="close-btn" data-action="${QUIZ_ACTIONS.CLOSE_MODAL}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="student-info">
                            <h4>${utils.escapeHTML(results.student?.firstName || '')} ${utils.escapeHTML(results.student?.lastName || '')}</h4>
                            <p>${utils.escapeHTML(results.student?.email || '')}</p>
                        </div>
                        <div class="attempt-results">
                            <div class="score-display">
                                <span class="score">${results.score}</span>
                                <span class="total">/ ${results.quiz?.totalPoints || 0}</span>
                            </div>
                        </div>
                        <div class="question-review">
                            ${results.answers.map((answer, index) => {
                                const question = results.quiz.questions[index];
                                const isCorrect = answer.selectedOptionIndex === question.correctOptionIndex;
                                return `
                                    <div class="review-question ${isCorrect ? 'correct' : 'incorrect'}">
                                        <h5>Question ${index + 1}: ${utils.escapeHTML(question.text)}</h5>
                                        <div class="student-answer">
                                            Your answer: ${utils.escapeHTML(question.options[answer.selectedOptionIndex]?.text || 'No answer')}
                                            ${isCorrect ? 
                                                '<span class="result-icon correct"><i class="fas fa-check"></i></span>' : 
                                                '<span class="result-icon incorrect"><i class="fas fa-times"></i></span>'}
                                        </div>
                                        ${!isCorrect ? `
                                            <div class="correct-answer">
                                                Correct answer: ${utils.escapeHTML(question.options[question.correctOptionIndex]?.text)}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
            
            elements.modalBackdrop.innerHTML = '';
            elements.modalBackdrop.appendChild(modal);
            elements.modalBackdrop.style.display = 'flex';
            
        } catch (error) {
            console.error('Failed to fetch student attempt:', error);
            uiRenderer.showNotification('Failed to load student attempt details', 'error');
        }
    },

    // Handle add from bank
    async handleAddFromBank() {
        try {
            uiRenderer.openModal('question-bank');
        } catch (error) {
            console.error('Error handling add from bank:', error);
        }
    },

    // Handle request retake
    async handleRequestRetake(quizId, reason) {
        try {
            if (!reason) {
                reason = prompt('Please provide a reason for requesting a retake:');
                if (!reason) return;
            }
            
            await apiService.requestRetake(quizId, reason);
            uiRenderer.showNotification('Retake request submitted successfully');
        } catch (error) {
            console.error('Failed to request retake:', error);
            uiRenderer.showNotification('Failed to submit retake request', 'error');
        }
    },

    // Extract questions data from form
    extractQuestionsData(form) {
        try {
            const questions = [];
            // This selector now correctly finds the question items inside the form.
            const questionElements = form.querySelectorAll('.question-item');

            if (questionElements.length === 0) {
                console.error("Error: No '.question-item' elements were found inside the form.");
            }

            questionElements.forEach(questionElement => {
                const options = [];
                const optionElements = questionElement.querySelectorAll('.option-item');
                
                optionElements.forEach(optionElement => {
                    options.push({
                        text: optionElement.querySelector('.option-text').value,
                        isCorrect: optionElement.querySelector('.correct-option-radio').checked
                    });
                });
                
                const imagePreview = questionElement.querySelector('.question-image-preview');
                const img = imagePreview.querySelector('img');
                const imageUrl = imagePreview.style.display !== 'none' ? img.src : null;
                const imagePublicId = imagePreview.style.display !== 'none' ? img.dataset.publicId : null;
                
                questions.push({
                    text: questionElement.querySelector('.question-text').value,
                    options: options,
                    points: parseInt(questionElement.querySelector('.question-points').value) || 1,
                    solution: questionElement.querySelector('.question-solution').value || '',
                    imageUrl: imageUrl,
                    imagePublicId: imagePublicId
                });
            });
            
            return questions;
        } catch (error) {
            console.error('A critical error occurred in extractQuestionsData:', error);
            // Return an empty array on error to trigger the validation message
            return [];
        }
    },
    // Handle create quiz
    async handleCreateQuiz(form) {
        try {
            const startTimeValue = form.querySelector('#quiz-start-time').value;
            const endTimeValue = form.querySelector('#quiz-end-time').value;
            
            // Prepare quiz data
            const quizData = {
                title: form.querySelector('#quiz-title').value,
                description: form.querySelector('#quiz-description').value,
                groupId: form.querySelector('#quiz-group').value,
                startTime: new Date(startTimeValue).toISOString(),
                endTime: new Date(endTimeValue).toISOString(),
                timeLimit: parseInt(form.querySelector('#quiz-time-limit').value) || null,
                isProtected: form.querySelector('#is-protected') ? form.querySelector('#is-protected').checked : false,
                allowRetakes: form.querySelector('#allow-retakes') ? form.querySelector('#allow-retakes').checked : false,
                retakePolicy: form.querySelector('#retake-policy') ? form.querySelector('#retake-policy').value : 'highest',
                questions: this.extractQuestionsData(form)
            };

            // Validate quiz data
            const validationErrors = utils.validateQuizData(quizData);
            if (validationErrors.length > 0) {
                return uiRenderer.showNotification(validationErrors[0], 'error');
            }

            await apiService.createQuiz(quizData);
            uiRenderer.showNotification('Quiz created successfully');
            uiRenderer.closeModal();
            await this.loadQuizzes();
        } catch (error) {
            console.error('Failed to create quiz:', error);
            uiRenderer.showNotification(error.data?.message || 'Failed to create quiz', 'error');
        }
    },

    async handleUpdateQuiz(quizId, form) {
        try {
            const startTimeValue = form.querySelector('#quiz-start-time').value;
            const endTimeValue = form.querySelector('#quiz-end-time').value;
            
            // Prepare quiz data
            const quizData = {
                title: form.querySelector('#quiz-title').value,
                description: form.querySelector('#quiz-description').value,
                groupId: form.querySelector('#quiz-group').value,
                startTime: new Date(startTimeValue).toISOString(),
                endTime: new Date(endTimeValue).toISOString(),
                timeLimit: parseInt(form.querySelector('#quiz-time-limit').value) || null,
                isProtected: form.querySelector('#is-protected') ? form.querySelector('#is-protected').checked : false,
                allowRetakes: form.querySelector('#allow-retakes') ? form.querySelector('#allow-retakes').checked : false,
                retakePolicy: form.querySelector('#retake-policy') ? form.querySelector('#retake-policy').value : 'highest',
                questions: this.extractQuestionsData(form)
            };

            // Validate quiz data
            const validationErrors = utils.validateQuizData(quizData);
            if (validationErrors.length > 0) {
                return uiRenderer.showNotification(validationErrors[0], 'error');
            }

            await apiService.updateQuiz(quizId, quizData);
            uiRenderer.showNotification('Quiz updated successfully');
            uiRenderer.closeModal();
            await this.loadQuizzes();
        } catch (error) {
            console.error('Failed to update quiz:', error);
            uiRenderer.showNotification(error.data?.message || 'Failed to update quiz', 'error');
        }
    },

    // Load quizzes based on current state
    async loadQuizzes() {
        try {
            state.isLoading = true;
            uiRenderer.updateView();
            
            let quizzes = [];
            let statusToFetch = state.activeTab;

            // This logic correctly fetches 'completed' AND 'graded' statuses for the Completed tab
            if (state.activeTab === 'completed') {
                statusToFetch = 'completed,graded';
            }
            
            if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
                if (!state.selectedGroupId) {
                    state.studentQuizzes = [];
                    state.isLoading = false;
                    uiRenderer.updateView();
                    return;
                }
                
                quizzes = await apiService.fetchQuizzesForGroup(state.selectedGroupId, statusToFetch);
            } else {
                quizzes = await apiService.fetchStudentQuizzes(statusToFetch);
            }
            
            state.studentQuizzes = Array.isArray(quizzes) ? quizzes : [];
            state.isLoading = false;
            uiRenderer.updateView();
            
        } catch (error) {
            console.error('Failed to fetch quizzes:', error);
            uiRenderer.showNotification('Failed to load quizzes', 'error');
            state.isLoading = false;
            uiRenderer.updateView();
        }
    },

    // Handle global click events
    handleGlobalClick(e) {
        try {
            const actionElement = e.target.closest('[data-action]');
            if (!actionElement) return;

            const { action, id, quizId, attemptId, requestId } = actionElement.dataset;

            switch (action) {
                case QUIZ_ACTIONS.VIEW_DETAIL:
                    this.handleViewDetail(id);
                    break;
                case QUIZ_ACTIONS.BACK_TO_LIST:
                    this.handleBackToList();
                    break;
                case QUIZ_ACTIONS.CLOSE_MODAL:
                    uiRenderer.closeModal();
                    break;
                case QUIZ_ACTIONS.EDIT_QUIZ:
                    this.handleEditQuiz(quizId || state.detailedQuiz._id);
                    break;
                case QUIZ_ACTIONS.DELETE_QUIZ:
                    this.handleDeleteQuiz(quizId);
                    break;
                case QUIZ_ACTIONS.DUPLICATE_QUIZ: // NEW
                    this.handleDuplicateQuiz(quizId || state.detailedQuiz.templateId?._id || state.detailedQuiz._id);
                    break;
                case QUIZ_ACTIONS.RETAKE_QUIZ: // NEW
                    this.handleRetakeQuiz(quizId || state.detailedQuiz._id);
                    break;
                case QUIZ_ACTIONS.START_QUIZ:
                    this.handleStartQuiz(state.detailedQuiz._id);
                    break;
                case QUIZ_ACTIONS.NEXT_QUESTION:
                    this.handleNextQuestion();
                    break;
                case QUIZ_ACTIONS.PREV_QUESTION:
                    this.handlePrevQuestion();
                    break;
                case QUIZ_ACTIONS.FINISH_QUIZ:
                    this.handleFinishQuiz();
                    break;
                case QUIZ_ACTIONS.ADD_QUESTION:
                    this.handleAddQuestion(actionElement);
                    break;
                case QUIZ_ACTIONS.DELETE_QUESTION:
                    this.handleDeleteQuestion(actionElement.closest('.question-item'));
                    break;
                case QUIZ_ACTIONS.MOVE_QUESTION_UP:
                    this.handleMoveQuestionUp(actionElement.closest('.question-item'));
                    break;
                case QUIZ_ACTIONS.MOVE_QUESTION_DOWN:
                    this.handleMoveQuestionDown(actionElement.closest('.question-item'));
                    break;
                case QUIZ_ACTIONS.ADD_OPTION:
                    this.handleAddOption(actionElement.closest('.options-container-wrapper').querySelector('.options-container'));
                    break;
                case QUIZ_ACTIONS.DELETE_OPTION:
                    this.handleDeleteOption(actionElement.closest('.option-item'));
                    break;
                case QUIZ_ACTIONS.REVIEW_QUIZ:
                    this.handleReviewQuiz(attemptId);
                    break;
                case QUIZ_ACTIONS.ADD_FROM_BANK:
                    this.handleAddFromQuizBank();
                    break;
                case QUIZ_ACTIONS.SELECT_QUIZ_FROM_BANK:
                    this.handleSelectQuizFromBank(quizId);
                    break;
                case QUIZ_ACTIONS.REQUEST_RETAKE:
                    this.handleRequestRetake(quizId);
                    break;
                case QUIZ_ACTIONS.APPROVE_REQUEST:
                    if(typeof this.handleApproveRequest === 'function') this.handleApproveRequest(requestId);
                    break;
                case QUIZ_ACTIONS.DENY_REQUEST:
                    if(typeof this.handleDenyRequest === 'function') this.handleDenyRequest(requestId);
                    break;
            }
        } catch (error) {
            console.error('Error handling global click:', error);
        }
    },
    
    // Handle keyboard shortcuts
    handleKeyboardShortcuts(e) {
        try {
            // ESC key to close modals
            if (e.key === 'Escape' && elements.modalBackdrop.style.display === 'flex') {
                uiRenderer.closeModal();
            }
            
            // Ctrl+Enter to submit forms
            if (e.ctrlKey && e.key === 'Enter') {
                const activeModal = document.querySelector('.modal:last-child');
                if (activeModal) {
                    const submitButton = activeModal.querySelector('button[type="submit"]');
                    if (submitButton) {
                        submitButton.click();
                    }
                }
            }
        } catch (error) {
            console.error('Error handling keyboard shortcuts:', error);
        }
    },

    // Handle add from quiz bank
    handleAddFromQuizBank() {
        try {
            uiRenderer.openModal('question-bank', null, true);
        } catch (error) {
            console.error('Error handling add from quiz bank:', error);
        }
    },

    // Handle select quiz from bank
    handleSelectQuizFromBank(quizId) {
        try {
            if (!state.quizBank) {
                uiRenderer.showNotification('Quiz bank data is not loaded.', 'error');
                return;
            }
            
            const selectedQuiz = state.quizBank.find(q => q._id === quizId);
            if (selectedQuiz) {
                uiRenderer.prefillQuizForm(selectedQuiz);
                uiRenderer.closeModal();
            } else {
                uiRenderer.showNotification('Selected quiz could not be found.', 'error');
            }
        } catch (error) {
            console.error('Error handling select quiz from bank:', error);
        }
    }
};

// Initialize the application
async function initQuizzes() {
    try {
        state.isLoading = true;
        
        const token = localStorage.getItem('piRateToken');
        if (!token) {
            window.location.href = '/client/login/login.html';
            return;
        }
        
        const { user, groups } = await apiService.fetchInitialData();
        
        // ✅ DEBUGGING: Let's see the exact user object we receive.
        console.log('--- USER DATA RECEIVED FROM SERVER ---:', user);
        if (user && user.role) {
            console.log('User Role is:', user.role);
            console.log('Is the Role exactly "Admin"?', user.role === ROLES.ADMIN);
            console.log('Is the Role exactly "Teacher"?', user.role === ROLES.TEACHER);
        } else {
            console.error('CRITICAL: User object is null or missing a role after fetch.');
            uiRenderer.showNotification('Could not verify user role. Logging out.', 'error');
            setTimeout(() => {
                // Redirect if user data is invalid
                localStorage.removeItem('piRateToken');
                window.location.href = '/client/login/login.html';
            }, 2000);
            return;
        }
        
        state.currentUser = user;
        state.groups = groups;
        
        uiRenderer.init();
        eventHandlers.init();
        
        if (state.currentUser.role === ROLES.STUDENT) {
            await eventHandlers.loadQuizzes();
        } else {
            state.isLoading = false;
            uiRenderer.updateView();
        }
        
    } catch (error) {
        console.error('Failed to initialize quizzes:', error);
        uiRenderer.showNotification('A critical error occurred. Please try logging in again.', 'error');
        state.isLoading = false;
        uiRenderer.updateView();
    }
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuizzes);
} else {
    initQuizzes();
}
