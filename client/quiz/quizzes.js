// quizzes.js (Enhanced Version)
// This version includes all requested features:
// - Advanced status handling for "Completed" and "Past Due" tabs
// - Student lists with scores for teachers
// - Immediate move to "Completed" after submission
// - Detailed quiz review with image support
// - Analytics dashboard with charts
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
    REVIEW_QUIZ: 'review-quiz'
};

const QUIZ_STATUS = {
    UPCOMING: 'upcoming',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    PAST_DUE: 'past-due',
    GRADED: 'graded',
    'NOT ATTEMPTED': 'not attempted'
};

const ROLES = {
    TEACHER: 'Teacher',
    ADMIN: 'Admin',
    STUDENT: 'Student'
};

const API_BASE_URL = 'http://localhost:5001/api';

const state = {
    currentUser: null,
    groups: [],
    quizzes: [],
    activeTab: 'active',
    isLoading: true,
    currentView: 'list',
    detailedQuiz: null,
    selectedGroupId: null,
    activeQuizAttempt: null,
    currentQuestionIndex: 0,
    activeSubView: 'quizzes',
    questionBanks: [],
    quizTimer: null
};

const elements = {
    container: document.querySelector('.quizzes-container'),
    teacherControls: document.getElementById('teacher-admin-controls'),
    groupSelect: document.getElementById('group-select'),
    createBtn: document.getElementById('create-quiz-btn'),
    tabsNav: document.getElementById('tabs-nav'),
    listView: document.getElementById('quiz-list-view'),
    detailView: document.getElementById('quiz-detail-view'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    globalLoading: document.getElementById('global-loading')
};

// Utility Functions
const utils = {
    calculateQuizStatus(quiz) {
        const now = new Date();
        const startTime = new Date(quiz.startTime);
        const endTime = new Date(quiz.endTime);
        
        if (state.currentUser.role === ROLES.STUDENT && quiz.studentAttempt) {
            if (quiz.studentAttempt.status === 'completed' || quiz.studentAttempt.status === 'graded') {
                return 'completed';
            }
        }

        if (now < startTime) {
            return 'upcoming';
        }

        if (now > endTime) {
            if (state.currentUser.role === ROLES.TEACHER || state.currentUser.role === ROLES.ADMIN) {
                return 'completed';
            }
            
            if (state.currentUser.role === ROLES.STUDENT) {
                if (quiz.studentAttempt && (quiz.studentAttempt.status === 'in-progress' || !quiz.studentAttempt)) {
                    return 'past-due';
                }
            }
        }

        return 'active';
    },
    
    formatDateTimeLocal(date) {
        if (!(date instanceof Date)) date = new Date(date);
        const pad = (num) => num.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },
    
    escapeHTML(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    
    sanitizeHTML(str) {
        if (typeof str !== 'string') return '';
        return DOMPurify.sanitize(str);
    },
    
    validateQuizData(quizData) {
        const errors = [];
        
        if (!quizData.title || quizData.title.trim() === '') errors.push('Title is required');
        if (!quizData.groupId) errors.push('Group is required');
        if (!quizData.startTime) errors.push('Start time is required');
        if (!quizData.endTime) errors.push('End time is required');
        
        if (quizData.startTime && quizData.endTime) {
            if (new Date(quizData.endTime) <= new Date(quizData.startTime)) {
                errors.push('End time must be after start time');
            }
        }
        
        if (!quizData.questions || quizData.questions.length === 0) {
            errors.push('At least one question is required');
        } else {
            quizData.questions.forEach((question, index) => {
                if (!question.text || question.text.trim() === '') {
                    errors.push(`Question ${index + 1} text is required`);
                }
                if (!question.options || question.options.length < 2) {
                    errors.push(`Question ${index + 1} must have at least 2 options`);
                }
                if (question.options && !question.options.some(opt => opt.isCorrect)) {
                    errors.push(`Question ${index + 1} must have at least one correct option`);
                }
            });
        }
        
        return errors;
    }
};

// API Service with Centralized Authentication Handling
const apiService = {
    async fetch(endpoint, options = {}) {
        try {
            document.body.classList.add('loading');
            const token = localStorage.getItem('piRateToken');
            const headers = {
                ...(options.headers || {}),
                'Authorization': token ? `Bearer ${token}` : ''
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
                let errorData;
                try {
                    errorData = await response.json();
                } catch {
                    errorData = { message: `HTTP error ${response.status}: ${response.statusText}` };
                }
                
                const error = new Error(errorData.message || 'An unknown error occurred');
                error.status = response.status;
                error.data = errorData;
                throw error;
            }

            return response.status === 204 ? null : response.json();
        } catch (error) {
            console.error('API request failed:', error);
            
            if (!error.message.includes('Session expired')) {
                const errorMessage = error.data?.message || error.message || 'API request failed';
                uiRenderer.showNotification(errorMessage, 'error');
            }
            
            throw error;
        } finally {
            document.body.classList.remove('loading');
        }
    },
    
    async fetchInitialData() {
        try {
            const [userResponse, groupsResponse] = await Promise.all([
                this.fetch('/users/profile'),
                this.fetch('/groups')
            ]);
            
            const user = userResponse.data || userResponse;
            const groups = groupsResponse.data || groupsResponse;
            
            return { user, groups };
        } catch (error) {
            console.error('Failed to fetch initial data:', error);
            
            if (error.message.includes('Session expired')) {
                return { user: null, groups: [] };
            }
            
            throw error;
        }
    },
    
    async fetchQuizzesForGroup(groupId, status) {
        let endpoint = `/quizzes/teacher/${groupId}`;
        if (status && status !== 'all') {
            endpoint += `?status=${status}`;
        }
        const response = await this.fetch(endpoint);
        return response.data || response;
    },
    
    async fetchStudentQuizzes(status) {
        let endpoint = '/quizzes/student';
        if (status && status !== 'all') {
            endpoint += `?status=${status}`;
        }
        const response = await this.fetch(endpoint);
        return response.data || response;
    },
    
    async fetchQuizDetails(quizId) {
        const response = await this.fetch(`/quizzes/${quizId}`);
        return response.data || response;
    },
    
    async createQuiz(quizData) {
        const response = await this.fetch('/quizzes', {
            method: 'POST',
            body: JSON.stringify(quizData)
        });
        return response.data || response;
    },
    
    async updateQuiz(quizId, quizData) {
        const response = await this.fetch(`/quizzes/${quizId}`, {
            method: 'PUT',
            body: JSON.stringify(quizData)
        });
        return response.data || response;
    },
    
    async deleteQuiz(quizId) {
        const response = await this.fetch(`/quizzes/${quizId}`, { method: 'DELETE' });
        return response.data || response;
    },
    
    async startQuizAttempt(quizId, password = null) {
        const body = password ? { password } : {};
        try {
            const response = await this.fetch(`/quizzes/${quizId}/start`, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            return response.data || response;
        } catch (error) {
            if (error.status === 400 && error.data?.message?.includes('Maximum attempts')) {
                const quizDetails = await this.fetchQuizDetails(quizId);
                if (quizDetails.attempts && quizDetails.attempts.length > 0) {
                    const inProgressAttempt = quizDetails.attempts.find(a => a.status === 'in-progress');
                    if (inProgressAttempt) {
                        return inProgressAttempt;
                    }
                }
            }
            throw error;
        }
    },
    
    async submitAnswer(attemptId, questionId, selectedOptionIndex) {
        const response = await this.fetch(`/quizzes/attempt/${attemptId}/answer`, {
            method: 'POST',
            body: JSON.stringify({
                questionId,
                selectedOptionIndex
            })
        });
        return response.data || response;
    },
    
    async submitQuizAttempt(attemptId) {
        const response = await this.fetch(`/quizzes/attempt/${attemptId}/submit`, {
            method: 'POST'
        });
        return response.data || response;
    },
    
    async fetchQuizResults(attemptId) {
        const response = await this.fetch(`/quizzes/attempt/${attemptId}/results`);
        return response.data || response;
    },
    
    async fetchQuizAnalytics(quizId) {
        if (!quizId || typeof quizId !== 'string' || !quizId.match(/^[0-9a-fA-F]{24}$/)) {
            throw new Error('Invalid quiz ID format');
        }
        
        const response = await this.fetch(`/quizzes/${quizId}/analytics`);
        return response.data || response;
    },
    
    async uploadQuestionImage(file) {
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await this.fetch('/quizzes/questions/image-upload', {
            method: 'POST',
            body: formData
        });
        return response.data || response;
    },
    
    async fetchQuestionBanks(groupId) {
        const response = await this.fetch(`/quizzes/question-banks/${groupId}`);
        return response.data || response;
    },
    
    async requestRetake(quizId, reason) {
        const response = await this.fetch('/assignments/requests', {
            method: 'POST',
            body: JSON.stringify({
                requestableId: quizId,
                requestableType: 'Quiz',
                reason: reason
            })
        });
        return response.data || response;
    }
};

// UI Renderer
const uiRenderer = {
    init() {
        if (!state.currentUser) {
            console.error('Current user not set in state');
            return;
        }
        
        elements.container.classList.add(`role-${state.currentUser.role.toLowerCase()}`);
        if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
            this.renderTeacherAdminUI();
        } else {
            this.renderStudentUI();
        }
        this.updateView();
    },

    renderTeacherAdminUI() {
        if (!elements.teacherControls) {
            console.error('Teacher controls element not found');
            return;
        }
        
        elements.teacherControls.style.display = 'flex';
        const relevantGroups = state.currentUser.role === ROLES.ADMIN ?
            state.groups :
            state.groups.filter(g => g.users && g.users.some(u => u._id.toString() === state.currentUser._id.toString()));

        elements.groupSelect.innerHTML = `<option value="">Choose a Group</option>` +
            relevantGroups.map(g => `<option value="${g._id}" ${g._id === state.selectedGroupId ? 'selected' : ''}>
                ${utils.escapeHTML(g.name)}
            </option>`).join('');

        this.renderTabs();
    },

    renderStudentUI() {
        this.renderTabs();
    },

    renderTabs() {
        if (!state.currentUser) return '';
        
        let html = '';
        
        const quizTabs = [
            { id: 'active', label: 'Active' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'completed', label: 'Completed' },
            { id: 'past-due', label: 'Past Due' }
        ];
        
        quizTabs.forEach(tab => {
            const isActive = state.activeSubView === 'quizzes' && state.activeTab === tab.id;
            html += `<button class="tab-btn ${isActive ? 'active' : ''}" data-action="${QUIZ_ACTIONS.CHANGE_TAB}" data-tab="${tab.id}">${tab.label}</button>`;
        });
        
        if (elements.tabsNav) {
            elements.tabsNav.innerHTML = html;
        }
    },

    updateView() {
        if (!state.currentUser) {
            return;
        }
        
        this.renderTabs();
        if (elements.listView) {
            elements.listView.style.display = state.currentView === 'list' ? 'block' : 'none';
        }
        if (elements.detailView) {
            elements.detailView.style.display = state.currentView === 'detail' ? 'block' : 'none';
        }

        if (state.currentView === 'list') {
            this.renderListView();
        } else if (state.currentView === 'detail') {
            this.renderDetailView();
        }
    },

    renderListView() {
        const container = elements.listView;
        if (!container) return;

        if (state.isLoading) {
            container.innerHTML = `<div class="loading-spinner"></div>`;
            return;
        }

        if (!state.quizzes || state.quizzes.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>No quizzes to display in this view.</p>
            </div>`;
            return;
        }

        container.innerHTML = state.quizzes.map(q => this.renderQuizItem(q)).join('');
    },

    renderQuizItem(quiz) {
        const isTeacher = [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role);
        const endTime = new Date(quiz.endTime);
        let statusHTML = '';
        let title = quiz.title;

        const status = utils.calculateQuizStatus(quiz);
        const statusClass = status.toLowerCase().replace(' ', '-');

        if (isTeacher) {
            statusHTML = `<span class="quiz-item-status status-badge ${statusClass}">${status}</span>`;
        } else {
            const statusText = status === 'completed' && quiz.score !== undefined ? 
                `${quiz.score}/${quiz.totalPoints}` : status;
                
            statusHTML = `<span class="quiz-item-status status-badge ${statusClass}">${statusText}</span>`;
        }

        return `
            <div class="quiz-item" data-id="${quiz._id}" 
                 data-action="${QUIZ_ACTIONS.VIEW_DETAIL}">
                <i class="fas fa-file-alt quiz-item-icon"></i>
                <div class="quiz-item-info">
                    <span class="quiz-item-title">${utils.escapeHTML(title)}</span>
                    <span class="quiz-item-meta">
                        ${isTeacher ? `Group: ${quiz.group?.name || 'Unknown'}` : ''}
                        ${isTeacher ? `Due: ${endTime.toLocaleDateString()}` : ''}
                    </span>
                </div>
                ${statusHTML}
            </div>
        `;
    },

    renderDetailView() {
        if (!state.detailedQuiz) {
            console.error('No detailed quiz to render');
            return;
        }
        
        const isTeacher = [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role);
        if (isTeacher) {
            this.renderTeacherDetailView();
        } else {
            this.renderStudentDetailView();
        }
    },

    renderStudentDetailView() {
        const quiz = state.detailedQuiz;
        const status = utils.calculateQuizStatus(quiz);
        let actionButton = '';
        
        if (status === 'completed') {
            actionButton = `<button class="btn btn-primary" data-action="${QUIZ_ACTIONS.REVIEW_QUIZ}" data-attempt-id="${quiz.attempts[0]._id}">Review Quiz</button>`;
        } else if (status === 'active') {
            actionButton = `<button class="btn btn-primary" data-action="${QUIZ_ACTIONS.START_QUIZ}">Start Quiz</button>`;
        } else if (status === 'upcoming') {
            actionButton = `<button class="btn btn-primary" disabled>Quiz Not Yet Available</button>`;
        } else {
            actionButton = `<button class="btn btn-primary" disabled>Quiz No Longer Available</button>`;
        }

        elements.detailView.innerHTML = `
            <div class="detail-panel">
                <div class="detail-panel-header">
                    <button class="btn back-btn" data-action="${QUIZ_ACTIONS.BACK_TO_LIST}" aria-label="Back to quizzes list">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <h2 class="quiz-title-detail">${utils.escapeHTML(quiz.title)}</h2>
                </div>
                <div class="quiz-info">
                    <div class="info-item">
                        <label>Total Points:</label>
                        <span>${quiz.totalPoints || 0}</span>
                    </div>
                    <div class="info-item">
                        <label>Instructions:</label>
                        <div class="instructions-text">${utils.sanitizeHTML(quiz.instructions || 'No instructions provided.')}</div>
                    </div>
                </div>
                <div class="quiz-actions">
                    ${actionButton}
                </div>
            </div>
        `;
    },

    renderTeacherDetailView() {
        const quiz = state.detailedQuiz;
        const status = utils.calculateQuizStatus(quiz);
        
        elements.detailView.innerHTML = `
            <div class="detail-panel">
                <div class="detail-panel-header">
                    <button class="btn back-btn" data-action="${QUIZ_ACTIONS.BACK_TO_LIST}" aria-label="Back to quizzes list">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <h2 class="quiz-title-detail">${utils.escapeHTML(quiz.title)}</h2>
                    <div class="teacher-quiz-actions">
                        <button class="btn btn-secondary edit-quiz-btn" data-action="${QUIZ_ACTIONS.EDIT_QUIZ}">
                            <i class="fas fa-edit"></i> Edit Quiz
                        </button>
                        <button class="btn btn-danger delete-quiz-btn" data-action="${QUIZ_ACTIONS.DELETE_QUIZ}" data-quiz-id="${quiz._id}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
                <div class="quiz-info">
                    <div class="info-item">
                        <label>Group:</label>
                        <span class="group-name">${quiz.group?.name || 'Unknown'}</span>
                    </div>
                    <div class="info-item">
                        <label>Start Time:</label>
                        <span class="start-time">${new Date(quiz.startTime).toLocaleString()}</span>
                    </div>
                    <div class="info-item">
                        <label>End Time:</label>
                        <span class="end-time">${new Date(quiz.endTime).toLocaleString()}</span>
                    </div>
                    <div class="info-item">
                        <label>Status:</label>
                        <span class="status-badge ${status.toLowerCase()}">${status}</span>
                    </div>
                </div>
                ${status === 'completed' && quiz._id ? this.renderQuizStats(quiz) : ''}
            </div>
        `;
        
        if (status === 'completed' && quiz._id) {
            this.loadQuizAnalytics(quiz._id);
        }
    },
    
    renderQuizStats(quiz) {
        return `
            <div class="quiz-stats-container">
                <div class="stat-card">
                    <div class="stat-value" id="total-students">0</div>
                    <div class="stat-label">Total Students</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="completed-attempts">0</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="average-score">0%</div>
                    <div class="stat-label">Average Score</div>
                </div>
            </div>
            <div class="student-attempts-container">
                <h3>Student Attempts</h3>
                <div class="student-list" id="student-attempts-list">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;
    },

    async loadQuizAnalytics(quizId) {
        try {
            if (!quizId || typeof quizId !== 'string' || !quizId.match(/^[0-9a-fA-F]{24}$/)) {
                console.error('Invalid quiz ID for analytics:', quizId);
                return;
            }
            
            const analytics = await apiService.fetchQuizAnalytics(quizId);
            if (!analytics) {
                console.error('No analytics data received');
                return;
            }
            
            document.getElementById('total-students').textContent = analytics.participation?.totalStudents || 0;
            document.getElementById('completed-attempts').textContent = analytics.participation?.attemptedCount || 0;
            document.getElementById('average-score').textContent = `${(analytics.performance?.averageScore || 0).toFixed(1)}%`;

            const studentList = document.getElementById('student-attempts-list');
            
            if (analytics.attempts && analytics.attempts.length > 0) {
                studentList.innerHTML = analytics.attempts.map(attempt => `
                    <div class="student-attempt-item">
                        <div class="student-info">
                            <span class="student-name">${utils.escapeHTML(attempt.student?.firstName || '')} ${utils.escapeHTML(attempt.student?.lastName || '')}</span>
                            <span class="student-email">${utils.escapeHTML(attempt.student?.email || '')}</span>
                        </div>
                        <div class="attempt-info">
                            <span class="attempt-status status-badge ${attempt.status}">${attempt.status}</span>
                            <span class="attempt-score">${attempt.score || 0}/${attempt.quiz?.totalPoints || 0}</span>
                        </div>
                        <div class="attempt-actions">
                            <button class="btn btn-secondary view-attempt-btn" 
                                    data-action="${QUIZ_ACTIONS.VIEW_STUDENT_ATTEMPT}" 
                                    data-attempt-id="${attempt._id}">
                                <i class="fas fa-eye"></i> View
                            </button>
                        </div>
                    </div>
                `).join('');
            } else {
                studentList.innerHTML = '<p>No attempts have been made on this quiz yet.</p>';
            }
        } catch (error) {
            console.error('Failed to load quiz analytics:', error);
            this.showNotification('Failed to load quiz analytics', 'error');
        }
    },

    openModal(type, data = null) {
        const templateId = `template-${type}-modal`;
        const template = document.getElementById(templateId);
        if (!template) {
            console.error(`Modal template with ID "${templateId}" not found.`);
            return;
        }

        elements.modalBackdrop.innerHTML = '';
        elements.modalBackdrop.appendChild(template.content.cloneNode(true));

        const modalElement = elements.modalBackdrop.querySelector('.modal');
        if (!modalElement) {
            console.error('Modal element not found in backdrop');
            return;
        }
        const form = modalElement.querySelector('form');

        if (type === 'create-edit-quiz') {
            this.setupQuizModal(modalElement, data);
        } else if (type === 'quiz-instructions') {
            this.setupInstructionsModal(modalElement);
        } else if (type === 'quiz-taking') {
            this.setupQuizTakingModal(modalElement);
        } else if (type === 'question-bank') {
            this.setupQuestionBankModal(modalElement);
        }

        modalElement.querySelectorAll(`[data-action="${QUIZ_ACTIONS.CLOSE_MODAL}"]`).forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });
        
        elements.modalBackdrop.style.display = 'flex';
    },

    setupQuizModal(modalElement, data) {
        const groupSelect = modalElement.querySelector('#quiz-group');
        if (groupSelect) {
            const relevantGroups = state.currentUser.role === ROLES.ADMIN ?
                state.groups :
                state.groups.filter(g => g.users && g.users.some(u => u._id.toString() === state.currentUser._id.toString()));
            groupSelect.innerHTML = relevantGroups.map(g => `<option value="${g._id}">${utils.escapeHTML(g.name)}</option>`).join('');
        }

        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        modalElement.querySelector('#quiz-start-time').value = utils.formatDateTimeLocal(now);
        modalElement.querySelector('#quiz-end-time').value = utils.formatDateTimeLocal(oneHourLater);

        if (data) {
            modalElement.querySelector('#modal-title').textContent = 'Edit Quiz';
            modalElement.querySelector('#quiz-title').value = data.title;
            modalElement.querySelector('#quiz-description').value = data.description;
            modalElement.querySelector('#quiz-instructions').value = data.instructions;
            modalElement.querySelector('#quiz-start-time').value = utils.formatDateTimeLocal(new Date(data.startTime));
            modalElement.querySelector('#quiz-end-time').value = utils.formatDateTimeLocal(new Date(data.endTime));
            modalElement.querySelector('#quiz-time-limit').value = data.timeLimit;
            modalElement.querySelector('#quiz-group').value = data.group._id;
            modalElement.querySelector('#quiz-max-attempts').value = data.maxAttempts || 1;
            modalElement.querySelector('#quiz-show-results').value = data.showResults || 'after-submission';
            modalElement.querySelector('#quiz-allow-retakes').checked = data.allowRetakes || false;
            modalElement.querySelector('#quiz-requires-password').checked = data.requiresPassword || false;
            
            if (data.requiresPassword) {
                modalElement.querySelector('#quiz-password-field').style.display = 'block';
                modalElement.querySelector('#quiz-password-field').value = data.password || '';
            }
            
            this.renderQuestions(data.questions, modalElement);
        } else {
            this.addNewQuestion(modalElement);
        }

        modalElement.addEventListener('input', (e) => {
            if (e.target.matches('.question-text, .option-text, .question-solution')) {
                this.updateLatexPreview(e.target);
            }
        });

        modalElement.querySelector('#quiz-requires-password').addEventListener('change', (e) => {
            modalElement.querySelector('#quiz-password-field').style.display = e.target.checked ? 'block' : 'none';
        });

        const addFromBankBtn = modalElement.querySelector('#add-from-bank-btn');
        if (addFromBankBtn) {
            addFromBankBtn.addEventListener('click', () => {
                eventHandlers.handleAddFromBank();
            });
        }

        const form = modalElement.querySelector('form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (data) {
                    eventHandlers.handleUpdateQuiz(data._id, form);
                } else {
                    eventHandlers.handleCreateQuiz(form);
                }
            });
        }
    },

    setupInstructionsModal(modalElement) {
        if (state.detailedQuiz.requiresPassword) {
            const passwordContainer = modalElement.querySelector('#password-field-container');
            if (passwordContainer) {
                passwordContainer.style.display = 'block';
            }
        }
        
        const instructionsText = modalElement.querySelector('#quiz-instructions-text');
        const instructionsTitle = modalElement.querySelector('.quiz-instructions-title');
        
        if (instructionsText && instructionsTitle && state.detailedQuiz) {
            instructionsTitle.textContent = state.detailedQuiz.title;
            instructionsText.innerHTML = utils.sanitizeHTML(state.detailedQuiz.instructions || 'No specific instructions provided for this quiz.');
        }
        
        const agreementCheckbox = modalElement.querySelector('#quiz-agreement');
        const startButton = modalElement.querySelector('#start-quiz-after-instructions');
        
        if (agreementCheckbox && startButton) {
            agreementCheckbox.addEventListener('change', () => {
                startButton.disabled = !agreementCheckbox.checked;
            });
            
            startButton.addEventListener('click', () => {
                const password = state.detailedQuiz.requiresPassword ? 
                    modalElement.querySelector('#quiz-password')?.value : null;
                
                this.closeModal();
                eventHandlers.handleRealStartQuiz(state.detailedQuiz._id, password);
            });
        }
    },

    setupQuizTakingModal(modalElement) {
        const quiz = state.detailedQuiz;
        const attempt = state.activeQuizAttempt;
        
        if (!quiz || !quiz.questions || quiz.questions.length === 0) {
            console.error('Quiz data is incomplete or missing questions');
            this.showNotification('Quiz data is incomplete. Please try again.', 'error');
            this.closeModal();
            return;
        }
        
        if (state.currentQuestionIndex < 0) {
            state.currentQuestionIndex = 0;
        } else if (state.currentQuestionIndex >= quiz.questions.length) {
            state.currentQuestionIndex = quiz.questions.length - 1;
        }
        
        const questionIndex = state.currentQuestionIndex;
        const question = quiz.questions[questionIndex];
        
        if (!question) {
            console.error('Question not found at index', questionIndex);
            this.showNotification('Question not found. Please try again.', 'error');
            this.closeModal();
            return;
        }

        modalElement.querySelector('.quiz-title-taking').textContent = quiz.title;
        modalElement.querySelector('#total-questions').textContent = quiz.questions.length;
        modalElement.querySelector('#current-question-number').textContent = questionIndex + 1;
        
        const progress = ((questionIndex + 1) / quiz.questions.length) * 100;
        const progressFill = modalElement.querySelector('.progress-fill');
        if (progressFill) progressFill.style.width = `${progress}%`;
        
        modalElement.querySelector('.question-text-taking').innerHTML = utils.sanitizeHTML(question.text);
        
        const imageContainer = modalElement.querySelector('.question-image-container');
        if (question.imageUrl) {
            imageContainer.innerHTML = `<img src="${question.imageUrl}" alt="Question image">`;
            imageContainer.style.display = 'block';
        } else {
            imageContainer.style.display = 'none';
        }
        
        const optionsContainer = modalElement.querySelector('.options-container-taking');
        if (optionsContainer) {
            optionsContainer.innerHTML = '';
            
            switch(question.type) {
                case 'true-false':
                    optionsContainer.innerHTML = `
                        <div class="option-taking" data-option-index="0">
                            <span class="option-letter">T</span>
                            <span class="option-text">True</span>
                        </div>
                        <div class="option-taking" data-option-index="1">
                            <span class="option-letter">F</span>
                            <span class="option-text">False</span>
                        </div>
                    `;
                    break;
                    
                case 'short-answer':
                    optionsContainer.innerHTML = `
                        <div class="short-answer-container">
                            <textarea class="short-answer-input" placeholder="Type your answer here..." rows="4"></textarea>
                        </div>
                    `;
                    break;
                    
                case 'multiple-choice':
                default:
                    question.options.forEach((option, index) => {
                        const optionElement = document.createElement('div');
                        optionElement.className = 'option-taking';
                        optionElement.dataset.optionIndex = index;
                        optionElement.innerHTML = `
                            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
                            <span class="option-text">${utils.sanitizeHTML(option.text)}</span>
                        `;
                        
                        if (attempt && attempt.answers) {
                            const existingAnswer = attempt.answers.find(a => 
                                a.question && a.question.toString() === question._id.toString() && a.selectedOptionIndex === index
                            );
                            
                            if (existingAnswer) {
                                optionElement.classList.add('selected');
                            }
                        }
                        
                        optionElement.addEventListener('click', () => {
                            eventHandlers.handleSelectOption(index);
                        });
                        
                        optionsContainer.appendChild(optionElement);
                    });
                    break;
            }
        }
        
        const prevBtn = modalElement.querySelector('.prev-question-btn');
        const nextBtn = modalElement.querySelector('.next-question-btn');
        const finishBtn = modalElement.querySelector('.finish-quiz-btn');
        
        if (prevBtn) prevBtn.disabled = questionIndex === 0;
        if (nextBtn) {
            nextBtn.textContent = 'Next Question';
            if (questionIndex === quiz.questions.length - 1) {
                nextBtn.style.display = 'none';
            } else {
                nextBtn.style.display = 'block';
            }
        }
        if (finishBtn) finishBtn.style.display = questionIndex === quiz.questions.length - 1 ? 'block' : 'none';
        
        if (prevBtn) prevBtn.addEventListener('click', () => eventHandlers.handlePrevQuestion());
        if (nextBtn) nextBtn.addEventListener('click', () => eventHandlers.handleNextQuestion());
        if (finishBtn) finishBtn.addEventListener('click', () => eventHandlers.handleFinishQuiz());
        
        if (window.MathJax && window.MathJax.typesetPromise) {
            setTimeout(() => {
                window.MathJax.typesetPromise().catch(err => console.error('MathJax typeset error:', err));
            }, 100);
        }
    },

    setupQuestionBankModal(modalElement) {
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

        apiService.fetchQuestionBanks(groupId)
            .then(banks => {
                state.questionBanks = banks;
                
                const banksContainer = modalElement.querySelector('.question-banks-container');
                if (!banksContainer) return;
                
                banksContainer.innerHTML = '';
                
                if (banks.length === 0) {
                    banksContainer.innerHTML = '<p class="empty-state">No question banks available for this group.</p>';
                    return;
                }
                
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
    },

    updateLatexPreview(inputElement) {
        const previewElement = inputElement.nextElementSibling;
        if (previewElement && previewElement.classList.contains('latex-preview')) {
            previewElement.textContent = inputElement.value;
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([previewElement]).catch(err => console.error('MathJax typeset error:', err));
            }
        }
    },

    addNewQuestion(modalElement) {
        const questionsContainer = modalElement.querySelector('#questions-container');
        const questionTemplate = document.getElementById('template-question-item');
        
        if (!questionTemplate || !questionsContainer) {
            console.error('Question item template or container not found');
            return;
        }
        
        const questionClone = questionTemplate.content.cloneNode(true);
        const questionId = Date.now() + Math.random().toString(36).substr(2, 5);
        const questionItem = questionClone.querySelector('.question-item');
        questionItem.dataset.questionId = questionId;
        
        const questionNumber = questionsContainer.children.length + 1;
        questionClone.querySelector('.question-number').textContent = `Question #${questionNumber}`;
        
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
        
        questionsContainer.appendChild(questionClone);
        
        const optionsContainer = questionItem.querySelector('.options-container');
        if (optionsContainer) {
            for (let i = 0; i < 4; i++) {
                this.addNewOption(optionsContainer);
            }
        }
        this.renumberQuestions(questionsContainer);
    },
    
    async handleImageUpload(input, preview) {
        const file = input.files[0];
        if (file) {
            try {
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
        }
    },
    
    removeImage(input, preview) {
        input.value = '';
        if (preview) {
            preview.style.display = 'none';
        }
    },

    addNewOption(optionsContainer) {
        const optionTemplate = document.getElementById('template-option-item');
        if (!optionTemplate || !optionsContainer) {
            console.error('Option item template or container not found');
            return;
        }
        const optionClone = optionTemplate.content.cloneNode(true);
        optionsContainer.appendChild(optionClone);
        this.reletterOptions(optionsContainer);
    },

    reletterOptions(container) {
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
    },

    renderQuestions(questions, modalElement) {
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

                    if (question.imageUrl) {
                        const preview = questionElement.querySelector('.question-image-preview');
                        const img = preview.querySelector('img');
                        img.src = question.imageUrl;
                        preview.style.display = 'block';
                    }

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
    },

    renumberQuestions(questionsContainer) {
        Array.from(questionsContainer.children).forEach((question, index) =>{
            const numberElement = question.querySelector('.question-number');
            if (numberElement) numberElement.textContent = `Question #${index + 1}`;
            
            question.dataset.questionIndex = index;
            const optionsContainer = question.querySelector('.options-container');
            if (optionsContainer) this.reletterOptions(optionsContainer);
        });
    },

    renderQuizResults(results) {
        const template = document.getElementById('template-quiz-results');
        if (!template) {
            console.error('Quiz results template not found');
            return;
        }
        
        const clone = template.content.cloneNode(true);
        const quiz = state.detailedQuiz;
        
        clone.querySelector('.quiz-title-results').textContent = quiz.title;
        clone.querySelector('.score-value').textContent = results.score;
        clone.querySelector('.score-total').textContent = `/ ${quiz.totalPoints}`;
        const percentage = ((results.score / quiz.totalPoints) * 100).toFixed(1);
        clone.querySelector('.score-percentage').textContent = `${percentage}%`;
        
        const scoreCircle = clone.querySelector('.score-circle');
        if (scoreCircle) {
            scoreCircle.style.setProperty('--percentage', `${percentage}%`);
        }
        
        const retakeBtn = clone.querySelector('[data-action="request-retake"]');
        if (quiz.allowRetakes && results.attemptNumber < quiz.maxAttempts) {
            retakeBtn.style.display = 'inline-flex';
            retakeBtn.addEventListener('click', () => {
                const reason = prompt('Please provide a reason for requesting a retake:');
                if (reason) {
                    eventHandlers.handleRequestRetake(quiz._id, reason);
                }
            });
        }
        
        const backButton = clone.querySelector('[data-action="back-to-list"]');
        if (backButton) {
            backButton.addEventListener('click', () => {
                eventHandlers.handleBackToList();
            });
        }
        
        elements.detailView.innerHTML = '';
        elements.detailView.appendChild(clone);
    },

    closeModal() {
        elements.modalBackdrop.style.display = 'none';
        elements.modalBackdrop.innerHTML = '';
    },

    showNotification(message, type = 'success') {
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
        
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
};

// Event Handlers
const eventHandlers = {
    init() {
        if (!state.currentUser) return;
        
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
        
        if (elements.tabsNav) {
            elements.tabsNav.addEventListener('click', this.handleTabClick.bind(this));
        }
        
        document.body.addEventListener('click', this.handleGlobalClick.bind(this));
    },

    async handleGroupChange(e) {
        const groupId = e.target.value;
        state.selectedGroupId = groupId;
        await this.loadQuizzes();
    },

    async handleTabClick(e) {
        const tabBtn = e.target.closest('.tab-btn');
        if (!tabBtn) return;
        
        const tab = tabBtn.dataset.tab;
        state.activeSubView = 'quizzes';
        state.activeTab = tab;
        state.currentView = 'list';
        await this.loadQuizzes();
    },

    handleGlobalClick(e) {
        const actionElement = e.target.closest('[data-action]');
        if (!actionElement) return;

        const { action, id, quizId, attemptId } = actionElement.dataset;

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
            case QUIZ_ACTIONS.CREATE_QUIZ:
                uiRenderer.openModal('create-quiz');
                break;
            case QUIZ_ACTIONS.EDIT_QUIZ:
                this.handleEditQuiz(state.detailedQuiz._id);
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
            case QUIZ_ACTIONS.SELECT_OPTION:
                this.handleSelectOption(parseInt(actionElement.dataset.optionIndex));
                break;
            case QUIZ_ACTIONS.ADD_QUESTION:
                this.handleAddQuestion();
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
                this.handleAddOption(actionElement.closest('.options-container'));
                break;
            case QUIZ_ACTIONS.DELETE_OPTION:
                this.handleDeleteOption(actionElement.closest('.option-item'));
                break;
            case QUIZ_ACTIONS.VIEW_STUDENT_ATTEMPT:
                this.handleViewStudentAttempt(attemptId);
                break;
            case QUIZ_ACTIONS.VIEW_INSTRUCTIONS:
                uiRenderer.openModal('quiz-instructions');
                break;
            case QUIZ_ACTIONS.ADD_FROM_BANK:
                this.handleAddFromBank();
                break;
            case QUIZ_ACTIONS.REQUEST_RETAKE:
                this.handleRequestRetake(quizId);
                break;
            case QUIZ_ACTIONS.REVIEW_QUIZ:
                this.handleReviewQuiz(attemptId);
                break;
        }
    },

    async handleViewDetail(quizId) {
        try {
            state.isLoading = true;
            uiRenderer.updateView();
            
            const quiz = await apiService.fetchQuizDetails(quizId);
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

    async handleReviewQuiz(attemptId) {
        try {
            const results = await apiService.fetchQuizResults(attemptId);
            uiRenderer.renderQuizResults(results);
        } catch (error) {
            console.error('Failed to fetch quiz results:', error);
            uiRenderer.showNotification('Failed to load quiz results', 'error');
        }
    },

    handleBackToList() {
        state.currentView = 'list';
        state.detailedQuiz = null;
        state.activeQuizAttempt = null;
        state.currentQuestionIndex = 0;
        uiRenderer.updateView();
    },

    async handleEditQuiz(quizId) {
        try {
            const quiz = await apiService.fetchQuizDetails(quizId);
            uiRenderer.openModal('create-edit-quiz', quiz);
        } catch (error) {
            console.error('Failed to fetch quiz for editing:', error);
            uiRenderer.showNotification('Failed to load quiz for editing', 'error');
        }
    },

    async handleDeleteQuiz(quizId) {
        const confirmed = confirm('Are you sure you want to delete this quiz? This action cannot be undone.');
        if (!confirmed) return;
        
        try {
            await apiService.deleteQuiz(quizId);
            uiRenderer.showNotification('Quiz deleted successfully');
            await this.loadQuizzes();
            this.handleBackToList();
        } catch (error) {
            console.error('Failed to delete quiz:', error);
            uiRenderer.showNotification('Failed to delete quiz', 'error');
        }
    },

    async handleStartQuiz(quizId) {
        try {
            if (state.detailedQuiz.requiresPassword) {
                uiRenderer.openModal('quiz-instructions');
            } else {
                await this.handleRealStartQuiz(quizId);
            }
        } catch (error) {
            console.error('Failed to start quiz:', error);
            uiRenderer.showNotification('Failed to start quiz', 'error');
        }
    },

    async handleRealStartQuiz(quizId, password = null) {
        try {
            const attempt = await apiService.startQuizAttempt(quizId, password);
            state.activeQuizAttempt = attempt;
            state.currentQuestionIndex = 0;
            
            uiRenderer.closeModal();
            
            setTimeout(() => {
                uiRenderer.openModal('quiz-taking');
                if (state.detailedQuiz.timeLimit) {
                    this.startTimer(state.detailedQuiz.timeLimit);
                }
            }, 100);
        } catch (error) {
            console.error('Failed to start quiz attempt:', error);
            
            if (error.status === 400 && error.data?.message?.includes('Maximum attempts')) {
                const quizDetails = await apiService.fetchQuizDetails(quizId);
                if (quizDetails.attempts && quizDetails.attempts.length > 0) {
                    const inProgressAttempt = quizDetails.attempts.find(a => a.status === 'in-progress');
                    if (inProgressAttempt) {
                        state.activeQuizAttempt = inProgressAttempt;
                        state.currentQuestionIndex = 0;
                        uiRenderer.openModal('quiz-taking');
                        return;
                    }
                }
                
                uiRenderer.showNotification('Maximum attempts reached for this quiz', 'error');
            } else {
                uiRenderer.showNotification(error.data?.message || 'Failed to start quiz', 'error');
            }
        }
    },

    startTimer(durationInMinutes) {
        const countdownElement = document.getElementById('quiz-countdown');
        if (!countdownElement) return;

        let timeRemaining = durationInMinutes * 60;

        state.quizTimer = setInterval(() => {
            timeRemaining--;

            const minutes = Math.floor(timeRemaining / 60);
            const seconds = timeRemaining % 60;

            countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            if (timeRemaining <= 0) {
                clearInterval(state.quizTimer);
                this.handleFinishQuiz();
            }
        }, 1000);
    },

    async handleSelectOption(optionIndex) {
        try {
            const quiz = state.detailedQuiz;
            const attempt = state.activeQuizAttempt;
            
            if (!quiz || !quiz.questions || quiz.questions.length === 0) {
                console.error('Quiz data is incomplete or missing questions');
                uiRenderer.showNotification('Quiz data is incomplete. Please try again.', 'error');
                return;
            }
            
            const question = quiz.questions[state.currentQuestionIndex];
            
            if (!question || !question._id) {
                console.error('Question not found at index', state.currentQuestionIndex);
                uiRenderer.showNotification('Question not found. Please try again.', 'error');
                return;
            }
            
            await apiService.submitAnswer(
                attempt._id, 
                question._id, 
                optionIndex
            );
            
            const options = document.querySelectorAll('.option-taking');
            options.forEach(opt => opt.classList.remove('selected'));
            
            const selectedOption = document.querySelector(`.option-taking[data-option-index="${optionIndex}"]`);
            if (selectedOption) {
                selectedOption.classList.add('selected');
            }
            
            const nextBtn = document.querySelector('.next-question-btn');
            if (nextBtn) {
                nextBtn.disabled = false;
            }
            
            if (state.currentQuestionIndex === quiz.questions.length - 1) {
                const finishBtn = document.querySelector('.finish-quiz-btn');
                if (finishBtn) {
                    finishBtn.style.display = 'block';
                }
            }
            
        } catch (error) {
            console.error('Failed to submit answer:', error);
            uiRenderer.showNotification('Failed to submit answer', 'error');
        }
    },

    async handleNextQuestion() {
        const quiz = state.detailedQuiz;
        if (!quiz || !quiz.questions) {
            uiRenderer.showNotification('No questions available', 'error');
            return;
        }

        if (state.currentQuestionIndex < quiz.questions.length - 1) {
            state.currentQuestionIndex++;
            uiRenderer.setupQuizTakingModal(document.querySelector('.modal'));
        } else {
            uiRenderer.showNotification('This is the last question', 'info');
        }
    },

    async handlePrevQuestion() {
        const quiz = state.detailedQuiz;
        if (!quiz || !quiz.questions) {
            uiRenderer.showNotification('No questions available', 'error');
            return;
        }

        if (state.currentQuestionIndex > 0) {
            state.currentQuestionIndex--;
            uiRenderer.setupQuizTakingModal(document.querySelector('.modal'));
        } else {
            uiRenderer.showNotification('This is the first question', 'info');
        }
    },

    async handleFinishQuiz() {
        try {
            if (state.quizTimer) {
                clearInterval(state.quizTimer);
            }
            const attempt = state.activeQuizAttempt;
            await apiService.submitQuizAttempt(attempt._id);
            
            const results = await apiService.fetchQuizResults(attempt._id);
            
            uiRenderer.closeModal();
            uiRenderer.renderQuizResults(results);
            
            await this.loadQuizzes();
            
        } catch (error) {
            console.error('Failed to finish quiz:', error);
            uiRenderer.showNotification('Failed to submit quiz', 'error');
        }
    },

    handleAddQuestion() {
        const modal = document.querySelector('.modal');
        if (!modal) return;
        uiRenderer.addNewQuestion(modal);
    },

    handleDeleteQuestion(questionElement) {
        if (!questionElement) return;
        
        const questionsContainer = questionElement.parentElement;
        if (questionsContainer.children.length <= 1) {
            uiRenderer.showNotification('A quiz must have at least one question', 'error');
            return;
        }
        
        questionElement.remove();
        uiRenderer.renumberQuestions(questionsContainer);
    },

    handleMoveQuestionUp(questionElement) {
        const questionsContainer = questionElement.parentElement;
        const prevElement = questionElement.previousElementSibling;
        if (prevElement) {
            questionsContainer.insertBefore(questionElement, prevElement);
            uiRenderer.renumberQuestions(questionsContainer);
        }
    },

    handleMoveQuestionDown(questionElement) {
        const questionsContainer = questionElement.parentElement;
        const nextElement = questionElement.nextElementSibling;
        if (nextElement) {
            questionsContainer.insertBefore(nextElement, questionElement);
            uiRenderer.renumberQuestions(questionsContainer);
        }
    },

    handleAddOption(optionsContainer) {
        uiRenderer.addNewOption(optionsContainer);
    },

    handleDeleteOption(optionElement) {
        const optionsContainer = optionElement.parentElement;
        if (optionsContainer.children.length <= 2) {
            uiRenderer.showNotification('A question must have at least two options', 'error');
            return;
        }
        
        optionElement.remove();
        uiRenderer.reletterOptions(optionsContainer);
    },

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

    async handleAddFromBank() {
        uiRenderer.openModal('question-bank');
    },

    async handleRequestRetake(quizId, reason) {
        if (!reason) {
            reason = prompt('Please provide a reason for requesting a retake:');
            if (!reason) return;
        }
        
        try {
            await apiService.requestRetake(quizId, reason);
            uiRenderer.showNotification('Retake request submitted successfully');
        } catch (error) {
            console.error('Failed to request retake:', error);
            uiRenderer.showNotification('Failed to submit retake request', 'error');
        }
    },

    extractQuestionsData(form) {
        const questions = [];
        const questionElements = form.querySelectorAll('.question-item');
        
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
            const imageUrl = imagePreview.style.display !== 'none' ? 
                imagePreview.querySelector('img').src : null;
            
            questions.push({
                text: questionElement.querySelector('.question-text').value,
                type: questionElement.querySelector('.question-type').value,
                options: options,
                points: parseInt(questionElement.querySelector('.question-points').value) || 1,
                solution: questionElement.querySelector('.question-solution').value || '',
                imageUrl: imageUrl
            });
        });
        
        return questions;
    },

    async handleCreateQuiz(form) {
        try {
            const quizData = {
                title: form.querySelector('#quiz-title').value,
                description: form.querySelector('#quiz-description').value,
                instructions: form.querySelector('#quiz-instructions').value,
                groupId: form.querySelector('#quiz-group').value,
                timeLimit: parseInt(form.querySelector('#quiz-time-limit').value),
                maxAttempts: parseInt(form.querySelector('#quiz-max-attempts').value),
                showResults: form.querySelector('#quiz-show-results').value,
                allowRetakes: form.querySelector('#quiz-allow-retakes').checked,
                requiresPassword: form.querySelector('#quiz-requires-password').checked,
                password: form.querySelector('#quiz-requires-password').checked ? form.querySelector('#quiz-password-field').value : '',
                startTime: new Date(form.querySelector('#quiz-start-time').value).toISOString(),
                endTime: new Date(form.querySelector('#quiz-end-time').value).toISOString(),
                questions: this.extractQuestionsData(form)
            };

            const validationErrors = utils.validateQuizData(quizData);
            if (validationErrors.length > 0) {
                uiRenderer.showNotification(validationErrors[0], 'error');
                return;
            }

            const result = await apiService.createQuiz(quizData);
            
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
            const quizData = {
                title: form.querySelector('#quiz-title').value,
                description: form.querySelector('#quiz-description').value,
                instructions: form.querySelector('#quiz-instructions').value,
                groupId: form.querySelector('#quiz-group').value,
                timeLimit: parseInt(form.querySelector('#quiz-time-limit').value),
                maxAttempts: parseInt(form.querySelector('#quiz-max-attempts').value),
                showResults: form.querySelector('#quiz-show-results').value,
                allowRetakes: form.querySelector('#quiz-allow-retakes').checked,
                requiresPassword: form.querySelector('#quiz-requires-password').checked,
                password: form.querySelector('#quiz-requires-password').checked ? form.querySelector('#quiz-password-field').value : '',
                startTime: new Date(form.querySelector('#quiz-start-time').value).toISOString(),
                endTime: new Date(form.querySelector('#quiz-end-time').value).toISOString(),
                questions: this.extractQuestionsData(form)
            };

            const validationErrors = utils.validateQuizData(quizData);
            if (validationErrors.length > 0) {
                uiRenderer.showNotification(validationErrors[0], 'error');
                return;
            }

            const result = await apiService.updateQuiz(quizId, quizData);
            
            uiRenderer.showNotification('Quiz updated successfully');
            uiRenderer.closeModal();
            
            await this.loadQuizzes();
            
        } catch (error) {
            console.error('Failed to update quiz:', error);
            uiRenderer.showNotification(error.data?.message || 'Failed to update quiz', 'error');
        }
    },

    async loadQuizzes() {
        try {
            state.isLoading = true;
            uiRenderer.updateView();
            
            let quizzes = [];
            
            if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
                if (!state.selectedGroupId) {
                    state.quizzes = [];
                    state.isLoading = false;
                    uiRenderer.updateView();
                    return;
                }
                
                quizzes = await apiService.fetchQuizzesForGroup(state.selectedGroupId, state.activeTab);
            } else {
                quizzes = await apiService.fetchStudentQuizzes(state.activeTab);
            }
            
            state.quizzes = Array.isArray(quizzes) ? quizzes : [];
            state.isLoading = false;
            uiRenderer.updateView();
            
        } catch (error) {
            console.error('Failed to fetch quizzes:', error);
            uiRenderer.showNotification('Failed to load quizzes', 'error');
            state.isLoading = false;
            uiRenderer.updateView();
        }
    }
};

// Initialize the application
async function initQuizzes() {
    try {
        state.isLoading = true;
        state.currentQuestionIndex = 0;
        
        const token = localStorage.getItem('piRateToken');
        if (!token) {
            window.location.href = '/client/login/login.html';
            return;
        }
        
        const { user, groups } = await apiService.fetchInitialData();
        
        if (!user) {
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
        
        if (!error.message.includes('Session expired') && !error.message.includes('Unauthorized')) {
            uiRenderer.showNotification(
                'Failed to initialize quizzes. Please check your connection and try again.', 
                'error'
            );
        }
        
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