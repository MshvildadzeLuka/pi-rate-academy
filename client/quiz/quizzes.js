// quizzes.js (Georgian Version)
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
    SELECT_QUIZ_FROM_BANK: 'select-quiz-from-bank'
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
            if (!dateStr) return 'არასწორი თარიღი';
            
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'არასწორი თარიღი';
            
            return date.toLocaleString('ka-GE', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting date for display:', error);
            return 'არასწორი თარიღი';
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
            errors.push('ქვიზის სათაური აუცილებელია.');
        }
        if (!quizData.groupId) {
            errors.push('უნდა აირჩიოთ ჯგუფი.');
        }
        if (!quizData.startTime || !quizData.endTime) {
            errors.push('საჭიროა როგორც დაწყების, ასევე დამთავრების დრო.');
        } else {
            const startDate = new Date(quizData.startTime);
            const endDate = new Date(quizData.endTime);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                errors.push('დაწყების ან დამთავრების დრო არ არის სწორი.');
            } else if (endDate <= startDate) {
                errors.push('დამთავრების დრო უნდა იყოს დაწყების დროის შემდეგ.');
            }
        }

        // --- Detailed Question Validation ---
        if (!quizData.questions || quizData.questions.length === 0) {
            errors.push('ქვიზს უნდა ჰქონდეს მინიმუმ ერთი კითხვა.');
        } else {
            quizData.questions.forEach((question, index) => {
                if (!question.text || question.text.trim() === '') {
                    errors.push(`კითხვა #${index + 1} არ შეიძლება იყოს ცარიელი.`);
                }
                if (!question.options || question.options.length < 2) {
                    errors.push(`კითხვა #${index + 1} უნდა ჰქონდეს მინიმუმ ორი პასუხის ვარიანტი.`);
                } else if (!question.options.some(opt => opt.isCorrect)) {
                    errors.push(`კითხვა #${index + 1} უნდა ჰქონდეს მინიმუმ ერთი სწორი პასუხი.`);
                }
                if (isNaN(parseInt(question.points)) || question.points < 0) {
                    errors.push(`კითხვა #${index + 1} უნდა ჰქონდეს სწორი, არაუარყოფითი ქულა.`);
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
    },
    
    // Translate status to Georgian
    translateStatus(status) {
        const statusMap = {
            [QUIZ_STATUS.UPCOMING]: 'მომავალი',
            [QUIZ_STATUS.ACTIVE]: 'აქტიური',
            [QUIZ_STATUS.COMPLETED]: 'დასრულებული',
            [QUIZ_STATUS.PAST_DUE]: 'ვადაგასული',
            [QUIZ_STATUS.GRADED]: 'შეფასებული',
            [QUIZ_STATUS['NOT ATTEMPTED']]: 'არ არის ნაცდი',
            [QUIZ_STATUS.IN_PROGRESS]: 'მიმდინარე'
        };
        return statusMap[status] || status;
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
                throw new Error('ავთენტიფიკაციის ტოკენი არ მოიძებნა');
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
                throw new Error('სესია ამოიწურა. გთხოვთ, თავიდან შეხვიდეთ სისტემაში.');
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `HTTP შეცდომა ${response.status}` }));
                const error = new Error(errorData.message || 'მოხდა უცნობი შეცდომა');
                error.status = response.status;
                error.data = errorData;
                throw error;
            }

            return response.status === 204 ? null : response.json();
        } catch (error) {
            console.error(`API მოთხოვნა ${endpoint}-ზე ვერ შესრულდა:`, error);
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
                throw new Error(`მომხმარებლის პროფილის მიღება ვერ მოხერხდა: ${userResult.reason.message}`);
            }
            
            // ✅ Robustness: Explicitly assign the user object. The /users/profile route returns it directly.
            const user = userResult.value; 

            // ✅ Robustness: Safely handle the groups response, which might have a .data wrapper.
            const groupsResponse = groupsResult.status === 'fulfilled' ? groupsResult.value : { data: [] };
            const groups = groupsResponse.data || groupsResponse || [];

            return { user, groups };
        } catch (error) {
            console.error('საწყისი მონაცემების მიღება ვერ მოხერხდა:', error);
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
            console.error('სტუდენტური ქვიზების მიღება ვერ მოხერხდა:', error);
            return [];
        }
    },
    
    // Fetch quizzes for a specific group (teacher view)
    async fetchQuizzesForGroup(groupId, status) {
        try {
            if (!utils.isValidObjectId(groupId)) {
                throw new Error('ჯგუფის ID არასწორია');
            }
            
            let endpoint = `/quizzes/teacher/${groupId}`;
            if (status && status !== 'all') {
                endpoint += `?status=${status}`;
            }
            const response = await this.fetch(endpoint);
            return response.data || response;
        } catch (error) {
            console.error('ჯგუფის ქვიზების მიღება ვერ მოხერხდა:', error);
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
            console.error('ქვიზის შექმნა ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Update an existing quiz
    async updateQuiz(quizId, quizData) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('ქვიზის ID არასწორია');
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
            console.error('ქვიზის განახლება ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Delete a quiz
    async deleteQuiz(quizId) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('ქვიზის ID არასწორია');
            }
            
            const response = await this.fetch(`/quizzes/${quizId}`, { method: 'DELETE' });
            return response.data || response;
        } catch (error) {
            console.error('ქვიზის წაშლა ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Start a quiz attempt
    async startQuizAttempt(quizId, password = null) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('ქვიზის ID არასწორია');
            }
            
            const body = password ? { password } : {};
            const response = await this.fetch(`/quizzes/${quizId}/start`, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            return response.data || response;
        } catch (error) {
            console.error('ქვიზის დაწყება ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Submit an answer
    async submitAnswer(attemptId, questionId, selectedOptionIndex) {
        try {
            if (!utils.isValidObjectId(attemptId) || !utils.isValidObjectId(questionId)) {
                throw new Error('ID არასწორია');
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
            console.error('პასუხის გაგზავნა ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Submit a quiz attempt
    async submitQuizAttempt(attemptId, answers) {
        try {
            if (!utils.isValidObjectId(attemptId)) {
                throw new Error('ცდის ID არასწორია');
            }
            
            return this.fetch(`/quizzes/attempt/${attemptId}/submit`, {
                method: 'POST',
                body: JSON.stringify({ answers })
            });
        } catch (error) {
            console.error('ქვიზის გაგზავნა ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Fetch quiz results
    async fetchQuizResults(attemptId) {
        try {
            if (!utils.isValidObjectId(attemptId)) {
                throw new Error('ცდის ID არასწორია');
            }
            
            const response = await this.fetch(`/quizzes/attempt/${attemptId}/results`);
            return response.data || response;
        } catch (error) {
            console.error('ქვიზის შედეგების მიღება ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Fetch quiz analytics
    async fetchQuizAnalytics(quizId) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('ქვიზის ID არასწორია');
            }
            
            const response = await this.fetch(`/quizzes/${quizId}/analytics`);
            return response.data || response;
        } catch (error) {
            console.error('ქვიზის ანალიტიკის მიღება ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Upload question image
    async uploadQuestionImage(file) {
        try {
            if (!file || !(file instanceof File)) {
                throw new Error('არასწორი ფაილი');
            }
            
            const formData = new FormData();
            formData.append('image', file);
            
            const response = await this.fetch('/quizzes/questions/image-upload', {
                method: 'POST',
                body: formData
            });
            return response.data || response;
        } catch (error) {
            console.error('კითხვის სურათის ატვირთვა ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Fetch question banks
    async fetchQuestionBanks(groupId) {
        try {
            if (!utils.isValidObjectId(groupId)) {
                throw new Error('ჯგუფის ID არასწორია');
            }
            
            const response = await this.fetch(`/quizzes/question-banks/${groupId}`);
            return response.data || response;
        } catch (error) {
            console.error('კითხვების ბანკების მიღება ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Request a retake
    async requestRetake(quizId, reason) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                throw new Error('ქვიზის ID არასწორია');
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
            console.error('ხელახალი გაკეთების მოთხოვნა ვერ მოხერხდა:', error);
            throw error;
        }
    },
    
    // Fetch quiz bank
    async fetchQuizBank() {
        try {
            const response = await this.fetch('/quizzes/bank');
            return response.data || response;
        } catch (error) {
            console.error('ქვიზების ბანკის მიღება ვერ მოხერხდა:', error);
            throw error;
        }
    },

    async fetchQuizTemplatesForGroup(groupId, status) {
        try {
            if (!utils.isValidObjectId(groupId)) throw new Error('ჯგუფის ID არასწორია');
            const response = await this.fetch(`/quizzes/templates/${groupId}?status=${status}`);
            return response.data || [];
        } catch (error) {
            console.error('ქვიზის შაბლონების მიღება ვერ მოხერხდა:', error);
            return [];
        }
    },

    async fetchRetakeRequests() {
        try {
            const response = await this.fetch('/assignments/requests?type=Quiz');
            return response.data || [];
        } catch (error) {
            console.error('ხელახალი გაკეთების მოთხოვნების მიღება ვერ მოხერხდა:', error);
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
                console.error('მიმდინარე მომხმარებელი არ არის დაყენებული, UI-ის ინიციალიზაცია შეუძლებელია.');
                return;
            }
            
            if (elements.container) {
                elements.container.classList.add(`role-${state.currentUser.role.toLowerCase()}`);
            }
            
            // ✅ DEBUGGING: Check the role right before the UI decision is made.
            console.log('--- UI INIT: Checking role ---:', state.currentUser.role);

            if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
                console.log('SUCCESS: User is a Teacher or Admin. Rendering admin controls.');
                this.renderTeacherAdminUI();
            } else {
                console.log('INFO: User is a Student. Skipping admin controls.');
            }
            
            this.renderTabs();
            this.updateView();
        } catch (error) {
            console.error('UI-ის ინიციალიზაციის შეცდომა:', error);
        }
    },

    // Render teacher/admin specific UI
    renderTeacherAdminUI() {
        try {
            if (!elements.teacherControls) {
                console.error('მასწავლებელის კონტროლის ელემენტი HTML-ში ვერ მოიძებნა.');
                return;
            }
            
            elements.teacherControls.style.display = 'flex';
            
            const relevantGroups = state.currentUser.role === ROLES.ADMIN 
                ? state.groups 
                : state.groups.filter(g => g.users?.some(u => u._id?.toString() === state.currentUser._id.toString()));

            if (elements.groupSelect) {
                elements.groupSelect.innerHTML = `<option value="">აირჩიეთ ჯგუფი</option>` +
                    relevantGroups.map(g => `
                        <option value="${g._id}" ${g._id === state.selectedGroupId ? 'selected' : ''}>
                            ${utils.escapeHTML(g.name)}
                        </option>
                    `).join('');
            }
        } catch (error) {
            console.error('მასწავლებელის/ადმინისტრატორის UI-ის გამოსახვის შეცდომა:', error);
        }
    },

    // Render student specific UI
    renderStudentUI() {
        try {
            this.renderTabs();
        } catch (error) {
            console.error('სტუდენტური UI-ის გამოსახვის შეცდომა:', error);
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
            console.error('ტაბების გამოსახვის შეცდომა:', error);
        }
    },

    renderQuizItem(quiz) {
        try {
            const isTeacher = [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role);
            
            const title = quiz.templateTitle || (quiz.templateId && quiz.templateId.title) || 'უსათაურო ქვიზი';
            const id = quiz._id;
            const status = quiz.status; 
            const statusClass = status.toLowerCase().replace(/\s+/g, '-');
            const translatedStatus = utils.translateStatus(status);
            
            // This logic correctly displays the score for completed/graded quizzes
            let statusDisplay = `<span class="quiz-item-status status-badge ${statusClass}">${translatedStatus}</span>`;
            if ((status === 'completed' || status === 'graded') && quiz.grade && typeof quiz.grade.score === 'number') {
                const scoreText = `${quiz.grade.score}/${quiz.templatePoints}`;
                statusDisplay = `<span class="quiz-item-status score-badge completed">${scoreText}</span>`;
            }

            return `
                <div class="quiz-item" data-id="${id}" data-action="${QUIZ_ACTIONS.VIEW_DETAIL}" role="button" tabindex="0">
                    <i class="fas fa-file-alt quiz-item-icon"></i>
                    <div class="quiz-item-info">
                        <span class="quiz-item-title">${utils.escapeHTML(title)}</span>
                        <span class="quiz-item-meta">ვადა: ${utils.formatDate(quiz.dueDate)}</span>
                        ${isTeacher ? `<span class="quiz-item-meta">სტუდენტი: ${utils.escapeHTML(quiz.studentId.firstName)} ${utils.escapeHTML(quiz.studentId.lastName)}</span>` : ''}
                    </div>
                    ${statusDisplay}
                </div>
            `;
        } catch (error) {
            console.error('ქვიზის ელემენტის გამოსახვის შეცდომა:', error, quiz);
            return `<div class="quiz-item error"><p>ქვიზის ჩატვირთვის შეცდომა.</p></div>`;
        }
    },

    // ✅ ADD THIS NEW FUNCTION to render the requests list
    renderRequestsList(requests) {
        const container = elements.listView;
        if (!container) return;

        if (requests.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>მოლოდინში არ არის ხელახალი გაკეთების მოთხოვნები.</p></div>`;
            return;
        }

        container.innerHTML = requests.map(req => `
            <div class="request-item">
                <div class="request-info">
                    <strong>${utils.escapeHTML(req.studentId.firstName)} ${utils.escapeHTML(req.studentId.lastName)}</strong>
                    მოითხოვს ხელახლა გაკეთებას ქვიზისთვის:
                    <em>${utils.escapeHTML(req.requestableId.title)}</em>
                    <p class="request-reason">მიზეზი: "${utils.escapeHTML(req.reason)}"</p>
                </div>
                <div class="request-actions">
                    <button class="btn btn-success" data-action="approve-request" data-request-id="${req._id}">დამტკიცება</button>
                    <button class="btn btn-danger" data-action="deny-request" data-request-id="${req._id}">უარყოფა</button>
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
            console.error('ხედის განახლების შეცდომა:', error);
        }
    },

    groupQuizzesByDate(quizzes) {
        const groups = {};
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // Sort quizzes by due date, newest first
        quizzes.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

        quizzes.forEach(quiz => {
            const dueDate = new Date(quiz.dueDate);
            let key = dueDate.toLocaleDateString('ka-GE', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });

            // Use friendly labels for today and yesterday
            if (dueDate.toDateString() === today.toDateString()) key = 'დღეს';
            if (dueDate.toDateString() === yesterday.toDateString()) key = 'გუშინ';

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(quiz);
        });

        return groups;
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
            let message = 'ამ ხედში ქვიზები არაა ნაჩვენები.';
            if (state.currentUser.role !== ROLES.STUDENT && !state.selectedGroupId) {
                message = 'გთხოვთ აირჩიოთ ჯგუფი მისი ქვიზების სანახავად.';
            }
            container.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><p>${message}</p></div>`;
            return;
        }

        // Apply grouping logic only for 'completed' and 'past-due' tabs
        if (['completed', 'past-due'].includes(state.activeTab)) {
            const groupedQuizzes = this.groupQuizzesByDate(state.studentQuizzes);
            container.innerHTML = Object.entries(groupedQuizzes).map(([dateLabel, quizzes]) => `
                <h3 class="date-group-header">${dateLabel}</h3>
                <div class="list-container">
                    ${quizzes.map(q => this.renderQuizItem(q)).join('')}
                </div>
            `).join('');
        } else {
            // Render a simple list for other tabs
            container.innerHTML = `
                <div class="list-container">
                    ${state.studentQuizzes.map(item => this.renderQuizItem(item)).join('')}
                </div>
            `;
        }
    },

       // Render the detailed view of a quiz
    renderDetailView() {
        try {
            // ✅ This is a safe check before attempting to render.
            if (!state.detailedQuiz) {
                elements.detailView.innerHTML = `
                    <div class="error-message">
                        <p>ქვიზის დეტალების ჩატვირთვა ვერ მოხერხდა. გთხოვთ, დაბრუნდით და სცადოთ თავიდან.</p>
                        <button class="btn btn-primary" data-action="back-to-list">
                            უკან სიაში
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
            console.error('დეტალური ხედის გამოსახვის შეცდომა:', error);
            elements.detailView.innerHTML = `<div class="error-message"><p>მოხდა კრიტიკული შეცდომა ქვიზის დეტალების ჩვენებისას.</p></div>`;
        }
    },
    // Render student-specific detail view
    async renderUnifiedResultsView(quiz) {
        const uniqueAnalyticsId = `analytics-${quiz.templateId._id}`;
        
        elements.detailView.innerHTML = `
            <div class="detail-panel results-dashboard">
                 <div class="detail-panel-header">
                    <button class="btn back-btn" data-action="${QUIZ_ACTIONS.BACK_TO_LIST}"><i class="fas fa-arrow-left"></i> უკან</button>
                    <h2 class="quiz-title-detail">${utils.escapeHTML(quiz.templateTitle)}</h2>
                </div>
                <div class="results-grid">
                    <div class="stat-card">
                        <div class="stat-label">სტუდენტი</div>
                        <div class="stat-value student-name">${utils.escapeHTML(quiz.studentId?.firstName)} ${utils.escapeHTML(quiz.studentId?.lastName)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">სტუდენტის ქულა</div>
                        <div class="stat-value score-value">${quiz.grade?.score ?? 'N/A'} / ${quiz.templatePoints} (${(quiz.templatePoints > 0 && quiz.grade?.score != null) ? ((quiz.grade.score / quiz.templatePoints) * 100).toFixed(0) : 0}%)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">კლასის საშუალო</div>
                        <div class="stat-value class-average" id="${uniqueAnalyticsId}"><i class="fas fa-spinner fa-spin"></i></div>
                    </div>
                </div>
                <div class="results-actions">
                    ${quiz.lastAttemptId ? `<button class="btn btn-primary" data-action="${QUIZ_ACTIONS.REVIEW_QUIZ}" data-attempt-id="${quiz.lastAttemptId}">პასუხების გადახედვა</button>` : ''}
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
            const timeLimit = quiz.templateId?.timeLimit || 'დროის ლიმიტი არ არის';
            const totalPoints = quiz.templatePoints || 0;
            const description = quiz.templateId?.description || 'აღწერა არ არის მოწოდებული';

            // ✅ This block contains the specific rules, translated into Georgian.
            const instructionsInGeorgian = `
                <h3 style="color: var(--warning-accent);">ყურადღება! მნიშვნელოვანი ინსტრუქციები</h3>
                <ul class="instructions-list">
                    <li><i class="fas fa-arrows-alt"></i> ქვიზის დაწყებისას, გვერდი გადავა სრულ ეკრანზე.</li>
                    <li><i class="fas fa-sign-out-alt"></i> სრული ეკრანიდან გასვლა ან სხვა ფანჯარაში გადასვლა გამოიწვევს ქვიზის ავტომატურ დასრულებას.</li>
                    <li><i class="fas fa-camera"></i> სქრინშოთის გადაღება და კოპირება აკრძალულია.</li>
                    <li><i class="fas fa-clock"></i> ქვიზი ავტომატურად დასრულდება დროის ამოწურვისას.</li>
                </ul>
            `;

            elements.detailView.innerHTML = `
                <div class="detail-panel">
                    <div class="detail-panel-header">
                        <button class="btn back-btn" data-action="${QUIZ_ACTIONS.BACK_TO_LIST}"><i class="fas fa-arrow-left"></i> უკან</button>
                        <h2 class="quiz-title-detail">${quizTitle}</h2>
                    </div>
                    <div class="quiz-instructions-content" style="padding: 20px;">
                        ${!isStudent ? `<p><strong>სტუდენტი:</strong> ${utils.escapeHTML(quiz.studentId?.firstName)} ${utils.escapeHTML(quiz.studentId?.lastName)}</p>` : ''}
                        
                        <div class="quiz-info-card" style="background-color: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border-color);">
                            <h3 style="margin-top: 0; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">ქვიზის ინფორმაცია</h3>
                            <p><strong>სტატუსი:</strong> <span class="status-badge ${quiz.status.toLowerCase()}">${utils.translateStatus(quiz.status)}</span></p>
                            <p><strong>აღწერა:</strong> ${utils.sanitizeHTML(description)}</p>
                            <p><strong>სულ ქულა:</strong> ${totalPoints}</p>
                            <p><strong>დროის ლიმიტი:</strong> ${timeLimit} ${typeof timeLimit === 'number' ? 'წუთი' : ''}</p>
                            <p><strong>ხელმისაწვდომია:</strong> ${utils.formatDate(startTime)}</p>
                            <p><strong>ვადა:</strong> ${utils.formatDate(endTime)}</p>
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
            console.error('ინსტრუქციების ხედის გამოსახვის შეცდომა:', error);
        }
    },

    // Render quiz statistics section
    renderQuizStats(quiz) {
        return `
            <div class="quiz-stats-container">
                <div class="stat-card">
                    <div class="stat-value" id="total-students">0</div>
                    <div class="stat-label">სულ სტუდენტები</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="completed-attempts">0</div>
                    <div class="stat-label">დასრულებული</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="average-score">0%</div>
                    <div class="stat-label">საშუალო ქულა</div>
                </div>
            </div>
            <div class="student-attempts-container">
                <h3>სტუდენტების ცდები</h3>
                <div class="student-list" id="student-attempts-list">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;
    },

    // Load and display quiz analytics
    async loadQuizAnalytics(quizId) {
        try {
            if (!utils.isValidObjectId(quizId)) {
                console.error('ანალიტიკისთვის ქვიზის ID არასწორია:', quizId);
                return;
            }
            
            const analytics = await apiService.fetchQuizAnalytics(quizId);
            if (!analytics) {
                console.error('ანალიტიკის მონაცემები არ მიღებულა');
                return;
            }
            
            // Update stats
            if (document.getElementById('total-students')) {
                document.getElementById('total-students').textContent = analytics.participation?.totalStudents || 0;
            }
            
            if (document.getElementById('completed-attempts')) {
                document.getElementById('completed-attempts').textContent = analytics.participation?.attemptedCount || 0;
            }
            
            if (document.getElementById('average-score')) {
                document.getElementById('average-score').textContent = `${(analytics.performance?.averageScore || 0).toFixed(1)}%`;
            }

            // Update student attempts list
            const studentList = document.getElementById('student-attempts-list');
            if (!studentList) return;
            
            if (analytics.attempts && analytics.attempts.length > 0) {
                studentList.innerHTML = analytics.attempts.map(attempt => `
                    <div class="student-attempt-item">
                        <div class="student-info">
                            <span class="student-name">
                                ${utils.escapeHTML(attempt.student?.firstName || '')} 
                                ${utils.escapeHTML(attempt.student?.lastName || '')}
                            </span>
                            <span class="student-email">${utils.escapeHTML(attempt.student?.email || '')}</span>
                        </div>
                        <div class="attempt-info">
                            <span class="attempt-status status-badge ${attempt.status}">${utils.translateStatus(attempt.status)}</span>
                            <span class="attempt-score">${attempt.score || 0}/${attempt.quiz?.totalPoints || 0}</span>
                        </div>
                        <div class="attempt-actions">
                            <button class="btn btn-secondary view-attempt-btn" 
                                    data-action="${QUIZ_ACTIONS.VIEW_STUDENT_ATTEMPT}" 
                                    data-attempt-id="${attempt._id}">
                                <i class="fas fa-eye"></i> ნახვა
                            </button>
                        </div>
                    </div>
                `).join('');
            } else {
                studentList.innerHTML = '<p>ამ ქვიზზე ჯერ არავინ არ ცდილობდა.</p>';
            }
        } catch (error) {
            console.error('ქვიზის ანალიტიკის ჩატვირთვა ვერ მოხერხდა:', error);
            this.showNotification('ქვიზის ანალიტიკის ჩატვირთვა ვერ მოხერხდა', 'error');
            
            const studentList = document.getElementById('student-attempts-list');
            if (studentList) {
                studentList.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>ანალიტიკის მონაცემების ჩატვირთვა ვერ მოხერხდა.</p>
                    </div>
                `;
            }
        }
    },

    // Open a modal dialog
    openModal(type, data = null, isLayered = false) {
        try {
            const templateId = `template-${type}-modal`;
            const template = document.getElementById(templateId);

            if (!template) {
                console.error(`მოდალური შაბლონი ID-ით "${templateId}" ვერ მოიძებნა.`);
                return;
            }

            if (!isLayered) {
                elements.modalBackdrop.innerHTML = '';
                state.modalStack = [];
            }

            const content = template.content.cloneNode(true);
            const modalElement = content.querySelector('.modal');
            
            if (!modalElement) {
                console.error('მოდალური ელემენტი შაბლონში ვერ მოიძებნა');
                return;
            }
            
            modalElement.id = `modal-${type}-${Date.now()}`;
            elements.modalBackdrop.appendChild(content);
            state.modalStack.push(modalElement.id);

            switch (type) {
                case 'create-edit-quiz':
                    this.setupQuizModal(modalElement, data);
                    break;
                case 'quiz-instructions':
                    this.setupInstructionsModal(modalElement);
                    break;
                case 'quiz-taking':
                    // This block intentionally does NOT add event listeners for navigation.
                    // The global handleGlobalClick function is the single source of truth for those actions.
                    this.setupQuizTakingModal(modalElement);
                    break;
                case 'quiz-bank':
                    this.setupQuestionBankModal(modalElement);
                    break;
                case 'question-bank': // Added for completeness from your file
                    this.setupQuestionBankModal(modalElement);
                    break;
                default:
                    console.warn(`უცნობი მოდალის ტიპი: ${type}`);
            }

            // Add event listeners for all "close" buttons within the new modal
            modalElement.querySelectorAll(`[data-action="${QUIZ_ACTIONS.CLOSE_MODAL}"]`).forEach(btn => {
                btn.addEventListener('click', () => this.closeModal());
            });
            
            elements.modalBackdrop.style.display = 'flex';
        } catch (error) {
            console.error('მოდალის გახსნის შეცდომა:', error);
        }
    },

    // Close the current modal
    closeModal() {
        try {
            if (state.modalStack.length > 0) {
                const modalId = state.modalStack.pop();
                const modalElement = document.getElementById(modalId);
                
                if (modalElement) {
                    modalElement.remove();
                }
            }
            
            // Hide backdrop if no modals left
            if (state.modalStack.length === 0) {
                elements.modalBackdrop.style.display = 'none';
                elements.modalBackdrop.innerHTML = '';
            }
        } catch (error) {
            console.error('მოდალის დახურვის შეცდომა:', error);
        }
    },

    // Setup quiz creation/editing modal
    setupQuizModal(modalElement, data) {
        try {
            const groupSelect = modalElement.querySelector('#quiz-group');
            if (groupSelect) {
                const relevantGroups = state.currentUser.role === ROLES.ADMIN ?
                    state.groups :
                    state.groups.filter(g => 
                        g.users && g.users.some(u => 
                            u._id && u._id.toString() === state.currentUser._id.toString()
                        )
                    );
                
                groupSelect.innerHTML = relevantGroups.map(g => `
                    <option value="${g._id}">${utils.escapeHTML(g.name)}</option>
                `).join('');
            }

            const now = new Date();
            const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
            
            modalElement.querySelector('#quiz-start-time').value = utils.formatDateTimeLocal(now);
            modalElement.querySelector('#quiz-end-time').value = utils.formatDateTimeLocal(oneHourLater);

            if (data) { // Prefill data if editing
                modalElement.querySelector('#modal-title').textContent = 'ქვიზის რედაქტირება';
                modalElement.querySelector('#quiz-title').value = data.title || '';
                modalElement.querySelector('#quiz-description').value = data.description || '';
                modalElement.querySelector('#quiz-start-time').value = utils.formatDateTimeLocal(new Date(data.startTime || now));
                modalElement.querySelector('#quiz-end-time').value = utils.formatDateTimeLocal(new Date(data.endTime || oneHourLater));
                modalElement.querySelector('#quiz-time-limit').value = data.timeLimit || 60;
                modalElement.querySelector('#quiz-group').value = data.group?._id || data.groupId || data.courseId[0]?._id || '';
                
                // ✅ FIX: Removed pre-filling for deleted fields (maxAttempts, showResults, password, etc.)
                
                this.renderQuestions(data.questions, modalElement);
            } else {
                this.addNewQuestion(modalElement);
            }

            modalElement.addEventListener('input', utils.debounce((e) => {
                if (e.target.matches('.question-text, .option-text, .question-solution')) {
                    this.updateLatexPreview(e.target);
                }
            }, 300));

            // ✅ FIX: Removed event listener for the deleted password checkbox.

            const addFromBankBtn = modalElement.querySelector('#add-from-quiz-bank-btn');
            if (addFromBankBtn) {
                addFromBankBtn.addEventListener('click', () => {
                    eventHandlers.handleAddFromQuizBank();
                });
            }

            const form = modalElement.querySelector('form');
            if (form) {
                form.onsubmit = async (e) => {
                    e.preventDefault();
                    if (data) {
                        await eventHandlers.handleUpdateQuiz(data._id, form);
                    } else {
                        await eventHandlers.handleCreateQuiz(form);
                    }
                };
            }
        } catch (error) {
            console.error('ქვიზის მოდალის დაყენების შეცდომა:', error);
        }
    },

    // Setup quiz instructions modal
    setupInstructionsModal(modalElement) {
        try {
            if (state.detailedQuiz?.templateId?.requiresPassword) {
                const passwordContainer = modalElement.querySelector('#password-field-container');
                if (passwordContainer) {
                    passwordContainer.style.display = 'block';
                }
            }
            
            const instructionsText = modalElement.querySelector('#quiz-instructions-text');
            const instructionsTitle = modalElement.querySelector('.quiz-instructions-title');
            
            if (instructionsText && instructionsTitle && state.detailedQuiz) {
                instructionsTitle.textContent = state.detailedQuiz.templateTitle || state.detailedQuiz.title;
                instructionsText.innerHTML = utils.sanitizeHTML(
                    state.detailedQuiz.templateId?.instructions || 
                    state.detailedQuiz.instructions || 
                    'ამ ქვიზისთვის სპეციალური ინსტრუქციები არ არის მოწოდებული.'
                );
            }
            
            const agreementCheckbox = modalElement.querySelector('#quiz-agreement');
            const startButton = modalElement.querySelector('#start-quiz-after-instructions');
            
            if (agreementCheckbox && startButton) {
                agreementCheckbox.addEventListener('change', () => {
                    startButton.disabled = !agreementCheckbox.checked;
                });
                
                startButton.addEventListener('click', () => {
                    const password = state.detailedQuiz.templateId?.requiresPassword ? 
                        modalElement.querySelector('#quiz-password')?.value : null;
                    
                    this.closeModal();
                    eventHandlers.handleRealStartQuiz(state.detailedQuiz._id, password);
                });
            }
        } catch (error) {
            console.error('ინსტრუქციების მოდალის დაყენების შეცდომა:', error);
        }
    },

    // Setup quiz taking modal
    setupQuizTakingModal(modalElement) {
        try {
            const quiz = state.detailedQuiz;
            const attempt = state.activeQuizAttempt;
            const questions = quiz.templateId?.questions || [];
            
            if (questions.length === 0) {
                this.showNotification('ქვიზის მონაცემები არასრულია.', 'error');
                this.closeModal();
                return;
            }
            
            const questionIndex = state.currentQuestionIndex;
            const question = questions[questionIndex];
            
            if (!question) {
                this.showNotification('კითხვა ვერ მოიძებნა.', 'error');
                this.closeModal();
                return;
            }

            modalElement.querySelector('.quiz-title-taking').textContent = quiz.templateTitle;
            modalElement.querySelector('#total-questions').textContent = questions.length;
            modalElement.querySelector('#current-question-number').textContent = questionIndex + 1;
            
            const progress = ((questionIndex + 1) / questions.length) * 100;
            modalElement.querySelector('.progress-fill').style.width = `${progress}%`;
            
            // --- FIX: Use innerHTML to ensure LaTeX delimiters are preserved ---
            const questionTextElement = modalElement.querySelector('.question-text-taking');
            questionTextElement.innerHTML = question.text; // Content from DB is assumed to be safe
            
            const imageContainer = modalElement.querySelector('.question-image-container');
            if (question.imageUrl) {
                imageContainer.querySelector('img').src = question.imageUrl;
                imageContainer.style.display = 'flex';
            } else {
                imageContainer.style.display = 'none';
            }
            
            const optionsContainer = modalElement.querySelector('.options-container-taking');
            optionsContainer.innerHTML = '';
            (question.options || []).forEach((option, index) => {
                const optionElement = document.createElement('div');
                optionElement.className = 'option-taking';
                optionElement.dataset.optionIndex = index;
                
                // --- FIX: Use innerHTML here as well for options with LaTeX ---
                optionElement.innerHTML = `
                    <span class="option-letter">${String.fromCharCode(65 + index)}</span>
                    <span class="option-text">${option.text}</span>
                `;
                
                const existingAnswer = attempt.answers?.find(a => a.question?.toString() === question._id.toString());
                if (existingAnswer && existingAnswer.selectedOptionIndex === index) {
                    optionElement.classList.add('selected');
                }

                optionElement.addEventListener('click', () => eventHandlers.handleSelectOption(index));
                optionsContainer.appendChild(optionElement);
            });
            
            modalElement.querySelector('.prev-question-btn').disabled = (questionIndex === 0);
            modalElement.querySelector('.next-question-btn').style.display = (questionIndex === questions.length - 1) ? 'none' : 'block';
            modalElement.querySelector('.finish-quiz-btn').style.display = (questionIndex === questions.length - 1) ? 'block' : 'none';

            // --- FIX: Tell MathJax to render all the new math content in the modal ---
            utils.renderMath(modalElement);

        } catch (error) {
            console.error('ქვიზის გაკეთების მოდალის დაყენების შეცდომა:', error);
        }
    },

    // Setup question bank modal
    setupQuestionBankModal(modalElement) {
        try {
            const groupSelect = document.querySelector('#quiz-group');
            if (!groupSelect) {
                this.showNotification('გთხოვთ ჯერ აირჩიოთ ჯგუფი', 'error');
                this.closeModal();
                return;
            }
            
            const groupId = groupSelect.value;
            if (!groupId) {
                this.showNotification('გთხოვთ ჯერ აირჩიოთ ჯგუფი', 'error');
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
                        banksContainer.innerHTML = '<p class="empty-state">ამ ჯგუფისთვის კითხვების ბანკები არ არის ხელმისაწვდომი.</p>';
                        return;
                    }
                    
                    // Render question banks
                    banks.forEach(bank => {
                        const bankElement = document.createElement('div');
                        bankElement.className = 'question-bank-item';
                        bankElement.innerHTML = `
                            <h4>${utils.escapeHTML(bank.name)}</h4>
                            <p>${utils.escapeHTML(bank.description || 'აღწერა არ არის')}</p>
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
                    this.showNotification('კითხვების ბანკების ჩატვირთვა ვერ მოხერხდა', 'error');
                });
        } catch (error) {
            console.error('კითხვების ბანკის მოდალის დაყენების შეცდომა:', error);
        }
    },

    // Update LaTeX preview
    updateLatexPreview(inputElement) {
        try {
            const previewElement = inputElement.nextElementSibling;
            if (previewElement && previewElement.classList.contains('latex-preview')) {
                // --- FIX: Directly set the raw value to innerHTML. ---
                // MathJax needs the raw, un-escaped LaTeX string to process it.
                // We trust this input because it's coming from a teacher/admin in the editor.
                previewElement.innerHTML = inputElement.value;
                
                // --- FIX: Explicitly call the renderMath helper ---
                utils.renderMath(previewElement);
            }
        } catch (error) {
            console.error('LaTeX პრევიუს განახლების შეცდომა:', error);
        }
    },
    // Add a new question to the form
    addNewQuestion(modalElement) {
        try {
            const questionsContainer = modalElement.querySelector('#questions-container');
            const questionTemplate = document.getElementById('template-question-item');
            
            if (!questionTemplate || !questionsContainer) {
                console.error('კითხვის შაბლონი ან კონტეინერი ვერ მოიძებნა');
                return;
            }

            // Clone question template
            const questionClone = questionTemplate.content.cloneNode(true);
            const questionItem = questionClone.querySelector('.question-item');

            // Set question number
            const questionNumber = questionsContainer.children.length + 1;
            questionItem.querySelector('.question-number').textContent = `კითხვა #${questionNumber}`;
            
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
            console.error('ახალი კითხვის დამატების შეცდომა:', error);
        }
    },
    
    // Handle image upload
    async handleImageUpload(input, preview) {
        try {
            const file = input.files[0];
            if (!file) return;
            
            // Validate file type
            if (!file.type.startsWith('image/')) {
                this.showNotification('გთხოვთ აირჩიოთ სურათის ფაილი', 'error');
                return;
            }
            
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                this.showNotification('სურათი უნდა იყოს 5MB-ზე ნაკლები', 'error');
                return;
            }
            
            const result = await apiService.uploadQuestionImage(file);
            if (preview && preview.querySelector('img')) {
                preview.querySelector('img').src = result.imageUrl;
                preview.style.display = 'block';
                this.showNotification('სურათი წარმატებით აიტვირთა');
            }
        } catch (error) {
            console.error('სურათის ატვირთვა ვერ მოხერხდა:', error);
            this.showNotification('სურათის ატვირთვა ვერ მოხერხდა', 'error');
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
            console.error('სურათის წაშლის შეცდომა:', error);
        }
    },

    // Add a new option to a question
    addNewOption(optionsContainer) {
        try {
            const optionTemplate = document.getElementById('template-option-item');
            if (!optionTemplate || !optionsContainer) {
                console.error('ოფშენის შაბლონი ან კონტეინერი ვერ მოიძებნა');
                return;
            }
            
            const optionClone = optionTemplate.content.cloneNode(true);
            optionsContainer.appendChild(optionClone);
            this.reletterOptions(optionsContainer);
        } catch (error) {
            console.error('ახალი ოფშენის დამატების შეცდომა:', error);
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
            console.error('ოფშენების ასოებით აღნიშვნის შეცდომა:', error);
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
                        questionElement.querySelector('.question-type').value = question.type || 'multiple-choice';

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
            console.error('კითხვების გამოსახვის შეცდომა:', error);
        }
    },

    // Renumber questions
    renumberQuestions(questionsContainer) {
        try {
            Array.from(questionsContainer.children).forEach((question, index) => {
                const numberElement = question.querySelector('.question-number');
                if (numberElement) numberElement.textContent = `კითხვა #${index + 1}`;
                
                question.dataset.questionIndex = index;
                const optionsContainer = question.querySelector('.options-container');
                if (optionsContainer) this.reletterOptions(optionsContainer);
            });
        } catch (error) {
            console.error('კითხვების ნუმერაციის შეცდომა:', error);
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
            
            const reviewContainer = clone.querySelector('.questions-review');
            if (reviewContainer && quizTemplate.questions) {
                quizTemplate.questions.forEach((question, index) => {
                    const reviewItemTemplate = document.getElementById('template-question-review');
                    if (!reviewItemTemplate) return;
                    
                    const reviewClone = reviewItemTemplate.content.cloneNode(true);
                    const studentAnswer = results.answers.find(ans => ans.question?.toString() === question._id.toString());

                    // --- FIX: Use innerHTML for all text that might contain LaTeX ---
                    reviewClone.querySelector('.question-number-review').textContent = `კითხვა ${index + 1}`;
                    reviewClone.querySelector('.question-points-review').textContent = `${studentAnswer ? studentAnswer.pointsAwarded : 0} / ${question.points} ქულა`;
                    reviewClone.querySelector('.question-text-review').innerHTML = question.text;
                    reviewClone.querySelector('.solution-text').innerHTML = question.solution || 'გამოსავალი არ არის მოწოდებული.';

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
            
            // --- FIX: Tell MathJax to render all the math on the results page ---
            utils.renderMath(elements.detailView);
            
        } catch (error) {
            console.error('ქვიზის შედეგების გამოსახვის შეცდომა:', error);
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
            console.error('შეტყობინების ჩვენების შეცდომა:', error);
        }
    },

    // Prefill quiz form from template
    prefillQuizForm(quizData) {
        try {
            const modal = document.querySelector('#modal-create-edit-quiz');
            if (!modal) {
                this.showNotification('ქვიზის ფორმა ვერ მოიძებნა წინასწარი შესავსებად.', 'error');
                return;
            }

            // Prefill basic fields
            modal.querySelector('#quiz-title').value = (quizData.title || '') + ' (კოპირება)';
            modal.querySelector('#quiz-description').value = quizData.description || '';
            modal.querySelector('#quiz-time-limit').value = quizData.timeLimit || 60;
            modal.querySelector('#quiz-max-attempts').value = quizData.maxAttempts || 1;
            modal.querySelector('#quiz-show-results').value = quizData.showResults || 'after-submission';
            modal.querySelector('#quiz-allow-retakes').checked = quizData.allowRetakes || false;

            // Handle password field
            const requiresPasswordField = modal.querySelector('#quiz-requires-password');
            const passwordField = modal.querySelector('#quiz-password-field');
            requiresPasswordField.checked = quizData.requiresPassword || false;
            
            if (requiresPasswordField.checked) {
                passwordField.style.display = 'block';
                passwordField.value = quizData.password || '';
            } else {
                passwordField.style.display = 'none';
                passwordField.value = '';
            }

            // Render questions
            this.renderQuestions(quizData.questions, modal);
        } catch (error) {
            console.error('ქვიზის ფორმის წინასწარი შევსების შეცდომა:', error);
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
                    listContainer.innerHTML = '<p>შენახული ქვიზის შაბლონები არ მოიძებნა.</p>';
                    return;
                }

                // Create list items
                listContainer.innerHTML = quizBankTemplates.map(quiz => `
                    <div class="quiz-item" data-action="${QUIZ_ACTIONS.SELECT_QUIZ_FROM_BANK}" data-quiz-id="${quiz._id}">
                        <i class="fas fa-file-alt quiz-item-icon"></i>
                        <div class="quiz-item-info">
                            <span class="quiz-item-title">${utils.escapeHTML(quiz.title)}</span>
                            <span class="quiz-item-meta">${quiz.questions.length} კითხვა</span>
                        </div>
                    </div>
                `).join('');

                // Save to state
                state.quizBank = quizBankTemplates;
            } catch (error) {
                console.error('ქვიზების ბანკის ჩატვირთვა ვერ მოხერხდა:', error);
                listContainer.innerHTML = '<p>ქვიზების ბანკის ჩატვირთვა ვერ მოხერხდა.</p>';
            }
        } catch (error) {
            console.error('ქვიზების ბანკის მოდალის დაყენების შეცდომა:', error);
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
            console.error('მოვლენების დამმუშავებლების ინიციალიზაციის შეცდომა:', error);
        }
    },

    // Handle group change
    async handleGroupChange(e) {
        try {
            const groupId = e.target.value;
            state.selectedGroupId = groupId;
            await this.loadQuizzes();
        } catch (error) {
            console.error('ჯგუფის ცვლილების დამუშავების შეცდომა:', error);
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
            console.error('ტაბის დაჭერის დამუშავების შეცდომა:', error);
        }
    },

       // Handle view detail
    async handleViewDetail(quizId) {
        try {
            if (!quizId) {
                console.error('handleViewDetail was called with an invalid ID.');
                uiRenderer.showNotification('ქვიზის ჩატვირთვა შეუძლებელია: ID აკლია.', 'error');
                return;
            }

            state.isLoading = true;
            uiRenderer.updateView();
            
            const responseData = await apiService.fetchQuizById(quizId);
            const quiz = responseData.data;

            if (!quiz) {
                throw new Error('ქვიზის მონაცემები სერვერის პასუხში ვერ მოიძებნა.');
            }
            
            state.detailedQuiz = quiz;
            state.currentView = 'detail';
            
            state.isLoading = false;
            uiRenderer.updateView();
        } catch (error) {
            console.error('ქვიზის დეტალების მიღება ვერ მოხერხდა:', error);
            uiRenderer.showNotification('ქვიზის დეტალების ჩატვირთვა ვერ მოხერხდა', 'error');
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
            console.error('ქვიზის შედეგების მიღება ვერ მოხერხდა:', error);
            uiRenderer.showNotification('ქვიზის შედეგების ჩატვირთვა ვერ მოხერხდა', 'error');
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
            console.error('სიაში დაბრუნების დამუშავების შეცდომა:', error);
        }
    },

    // Handle edit quiz
    async handleEditQuiz(quizId) {
        try {
            const quiz = await apiService.fetchQuizById(quizId);
            uiRenderer.openModal('create-edit-quiz', quiz);
        } catch (error) {
            console.error('რედაქტირებისთვის ქვიზის მიღება ვერ მოხერხდა:', error);
            uiRenderer.showNotification('რედაქტირებისთვის ქვიზის ჩატვირთვა ვერ მოხერხდა', 'error');
        }
    },

    // Handle delete quiz
    async handleDeleteQuiz(quizId) {
        try {
            const confirmed = confirm('დარწმუნებული ხართ, რომ გსურთ ამ ქვიზის წაშლა? ეს ქმედება შეუქცევადია.');
            if (!confirmed) return;
            
            await apiService.deleteQuiz(quizId);
            uiRenderer.showNotification('ქვიზი წარმატებით წაიშალა');
            await this.loadQuizzes();
            this.handleBackToList();
        } catch (error) {
            console.error('ქვიზის წაშლა ვერ მოხერხდა:', error);
            uiRenderer.showNotification('ქვიზის წაშლა ვერ მოხერხდა', 'error');
        }
    },

    // Handle start quiz
    async handleStartQuiz(quizId) {
        // Target the entire HTML document for the fullscreen request.
        const quizElement = document.documentElement;

        // Check if the browser supports the Fullscreen API.
        if (!quizElement.requestFullscreen && !quizElement.webkitRequestFullscreen) {
            uiRenderer.showNotification('თქვენი ბრაუზერი არ უჭერს მხარს სრულეკრანიან რეჟიმს, რომელიც აუცილებელია ქვიზისთვის.', 'error');
            return;
        }

        uiRenderer.showNotification('ქვიზის დასაწყებად, გთხოვთ, დაუშვათ სრულეკრანიანი რეჟიმი.', 'info');

        try {
            // Directly request fullscreen. The browser will now show a permission pop-up.
            // This 'await' will pause the function until the user clicks "Allow" or "Deny".
            if (quizElement.requestFullscreen) {
                await quizElement.requestFullscreen();
            } else if (quizElement.webkitRequestFullscreen) { // For Safari
                await quizElement.webkitRequestFullscreen();
            }

            // --- This code ONLY runs if the user clicks "Allow" ---
            const attempt = await apiService.startQuizAttempt(quizId);
            state.activeQuizAttempt = attempt;
            state.currentQuestionIndex = 0;

            // Use a short timeout for a smoother visual transition into the quiz modal.
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
            }, 150);

        } catch (error) {
            // --- This code runs if the user clicks "Deny" or an error occurs ---
            console.error('Fullscreen request failed:', error);
            uiRenderer.showNotification('ქვიზის დასაწყებად სრულეკრანიან რეჟიმზე წვდომა აუცილებელია. გთხოვთ, სცადოთ თავიდან.', 'error');
        }
    },

    // Handle real start quiz (with password)
    async handleRealStartQuiz(quizId, password = null) {
        try {
            const attempt = await apiService.startQuizAttempt(quizId, password);
            state.activeQuizAttempt = attempt;
            state.currentQuestionIndex = 0;
            
            // This timeout provides a brief moment for the DOM to update after the API call,
            // ensuring the modal and its elements are ready.
            setTimeout(() => {
                uiRenderer.openModal('quiz-taking');
                
                const timeLimit = state.detailedQuiz.templateId?.timeLimit;
                const deadline = state.detailedQuiz.dueDate;
                
                if (timeLimit && Number(timeLimit) > 0) {
                    this.startQuizTimers(Number(timeLimit), deadline);
                } else {
                    // If there's no time limit, hide the timer element completely.
                    const countdownElement = document.querySelector('#quiz-countdown');
                    if (countdownElement) {
                       countdownElement.parentElement.style.display = 'none';
                    }
                }
            }, 100);
        } catch (error) {
            uiRenderer.showNotification(error.data?.message || 'ქვიზის დაწყება ვერ მოხერხდა', 'error');
        }
    },
    // Start quiz timer
    startQuizTimers(durationInMinutes, deadlineDate) {
        // Clear any previous timers to prevent memory leaks.
        if (state.quizTimer) clearInterval(state.quizTimer);
        if (state.quizDeadlineTimer) clearTimeout(state.quizDeadlineTimer);

        const countdownElement = document.querySelector('#quiz-countdown');

        // --- FIX 1: Robustness Check ---
        // This check prevents the entire function from crashing if the countdown
        // element is somehow not found in the DOM.
        if (!countdownElement) {
            console.error('CRITICAL: Could not find the #quiz-countdown element to display the timer.');
            return;
        }
        
        // Ensure the timer container is visible.
        countdownElement.parentElement.style.display = 'flex';

        let timeLeftInSeconds = durationInMinutes * 60;

        // Helper function to update the timer display, avoiding code repetition.
        const updateTimerDisplay = () => {
            if (timeLeftInSeconds < 0) timeLeftInSeconds = 0;
            const minutes = Math.floor(timeLeftInSeconds / 60);
            const seconds = timeLeftInSeconds % 60;
            countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // Add a visual warning when time is low.
            if (timeLeftInSeconds <= 60) {
                countdownElement.parentElement.classList.add('critical');
            }
        };

        // --- FIX 2: Immediate Display ---
        // This line is crucial. It displays the starting time immediately,
        // so you don't have to wait one full second for the first update.
        updateTimerDisplay();

        // 1. Countdown Timer (updates every second)
        state.quizTimer = setInterval(() => {
            timeLeftInSeconds--;
            updateTimerDisplay();
            if (timeLeftInSeconds <= 0) {
                this.handleFinishQuiz(); // Automatically submits the quiz when time runs out.
            }
        }, 1000);

        // 2. Hard Deadline Timer (a failsafe for the quiz due date)
        const timeUntilDeadline = new Date(deadlineDate) - new Date();
        if (timeUntilDeadline > 0) {
            state.quizDeadlineTimer = setTimeout(() => {
                uiRenderer.showNotification("ქვიზის ვადა ამოიწურა. ავტომატურად იგზავნება.", 'warning');
                this.handleFinishQuiz();
            }, timeUntilDeadline);
        }
        
        // 3. Anti-Cheating Event Listeners
        this.beforeUnloadListener = (e) => { e.preventDefault(); e.returnValue = ''; };
        this.visibilityChangeListener = () => {
            if (document.hidden) {
                uiRenderer.showNotification("თქვენ დატოვეთ გვერდი. ქვიზი გაიგზავნება.", 'error');
                this.handleFinishQuiz();
            }
        };
        this.fullscreenChangeListener = () => {
            if (!document.fullscreenElement) {
                uiRenderer.showNotification("თქვენ დატოვეთ სრულეკრანიანი რეჟიმი. ქვიზი გაიგზავნება.", 'error');
                this.handleFinishQuiz();
            }
        };

        window.addEventListener('beforeunload', this.beforeUnloadListener);
        document.addEventListener('visibilitychange', this.visibilityChangeListener);
        document.addEventListener('fullscreenchange', this.fullscreenChangeListener);
    },
    // Handle select option
    async handleSelectOption(optionIndex) {
        try {
            const quiz = state.detailedQuiz;
            const attempt = state.activeQuizAttempt;
            
            // Get questions
            const questions = quiz.templateId?.questions || [];
            
            if (questions.length === 0) {
                console.error('ქვიზის მონაცემები არასრულია ან კითხვები აკლია');
                uiRenderer.showNotification('ქვიზის მონაცემები არასრულია. გთხოვთ, სცადოთ თავიდან.', 'error');
                return;
            }
            
            const question = questions[state.currentQuestionIndex];
            if (!question || !question._id) {
                console.error('კითხვა ვერ მოიძებნა ინდექსზე', state.currentQuestionIndex);
                uiRenderer.showNotification('კითხვა ვერ მოიძებნა. გთხოვთ, სცადოთ თავიდან.', 'error');
                return;
            }
            
            // Submit answer to server
            await apiService.submitAnswer(attempt._id, question._id, optionIndex);
            
            // Update local attempt state
            const existingAnswerIndex = attempt.answers.findIndex(a => 
                a.question && a.question.toString() === question._id.toString()
            );
            
            if (existingAnswerIndex !== -1) {
                // Update existing answer
                attempt.answers[existingAnswerIndex] = {
                    question: question._id,
                    selectedOptionIndex: optionIndex,
                    answeredAt: new Date()
                };
            } else {
                // Add new answer
                attempt.answers.push({
                    question: question._id,
                    selectedOptionIndex: optionIndex,
                    answeredAt: new Date()
                });
            }
            
            // Update UI
            const options = document.querySelectorAll('.option-taking');
            options.forEach(opt => opt.classList.remove('selected'));
            
            const selectedOption = document.querySelector(`.option-taking[data-option-index="${optionIndex}"]`);
            if (selectedOption) {
                selectedOption.classList.add('selected');
            }
            
        } catch (error) {
            console.error('პასუხის გაგზავნა ვერ მოხერხდა:', error);
            uiRenderer.showNotification('პასუხის გაგზავნა ვერ მოხერხდა', 'error');
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
            console.error('შემდეგი კითხვის დამუშავების შეცდომა:', error);
        }
    },

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
            console.error('წინა კითხვის დამუშავების შეცდომა:', error);
        }
    },
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
                    // Update existing answer
                    attempt.answers[existingAnswerIndex] = {
                        question: currentQuestion._id,
                        selectedOptionIndex: selectedIndex,
                        answeredAt: new Date()
                    };
                } else {
                    // Add new answer
                    attempt.answers.push({
                        question: currentQuestion._id,
                        selectedOptionIndex: selectedIndex,
                        answeredAt: new Date()
                    });
                }
            }
        } catch (error) {
            console.error('მიმდინარე პასუხის შენახვის შეცდომა:', error);
            // Don't show error to avoid disrupting quiz flow
        }
    },
    // Handle finish quiz
    async handleFinishQuiz() {
        try {
            // ✅ This function now cleans up all timers and anti-cheating listeners.
            console.log('ქვიზის დასრულება...');
            
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

            const finishBtn = document.querySelector('.finish-quiz-btn, .btn-warning');
            if (finishBtn) {
                finishBtn.disabled = true;
                finishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> იგზავნება...';
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
            console.error('ქვიზის დასრულება ვერ მოხერხდა:', error);
            uiRenderer.showNotification(error.data?.message || 'ქვიზის გაგზავნა ვერ მოხერხდა', 'error');
        }
    },

    // Handle add question
    handleAddQuestion(buttonElement) {
        try {
            // Find the modal relative to the button that was clicked
            const modal = buttonElement.closest('.modal');
            if (!modal) {
                console.error('Could not find the create quiz modal to add a question to.');
                uiRenderer.showNotification('შეცდომა: ქვიზის ფორმა ვერ მოიძებნა.', 'error');
                return;
            }
            uiRenderer.addNewQuestion(modal);
        } catch (error) {
            console.error('კითხვის დამატების დამუშავების შეცდომა:', error);
        }
    },

    // Handle delete question
    handleDeleteQuestion(questionElement) {
        try {
            if (!questionElement) return;
            
            const questionsContainer = questionElement.parentElement;
            if (questionsContainer.children.length <= 1) {
                uiRenderer.showNotification('ქვიზს უნდა ჰქონდეს მინიმუმ ერთი კითხვა', 'error');
                return;
            }
            
            questionElement.remove();
            uiRenderer.renumberQuestions(questionsContainer);
        } catch (error) {
            console.error('კითხვის წაშლის დამუშავების შეცდომა:', error);
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
            console.error('კითხვის აწევის დამუშავების შეცდომა:', error);
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
            console.error('კითხვის ჩამოწევის დამუშავების შეცდომა:', error);
        }
    },

    // Handle add option
    handleAddOption(optionsContainer) {
        try {
            uiRenderer.addNewOption(optionsContainer);
        } catch (error) {
            console.error('ოფშენის დამატების დამუშავების შეცდომა:', error);
        }
    },

    // Handle delete option
    handleDeleteOption(optionElement) {
        try {
            const optionsContainer = optionElement.parentElement;
            if (optionsContainer.children.length <= 2) {
                uiRenderer.showNotification('კითხვას უნდა ჰქონდეს მინიმუმ ორი ვარიანტი', 'error');
                return;
            }
            
            optionElement.remove();
            uiRenderer.reletterOptions(optionsContainer);
        } catch (error) {
            console.error('ოფშენის წაშლის დამუშავების შეცდომა:', error);
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
                        <h3>სტუდენტის ცდის დეტალები</h3>
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
                                        <h5>კითხვა ${index + 1}: ${utils.escapeHTML(question.text)}</h5>
                                        <div class="student-answer">
                                            თქვენი პასუხი: ${utils.escapeHTML(question.options[answer.selectedOptionIndex]?.text || 'პასუხი არ არის')}
                                            ${isCorrect ? 
                                                '<span class="result-icon correct"><i class="fas fa-check"></i></span>' : 
                                                '<span class="result-icon incorrect"><i class="fas fa-times"></i></span>'}
                                        </div>
                                        ${!isCorrect ? `
                                            <div class="correct-answer">
                                                სწორი პასუხი: ${utils.escapeHTML(question.options[question.correctOptionIndex]?.text)}
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
            console.error('სტუდენტის ცდის მიღება ვერ მოხერხდა:', error);
            uiRenderer.showNotification('სტუდენტის ცდის დეტალების ჩატვირთვა ვერ მოხერხდა', 'error');
        }
    },

    // Handle add from bank
    handleAddFromQuizBank() {
        try {
            uiRenderer.openModal('question-bank');
        } catch (error) {
            console.error('ბანკიდან დამატების დამუშავების შეცდომა:', error);
        }
    },

    // Handle request retake
    async handleRequestRetake(quizId, reason) {
        try {
            if (!reason) {
                reason = prompt('გთხოვთ, მიუთითოთ ხელახლა გაკეთების მოთხოვნის მიზეზი:');
                if (!reason) return;
            }
            
            await apiService.requestRetake(quizId, reason);
            uiRenderer.showNotification('ხელახალი გაკეთების მოთხოვნა წარმატებით გაიგზავნა');
        } catch (error) {
            console.error('ხელახალი გაკეთების მოთხოვნა ვერ მოხერხდა:', error);
            uiRenderer.showNotification('ხელახალი გაკეთების მოთხოვნის გაგზავნა ვერ მოხერხდა', 'error');
        }
    },

    // Extract questions data from form
    extractQuestionsData(form) {
        try {
            const questions = [];
            // This selector now correctly finds the question items inside the form.
            const questionElements = form.querySelectorAll('.question-item');

            if (questionElements.length === 0) {
                console.error("შეცდომა: ფორმის შიგნით '.question-item' ელემენტები ვერ მოიძებნა.");
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
            console.error('კრიტიკული შეცდომა extractQuestionsData-ში:', error);
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
                // ✅ FIX: Removed keys for maxAttempts, showResults, password, etc.
                questions: this.extractQuestionsData(form)
            };

            // Validate quiz data
            const validationErrors = utils.validateQuizData(quizData);
            if (validationErrors.length > 0) {
                return uiRenderer.showNotification(validationErrors[0], 'error');
            }

            await apiService.createQuiz(quizData);
            uiRenderer.showNotification('ქვიზი წარმატებით შეიქმნა');
            uiRenderer.closeModal();
            await this.loadQuizzes();
        } catch (error) {
            console.error('ქვიზის შექმნა ვერ მოხერხდა:', error);
            uiRenderer.showNotification(error.data?.message || 'ქვიზის შექმნა ვერ მოხერხდა', 'error');
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
                // ✅ FIX: Removed keys for maxAttempts, showResults, password, etc.
                questions: this.extractQuestionsData(form)
            };

            // Validate quiz data
            const validationErrors = utils.validateQuizData(quizData);
            if (validationErrors.length > 0) {
                return uiRenderer.showNotification(validationErrors[0], 'error');
            }

            await apiService.updateQuiz(quizId, quizData);
            uiRenderer.showNotification('ქვიზი წარმატებით განახლდა');
            uiRenderer.closeModal();
            await this.loadQuizzes();
        } catch (error) {
            console.error('ქვიზის განახლება ვერ მოხერხდა:', error);
            uiRenderer.showNotification(error.data?.message || 'ქვიზის განახლება ვერ მოხერხდა', 'error');
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
            console.error('ქვიზების მიღება ვერ მოხერხდა:', error);
            uiRenderer.showNotification('ქვიზების ჩატვირთვა ვერ მოხერხდა', 'error');
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
                    this.handleApproveRequest(requestId);
                    break;
                case QUIZ_ACTIONS.DENY_REQUEST:
                    this.handleDenyRequest(requestId);
                    break;
            }
        } catch (error) {
            console.error('გლობალური დაჭერის დამუშავების შეცდომა:', error);
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
            console.error('კლავიშების კომბინაციების დამუშავების შეცდომა:', error);
        }
    },

    // Handle add from bank
    handleAddFromQuizBank() {
        try {
            uiRenderer.openModal('question-bank', null, true);
        } catch (error) {
            console.error('ბანკიდან დამატების დამუშავების შეცდომა:', error);
        }
    },

    // Handle select quiz from bank
    handleSelectQuizFromBank(quizId) {
        try {
            if (!state.quizBank) {
                uiRenderer.showNotification('ქვიზების ბანკის მონაცემები არ არის ჩატვირთული.', 'error');
                return;
            }
            
            const selectedQuiz = state.quizBank.find(q => q._id === quizId);
            if (selectedQuiz) {
                uiRenderer.prefillQuizForm(selectedQuiz);
                uiRenderer.closeModal();
            } else {
                uiRenderer.showNotification('არჩეული ქვიზი ვერ მოიძებნა.', 'error');
            }
        } catch (error) {
            console.error('ქვიზების ბანკიდან არჩევის დამუშავების შეცდომა:', error);
        }
    }
};

// Initialize the application
async function initQuizzes() {
    try {
        state.isLoading = true;
        
        const token = localStorage.localStorage.getItem('piRateToken');
        if (!token) {
            window.location.href = '/login/login.html';
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
            uiRenderer.showNotification('მომხმარებლის როლის დადასტურება ვერ მოხერხდა. გამოსვლა.', 'error');
            setTimeout(() => {
                // Redirect if user data is invalid
                localStorage.removeItem('piRateToken');
                window.location.href = '/login/login.html';
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
        console.error('ქვიზების ინიციალიზაცია ვერ მოხერხდა:', error);
        uiRenderer.showNotification('მოხდა კრიტიკული შეცდომა. გთხოვთ, თავიდან შეხვიდეთ სისტემაში.', 'error');
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
