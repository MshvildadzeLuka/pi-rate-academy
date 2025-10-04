// Path: client/assignments/assignments.js

// =========================================================================
// FILE: assignments.js (Georgian Language & Enhanced File Handling)
// =========================================================================

// Constants with Georgian translations
const ACTIONS = {
    CLOSE_MODAL: 'close-modal',
    VIEW_DETAIL: 'view-detail',
    SELECT_STUDENT_FOR_GRADING: 'select-student-for-grading',
    REMOVE_FILE: 'remove-file',
    BACK_TO_LIST: 'back-to-list',
    VIEW_FILE: 'view-file',
    CREATE_ASSIGNMENT: 'create-assignment',
    EDIT_ASSIGNMENT: 'edit-assignment',
    DELETE_ASSIGNMENT: 'delete-assignment',
    UNSUBMIT_ASSIGNMENT: 'unsubmit-assignment',
    REQUEST_RETAKE: 'request-retake',
    TRIGGER_FILE_UPLOAD: 'trigger-file-upload',
    SUBMIT_ASSIGNMENT: 'submit-assignment',
    CHANGE_TAB: 'change-tab',
    APPROVE_RETAKE: 'approve-retake',
    DENY_RETAKE: 'deny-retake',
    VIEW_REQUESTS: 'view-requests'
};

const STATUS = {
    UPCOMING: 'upcoming',
    COMPLETED: 'completed',
    GRADED: 'graded',
    PAST_DUE: 'past-due',
    RETURNED: 'returned',
    PENDING: 'pending',
    APPROVED: 'approved',
    DENIED: 'denied'
};

const ROLES = {
    TEACHER: 'Teacher',
    ADMIN: 'Admin',
    STUDENT: 'Student'
};

// Georgian status texts
const STATUS_TEXTS = {
    NOT_SUBMITTED: 'არ არის გაგზავნილი',
    TURNED_IN: 'გაგზავნილია',
    GRADED: 'შეფასებული',
    MISSING: 'გაცდენილი',
    NEEDS_GRADING: 'საჭიროებს შეფასებას',
    UNKNOWN: 'უცნობი'
};

const API_BASE_URL = '/api';
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/zip'
];

const state = {
    currentUser: null,
    groups: [],
    studentAssignments: [],
    activeTab: 'upcoming',
    isLoading: true,
    currentView: 'list',
    detailedAssignment: null,
    selectedStudentIdForGrading: null,
    selectedGroupId: null,
    filesToUpload: new Map(),
    retakeRequests: [],
    activeSubView: 'assignments'
};

const elements = {
    container: document.querySelector('.assignments-container'),
    teacherControls: document.getElementById('teacher-admin-controls'),
    groupSelect: document.getElementById('group-select'),
    createBtn: document.getElementById('create-assignment-btn'),
    tabsNav: document.getElementById('tabs-nav'),
    listView: document.getElementById('assignment-list-view'),
    detailView: document.getElementById('assignment-detail-view'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    submissionFileInput: document.getElementById('submission-file-input')
};

const apiService = {
    async fetch(endpoint, options = {}) {
        const token = localStorage.getItem('piRateToken');
        const headers = {
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`
        };

        if (options.body && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({
                message: 'დაფიქსირდა უცნობი შეცდომა'
            }));
            throw new Error(errorData.message);
        }

        return response.status === 204 ? null : response.json();
    },
    async fetchInitialData() {
        const [user, groups] = await Promise.all([
            this.fetch('/users/profile'),
            this.fetch('/groups')
        ]);
        return { user, groups };
    },
    async fetchAssignmentsForGroup(groupId, status) {
        let endpoint = `/assignments/teacher/${groupId}`;
        if (status && status !== 'all') {
            endpoint += `?status=${status}`;
        }
        return this.fetch(endpoint);
    },
    async fetchStudentAssignments(status) {
        let endpoint = '/assignments/student';
        let apiStatus = status;
        if (apiStatus === 'returned') apiStatus = 'graded';
        if (apiStatus && apiStatus !== 'all') endpoint += `?status=${apiStatus}`;
        return this.fetch(endpoint);
    },
    async fetchAssignmentTemplate(templateId) {
        return this.fetch(`/assignments/template/${templateId}`);
    },
    async createAssignment(formData) {
        return this.fetch('/assignments', { method: 'POST', body: formData });
    },
    async updateAssignment(templateId, formData) {
        return this.fetch(`/assignments/template/${templateId}`, { method: 'PUT', body: formData });
    },
    async deleteAssignment(templateId) {
        return this.fetch(`/assignments/template/${templateId}`, { method: 'DELETE' });
    },
    async submitAssignment(assignmentId, formData) {
        return this.fetch(`/assignments/student/${assignmentId}/submit`, { method: 'POST', body: formData });
    },
    async unsubmitAssignment(assignmentId) {
        return this.fetch(`/assignments/unsubmit/${assignmentId}`, { method: 'PUT' });
    },
    async gradeAssignment(assignmentId, data) {
        return this.fetch(`/assignments/grade/${assignmentId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
        });
    },
    async createRetakeRequest(data) {
        return this.fetch('/assignments/requests', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
        });
    },
    async fetchRetakeRequests(status = 'pending', courseId = null) {
        let endpoint = `/assignments/requests?status=${status}`;
        if (courseId) endpoint += `&courseId=${courseId}`;
        return this.fetch(endpoint);
    },
    async processRetakeRequest(requestId, status, data = {}) {
        return this.fetch(`/assignments/requests/${requestId}`, {
            method: 'PUT',
            body: JSON.stringify({ status, ...data }),
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

const uiRenderer = {
    
    toServerISOString(dateTimeLocalString) {
        if (!dateTimeLocalString) return null;
        const date = new Date(dateTimeLocalString);
        return date.toISOString();
    },

    // [FIX 1] Enhanced getFileIconClass for robust file type checking
    getFileIconClass(fileType, fileName = '') {
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        
        if (!fileType && !fileName) return 'fa-file-alt';
        
        // Primary check by MIME type
        if (fileType?.startsWith('image/')) return 'fa-file-image';
        if (fileType === 'application/pdf') return 'fa-file-pdf';
        if (fileType?.includes('wordprocessingml') || fileType === 'application/msword') return 'fa-file-word';
        if (fileType?.includes('spreadsheetml') || fileType?.includes('excel')) return 'fa-file-excel';
        if (fileType?.includes('presentationml') || fileType?.includes('powerpoint')) return 'fa-file-powerpoint';
        if (fileType?.startsWith('video/')) return 'fa-file-video';
        if (fileType?.startsWith('audio/')) return 'fa-file-audio';
        if (fileType?.includes('zip') || fileType?.includes('archive')) return 'fa-file-archive';
        if (fileType?.startsWith('text/')) return 'fa-file-alt';

        // Secondary check by extension for robustness
        if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) return 'fa-file-image';
        if (extension === 'pdf') return 'fa-file-pdf';
        if (['doc', 'docx'].includes(extension)) return 'fa-file-word';
        if (['zip', 'rar', '7z'].includes(extension)) return 'fa-file-archive';

        return 'fa-file-alt'; // Default
    },
    
    renderFileListItem(file, allowDownload = true) {
        const iconClass = this.getFileIconClass(file.fileType, file.fileName);
        const fileName = this.escapeHTML(file.fileName);
        
        return `
            <div class="file-list-item view-only">
                <i class="fas ${iconClass}"></i>
                <div class="file-info">
                    <a href="${file.url}" 
                       target="_blank" 
                       data-action="${ACTIONS.VIEW_FILE}" 
                       data-url="${file.url}" 
                       data-type="${file.fileType}"
                       data-file-name="${fileName}">
                       ${fileName}
                    </a>
                </div>
            </div>
        `;
    },
    
    init() {
        elements.container.classList.add(`role-${state.currentUser.role.toLowerCase()}`);
        if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
            this.renderTeacherAdminUI();
        } else {
            this.renderStudentUI();
        }
        this.updateView();
    },

    renderTeacherAdminUI() {
        elements.teacherControls.style.display = 'flex';
        const relevantGroups = state.currentUser.role === ROLES.ADMIN ?
            state.groups :
            state.groups.filter(g => g.users.some(u => u._id === state.currentUser._id));

        elements.groupSelect.innerHTML = `<option value="">აირჩიეთ ჯგუფი</option>` +
            relevantGroups.map(g => `<option value="${g._id}" ${g._id === state.selectedGroupId ? 'selected' : ''}>
                ${this.escapeHTML(g.name)}
            </option>`).join('');

        this.renderTabs();
    },

    renderStudentUI() {
        this.renderTabs();
    },

    renderTabs() {
        let html = '';
        const isTeacherOrAdmin = [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role);
        
        const assignmentTabs = [
            { id: 'upcoming', label: 'მომავალი' },
            { id: 'completed', label: 'შესრულებული' },
            { id: 'graded', label: 'შეფასებული' },
            { id: 'past-due', label: 'ვადაგასული' }
        ];
        
        assignmentTabs.forEach(tab => {
            const isActive = state.activeSubView === 'assignments' && state.activeTab === tab.id;
            html += `<button class="tab-btn ${isActive ? 'active' : ''}" data-action="${ACTIONS.CHANGE_TAB}" data-tab="${tab.id}">${tab.label}</button>`;
        });
        
        if (!isTeacherOrAdmin) {
            const isReturnedActive = state.activeTab === 'returned';
            html += `<button class="tab-btn ${isReturnedActive ? 'active' : ''}" data-action="${ACTIONS.CHANGE_TAB}" data-tab="returned">დაბრუნებული</button>`;
        }
        
        if (isTeacherOrAdmin) {
            const isRequestsActive = state.activeSubView === 'requests';
            html += `<button class="tab-btn ${isRequestsActive ? 'active' : ''}" data-action="${ACTIONS.CHANGE_TAB}" data-tab="requests">მოთხოვნები</button>`;
        }
        
        elements.tabsNav.innerHTML = html;
    },

    updateView() {
        this.renderTabs();
        elements.listView.style.display = state.currentView === 'list' ? 'block' : 'none';
        elements.detailView.style.display = state.currentView === 'detail' ? 'block' : 'none';

        if (state.currentView === 'list') {
            if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role) && state.activeSubView === 'requests') {
                this.renderRetakeRequestsList();
            } else {
                this.renderListView();
            }
        } else {
            this.renderDetailView();
        }
    },

    renderListView() {
        const container = elements.listView;

        if (state.isLoading) {
            container.innerHTML = `<div class="loading-spinner"></div>`;
            return;
        }

        if (state.studentAssignments.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>ამ ხედში დავალებები არ მოიძებნა.</p>
            </div>`;
            return;
        }

        if (state.activeTab === 'past-due' && [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
            const grouped = this.groupAssignmentsByDate(state.studentAssignments);
            container.innerHTML = Object.entries(grouped).map(([dateLabel, assignments]) => `
                <h3 class="date-group-header">${dateLabel}</h3>
                ${assignments.map(a => this.renderAssignmentItem(a)).join('')}
            `).join('');
        } else {
            container.innerHTML = state.studentAssignments.map(a => this.renderAssignmentItem(a)).join('');
        }
    },

    renderRetakeRequestsList() {
        const container = elements.listView;

        if (state.isLoading) {
            container.innerHTML = `<div class="loading-spinner"></div>`;
            return;
        }

        if (!state.retakeRequests.length) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>მოლოდინში არის ხელახლა შესრულების მოთხოვნები.</p>
            </div>`;
            return;
        }

        let html = '<div class="list-container">';
        state.retakeRequests.forEach(request => {
            const assignment = request.requestableId || {};
            const student = request.studentId || {};
            const assignmentTitle = assignment.templateTitle || 'უცნობი დავალება';

            html += `
                <div class="assignment-item" data-request-id="${request._id}">
                    <i class="fas fa-file-alt assignment-item-icon"></i>
                    <div class="assignment-item-info">
                        <span class="assignment-item-title">${this.escapeHTML(assignmentTitle)}</span>
                        <span class="assignment-item-meta">
                            სტუდენტი: ${student.firstName || ''} ${student.lastName || ''} (${student.email || ''})<br>
                            მიზეზი: ${this.escapeHTML(request.reason)}<br>
                            მოთხოვნის თარიღი: ${new Date(request.createdAt).toLocaleString('ka-GE')}
                        </span>
                    </div>
                    <div class="assignment-item-status">
                        <button class="btn btn-primary" data-action="${ACTIONS.APPROVE_RETAKE}" data-request-id="${request._id}">დამტკიცება</button>
                        <button class="btn btn-danger" data-action="${ACTIONS.DENY_RETAKE}" data-request-id="${request._id}">უარყოფა</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
    },
    
    groupAssignmentsByDate(assignments) {
        const groups = {};
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        assignments.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

        assignments.forEach(a => {
            const dueDate = new Date(a.dueDate);
            let key = dueDate.toLocaleDateString('ka-GE', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });

            if (dueDate.toDateString() === today.toDateString()) key = 'დღეს';
            if (dueDate.toDateString() === yesterday.toDateString()) key = 'გუშინ';

            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
        });

        return groups;
    },

    renderAssignmentItem(assignment) {
        const isTeacher = [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role);
        const dueDate = new Date(assignment.dueDate);
        let statusHTML = '';
        let title = '';

        if (isTeacher) {
            const statusText = this.getTeacherStatusText(assignment);
            statusHTML = `<span class="assignment-item-status status-badge ${assignment.status}">${statusText}</span>`;

            const studentName = assignment.studentId ?
                `${assignment.studentId.firstName} ${assignment.studentId.lastName}` :
                'უცნობი სტუდენტი';
            title = `${studentName} - ${assignment.templateId.title}`;
        } else {
            title = assignment.templateId.title;
            statusHTML = `<span class="assignment-item-status status-badge ${assignment.status}">
                ${this.getStudentStatusText(assignment)}
            </span>`;
        }

        return `
            <div class="assignment-item" data-id="${assignment._id}" 
                 data-action="${ACTIONS.VIEW_DETAIL}">
                <i class="fas fa-file-alt assignment-item-icon"></i>
                <div class="assignment-item-info">
                    <span class="assignment-item-title">${this.escapeHTML(title)}</span>
                    <span class="assignment-item-meta">ვადა: ${dueDate.toLocaleString('ka-GE')}</span>
                </div>
                ${(assignment.status === STATUS.PAST_DUE && !assignment.seenByTeacher && isTeacher) ? 
                    '<span class="status-badge new">ახალი</span>' : ''}
            </div>
        `;
    },

    renderDetailView() {
        const isTeacher = [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role);
        
        if (!state.detailedAssignment) {
            elements.detailView.innerHTML = `
                <div class="error-message">
                    <p>დავალების დეტალების ჩატვირთვა ვერ მოხერხდა. გთხოვთ, დაბრუნდით და სცადოთ თავიდან.</p>
                    <button class="btn btn-primary" data-action="back-to-list">
                        უკან სიაში
                    </button>
                </div>`;
            return;
        }

        if (isTeacher) {
            this.renderTeacherDetailView();
        } else {
            this.renderStudentDetailView();
        }
    },

    renderStudentDetailView() {
        const template = document.getElementById('template-student-detail-view').content.cloneNode(true);
        const assignment = state.detailedAssignment;
        const now = new Date();
        const dueDate = new Date(assignment.dueDate);
        const isPastDue = now > dueDate;

        template.querySelector('.assignment-title-detail').textContent = assignment.templateId.title;
        template.querySelector('.due-date').textContent = dueDate.toLocaleString('ka-GE');
        template.querySelector('.points').textContent = assignment.templateId.points;
        template.querySelector('.instructions-text').innerHTML =
            this.sanitizeHTML(assignment.templateId.instructions || 'ინსტრუქციები არ არის მოწოდებული.');

        const attachmentsContainer = template.querySelector('.attachments-list');
        if (assignment.templateId.attachments?.length > 0) {
            attachmentsContainer.innerHTML = assignment.templateId.attachments.map(file => 
                this.renderFileListItem(file)
            ).join('');
        } else {
            attachmentsContainer.innerHTML = `<p>მიმაგრებული ფაილები არ არის.</p>`;
        }

        const statusBadge = template.querySelector('.status-badge');
        const handInBtn = template.querySelector('.hand-in-btn');
        const unsubmitBtn = template.querySelector('.unsubmit-btn');
        const requestRetakeBtn = template.querySelector('.request-retake-btn');
        const submissionFilesList = template.querySelector('#submission-file-list');

        statusBadge.textContent = this.getStudentStatusText(assignment);
        statusBadge.className = `status-badge ${assignment.status}`;

        if (assignment.submission?.files?.length > 0) {
            submissionFilesList.innerHTML = assignment.submission.files.map(file => 
                this.renderFileListItem(file)
            ).join('');
        } else {
            submissionFilesList.innerHTML = `<p>ფაილები არ არის გაგზავნილი.</p>`;
        }

        const feedbackContainer = template.querySelector('.feedback-container');
        const feedbackBox = template.querySelector('.feedback-box');
        if (assignment.grade?.feedback) {
            feedbackContainer.style.display = 'block';
            feedbackBox.textContent = assignment.grade.feedback;
        }

        handInBtn.style.display = 'none';
        unsubmitBtn.style.display = 'none';
        requestRetakeBtn.style.display = 'none';

        if (assignment.status === STATUS.UPCOMING && !isPastDue) {
            handInBtn.style.display = 'block';
            // Hand-in button disability is managed by eventHandlers.handleFileInputChange
        } else if (assignment.status === STATUS.COMPLETED && !isPastDue) {
            unsubmitBtn.style.display = 'block';
        } else if (assignment.status === STATUS.PAST_DUE || (isPastDue && assignment.status !== STATUS.GRADED)) {
            requestRetakeBtn.style.display = 'block';
        }

        template.querySelector('.back-btn').dataset.action = ACTIONS.BACK_TO_LIST;
        const dropZone = template.querySelector('#submission-drop-zone');
        const fileInput = template.querySelector('#submission-file-input');
        dropZone.dataset.action = ACTIONS.TRIGGER_FILE_UPLOAD;
        dropZone.dataset.target = 'submission-file-input';
        fileInput.addEventListener('change', (e) => eventHandlers.handleFileInputChange(e.target));
        
        // [Fix 4] Event listeners for drag-and-drop on student submission view
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, this.preventDefaults));
        ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over')));
        ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over')));
        dropZone.addEventListener('drop', (e) => {
            if (e.dataTransfer.files.length) eventHandlers.handleFileInputChange({files: e.dataTransfer.files, id: 'submission-file-input'});
        });


        elements.detailView.innerHTML = '';
        elements.detailView.appendChild(template);
        // Ensure the hand-in button is disabled if no files are in the map initially
        if (handInBtn) handInBtn.disabled = state.filesToUpload.size === 0;
        
        // Call renderFileList to show any files already in the map (e.g., re-entering the detail view)
        this.renderFileList('submission-file-list');
    },

    renderTeacherDetailView() {
        const template = document.getElementById('template-teacher-detail-view').content.cloneNode(true);
        const assignment = state.detailedAssignment;
        
        template.querySelector('.assignment-title-detail').textContent = assignment.templateId.title;
        template.querySelector('.edit-master-btn').dataset.action = ACTIONS.EDIT_ASSIGNMENT;
        template.querySelector('[data-action="delete-assignment"]').dataset.templateId = assignment.templateId._id;
        
        // Render Teacher's Attachments from the master assignment template
        const instructionsText = template.querySelector('.instructions-text');
        instructionsText.innerHTML = this.sanitizeHTML(assignment.templateId.instructions || 'ინსტრუქციები არ არის მოწოდებული.');
        
        const attachmentsList = template.querySelector('.attachments-list');
        if (assignment.templateId.attachments?.length > 0) {
            attachmentsList.innerHTML = assignment.templateId.attachments.map(file => 
                this.renderFileListItem(file)
            ).join('');
        } else {
            attachmentsList.innerHTML = `<p>მიმაგრებული ფაილები არ არის.</p>`;
        }

        const container = template.querySelector('.grading-main-content');
        
        // Render student-specific content
        let filesHTML = '<p>ფაილები არ არის გაგზავნილი.</p>';
        if (assignment.submission?.files?.length > 0) {
            filesHTML = assignment.submission.files.map(file => 
                this.renderFileListItem(file)
            ).join('');
        }

        container.innerHTML = `
            <h3>სტუდენტის ნამუშევარი: ${this.escapeHTML(assignment.studentId.firstName)} ${this.escapeHTML(assignment.studentId.lastName)}</h3>
            <div class="submission-files-grading">${filesHTML}</div>
            <form class="grading-form" data-id="${assignment._id}">
                <div class="form-group">
                    <label for="grade-score">ქულა</label>
                    <div class="grade-input-group">
                        <input type="number" id="grade-score" name="score" value="${assignment.grade?.score || ''}" max="${assignment.templateId.points}" min="0">
                        <span>/ ${assignment.templateId.points}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label for="grade-feedback">გამოკვლევა</label>
                    <textarea id="grade-feedback" name="feedback" rows="6">${assignment.grade?.feedback || ''}</textarea>
                </div>
                <div class="modal-footer">
                    <button type="submit" class="btn btn-primary">ქულის დადგენა</button>
                </div>
            </form>
        `;

        container.querySelector('.grading-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const score = parseInt(formData.get('score'));
            const feedback = formData.get('feedback');
            const assignmentId = e.target.dataset.id;
            const assignment = state.studentAssignments.find(a => a._id === assignmentId);
            if (isNaN(score) || score < 0 || score > assignment.templateId.points) {
                uiRenderer.showNotification(`ქულა უნდა იყოს 0-${assignment.templateId.points} შორის`, 'error');
                return;
            }
            eventHandlers.handleGradeAssignment(assignmentId, { score, feedback });
        });

        template.querySelector('.back-btn').dataset.action = ACTIONS.BACK_TO_LIST;
        
        elements.detailView.innerHTML = '';
        elements.detailView.appendChild(template);
    },

    renderGradingPanel(studentAssignmentId) {
        const assignment = state.studentAssignments.find(sa => sa._id === studentAssignmentId);
        if (!assignment) return;

        const container = document.querySelector('.grading-main-content');
        if (!['completed', 'past-due'].includes(assignment.status)) {
            container.innerHTML = `<div class="grading-view-placeholder">
                <i class="fas fa-clock"></i>
                <p>ეს დავალება არ არის გაგზავნილი ან ჯერ არ აქვს ვადა. შეფასება მიუწვდომელია.</p>
            </div>`;
            return;
        }

        let filesHTML = '<p>ფაილები არ არის გაგზავნილი.</p>';
        if (assignment.submission?.files?.length > 0) {
            filesHTML = assignment.submission.files.map(file => 
                this.renderFileListItem(file)
            ).join('');
        }

        container.innerHTML = `
            <h3>სტუდენტის გაგზავნა: ${this.escapeHTML(assignment.studentId.firstName)} ${this.escapeHTML(assignment.studentId.lastName)}</h3>
            <div class="submission-files-grading">${filesHTML}</div>
            <form class="grading-form" data-id="${assignment._id}">
                <div class="form-group">
                    <label for="grade-score">ქულა</label>
                    <div class="grade-input-group">
                        <input type="number" id="grade-score" name="score" value="${assignment.grade?.score || ''}" max="${assignment.templateId.points}" min="0">
                        <span>/ ${assignment.templateId.points}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label for="grade-feedback">გამოკვლევა</label>
                    <textarea id="grade-feedback" name="feedback" rows="6">${assignment.grade?.feedback || ''}</textarea>
                </div>
                <div class="modal-footer">
                    <button type="submit" class="btn btn-primary">ქულის დადგენა</button>
                </div>
            </form>
        `;

        container.querySelector('.grading-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const score = parseInt(formData.get('score'));
            const feedback = formData.get('feedback');
            if (isNaN(score) || score < 0 || score > assignment.templateId.points) {
                uiRenderer.showNotification(`ქულა უნდა იყოს 0-${assignment.templateId.points} შორის`, 'error');
                return;
            }
            eventHandlers.handleGradeAssignment(assignment._id, { score, feedback });
        });
    },

    openModal(type, data = null) {
        const templateId = `template-${type}-modal`;
        const template = document.getElementById(templateId);
        if (!template) {
            console.error(`Modal template with ID "${templateId}" not found.`);
            return;
        }

        state.filesToUpload.clear();
        elements.modalBackdrop.innerHTML = '';
        elements.modalBackdrop.appendChild(template.content.cloneNode(true));

        const modalElement = elements.modalBackdrop.querySelector('.modal');
        const form = modalElement.querySelector('form');

        if (type === 'create-assignment') {
            const courseSelect = modalElement.querySelector('#assignment-course');
            if (courseSelect) {
                const relevantGroups = state.currentUser.role === ROLES.ADMIN ?
                    state.groups :
                    state.groups.filter(g => g.users.some(u => u._id === state.currentUser._id));
                courseSelect.innerHTML = relevantGroups.map(g => `<option value="${g._id}" ${g._id === state.selectedGroupId ? 'selected' : ''}>${this.escapeHTML(g.name)}</option>`).join('');
            }

            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            modalElement.querySelector('#assignment-start-time').value = this.formatDateTimeLocal(now);
            modalElement.querySelector('#assignment-end-time').value = this.formatDateTimeLocal(tomorrow);

            if (data) {
                modalElement.querySelector('#modal-title').textContent = 'დავალების რედაქტირება';
                modalElement.querySelector('#assignment-title').value = data.title;
                modalElement.querySelector('#assignment-instructions').value = data.instructions;
                modalElement.querySelector('#assignment-points').value = data.points;
                Array.from(courseSelect.options).forEach(option => {
                    option.selected = data.courseId.includes(option.value);
                });
                modalElement.querySelector('#assignment-start-time').value = this.formatDateTimeLocal(new Date(data.startTime));
                modalElement.querySelector('#assignment-end-time').value = this.formatDateTimeLocal(new Date(data.endTime));
            }

            const dropZone = modalElement.querySelector('#attachment-drop-zone');
            const fileInput = modalElement.querySelector('#attachment-file-input');
            dropZone.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) this.handleFiles(e.target.files, 'attachment-list');
            });
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, this.preventDefaults));
            ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over')));
            ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over')));
            dropZone.addEventListener('drop', (e) => {
                if (e.dataTransfer.files.length) this.handleFiles(e.dataTransfer.files, 'attachment-list');
            });
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (data) {
                    eventHandlers.handleUpdateAssignment(data._id, form);
                } else {
                    eventHandlers.handleCreateAssignment(form);
                }
            });
        }

        modalElement.querySelectorAll(`[data-action="${ACTIONS.CLOSE_MODAL}"]`).forEach(btn => btn.addEventListener('click', () => this.closeModal()));
        elements.modalBackdrop.style.display = 'flex';
    },

    closeModal() {
        elements.modalBackdrop.style.display = 'none';
        elements.modalBackdrop.innerHTML = '';
    },

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 500);
            }, 4000);
        }, 10);
    },

    escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[tag] || tag));
    },

    sanitizeHTML(str) {
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    },

    getStudentStatusText(assignment) {
        switch (assignment.status) {
            case STATUS.UPCOMING: return STATUS_TEXTS.NOT_SUBMITTED;
            case STATUS.COMPLETED: return STATUS_TEXTS.TURNED_IN;
            case STATUS.GRADED: return `${STATUS_TEXTS.GRADED}: ${assignment.grade.score}/${assignment.templateId.points}`;
            case STATUS.PAST_DUE: return STATUS_TEXTS.MISSING;
            default: return STATUS_TEXTS.UNKNOWN;
        }
    },

    getTeacherStatusText(assignment) {
        switch (assignment.status) {
            case STATUS.COMPLETED: return STATUS_TEXTS.NEEDS_GRADING;
            case STATUS.GRADED: return `${STATUS_TEXTS.GRADED}: ${assignment.grade.score}/${assignment.templateId.points}`;
            case STATUS.PAST_DUE: return STATUS_TEXTS.MISSING;
            default: return STATUS_TEXTS.NOT_SUBMITTED;
        }
    },

    // [FIX 5] handleFiles now accepts containerId
    handleFiles(files, containerId = 'attachment-list') {
        Array.from(files).forEach(file => {
            if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                this.showNotification(`ფაილი ${file.name} აჭარბებს ${MAX_FILE_SIZE_MB}MB ლიმიტს`, 'error');
                return;
            }
            if (!ALLOWED_FILE_TYPES.includes(file.type)) {
                this.showNotification(`ფაილის ტიპი არ არის მხარდაჭერილი: ${file.name}`, 'error');
                return;
            }
            const fileWrapper = { file, progress: 0, status: 'uploading' };
            state.filesToUpload.set(file.name, fileWrapper);
            const interval = setInterval(() => {
                fileWrapper.progress += 10;
                if (fileWrapper.progress >= 100) {
                    clearInterval(interval);
                    fileWrapper.status = 'complete';
                }
                this.renderFileList(containerId); // Use passed containerId
            }, 200);
        });
        this.renderFileList(containerId); // Use passed containerId
    },

    renderFileList(containerId = 'attachment-list') {
        const container = document.querySelector(`#${containerId}`);
        if (!container) return;
        container.innerHTML = '';
        state.filesToUpload.forEach((fileWrapper, fileName) => {
            const template = document.getElementById('template-file-item').content.cloneNode(true);
            const iconClass = this.getFileIconClass(fileWrapper.file.type);
            template.querySelector('.file-icon').className = `fas ${iconClass} file-icon`;
            template.querySelector('.file-name').textContent = fileWrapper.file.name;
            template.querySelector('.progress-bar').style.width = `${fileWrapper.progress}%`;
            template.querySelector('.progress-bar-container').setAttribute('aria-valuenow', fileWrapper.progress);
            const statusEl = template.querySelector('.file-status');
            if (fileWrapper.status === 'uploading') {
                statusEl.className = 'file-status uploading';
                statusEl.innerHTML = '<i class="fas fa-spinner"></i>';
            } else if (fileWrapper.status === 'complete') {
                statusEl.className = 'file-status status-complete';
                statusEl.innerHTML = '<i class="fas fa-check-circle"></i>';
            }
            template.querySelector('.remove-file-btn').dataset.fileName = fileName;
            template.querySelector('.remove-file-btn').dataset.containerId = containerId;
            container.appendChild(template);
        });
    },

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    },

    formatDateTimeLocal(date) {
        const pad = (num) => num.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
};

const eventHandlers = {
    init() {
        if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
            if (elements.groupSelect) {
                elements.groupSelect.addEventListener('change', this.handleGroupChange.bind(this));
            }
            if (elements.createBtn) {
                elements.createBtn.addEventListener('click', () => {
                    if (!state.selectedGroupId && state.currentUser.role !== ROLES.ADMIN && state.groups.length > 0) {
                        uiRenderer.showNotification('გთხოვთ ჯერ აირჩიოთ ჯგუფი', 'warning');
                        return;
                    }
                    uiRenderer.openModal('create-assignment');
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
        const url = new URL(window.location);
        url.searchParams.set('groupId', groupId);
        window.history.pushState({}, '', url);

        if (!groupId) {
            state.studentAssignments = [];
            uiRenderer.renderListView();
            return;
        }
        await this.loadStudentAssignments();
    },

    async handleTabClick(e) {
        const tabBtn = e.target.closest('.tab-btn');
        if (!tabBtn) return;
        await this.handleTabChange(tabBtn.dataset.tab);
    },

    handleGlobalClick(e) {
        const actionElement = e.target.closest('[data-action]');
        if (!actionElement) return;

        const { action, id, fileName, url, type, containerId, requestId, templateId } = actionElement.dataset;

        switch (action) {
            case ACTIONS.VIEW_DETAIL: this.handleViewDetail(id); break;
            case ACTIONS.BACK_TO_LIST: this.handleBackToList(); break;
            case ACTIONS.SELECT_STUDENT_FOR_GRADING: this.handleSelectStudentForGrading(id); break;
            case ACTIONS.REMOVE_FILE: this.handleRemoveFile(fileName, containerId); break;
            case ACTIONS.VIEW_FILE: e.preventDefault(); this.handleViewFile(url, type, fileName); break;
            case ACTIONS.CLOSE_MODAL: uiRenderer.closeModal(); break;
            case ACTIONS.UNSUBMIT_ASSIGNMENT: this.handleUnsubmitAssignment(state.detailedAssignment._id); break;
            case ACTIONS.REQUEST_RETAKE: this.handleRequestRetake(state.detailedAssignment._id); break;
            case ACTIONS.TRIGGER_FILE_UPLOAD: document.getElementById(actionElement.dataset.target)?.click(); break;
            case ACTIONS.SUBMIT_ASSIGNMENT: e.preventDefault(); this.handleSubmitAssignment(state.detailedAssignment._id); break;
            case ACTIONS.EDIT_ASSIGNMENT: this.handleEditAssignment(state.detailedAssignment.templateId._id); break;
            case ACTIONS.DELETE_ASSIGNMENT: this.handleDeleteAssignment(templateId); break;
            case ACTIONS.CHANGE_TAB: this.handleTabChange(actionElement.dataset.tab); break;
            case ACTIONS.APPROVE_RETAKE: this.handleApproveRetake(requestId); break;
            case ACTIONS.DENY_RETAKE: this.handleDenyRetake(requestId); break;
        }
    },

    // [FIX 6] Corrected handleFileInputChange to pass fileListId to uiRenderer.handleFiles
    async handleFileInputChange(input) {
        if (!input.files.length) return;
        const isSubmission = input.id === 'submission-file-input';
        const fileListId = isSubmission ? 'submission-file-list' : 'attachment-list'; // Correct target ID
        
        // Pass the correct fileListId to handleFiles
        uiRenderer.handleFiles(input.files, fileListId);
        
        if (isSubmission) {
            const handInBtn = document.querySelector('.hand-in-btn');
            if(handInBtn) handInBtn.disabled = state.filesToUpload.size === 0;
        }
        input.value = '';
    },
    
    async handleFormSubmit(form) {
        if (form.id === 'assignment-form') {
            const isEditing = form.querySelector('#modal-title').textContent === 'Edit Assignment';
            if (isEditing) {
                await this.handleUpdateAssignment(state.detailedAssignment.templateId._id, form);
            } else {
                await this.handleCreateAssignment(form);
            }
        } else if (form.classList.contains('grading-form')) {
            const formData = new FormData(form);
            const score = parseInt(formData.get('score'));
            const feedback = formData.get('feedback');
            const assignmentId = form.dataset.id;
            const assignment = state.studentAssignments.find(a => a._id === assignmentId);
            if (isNaN(score) || score < 0 || score > assignment.templateId.points) {
                uiRenderer.showNotification(`ქულა უნდა იყოს 0-${assignment.templateId.points} შორის`, 'error');
                return;
            }
            await this.handleGradeAssignment(assignmentId, { score, feedback });
        }
    },

    handleViewDetail(assignmentId) {
        state.detailedAssignment = state.studentAssignments.find(a => a._id === assignmentId);
        state.currentView = 'detail';
        
        if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
            state.selectedStudentIdForGrading = assignmentId;
            const masterAssignment = state.studentAssignments.find(sa => sa._id === assignmentId);
            if (masterAssignment) {
                state.detailedAssignment = masterAssignment;
            }
        }
        uiRenderer.updateView();
    },

    handleBackToList() {
        state.currentView = 'list';
        state.detailedAssignment = null;
        state.selectedStudentIdForGrading = null;
        state.filesToUpload.clear();
        uiRenderer.updateView();
    },

    handleSelectStudentForGrading(studentAssignmentId) {
        state.selectedStudentIdForGrading = studentAssignmentId;
        document.querySelector('.student-list-item.active')?.classList.remove('active');
        document.querySelector(`.student-list-item[data-id="${studentAssignmentId}"]`)?.classList.add('active');
        uiRenderer.renderGradingPanel(studentAssignmentId);
    },

    handleRemoveFile(fileName, containerId = 'attachment-list') {
        state.filesToUpload.delete(fileName);
        uiRenderer.renderFileList(containerId);
        if (state.currentView === 'detail' && state.currentUser.role === ROLES.STUDENT) {
            const submitBtn = document.querySelector('.hand-in-btn');
            if (submitBtn) submitBtn.disabled = state.filesToUpload.size === 0;
        }
    },

    handleViewFile(fileUrl, fileType, fileName) {
        const modalTemplate = document.getElementById('template-file-viewer-modal').content.cloneNode(true);
        
        const isPDF = fileType === 'application/pdf' || fileUrl.toLowerCase().endsWith('.pdf');
        const isImage = fileType?.startsWith('image/');
        
        modalTemplate.querySelector('#file-viewer-title').textContent = fileName || fileUrl.split('/').pop();
        
        let iframeSrc = fileUrl;
        
        if (isPDF) {
            const encodedUrl = encodeURIComponent(fileUrl);
            iframeSrc = `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;
        } else if (isImage) {
            iframeSrc = fileUrl;
        } else {
            const encodedUrl = encodeURIComponent(fileUrl);
            iframeSrc = `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;
        }
        
        modalTemplate.querySelector('#file-viewer-iframe').src = iframeSrc;
        modalTemplate.querySelector('#file-download-btn').href = fileUrl;
        
        elements.modalBackdrop.innerHTML = '';
        elements.modalBackdrop.appendChild(modalTemplate);
        elements.modalBackdrop.style.display = 'flex';
        
        const newModal = elements.modalBackdrop.querySelector('.file-viewer-modal');
        if (newModal) {
            newModal.querySelector('[data-action="close-modal"]').addEventListener('click', () => {
                elements.modalBackdrop.style.display = 'none';
            });
        }
    },

    async handleCreateAssignment(form) {
        const startTimeLocal = form.querySelector('#assignment-start-time').value;
        const endTimeLocal = form.querySelector('#assignment-end-time').value;
        const startTimeServer = uiRenderer.toServerISOString(startTimeLocal);
        const endTimeServer = uiRenderer.toServerISOString(endTimeLocal);
        
        const formData = new FormData();
        formData.append('title', form.querySelector('#assignment-title').value);
        formData.append('instructions', form.querySelector('#assignment-instructions').value);
        formData.append('points', form.querySelector('#assignment-points').value);
        formData.append('startTime', startTimeServer);
        formData.append('endTime', endTimeServer);
        Array.from(form.querySelector('#assignment-course').selectedOptions).forEach(option => {
            formData.append('courseId', option.value);
        });
        state.filesToUpload.forEach(fileWrapper => formData.append('attachments', fileWrapper.file));

        try {
            await apiService.createAssignment(formData);
            uiRenderer.showNotification('დავალება წარმატებით შეიქმნა!', 'success');
            uiRenderer.closeModal();
            await this.loadStudentAssignments();
        } catch (error) {
            uiRenderer.showNotification(`დავალების შექმნა ვერ მოხერხდა: ${error.message}`, 'error');
        }
    },

    async handleUpdateAssignment(templateId, form) {
        const startTimeLocal = form.querySelector('#assignment-start-time').value;
        const endTimeLocal = form.querySelector('#assignment-end-time').value;
        const startTimeServer = uiRenderer.toServerISOString(startTimeLocal);
        const endTimeServer = uiRenderer.toServerISOString(endTimeLocal);
        
        const formData = new FormData();
        formData.append('title', form.querySelector('#assignment-title').value);
        formData.append('instructions', form.querySelector('#assignment-instructions').value);
        formData.append('points', form.querySelector('#assignment-points').value);
        formData.append('startTime', startTimeServer);
        formData.append('endTime', endTimeServer);
        Array.from(form.querySelector('#assignment-course').selectedOptions).forEach(option => {
            formData.append('courseId', option.value);
        });
        state.filesToUpload.forEach(fileWrapper => formData.append('attachments', fileWrapper.file));

        try {
            await apiService.updateAssignment(templateId, formData);
            uiRenderer.showNotification('დავალება წარმატებით განახლდა!', 'success');
            uiRenderer.closeModal();
            await this.loadStudentAssignments();
        } catch (error) {
            uiRenderer.showNotification(`დავალების განახლება ვერ მოხერხდა: ${error.message}`, 'error');
        }
    },

    async handleDeleteAssignment(templateId) {
        if (confirm('დარწმუნებული ხართ, რომ გსურთ ამ დავალების და მასთან დაკავშირებული სტუდენტური გაგზავნების სრულად წაშლა? ეს მოქმედება შეუქცევადია.')) {
            try {
                await apiService.deleteAssignment(templateId);
                uiRenderer.showNotification('დავალება წარმატებით წაიშალა.', 'success');
                this.handleBackToList();
                await this.loadStudentAssignments();
            } catch (error) {
                uiRenderer.showNotification(`დავალების წაშლა ვერ მოხერხდა: ${error.message}`, 'error');
            }
        }
    },

    async handleEditAssignment(templateId) {
        try {
            const { data } = await apiService.fetchAssignmentTemplate(templateId);
            uiRenderer.openModal('create-assignment', data);
        } catch (error) {
            uiRenderer.showNotification('დავალების რედაქტირებისთვის ჩატვირთვა ვერ მოხერხდა.', 'error');
        }
    },

    async handleSubmitAssignment(assignmentId) {
        const formData = new FormData();
        state.filesToUpload.forEach(fileWrapper => formData.append('files', fileWrapper.file));
        try {
            await apiService.submitAssignment(assignmentId, formData);
            uiRenderer.showNotification('დავალება წარმატებით გაიგზავნა!', 'success');
            await this.loadStudentAssignments();
            this.handleBackToList();
        } catch (error) {
            uiRenderer.showNotification(`დავალების გაგზავნა ვერ მოხერხდა: ${error.message}`, 'error');
        }
    },

    async handleUnsubmitAssignment(assignmentId) {
        try {
            await apiService.unsubmitAssignment(assignmentId);
            uiRenderer.showNotification('გაგზავნა წარმატებით გაუქმდა!', 'success');
            await this.loadStudentAssignments();
            this.handleBackToList();
        } catch (error) {
            uiRenderer.showNotification(`გაგზავნის გაუქმება ვერ მოხერხდა: ${error.message}`, 'error');
        }
    },

    async handleRequestRetake(assignmentId) {
        const reason = prompt('გთხოვთ ახსნათ, რატომ გჭირდებახელახლა შესრულება:');
        if (!reason) return;
        try {
            await apiService.createRetakeRequest({ requestableId: assignmentId, reason });
            uiRenderer.showNotification('ხელახლა შესრულების მოთხოვნა გაიგზავნა!', 'success');
        } catch (error) {
            uiRenderer.showNotification(`მოთხოვნის გაგზავნა ვერ მოხერხდა: ${error.message}`, 'error');
        }
    },

    async handleGradeAssignment(assignmentId, data) {
        try {
            await apiService.gradeAssignment(assignmentId, data);
            uiRenderer.showNotification('დავალება წარმატებით შეფასდა!', 'success');
            await this.loadStudentAssignments();
        } catch (error) {
            uiRenderer.showNotification(`დავალების შეფასება ვერ მოხერხდა: ${error.message}`, 'error');
        }
    },

    async loadStudentAssignments() {
        if (!state.selectedGroupId && [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
            state.studentAssignments = [];
            uiRenderer.renderListView();
            return;
        }
        state.isLoading = true;
        uiRenderer.renderListView();
        try {
            const result = [ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)
                ? await apiService.fetchAssignmentsForGroup(state.selectedGroupId, state.activeTab)
                : await apiService.fetchStudentAssignments(state.activeTab);
            state.studentAssignments = result.data;
        } catch (error) {
            uiRenderer.showNotification('დავალებების ჩატვირთვა ვერ მოხერხდა.', 'error');
            state.studentAssignments = [];
        }
        state.isLoading = false;
        uiRenderer.renderListView();
    },

    async loadRetakeRequests() {
        state.isLoading = true;
        uiRenderer.renderListView();
        try {
            const result = await apiService.fetchRetakeRequests(STATUS.PENDING, state.selectedGroupId);
            state.retakeRequests = result.data || [];
        } catch (error) {
            uiRenderer.showNotification('ხელახლა შესრულების მოთხოვნების ჩატვირთვა ვერ მოხერხდა.', 'error');
            state.retakeRequests = [];
        }
        state.isLoading = false;
        uiRenderer.renderRetakeRequestsList();
    },

    handleApproveRetake(requestId) {
        uiRenderer.openModal('approve-retake');
        const form = document.getElementById('approve-retake-form');
        const newDueDateInput = document.getElementById('retake-end-time');
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 3);
        newDueDateInput.value = uiRenderer.formatDateTimeLocal(defaultDate);

        form.onsubmit = async (e) => {
            e.preventDefault();
            const newDueDateLocal = new FormData(form).get('newDueDate');
            if (!newDueDateLocal) {
                uiRenderer.showNotification('გთხოვთ აირჩიოთ ახალი ვადა.', 'error');
                return;
            }
            
            const newDueDateServer = uiRenderer.toServerISOString(newDueDateLocal);
            
            try {
                await apiService.processRetakeRequest(requestId, STATUS.APPROVED, { newDueDate: newDueDateServer });
                uiRenderer.showNotification('მოთხოვნა დამტკიცდა და დავალება განახლდა!', 'success');
                uiRenderer.closeModal();
                await this.loadRetakeRequests();
                await this.loadStudentAssignments();
            } catch (error) {
                uiRenderer.showNotification(`მოთხოვნის დამტკიცება ვერ მოხერხდა: ${error.message}`, 'error');
            }
        };
    },

    async handleDenyRetake(requestId) {
        try {
            await apiService.processRetakeRequest(requestId, STATUS.DENIED);
            uiRenderer.showNotification('ხელახლა შესრულების მოთხოვნა უარყოფილ იქნა.', 'success');
            await this.loadRetakeRequests();
        } catch (error) {
            uiRenderer.showNotification('მოთხოვნის უარყოფა ვერ მოხერხდა.', 'error');
        }
    },

    async handleTabChange(tabId) {
        if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
            if (tabId === 'requests') {
                state.activeSubView = 'requests';
                await this.loadRetakeRequests();
            } else {
                state.activeSubView = 'assignments';
                state.activeTab = tabId;
                await this.loadStudentAssignments();
            }
        } else {
            state.activeTab = tabId;
            await this.loadStudentAssignments();
        }
        uiRenderer.updateView();
    }
};

// Main App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const groupId = urlParams.get('groupId');
        if (groupId) {
            state.selectedGroupId = groupId;
        }

        const { user, groups } = await apiService.fetchInitialData();
        state.currentUser = user;
        state.groups = groups;

        uiRenderer.init();
        eventHandlers.init();

        if ([ROLES.TEACHER, ROLES.ADMIN].includes(state.currentUser.role)) {
            if (state.selectedGroupId) {
                await eventHandlers.loadStudentAssignments();
            }
        } else {
            await eventHandlers.loadStudentAssignments();
        }
    } catch (error) {
        console.error('Initialization error:', error);
        elements.container.innerHTML = `
            <h1><i class="fas fa-exclamation-triangle"></i> შეცდომა</h1>
            <p>დავალებების მოდულის ჩატვირთვა ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.</p>
        `;
    }
});
