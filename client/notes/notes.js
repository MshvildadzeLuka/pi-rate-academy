// notes.js (Updated to fix authentication issues, use server proxy for downloads to ensure authorization, and handle full uncompressed PDF downloads via blob streaming)
const API_BASE_URL = '/api';
const NOTES_PER_PAGE = 12;

// Georgian language dictionary
const lang = {
    loading: "იტვირთება...",
    error: "შეცდომა",
    success: "წარმატება",
    warning: "გაფრთხილება",
    info: "ინფორმაცია",
    notesTitle: "ლექციის ჩანაწერები",
    uploadNote: "ახალი ჩანაწერი",
    chooseGroup: "აირჩიეთ ჯგუფი",
    allGroups: "ყველა ჯგუფი",
    noGroups: "ჯგუფები არ არის",
    uploadNewNote: "ახალი ჩანაწერის ატვირთვა",
    title: "სათაური",
    description: "აღწერა",
    group: "ჯგუფი",
    filePdfOnly: "ფაილი (მხოლოდ PDF)",
    dragDrop: "გადმოათრიეთ PDF ფაილი აქ ან დააჭირეთ ფაილის ასარჩევად",
    cancel: "გაუქმება",
    uploadNoteButton: "ჩანაწერის ატვირთვა",
    uploading: "იტვირთება...",
    downloading: "ჩამოტვირთვა...",
    pleaseSelectGroup: "გთხოვთ, აირჩიოთ ჯგუფი მისი ჩანაწერების სანახავად",
    noNotes: "ამ ჯგუფისთვის ჩანაწერები არ არის",
    download: "ჩამოტვირთვა",
    delete: "წაშლა",
    unknownGroup: "უცნობი ჯგუფი",
    fileUploadFailed: "ფაილის ატვირთვა ვერ მოხერხდა",
    fileTooLarge: "ფაილის ზომა აღემატება 50MB ლიმიტს",
    fileTypeNotSupported: "ფაილის ფორმატი არ არის მხარდაჭერილი",
    onlyOneFile: "თქვენ შეგიძლიათ ატვირთოთ მხოლოდ ერთი ფაილი",
    pleaseSelectFile: "გთხოვთ, აირჩიოთ ფაილი ასატვირთად",
    confirmDelete: "დარწმუნებული ხართ, რომ გსურთ ამ ჩანაწერის წაშლა?",
    deleteSuccess: "ჩანაწერი წარმატებით წაიშალა",
    deleteError: "ჩანაწერის წაშლა ვერ მოხერხდა",
    downloadSuccess: "ფაილი წარმატებით ჩამოიტვირთა",
    downloadError: "ფაილის ჩამოტვირთვა ვერ მოხერხდა",
    page: "გვერდი",
    of: "of",
    previous: "წინა",
    next: "შემდეგი",
    loadError: "ჩანაწერების ჩატვირთვა ვერ მოხერხდა",
    initializationError: "ინიციალიზაციის შეცდომა",
    authError: "ავტორიზაციის შეცდომა",
    tryAgain: "სცადეთ თავიდან"
};

// State
const state = {
    currentUser: null,
    allSystemGroups: [],
    userMemberGroups: [],
    allNotesForGroup: [],
    paginatedNotes: [],
    selectedGroupId: '',
    filesToUpload: new Map(),
    currentPage: 1,
    totalPages: 1,
    isLoading: true
};

// DOM Elements
const elements = {
    teacherControls: document.getElementById('teacher-admin-controls'),
    groupSelect: document.getElementById('group-select'),
    uploadBtn: document.getElementById('upload-note-btn'),
    notesList: document.getElementById('notes-list'),
    modalBackdrop: document.getElementById('upload-note-modal'),
    noteForm: document.getElementById('note-form'),
    noteGroupSelect: document.getElementById('note-group'),
    noteDropZone: document.getElementById('note-drop-zone'),
    noteFileInput: document.getElementById('note-file-input'),
    noteFileList: document.getElementById('note-file-list'),
    paginationControls: document.getElementById('pagination-controls'),
    prevPageBtn: document.getElementById('prev-page-btn'),
    nextPageBtn: document.getElementById('next-page-btn'),
    pageInfo: document.getElementById('page-info')
};

// API Service
const apiService = {
    async fetch(endpoint, options = {}) {
        const token = localStorage.getItem('piRateToken');
        const headers = { ...options.headers };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        if (options.body && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, { 
                ...options, 
                headers,
                credentials: 'include'
            });
            
            if (response.status === 401) {
                localStorage.removeItem('piRateToken');
                window.location.href = '../login/login.html';
                throw new Error(lang.authError);
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: lang.error }));
                throw new Error(errorData.message || lang.error);
            }
            
            return response.status === 204 ? null : response.json();
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    },
    
    async fetchBlob(endpoint) {
        const token = localStorage.getItem('piRateToken');
        if (!token) {
            throw new Error('No authentication token found. Please log in again.');
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('piRateToken');
                window.location.href = '../login/login.html';
            }
            const errorData = await response.json().catch(() => ({ message: lang.error }));
            throw new Error(errorData.message || lang.error);
        }
        
        return response.blob();
    },
    
    async fetchInitialData() {
        try {
            const [user, allGroups] = await Promise.all([
                this.fetch('/users/profile'),
                this.fetch('/groups?populate=users')
            ]);
            return { user, allGroups };
        } catch (error) {
            console.error('Error fetching initial data:', error);
            throw new Error(lang.initializationError);
        }
    },
    
    async fetchNotes(groupId) {
        try {
            if (state.currentUser.role === 'Admin' && (!groupId || groupId === 'all')) {
                return this.fetch('/notes');
            }
            const endpoint = groupId ? `/notes/group/${groupId}` : '/notes';
            return this.fetch(endpoint);
        } catch (error) {
            console.error('Error fetching notes:', error);
            throw new Error(lang.loadError);
        }
    },
    
    async createNote(formData) {
        return this.fetch('/notes', { 
            method: 'POST', 
            body: formData 
        });
    },
    
    async deleteNote(noteId) {
        return this.fetch(`/notes/${noteId}`, { method: 'DELETE' });
    },
    
    async downloadNote(noteId, fileName) {
        try {
            const blob = await this.fetchBlob(`/notes/${noteId}/download`);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return true;
        } catch (error) {
            throw error;
        }
    },
    
    async fetchUserGroups() {
        return this.fetch('/groups/my-groups');
    }
};

// UI Renderer
const uiRenderer = {
    init() {
        this.setPageTitle();
        
        if (['Teacher', 'Admin'].includes(state.currentUser.role)) {
            this.renderTeacherAdminUI();
        } else {
            this.renderStudentUI();
        }
    },
    
    setPageTitle() {
        document.title = `${lang.notesTitle} | Pi-Rate Academy`;
    },
    
    renderTeacherAdminUI() {
        if (elements.teacherControls) {
            elements.teacherControls.style.display = 'flex';
        }
        this.renderGroupSelect();
        this.fetchAndRenderNotes();
    },
    
    renderStudentUI() {
        if (elements.teacherControls) {
            elements.teacherControls.style.display = 'none';
        }
        this.renderGroupSelect();
        this.fetchAndRenderNotes();
    },
    
    renderGroupSelect() {
        if (!elements.groupSelect) return;
        
        elements.groupSelect.innerHTML = '';
        
        if (state.currentUser.role === 'Admin') {
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = lang.allGroups;
            elements.groupSelect.appendChild(allOption);
        }
        
        state.userMemberGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group._id;
            option.textContent = group.name || lang.unknownGroup;
            elements.groupSelect.appendChild(option);
        });
        
        if (state.userMemberGroups.length > 0) {
            elements.groupSelect.value = state.userMemberGroups[0]._id;
            state.selectedGroupId = elements.groupSelect.value;
        } else if (state.currentUser.role === 'Admin') {
            elements.groupSelect.value = 'all';
            state.selectedGroupId = 'all';
        }
    },
    
    async fetchAndRenderNotes() {
        try {
            state.isLoading = true;
            this.renderLoadingState();
            
            const notesResponse = await apiService.fetchNotes(state.selectedGroupId);
            let notes = notesResponse.data || notesResponse || [];
            
            // CORRECTED: Added a sort to ensure newest notes are always first
            notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            state.allNotesForGroup = notes;
            
            this.updatePagination();
            this.renderNotes();
            
        } catch (error) {
            this.renderErrorState(error.message);
        } finally {
            state.isLoading = false;
        }
    },
    
    renderLoadingState() {
        if (elements.notesList) {
            elements.notesList.innerHTML = `
                <div class="loading-indicator">
                    <div class="loading-spinner"></div>
                    <p>${lang.loading}</p>
                </div>
            `;
        }
    },
    
    renderErrorState(message) {
        if (elements.notesList) {
            elements.notesList.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                    <button class="btn btn-primary" onclick="uiRenderer.fetchAndRenderNotes()">${lang.tryAgain}</button>
                </div>
            `;
        }
    },
    
    updatePagination() {
        state.totalPages = Math.ceil(state.allNotesForGroup.length / NOTES_PER_PAGE) || 1;
        state.currentPage = Math.min(state.currentPage, state.totalPages);
        
        const start = (state.currentPage - 1) * NOTES_PER_PAGE;
        state.paginatedNotes = state.allNotesForGroup.slice(start, start + NOTES_PER_PAGE);
        
        if (elements.pageInfo) {
            elements.pageInfo.textContent = `${lang.page} ${state.currentPage} ${lang.of} ${state.totalPages}`;
        }
        
        if (elements.prevPageBtn) {
            elements.prevPageBtn.disabled = state.currentPage === 1;
        }
        
        if (elements.nextPageBtn) {
            elements.nextPageBtn.disabled = state.currentPage === state.totalPages;
        }
    },
    
    renderNotes() {
        if (!elements.notesList) return;
        
        elements.notesList.innerHTML = '';
        
        if (state.paginatedNotes.length === 0) {
            elements.notesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <p>${state.selectedGroupId ? lang.noNotes : lang.pleaseSelectGroup}</p>
                </div>
            `;
            return;
        }
        
        state.paginatedNotes.forEach(note => {
            const card = this.renderNoteCard(note);
            elements.notesList.appendChild(card);
        });
    },
    
    renderNoteCard(note) {
        const card = document.createElement('div');
        card.className = 'note-card';
        
        const groupName = note.groupId?.name || lang.unknownGroup;
        const creatorName = note.creatorId ? `${note.creatorId.firstName} ${note.creatorId.lastName}` : 'Unknown';
        const createdAt = new Date(note.createdAt).toLocaleDateString('ka-GE');
        
        card.innerHTML = `
            <div class="note-thumbnail">
                <i class="fas fa-file-pdf"></i>
            </div>
            <div class="note-content">
                <h3 class="note-title">${note.title}</h3>
                <p class="note-description">${note.description}</p>
                <div class="note-meta">
                    <span><i class="fas fa-users"></i> ${groupName}</span>
                    <span><i class="fas fa-user"></i> ${creatorName}</span>
                    <span><i class="fas fa-calendar"></i> ${createdAt}</span>
                </div>
            </div>
            <div class="note-actions">
                <button class="btn btn-primary download-btn" data-note-id="${note._id}" data-file-name="${note.fileName}">
                    <i class="fas fa-download"></i> ${lang.download}
                </button>
                ${['Teacher', 'Admin'].includes(state.currentUser.role) ? `
                    <button class="btn btn-danger delete-btn" data-note-id="${note._id}">
                        <i class="fas fa-trash"></i> ${lang.delete}
                    </button>
                ` : ''}
            </div>
        `;
        
        const downloadBtn = card.querySelector('.download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async () => {
                try {
                    downloadBtn.disabled = true;
                    downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${lang.downloading}`;
                    await apiService.downloadNote(note._id, note.fileName);
                    this.showNotification(lang.downloadSuccess, 'success');
                } catch (error) {
                    this.showNotification(`${lang.downloadError}: ${error.message}`, 'error');
                } finally {
                    downloadBtn.disabled = false;
                    downloadBtn.innerHTML = `<i class="fas fa-download"></i> ${lang.download}`;
                }
            });
        }
        
        const deleteBtn = card.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => eventHandlers.handleDeleteNote(note._id));
        }
        
        return card;
    },
    
    renderGroupSelectForModal() {
        if (!elements.noteGroupSelect) return;
        
        elements.noteGroupSelect.innerHTML = '';
        
        state.userMemberGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group._id;
            option.textContent = group.name || lang.unknownGroup;
            elements.noteGroupSelect.appendChild(option);
        });
        
        if (state.userMemberGroups.length > 0) {
            elements.noteGroupSelect.value = state.userMemberGroups[0]._id;
        }
    },
    
    openModal() {
        if (elements.modalBackdrop) {
            this.renderGroupSelectForModal();
            elements.modalBackdrop.style.display = 'flex';
            elements.noteFileList.innerHTML = '';
            state.filesToUpload.clear();
            elements.noteForm.reset();
        }
    },
    
    closeModal() {
        if (elements.modalBackdrop) {
            elements.modalBackdrop.style.display = 'none';
            state.filesToUpload.clear();
            elements.noteFileList.innerHTML = '';
            elements.noteForm.reset();
        }
    },
    
    renderFileList() {
        elements.noteFileList.innerHTML = '';
        
        state.filesToUpload.forEach((fileWrapper, fileName) => {
            const item = document.createElement('div');
            item.className = 'file-list-item';
            
            let statusIcon = '';
            if (fileWrapper.status === 'complete') {
                statusIcon = '<i class="fas fa-check-circle file-status-complete"></i>';
            } else if (fileWrapper.status === 'error') {
                statusIcon = '<i class="fas fa-exclamation-circle file-status-error"></i>';
            }
            
            item.innerHTML = `
                <i class="fas fa-file file-icon"></i>
                <div class="file-info">
                    <span class="file-name">${fileName}</span>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${fileWrapper.progress}%"></div>
                    </div>
                </div>
                ${statusIcon}
                <button class="remove-file-btn" data-file-name="${fileName}" ${fileWrapper.status === 'uploading' ? 'disabled' : ''}>
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            const removeBtn = item.querySelector('.remove-file-btn');
            removeBtn.addEventListener('click', () => {
                state.filesToUpload.delete(fileName);
                this.renderFileList();
            });
            
            elements.noteFileList.appendChild(item);
        });
    },
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type} show`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} icon"></i>
            ${message}
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
};

// Event Handlers
const eventHandlers = {
    init() {
        if (elements.groupSelect) {
            elements.groupSelect.addEventListener('change', (e) => {
                state.selectedGroupId = e.target.value;
                state.currentPage = 1;
                uiRenderer.fetchAndRenderNotes();
            });
        }
        
        if (elements.uploadBtn) {
            elements.uploadBtn.addEventListener('click', () => uiRenderer.openModal());
        }
        
        if (elements.modalBackdrop) {
            elements.modalBackdrop.addEventListener('click', (e) => {
                if (e.target === elements.modalBackdrop) {
                    uiRenderer.closeModal();
                }
            });
        }
        
        const closeBtn = document.querySelector('.close-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => uiRenderer.closeModal());
        }
        
        if (elements.noteForm) {
            elements.noteForm.addEventListener('submit', (e) => this.handleNoteSubmit(e));
        }
        
        if (elements.noteDropZone) {
            elements.noteDropZone.addEventListener('click', () => elements.noteFileInput.click());
            elements.noteDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                elements.noteDropZone.classList.add('dragover');
            });
            elements.noteDropZone.addEventListener('dragleave', () => {
                elements.noteDropZone.classList.remove('dragover');
            });
            elements.noteDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                elements.noteDropZone.classList.remove('dragover');
                this.handleFiles(e.dataTransfer.files);
            });
        }
        
        if (elements.noteFileInput) {
            elements.noteFileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        }
        
        if (elements.prevPageBtn) {
            elements.prevPageBtn.addEventListener('click', () => {
                if (state.currentPage > 1) {
                    state.currentPage--;
                    uiRenderer.updatePagination();
                    uiRenderer.renderNotes();
                }
            });
        }
        
        if (elements.nextPageBtn) {
            elements.nextPageBtn.addEventListener('click', () => {
                if (state.currentPage < state.totalPages) {
                    state.currentPage++;
                    uiRenderer.updatePagination();
                    uiRenderer.renderNotes();
                }
            });
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && elements.modalBackdrop.style.display === 'flex') {
                uiRenderer.closeModal();
            }
        });
    },
    
    handleFiles(files) {
        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        const allowedTypes = ['application/pdf'];
        
        if (state.filesToUpload.size > 0 || files.length > 1) {
            uiRenderer.showNotification(lang.onlyOneFile, 'error');
            return;
        }

        const file = files[0];
        
        if (file.size > MAX_FILE_SIZE) {
            uiRenderer.showNotification(lang.fileTooLarge, 'error');
            return;
        }
        
        if (!allowedTypes.includes(file.type)) {
            uiRenderer.showNotification(lang.fileTypeNotSupported, 'error');
            return;
        }
        
        state.filesToUpload.set(file.name, { file, status: 'pending', progress: 0 });
        uiRenderer.renderFileList();
    },
    
    async handleNoteSubmit(e) {
        e.preventDefault();
        
        if (state.filesToUpload.size === 0) {
            uiRenderer.showNotification(lang.pleaseSelectFile, 'error');
            return;
        }
        
        const fileWrapper = Array.from(state.filesToUpload.values())[0];
        const submitButton = e.target.querySelector('button[type="submit"]');
        
        submitButton.disabled = true;
        submitButton.innerHTML = `${lang.uploading} <i class="fas fa-spinner fa-spin"></i>`;
        
        fileWrapper.status = 'uploading';
        uiRenderer.renderFileList();
        
        try {
            const formData = new FormData();
            formData.append('title', e.target.title.value);
            formData.append('description', e.target.description.value);
            formData.append('groupId', e.target.groupId.value);
            formData.append('file', fileWrapper.file);
            
            const response = await apiService.createNote(formData);
            
            fileWrapper.status = 'complete';
            fileWrapper.progress = 100;
            uiRenderer.renderFileList();
            
            uiRenderer.showNotification('ჩანაწერი წარმატებით აიტვირთა', 'success');
            
            setTimeout(() => {
                uiRenderer.closeModal();
                uiRenderer.fetchAndRenderNotes();
            }, 1500);
            
        } catch (error) {
            fileWrapper.status = 'error';
            uiRenderer.renderFileList();
            uiRenderer.showNotification(`${lang.fileUploadFailed}: ${error.message}`, 'error');
            if (error.message.includes('token') || error.message.includes('authorized')) {
                setTimeout(() => window.location.href = '../login/login.html', 2000);
            }
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = lang.uploadNoteButton;
        }
    },
    
    async handleDeleteNote(noteId) {
        if (!confirm(lang.confirmDelete)) return;
        
        try {
            await apiService.deleteNote(noteId);
            uiRenderer.showNotification(lang.deleteSuccess, 'success');
            uiRenderer.fetchAndRenderNotes();
        } catch (error) {
            uiRenderer.showNotification(`${lang.deleteError}: ${error.message}`, 'error');
        }
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const token = localStorage.getItem('piRateToken');
        if (!token) {
            window.location.href = '../login/login.html';
            return;
        }
        
        const { user, allGroups } = await apiService.fetchInitialData();
        state.currentUser = user;
        state.allSystemGroups = allGroups.data || allGroups || [];
        
        const userGroups = await apiService.fetchUserGroups();
        state.userMemberGroups = userGroups.data || userGroups || [];
        
        uiRenderer.init();
        eventHandlers.init();
    } catch (error) {
        console.error('Initialization error:', error);
        document.body.innerHTML = `
            <div style="text-align: center; padding: 50px; color: var(--text-primary);">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--danger-accent);"></i>
                <h1>${lang.error}</h1>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="window.location.reload()">${lang.tryAgain}</button>
            </div>
        `;
    }
});
