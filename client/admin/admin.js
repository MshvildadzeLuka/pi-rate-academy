/**
 * ===================================================================
 * ADMIN DASHBOARD SCRIPT (v5.2 - Fixed Calendar & Time Handling)
 * for Pi-Rate Academy
 * ===================================================================
 * - Complete CRUD functionality for all management panels
 * - Integrated interactive calendar with availability visualization
 * - Drag-and-drop lecture scheduling
 * - Optimized performance and error handling
 * - Fixed time formatting and timezone issues
 * - Georgian language implementation
 * ===================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
  // =================================================================
  // 1. CONFIGURATION & API HELPER
  // =================================================================
  const API_BASE_URL = '/api';

  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('piRateToken');
    const headers = { ...(options.headers || {}) };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Only set Content-Type if not FormData and not already set
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });
      
      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('piRateToken');
        window.location.href = '../login/login.html';
        throw new Error('Authentication required');
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API error: ${response.status}`);
      }
      
      return response.status === 204 ? null : response.json();
    } catch (error) {
      console.error('API Request Failed:', error);
      // Don't redirect on network errors, only on auth errors
      if (error.message !== 'Authentication required') {
        throw error;
      }
    }
  }

  // =================================================================
  // 2. STATE MANAGEMENT & DOM ELEMENT SELECTION
  // =================================================================
  const state = {
    users: [],
    groups: [],
    videos: [],
    currentUser: null,
    editingId: null,
    selectedGroup: null,
    selectedGroupMembers: [],
  };

  const calendarState = {
    mainViewDate: new Date(),
    isDragging: false,
    selectionStartSlot: null,
    selectedSlots: new Set(),
    activeLecture: null,
    lectures: [],
    memberEvents: [],
    aggregatedAvailability: {},
  };

  const elements = {
    sidebarLinks: document.querySelectorAll('.sidebar-link'),
    adminPanels: document.querySelectorAll('.admin-panel'),
    // Modals
    userModal: document.getElementById('user-form-modal'),
    videoModal: document.getElementById('video-form-modal'),
    groupModal: document.getElementById('group-form-modal'),
    // Forms
    userForm: document.getElementById('user-form'),
    videoForm: document.getElementById('video-form'),
    groupForm: document.getElementById('group-form'),
    // Calendar
    calendarControlPanel: document.getElementById('calendar-control-panel'),
    timeColumn: document.getElementById('time-column'),
    dayColumns: document.querySelectorAll('.day-column'),
    weekDisplay: document.getElementById('current-week-display'),
    prevWeekBtn: document.getElementById('prev-week-btn'),
    nextWeekBtn: document.getElementById('next-week-btn'),
    todayBtn: document.getElementById('today-btn'),
    groupSelect: document.getElementById('group-select'),
    sidebarTimeRange: document.getElementById('sidebar-time-range'),
    saveLectureBtn: document.getElementById('save-lecture-btn'),
    deleteLectureBtn: document.getElementById('delete-lecture-btn'),
    lectureTitleInput: document.getElementById('lecture-title-input'),
    currentTimeIndicator: document.getElementById('current-time-indicator'),
    suggestLecturesBtn: document.getElementById('suggest-schedule-btn'),
  };

  // =================================================================
  // 3. INITIALIZATION
  // =================================================================
  async function initializeApp() {
    // Check if user is authenticated
    const token = localStorage.getItem('piRateToken');
    if (!token) {
      window.location.href = '../login/login.html';
      return;
    }

    try {
      const [currentUserRes, usersRes, groupsRes, videosRes] = await Promise.all([
        apiFetch('/users/profile'),
        apiFetch('/users'),
        apiFetch('/groups'),
        apiFetch('/videos'),
      ]);
  
      // Handle API responses with proper data extraction
      const currentUser = currentUserRes;
      const users = Array.isArray(usersRes?.data) ? usersRes.data : usersRes || [];
      const groups = Array.isArray(groupsRes?.data) ? groupsRes.data : groupsRes || [];
    
      // FIXED: Handle videos response with the correct structure
      let videos = [];
      if (videosRes && videosRes.success) {
        videos = Array.isArray(videosRes.data?.videos) ? videosRes.data.videos : 
                Array.isArray(videosRes.videos) ? videosRes.videos : [];
      }

      Object.assign(state, { currentUser, users, groups, videos });

      renderAllComponents();
      setupAllEventListeners();
      initializeCalendar();
    
      // Start time indicator update
      updateCurrentTimeIndicator();
      setInterval(updateCurrentTimeIndicator, 60000);
    } catch (error) {
      console.error('Initialization Error:', error);
      showErrorPage('წვდომა აკრძალულია', 'ადმინისტრაციული მონაცემების ჩატვირთვა ვერ მოხერხდა. გთხოვთ შეამოწმოთ კავშირი და სცადოთ თავიდან.');
    }
  }
  // =================================================================
  // 4. DYNAMIC RENDERING FUNCTIONS
  // =================================================================
  function renderAllComponents() {
    renderDashboard();
    renderUsersTable();
    renderGroupsTable();
    renderVideosTable();
  }

  function renderDashboard() {
    const usersStat = document.getElementById('total-users-stat');
    const groupsStat = document.getElementById('total-groups-stat');
    const videosStat = document.getElementById('total-videos-stat');
    
    if (usersStat) usersStat.textContent = state.users.length;
    if (groupsStat) groupsStat.textContent = state.groups.length;
    if (videosStat) videosStat.textContent = state.videos.length;
    
    // Render recent activity
    renderRecentActivity();
  }

  function renderRecentActivity() {
    const activityList = document.getElementById('recent-activity-list');
    if (!activityList) return;
    
    // Sample recent activity - in a real app, this would come from an API
    const activities = [
      { icon: 'user-plus', title: 'ახალი მომხმარებელი', details: 'გიორგი ქართველიშვილი დაემატა სისტემას', time: '2 საათის წინ' },
      { icon: 'video', title: 'ვიდეო დაემატა', details: 'კალკულუსის შესავალი დაემატა', time: '5 საათის წინ' },
      { icon: 'user-group', title: 'ჯგუფი შეიქმნა', details: 'მათემატიკის მაღალი ჯგუფი შეიქმნა', time: '2 დღის წინ' }
    ];
    
    activityList.innerHTML = activities.map(activity => `
      <li class="activity-item">
        <div class="activity-icon">
          <i class="fa-solid fa-${activity.icon}"></i>
        </div>
        <div class="activity-content">
          <div class="activity-title">${activity.title}</div>
          <div class="activity-details">${activity.details} • ${activity.time}</div>
        </div>
      </li>
    `).join('');
  }

  function renderUsersTable() {
    const container = document.getElementById('users-table-container');
    if (!container) return;
    
    if (state.users.length === 0) {
      container.innerHTML = '<p class="empty-list-message">მომხმარებლები არ მოიძებნა.</p>';
      return;
    }
    
    container.innerHTML = `
      <table class="admin-list-table">
        <thead>
          <tr>
            <th>სახელი</th>
            <th>Email</th>
            <th>როლი</th>
            <th>მოქმედებები</th>
          </tr>
        </thead>
        <tbody>
          ${state.users.map(user => `
            <tr>
              <td>${escapeHTML(user.firstName)} ${escapeHTML(user.lastName)}</td>
              <td>${escapeHTML(user.email)}</td>
              <td>
                <span class="role-tag ${user.role.toLowerCase()}">
                  ${user.role === 'Student' ? 'სტუდენტი' : user.role === 'Teacher' ? 'ლექტორი' : 'ადმინისტრატორი'}
                </span>
              </td>
              <td class="action-btns">
                <button onclick="adminApp.editUser('${user._id}')">
                  <i class="fa-solid fa-pencil"></i>
                </button>
                <button onclick="adminApp.deleteUser('${user._id}')">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderGroupsTable() {
    const container = document.getElementById('groups-table-container');
    if (!container) return;
    
    if (state.groups.length === 0) {
      container.innerHTML = '<p class="empty-list-message">ჯგუფები არ მოიძებნა.</p>';
      return;
    }
    
    container.innerHTML = `
      <table class='admin-list-table'>
        <thead>
          <tr>
            <th>ჯგუფის სახელი</th>
            <th>ლექტორი</th>
            <th>სტუდენტები</th>
            <th>მოქმედებები</th>
          </tr>
        </thead>
        <tbody>
          ${state.groups.map(group => {
            const validUsers = group.users ? group.users.filter(u => u) : [];
            const teacher = validUsers.find(u => u.role === 'Teacher');
            const studentCount = validUsers.filter(u => u.role === 'Student').length;
            
            return `
              <tr>
                <td>${escapeHTML(group.name)}</td>
                <td>${teacher ? `${escapeHTML(teacher.firstName)} ${escapeHTML(teacher.lastName)}` : 'არ არის მინიჭებული'}</td>
                <td>${studentCount}</td>
                <td class="action-btns">
                  <button onclick="adminApp.editGroup('${group._id}')">
                    <i class="fa-solid fa-pencil"></i>
                  </button>
                  <button onclick="adminApp.deleteGroup('${group._id}')">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function renderVideosTable() {
    const container = document.getElementById('videos-table-container');
    if (!container) return;
    
    if (state.videos.length === 0) {
      container.innerHTML = '<p class="empty-list-message">ვიდეოები არ მოიძებნა.</p>';
      return;
    }
    
    container.innerHTML = `
      <table class="admin-list-table">
        <thead>
          <tr>
            <th>სათაური</th>
            <th>ტიპი</th>
            <th>ბმული</th>
            <th>მოქმედებები</th>
          </tr>
        </thead>
        <tbody>
          ${state.videos.map(video => `
            <tr>
              <td>${escapeHTML(video.title)}</td>
              <td>
                <span class="role-tag ${video.type}">
                  ${video.type === 'upload' ? 'ლექცია' : 'რესურსი'}
                </span>
              </td>
              <td class="video-url">${escapeHTML(video.url)}</td>
              <td class="action-btns">
                <button onclick="adminApp.editVideo('${video._id}')">
                  <i class="fa-solid fa-pencil"></i>
                </button>
                <button onclick="adminApp.deleteVideo('${video._id}')">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // =================================================================
  // 5. MODAL & FORM MANAGEMENT
  // =================================================================
  function openModal(modal) {
    if (modal) modal.classList.remove('hidden');
  }

  function closeModal(modal) {
    if (modal) modal.classList.add('hidden');
  }

  function setupUserModal(user = null) {
    if (!elements.userForm) return;
    
    state.editingId = user ? user._id : null;
    elements.userForm.reset();
    
    const modalTitle = document.getElementById('modal-title-user');
    if (modalTitle) modalTitle.textContent = user ? 'მომხმარებლის რედაქტირება' : 'ახალი მომხმარებელი';
    
    const teacherFields = document.getElementById('teacher-fields');
    if (teacherFields) teacherFields.classList.add('hidden');
    
    const passwordField = document.getElementById('password');
    if (passwordField) passwordField.required = !user;
    
    const passwordLabel = document.getElementById('password-label');
    if (passwordLabel) passwordLabel.textContent = user ? 'ახალი პაროლი (არასავალდებულო)' : 'დროებითი პაროლი';
    
    if (user) {
      elements.userForm.querySelector('#first-name').value = user.firstName || '';
      elements.userForm.querySelector('#last-name').value = user.lastName || '';
      elements.userForm.querySelector('#email').value = user.email || '';
      elements.userForm.querySelector('#user-role').value = user.role || '';
      
      if (['Teacher', 'Admin'].includes(user.role)) {
        if (teacherFields) teacherFields.classList.remove('hidden');
        elements.userForm.querySelector('#about-me').value = user.aboutMe || '';
        elements.userForm.querySelector('#photo-url').value = user.photoUrl || '';
      }
    }
    
    openModal(elements.userModal);
  }

  function setupVideoModal(video = null) {
    if (!elements.videoForm) return;
    
    state.editingId = video ? video._id : null;
    elements.videoForm.reset();
    
    const modalTitle = document.getElementById('modal-title-video');
    if (modalTitle) modalTitle.textContent = video ? 'ვიდეოს რედაქტირება' : 'ახალი ვიდეოს დამატება';
    
    if (video) {
      elements.videoForm.querySelector('#video-title').value = video.title || '';
      elements.videoForm.querySelector('#video-description').value = video.description || '';
      elements.videoForm.querySelector('#video-type').value = video.type || 'upload';
      elements.videoForm.querySelector('#video-youtube-url').value = video.url || '';
    }
    
    openModal(elements.videoModal);
  }

  function setupGroupModal(group = null) {
    if (!elements.groupForm) return;
    
    state.editingId = group ? group._id : null;
    elements.groupForm.reset();
    
    const modalTitle = document.getElementById('modal-title-group');
    if (modalTitle) modalTitle.textContent = group ? 'ჯგუფის რედაქტირება' : 'ახალი ჯგუფის შექმნა';
    
    if (group) {
      elements.groupForm.querySelector('#group-name').value = group.name || '';
      elements.groupForm.querySelector('#group-zoom-link').value = group.zoomLink || '';
    }
    
    const teacherId = group ? (group.users || []).find(u => u && u.role === 'Teacher')?._id : '';
    const studentIds = group ? (group.users || []).filter(u => u && u.role === 'Student').map(u => u._id) : [];
    
    populateUserSelects(teacherId, studentIds);
    openModal(elements.groupModal);
  }

  function populateUserSelects(selectedTeacherId, selectedStudentIds) {
    const teacherSelect = document.getElementById('teacher-select');
    const studentMultiSelect = document.getElementById('student-multiselect');
    
    if (!teacherSelect || !studentMultiSelect) return;
    
    teacherSelect.innerHTML = '<option value="">-- ლექტორის გარეშე --</option>' + 
      state.users
        .filter(u => u.role === 'Teacher')
        .map(t => `
          <option value="${t._id}" ${t._id === selectedTeacherId ? 'selected' : ''}>
            ${escapeHTML(t.firstName)} ${escapeHTML(t.lastName)}
          </option>`
        ).join('');
        
    studentMultiSelect.innerHTML = state.users
      .filter(u => u.role === 'Student')
      .map(s => `
        <label class="multi-select-option">
          <input type="checkbox" value="${s._id}" ${selectedStudentIds.includes(s._id) ? 'checked' : ''}>
          <span>${escapeHTML(s.firstName)} ${escapeHTML(s.lastName)}</span>
        </label>`
      ).join('');
  }

  // =================================================================
  // 6. FORM SUBMISSION HANDLERS
  // =================================================================
  async function handleUserFormSubmit(e) {
    e.preventDefault();
    if (!elements.userForm) return;
    
    const data = Object.fromEntries(new FormData(elements.userForm).entries());
    if (!data.password) delete data.password;
    
    const endpoint = state.editingId ? `/users/${state.editingId}` : '/users';
    const method = state.editingId ? 'PUT' : 'POST';
    
    try {
      await apiFetch(endpoint, { method, body: JSON.stringify(data) });
      const usersRes = await apiFetch('/users');
      state.users = Array.isArray(usersRes?.data) ? usersRes.data : usersRes || [];
      renderAllComponents();
      closeModal(elements.userModal);
    } catch (error) { 
      alert(`შეცდომა: ${error.message}`); 
    }
  }

  async function handleVideoFormSubmit(e) {
      e.preventDefault();
      if (!elements.videoForm) return;
    
      const formData = new FormData(elements.videoForm);
      const data = {
        title: formData.get('title'),
        description: formData.get('description'),
        type: formData.get('type'),
        url: formData.get('url'),
      };
    
      // Validate YouTube URL with more flexible regex
      const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
      if (!youtubeRegex.test(data.url)) {
        alert('გთხოვთ მიუთითოთ სწორი YouTube ბმული');
        return;
      }
    
      const endpoint = state.editingId ? `/videos/${state.editingId}` : '/videos';
      const method = state.editingId ? 'PUT' : 'POST';
    
      try {
        const response = await apiFetch(endpoint, { 
          method, 
          body: JSON.stringify(data),
          headers: { 'Content-Type': 'application/json' }
        });
      
        // Refresh videos list
        const videosRes = await apiFetch('/videos');
        state.videos = Array.isArray(videosRes?.data) ? videosRes.data : 
                      Array.isArray(videosRes?.videos) ? videosRes.videos : videosRes || [];
      
        renderAllComponents();
        closeModal(elements.videoModal);
      } catch (error) { 
        alert(`შეცდომა: ${error.message}`); 
      }
  }

  async function handleGroupFormSubmit(e) {
    e.preventDefault();
    if (!elements.groupForm) return;
    
    const selectedStudents = Array.from(document.querySelectorAll('#student-multiselect input:checked'))
      .map(el => el.value);
    const selectedTeacher = document.getElementById('teacher-select').value;
    const userIds = [...selectedStudents];
    
    if (selectedTeacher) userIds.push(selectedTeacher);
    
    const data = {
      name: document.getElementById('group-name').value,
      zoomLink: document.getElementById('group-zoom-link').value,
      users: userIds,
    };
    
    const endpoint = state.editingId ? `/groups/${state.editingId}` : '/groups';
    const method = state.editingId ? 'PUT' : 'POST';
    
    try {
      await apiFetch(endpoint, { method, body: JSON.stringify(data) });
      const groupsRes = await apiFetch('/groups');
      state.groups = Array.isArray(groupsRes?.data) ? groupsRes.data : groupsRes || [];
      renderAllComponents();
      closeModal(elements.groupModal);
    } catch (error) { 
      alert(`შეცდომა: ${error.message}`); 
    }
  }

  // =================================================================
  // 7. EVENT LISTENERS & PUBLIC API
  // =================================================================
  function setupAllEventListeners() {
    // Sidebar navigation
    if (elements.sidebarLinks) {
      elements.sidebarLinks.forEach(link => {
        link.addEventListener('click', e => {
          e.preventDefault();
          const targetId = link.dataset.target;
          
          elements.sidebarLinks.forEach(l => l.classList.remove('active'));
          link.classList.add('active');
          
          elements.adminPanels.forEach(p => p.classList.remove('active'));
          document.getElementById(targetId)?.classList.add('active');
          
          if (elements.calendarControlPanel) {
            elements.calendarControlPanel.classList.toggle('hidden', targetId !== 'calendar-panel');
          }
        });
      });
    }

    // Modal Triggers
    document.getElementById('create-user-btn')?.addEventListener('click', () => setupUserModal());
    document.getElementById('quick-create-user-btn')?.addEventListener('click', () => setupUserModal());
    document.getElementById('upload-video-btn')?.addEventListener('click', () => setupVideoModal());
    document.getElementById('quick-upload-video-btn')?.addEventListener('click', () => setupVideoModal());
    document.getElementById('create-group-btn')?.addEventListener('click', () => setupGroupModal());
    document.getElementById('quick-create-group-btn')?.addEventListener('click', () => setupGroupModal());

    // Modal Close Triggers
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', e => { 
        if (e.target === modal) closeModal(modal); 
      });
      
      modal.querySelector('.close-modal')?.addEventListener('click', () => closeModal(modal));
    });

    // Form Submissions
    elements.userForm?.addEventListener('submit', handleUserFormSubmit);
    elements.videoForm?.addEventListener('submit', handleVideoFormSubmit);
    elements.groupForm?.addEventListener('submit', handleGroupFormSubmit);

    // Dynamic UI Listeners
    elements.userForm?.querySelector('#user-role')?.addEventListener('change', e => {
      const teacherFields = document.getElementById('teacher-fields');
      if (teacherFields) {
        teacherFields.classList.toggle('hidden', !['Teacher', 'Admin'].includes(e.target.value));
      }
    });
  }

  // Global app object for inline event handlers
  window.adminApp = {
    editUser: (id) => setupUserModal(state.users.find(i => i._id === id)),
    deleteUser: async (id) => {
      if (confirm('დარწმუნებული ხართ, რომ გსურთ ამ მომხმარებლის წაშლა?')) {
        try {
          await apiFetch(`/users/${id}`, { method: 'DELETE' });
          const usersRes = await apiFetch('/users');
          state.users = Array.isArray(usersRes?.data) ? usersRes.data : usersRes || [];
          renderAllComponents();
        } catch (error) { 
          alert(`შეცდომა: ${error.message}`); 
        }
      }
    },
    editGroup: (id) => setupGroupModal(state.groups.find(i => i._id === id)),
    deleteGroup: async (id) => {
      if (confirm('დარწმუნებული ხართ, რომ გსურთ ამ ჯგუფის წაშლა?')) {
        try {
          await apiFetch(`/groups/${id}`, { method: 'DELETE' });
          const groupsRes = await apiFetch('/groups');
          state.groups = Array.isArray(groupsRes?.data) ? groupsRes.data : groupsRes || [];
          renderAllComponents();
        } catch (error) { 
          alert(`შეცდომა: ${error.message}`); 
        }
      }
    },
    editVideo: (id) => setupVideoModal(state.videos.find(i => i._id === id)),
    deleteVideo: async (id) => {
      if (confirm('დარწმუნებული ხართ, რომ გსურთ ამ ვიდეოს წაშლა?')) {
        try {
          await apiFetch(`/videos/${id}`, { method: 'DELETE' });
          const videosRes = await apiFetch('/videos');
          state.videos = Array.isArray(videosRes?.data) ? videosRes.data : videosRes || [];
          renderAllComponents();
        } catch (error) { 
          alert(`შეცდომა: ${error.message}`); 
        }
      }
    }
  };

  // =================================================================
  // 8. CALENDAR LOGIC - FIXED AND ENHANCED
  // =================================================================
  function initializeCalendar() {
    if (!elements.timeColumn || !elements.dayColumns.length) return;
    
    generateTimeSlots();
    populateGroupDropdown();
    addCalendarEventListeners();
    renderCalendarWeek();
  }

  function addCalendarEventListeners() {
    elements.prevWeekBtn?.addEventListener('click', () => navigateWeek(-1));
    elements.nextWeekBtn?.addEventListener('click', () => navigateWeek(1));
    elements.todayBtn?.addEventListener('click', () => navigateWeek(0));
    elements.groupSelect?.addEventListener('change', handleGroupSelection);
    elements.suggestLecturesBtn?.addEventListener('click', suggestLectures);

    const calendarGrid = document.querySelector('.calendar-grid-wrapper');
    calendarGrid?.addEventListener('mousedown', startDragSelection);
    calendarGrid?.addEventListener('mouseover', duringDragSelection);
    document.addEventListener('mouseup', endDragSelection);

    elements.saveLectureBtn?.addEventListener('click', saveLecture);
    elements.deleteLectureBtn?.addEventListener('click', deleteLecture);
  }

  function populateGroupDropdown() {
    if (!elements.groupSelect) return;
    
    elements.groupSelect.innerHTML = '<option value="">-- აირჩიეთ ჯგუფი --</option>' + 
      state.groups.map(g => `<option value="${g._id}">${escapeHTML(g.name)}</option>`).join('');
  }

  function navigateWeek(direction) {
    if (direction === 0) {
      calendarState.mainViewDate = new Date();
    } else {
      calendarState.mainViewDate.setDate(calendarState.mainViewDate.getDate() + (direction * 7));
    }
    
    renderCalendarWeek();
  }

  function renderCalendarWeek() {
    const start = getStartOfWeek(calendarState.mainViewDate);
    const end = getEndOfWeek(calendarState.mainViewDate);
    
    if (elements.weekDisplay) {
      elements.weekDisplay.textContent = 
        `${start.toLocaleDateString('ka-GE', { month: 'short', day: 'numeric' })} - ` +
        `${end.toLocaleDateString('ka-GE', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      
      const header = document.querySelector(`.day-column-header[data-day-header="${i}"]`);
      if (header) {
        header.querySelector('.day-number').textContent = date.getDate();
        header.classList.toggle('current-day-header', date.toDateString() === today.toDateString());
      }
    }
    
    // Only load group data if a group is already selected
    if (state.selectedGroup) {
      handleGroupSelection();
    }
  }

  // UPDATED: Handle group selection with corrected time handling
  async function handleGroupSelection() {
    // Clear any existing calendar data from the grid
    clearAllCalendarEvents();
    clearSlotClasses();
    elements.suggestLecturesBtn.disabled = true;

    const groupId = elements.groupSelect.value;
    if (!groupId) {
      // If no group is selected, do nothing.
      return;
    }

    try {
      // Store the selected group
      state.selectedGroup = groupId;
      
      // Get the group details to find members
      const group = state.groups.find(g => g._id === groupId);
      if (!group) return;
      
      state.selectedGroupMembers = group.users || [];
      
      // Fetch both the personal availability of all group members and the official lectures
      // for the selected group in parallel for a more accurate schedule.
      const [availabilityRes, lecturesRes] = await Promise.all([
        apiFetch(`/calendar-events/group/${groupId}`),
        apiFetch(`/lectures/group/${groupId}`),
      ]);

      // Process the raw event data into a structured availability map
      calendarState.memberEvents = availabilityRes.data || [];
      calendarState.aggregatedAvailability = aggregateAvailability(calendarState.memberEvents, state.selectedGroupMembers.length);
      
      // Store the official lectures in the calendar's state
      calendarState.lectures = lecturesRes.data || [];

      // Render the visual layers onto the calendar grid
      renderAggregatedAvailability();
      renderLectures();

      // Enable the suggestion button now that we have availability data
      elements.suggestLecturesBtn.disabled = false;

    } catch (error) {
      console.error('Error loading group calendars:', error);
      alert('ჯგუფის კალენდრების ჩატვირთვის შეცდომა: ' + error.message);
    }
  }

  /**
   * Processes an array of raw events from all group members into a simple
   * day-by-day, slot-by-slot availability map. The rule is: if any one
   * member is 'busy', the slot is considered 'busy' for the whole group.
   * @param {Array} memberEvents - Array of event objects from the API.
   * @param {Number} memberCount - Number of members in the group
   * @returns {Object} An object representing the aggregated availability.
   */
  function aggregateAvailability(memberEvents, memberCount) {
    const availabilityMap = {};
    const startOfWeek = getStartOfWeek(calendarState.mainViewDate);

    // 1. Initialize the entire week's grid as 'free'
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      availabilityMap[dayIndex] = {};
      // 48 slots per day (24 hours * 2 slots/hour) from 00:00 to 23:30
      for (let slot = 0; slot < 48; slot++) {
        availabilityMap[dayIndex][slot] = { busy: 0, preferred: 0 };
      }
    }

    // 2. Process each event and mark the corresponding slots
    memberEvents.forEach(event => {
      // Skip events that are not 'busy' or 'preferred'
      if (!['busy', 'preferred'].includes(event.type)) {
        return;
      }

      const eventDays = [];
      let eventStartMin, eventEndMin;

      if (event.isRecurring) {
        // For recurring events, we apply them to the correct day of the current week
        const dayIndex = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(event.dayOfWeek);
        if (dayIndex !== -1) {
          const currentDate = new Date(startOfWeek);
          currentDate.setDate(startOfWeek.getDate() + dayIndex);
          const dateString = currentDate.toISOString().split('T')[0];
        
          // Check if this instance was deleted by an exception
          const isException = memberEvents.some(ex => ex.exceptionDate === dateString && ex.title === `DELETED: ${event._id}`);
          if (!isException) {
            eventDays.push(dayIndex);
            // Ensure time is in HH:MM format
            eventStartMin = timeToMinutes(ensureTimeFormat(event.recurringStartTime));
            eventEndMin = timeToMinutes(ensureTimeFormat(event.recurringEndTime));
          }
        }
      } else if (event.startTime) {
        // For single-instance events, find which day of the week it falls on
        const eventDate = new Date(event.startTime);
        const dayIndex = (eventDate.getDay() + 6) % 7; // Monday is 0
        eventDays.push(dayIndex);
        eventStartMin = eventDate.getHours() * 60 + eventDate.getMinutes();
        eventEndMin = new Date(event.endTime).getHours() * 60 + new Date(event.endTime).getMinutes();
      }

      // 3. Mark the slots in the availability map
      for (const day of eventDays) {
        const startSlot = Math.floor(eventStartMin / 30);
        const endSlot = Math.ceil(eventEndMin / 30);

        for (let slot = startSlot; slot < endSlot; slot++) {
          // Count the number of busy and preferred events in each slot
          if (event.type === 'busy') {
            availabilityMap[day][slot].busy++;
          } else if (event.type === 'preferred') {
            availabilityMap[day][slot].preferred++;
          }
        }
      }
    });

    // 4. Classify each slot based on the counts
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      for (let slot = 0; slot < 48; slot++) {
        const counts = availabilityMap[dayIndex][slot];
        
        if (counts.busy > 0) {
          // If anyone is busy, mark as busy
          availabilityMap[dayIndex][slot] = 'busy';
        } else if (counts.preferred === memberCount) {
          // If all members prefer this time
          availabilityMap[dayIndex][slot] = 'preferred-all';
        } else if (counts.preferred > 0) {
          // If some members prefer this time
          availabilityMap[dayIndex][slot] = 'preferred-some';
        } else {
          // Free time slot
          availabilityMap[dayIndex][slot] = 'free';
        }
      }
    }

    return availabilityMap;
  }

  function renderAggregatedAvailability() {
    clearSlotClasses();
    
    // Get all time slots in the calendar
    const timeSlots = document.querySelectorAll('.time-slot');
    
    timeSlots.forEach(slot => {
      const dayIndex = parseInt(slot.dataset.day);
      const time = slot.dataset.time;
      const slotIndex = timeToSlotIndex(time);
      
      // Get the availability status for this slot
      const status = calendarState.aggregatedAvailability[dayIndex]?.[slotIndex] || 'free';
      
      // Add the appropriate CSS class
      if (status !== 'free') {
        slot.classList.add(`slot-${status}`);
      }
    });
  }

  function renderLectures() {
    const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
    const endOfWeek = getEndOfWeek(calendarState.mainViewDate);
    endOfWeek.setHours(23, 59, 59, 999); // Ensure we include the whole last day

    calendarState.lectures.forEach(lecture => {
      const lectureDate = new Date(lecture.startTime);
    
      // Check if the lecture falls within the currently displayed week
      if (lectureDate >= startOfWeek && lectureDate <= endOfWeek) {
        const dayIndex = (lectureDate.getDay() + 6) % 7; // Monday is 0
        
        // Create the visual event block on the calendar
        createEventBlock({
          id: lecture._id,
          title: lecture.title,
          start: lectureDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          end: new Date(lecture.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'lecture'
        }, dayIndex);
      }
    });
  }

  function createEventBlock(event, dayIndex) {
    const dayColumn = document.querySelector(`.day-column[data-day="${dayIndex}"]`);
    if (!dayColumn) return;
    
    const start = timeToMinutes(event.start);
    const end = timeToMinutes(event.end);
    const top = ((start - 8 * 60) / 30) * 40;
    const height = ((end - start) / 30) * 40;
    
    const eventBlock = document.createElement('div');
    eventBlock.className = `event-block event-${event.type}`;
    if (event.type === 'lecture') {
      eventBlock.classList.add('read-only');
    }
    eventBlock.style.top = `${top}px`;
    eventBlock.style.height = `${height - 2}px`;
    
    if (event.title) {
      eventBlock.innerHTML = `
        <div class="event-title">${escapeHTML(event.title)}</div>
        <div class="event-time">${formatTime(event.start, false)} - ${formatTime(event.end, false)}</div>
      `;
    }
    
    if (event.type === 'lecture') {
      eventBlock.dataset.lectureId = event.id;
      eventBlock.addEventListener('click', e => {
        e.stopPropagation();
        handleLectureClick(event);
      });
    }
    
    dayColumn.appendChild(eventBlock);
  }

  function startDragSelection(e) {
    if (e.target.classList.contains('time-slot')) {
      state.isDragging = true;
      state.selectionStartSlot = e.target;
      clearSelection();
      updateSelection(e.target);
    }
  }

  function duringDragSelection(e) {
    if (state.isDragging && 
        e.target.classList.contains('time-slot') && 
        e.target.dataset.day === state.selectionStartSlot.dataset.day) {
      updateSelection(e.target);
    }
  }
  
  function endDragSelection() {
    if (!state.isDragging) return;
    state.isDragging = false;
    updateSidebarWithSelection();
  }

  function updateSelection(endSlot) {
    document.querySelectorAll('.selection-active').forEach(s => s.classList.remove('selection-active'));
    state.selectedSlots.clear();
    
    const allSlots = Array.from(
      document.querySelectorAll(`.time-slot[data-day="${state.selectionStartSlot.dataset.day}"]`)
    );
    
    const startIndex = allSlots.indexOf(state.selectionStartSlot);
    const endIndex = allSlots.indexOf(endSlot);
    
    if (startIndex === -1 || endIndex === -1) return;
    
    const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
    for (let i = min; i <= max; i++) {
      allSlots[i].classList.add('selection-active');
      state.selectedSlots.add(allSlots[i]);
    }
    
    updateSidebarWithSelection();
  }

  function clearSelection() {
    document.querySelectorAll('.selection-active').forEach(s => s.classList.remove('selection-active'));
    state.selectedSlots.clear();
    state.activeLecture = null;
    
    if (elements.lectureTitleInput) elements.lectureTitleInput.value = '';
    updateSidebarWithSelection();
    
    const panelTitle = document.getElementById('calendar-panel-title');
    if (panelTitle) panelTitle.textContent = 'ლექციის დაგეგმვა';
  }

  function updateSidebarWithSelection() {
    const hasSelection = calendarState.selectedSlots.size > 0;
    
    if (elements.saveLectureBtn) elements.saveLectureBtn.disabled = !hasSelection;
    if (elements.deleteLectureBtn) elements.deleteLectureBtn.disabled = !calendarState.activeLecture;
    
    if (!hasSelection && !calendarState.activeLecture) {
      if (elements.sidebarTimeRange) elements.sidebarTimeRange.textContent = 'აირჩიეთ დრო კალენდარზე';
      return;
    }
    
    if (calendarState.activeLecture && !hasSelection) return; // Don't override edit view
    
    const times = Array.from(calendarState.selectedSlots)
      .map(s => s.dataset.time)
      .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
      
    if (elements.sidebarTimeRange && times.length > 0) {
      elements.sidebarTimeRange.textContent = 
        `${formatTime(times[0])} - ${formatTime(minutesToTime(timeToMinutes(times[times.length - 1]) + 30))}`;
    }
  }

  function handleLectureClick(lecture) {
    clearSelection();
    calendarState.activeLecture = lecture;
    
    if (elements.lectureTitleInput) elements.lectureTitleInput.value = lecture.title;
    if (elements.sidebarTimeRange) {
      elements.sidebarTimeRange.textContent = `${formatTime(lecture.start)} - ${formatTime(lecture.end)}`;
    }
    
    const panelTitle = document.getElementById('calendar-panel-title');
    if (panelTitle) panelTitle.textContent = 'ლექციის რედაქტირება';
    
    updateSidebarWithSelection();
  }

  async function saveLecture() {
    const slots = Array.from(calendarState.selectedSlots);

    // Guard against saving without a selection or title
    if (slots.length === 0 || !elements.lectureTitleInput.value.trim()) {
      alert("გთხოვთ აირჩიოთ დროის სლოტი კალენდარზე და მიუთითოთ სათაური.");
      return;
    }
    
    // Find the start date and time from the first selected slot
    const startSlot = slots[0];
    const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
    const lectureDate = new Date(startOfWeek);
    lectureDate.setDate(startOfWeek.getDate() + parseInt(startSlot.dataset.day));
    
    const [startH, startM] = startSlot.dataset.time.split(':');
    const startTime = new Date(lectureDate.setHours(parseInt(startH), parseInt(startM)));
   
    // Calculate end time based on the number of 30-minute slots selected
    const endTime = new Date(startTime.getTime() + slots.length * 30 * 60000);

    const payload = {
      title: elements.lectureTitleInput.value.trim(),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      groupId: elements.groupSelect.value,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone // Add current timezone
    };

    // Determine if we are creating a new lecture or updating an existing one
    const isUpdating = !!calendarState.activeLecture;
    const endpoint = isUpdating ? `/lectures/${calendarState.activeLecture.id}` : '/lectures';
    const method = isUpdating ? 'PUT' : 'POST';
    
    try {
      await apiFetch(endpoint, { method, body: JSON.stringify(payload) });
    
      // After successfully saving, refresh the entire calendar view for the group
      await handleGroupSelection(); 
    
      // Reset the selection and sidebar form
      clearSelection();
    } catch (error) {
      console.error(`Error saving lecture:`, error);
      alert(`შეცდომა: ${error.message}`); 
    }
  }

  async function deleteLecture() {
    if (!calendarState.activeLecture || !confirm('დარწმუნებული ხართ, რომ გსურთ ამ ლექციის წაშლა?')) return;
    
    try {
      await apiFetch(`/lectures/${calendarState.activeLecture.id}`, { method: 'DELETE' });
      await handleGroupSelection();
      clearSelection();
    } catch (error) { 
      alert(`შეცდომა: ${error.message}`); 
    }
  }

  function generateTimeSlots() {
    elements.timeColumn.innerHTML = '';
    // Fix: The loop now correctly runs up to and includes 22 (for 22:00)
    for (let hour = 8; hour <= 22; hour++) {
      const timeLabel = document.createElement('div');
      timeLabel.className = 'time-label';
      timeLabel.textContent = formatTime(`${hour}:00`, false);
      elements.timeColumn.appendChild(timeLabel);
    }

    elements.dayColumns.forEach((column, dayIndex) => {
      column.innerHTML = '';
      column.dataset.day = dayIndex;
      // Fix: The loop now correctly creates 29 slots (for 8:00 to 22:00)
      for (let slot = 0; slot < 29; slot++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        const hour = 8 + Math.floor(slot / 2);
        const minute = (slot % 2) * 30;
        timeSlot.dataset.time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        timeSlot.dataset.day = dayIndex.toString();
        column.appendChild(timeSlot);
      }
    });
  }

  function renderAll() {
    renderWeekDisplay();
    renderDayHeaders();
    renderMiniCalendar();
    renderEventsForWeek();
    updateSidebarUI('add');
  }

  function renderWeekDisplay() {
    const start = getStartOfWeek(state.mainViewDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    
    elements.weekDisplay.textContent = 
      `${start.toLocaleDateString('ka-GE', { month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('ka-GE', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }
  
  function renderDayHeaders() {
    const startOfWeek = getStartOfWeek(state.mainViewDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    document.querySelectorAll('.day-column-header').forEach((header, index) => {
      const headerDate = new Date(startOfWeek);
      headerDate.setDate(startOfWeek.getDate() + index);
      
      if (header.querySelector('.day-number')) {
        header.querySelector('.day-number').textContent = headerDate.getDate();
      }
      
      if (headerDate.toDateString() === today.toDateString()) {
        header.classList.add('current-day-header');
      } else {
        header.classList.remove('current-day-header');
      }
    });
  }

  function renderMiniCalendar() {
    const month = state.miniCalDate.getMonth();
    const year = state.miniCalDate.getFullYear();
    elements.miniCalHeader.textContent = `${new Date(year, month).toLocaleString('ka-GE', { month: 'long' })} ${year}`;
    elements.miniCalDaysGrid.innerHTML = '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = getStartOfWeek(state.mainViewDate);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Add empty days for previous month
    for (let i = 0; i < (firstDay + 6) % 7; i++) {
      const day = document.createElement('div');
      day.className = 'mini-calendar-day other-month';
      elements.miniCalDaysGrid.appendChild(day);
    }
    
    // Add days for current month
    for (let d = 1; d <= daysInMonth; d++) {
      const day = document.createElement('div');
      day.className = 'mini-calendar-day';
      day.textContent = d;
      const currentDay = new Date(year, month, d);
      
      if (currentDay.toDateString() === today.toDateString()) {
        day.classList.add('current-day');
      }
      
      if (currentDay >= startOfWeek && currentDay <= new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000)) {
        day.classList.add('in-selected-week');
      }
      
      day.addEventListener('click', () => {
        state.mainViewDate = new Date(currentDay);
        fetchEvents().then(() => {
          renderAll();
        });
      });
      
      elements.miniCalDaysGrid.appendChild(day);
    }
  }

  function renderEventsForWeek() {
    const startOfWeek = getStartOfWeek(state.mainViewDate);
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const exceptions = state.allEvents.filter(e => e.exceptionDate);

    document.querySelectorAll('.event-block').forEach(el => el.remove());

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const currentDayDate = new Date(startOfWeek);
      currentDayDate.setDate(currentDayDate.getDate() + dayIndex);
      const dayStr = currentDayDate.toISOString().split('T')[0];
      const dayColumn = elements.dayColumns[dayIndex];

      state.allEvents.forEach(event => {
        if (event.title && event.title.startsWith('DELETED:')) return;

        let render = false;
        let isException = false;
        let startTimeStr = event.startTimeLocal;
        let endTimeStr = event.endTimeLocal;

        if (event.isRecurring) {
          if (event.dayOfWeek === dayNames[dayIndex]) {
            isException = exceptions.some(exc => 
              exc.exceptionDate === dayStr && exc.title === `DELETED: ${event._id}`
            );
            if (!isException) {
              render = true;
              startTimeStr = ensureTimeFormat(event.recurringStartTime || startTimeStr);
              endTimeStr = ensureTimeFormat(event.recurringEndTime || endTimeStr);
            }
          } else if (event.type === 'lecture' && event.recurrenceRule) {
            const rruleWeekdays = event.recurrenceRule.byweekday || [];
            const weekdayMap = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };
            if (rruleWeekdays.some(wd => weekdayMap[wd] === dayIndex)) {
              const dtstart = new Date(event.recurrenceRule.dtstart);
              const until = event.recurrenceRule.until ? new Date(event.recurrenceRule.until) : null;
              if (currentDayDate >= dtstart && (!until || currentDayDate <= until)) {
                render = true;
              }
            }
          }
        } else {
          const eventStartDate = new Date(event.startTime);
          if (eventStartDate.toDateString() === currentDayDate.toDateString()) {
            render = true;
            startTimeStr = ensureTimeFormat(startTimeStr || formatTime(eventStartDate));
            endTimeStr = ensureTimeFormat(endTimeStr || formatTime(new Date(event.endTime)));
          }
        }

        if (render) {
          renderEventBlock({
            ...event,
            startTime: startTimeStr,
            endTime: endTimeStr
          }, dayColumn, isException);
        }
      });
    }
  }

  function renderEventBlock(eventData, dayColumn, isException = false) {
    if (isException) return;

    const startMinutes = timeToMinutes(eventData.startTime);
    const endMinutes = timeToMinutes(eventData.endTime);
    const durationMinutes = endMinutes - startMinutes;
    const slotHeight = 45;
    const slotsSpanned = durationMinutes / 30;
    const top = ((startMinutes - 8 * 60) / 30) * slotHeight;
    const height = slotsSpanned * slotHeight - 2;

    const eventBlock = document.createElement('div');
    eventBlock.className = `event-block event-${eventData.type}`;
    if (eventData.type === 'lecture') {
      eventBlock.classList.add('read-only');
    }
    eventBlock.style.top = `${top}px`;
    eventBlock.style.height = `${height}px`;
    eventBlock.dataset.eventId = eventData._id;

    let titleContent = eventData.title || eventData.type.toUpperCase();
    if (eventData.type === 'lecture' && eventData.groupName) {
      titleContent += ` (${eventData.groupName})`;
    }

    eventBlock.innerHTML = `
      <div class="event-title">${titleContent}</div>
      <div class="event-time">${formatTime(eventData.startTime)} - ${formatTime(eventData.endTime)}</div>
    `;

    if (eventData.type !== 'lecture') {
      eventBlock.addEventListener('click', () => handleEventClick(eventData));
    }

    dayColumn.appendChild(eventBlock);
  }

  function addEventListeners() {
    // Week navigation
    elements.prevWeekBtn.addEventListener('click', async () => {
      state.mainViewDate.setDate(state.mainViewDate.getDate() - 7);
      await fetchEvents();
      renderAll();
    });

    elements.nextWeekBtn.addEventListener('click', async () => {
      state.mainViewDate.setDate(state.mainViewDate.getDate() + 7);
      await fetchEvents();
      renderAll();
    });

    elements.todayBtn.addEventListener('click', async () => {
      state.mainViewDate = new Date();
      await fetchEvents();
      renderAll();
    });

    // Mini calendar navigation
    elements.miniCalPrevBtn.addEventListener('click', () => {
      state.miniCalDate.setMonth(state.miniCalDate.getMonth() - 1);
      renderMiniCalendar();
    });

    elements.miniCalNextBtn.addEventListener('click', () => {
      state.miniCalDate.setMonth(state.miniCalDate.getMonth() + 1);
      renderMiniCalendar();
    });

    // Event form handling
    elements.saveEventBtn.addEventListener('click', saveEvent);
    elements.deleteEventBtn.addEventListener('click', () => {
      if (state.activeEvent) deleteEvent(state.activeEvent._id);
    });
    
    // Recurring checkbox change
    elements.recurringCheckbox.addEventListener('change', () => {
      if (state.activeEvent) {
        elements.recurringLabelText.textContent = elements.recurringCheckbox.checked 
          ? 'Change all recurring events' 
          : 'Change only this event';
      } else {
        elements.recurringLabelText.textContent = elements.recurringCheckbox.checked 
          ? 'Apply to all weeks' 
          : 'Apply only to this week';
      }
    });
    
    // Time slot selection
    document.querySelectorAll('.time-slot').forEach(slot => {
      slot.addEventListener('mousedown', startSelection);
      slot.addEventListener('mouseenter', continueSelection);
      slot.addEventListener('touchstart', handleTouchStart, { passive: true });
    });

    document.addEventListener('mouseup', endSelection);
    document.addEventListener('touchend', endSelection);
    
    // Prevent form submission
    elements.eventForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveEvent();
    });
  }

  // Touch handling for mobile
  let touchStartX = 0;
  let touchStartY = 0;
  
  function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    startSelection(e);
  }
  
  function startSelection(e) {
    if (e.target.classList.contains('event-block')) {
      const eventId = e.target.dataset.eventId;
      const eventData = state.allEvents.find(event => event._id === eventId);
      if (eventData) {
        handleEventClick(eventData);
        return;
      }
    }
    
    if (state.activeEvent) return;
    
    state.isDragging = true;
    const targetSlot = e.type.includes('touch') 
      ? document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)?.closest('.time-slot')
      : e.target.closest('.time-slot');
      
    if (!targetSlot) return;
    
    clearSelection();
    state.selectionStartSlot = targetSlot;
    updateSelection(targetSlot);
  }

  function continueSelection(e) {
    if (!state.isDragging) return;
    
    const targetSlot = e.type.includes('touch')
      ? document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)?.closest('.time-slot')
      : e.target.closest('.time-slot');
      
    if (!targetSlot || targetSlot.dataset.day !== state.selectionStartSlot.dataset.day) return;
    updateSelection(targetSlot);
  }
  
  function endSelection() {
    if (!state.isDragging) return;
    state.isDragging = false;
    updateSidebarWithSelection();
  }

  function handleEventClick(eventData) {
    clearSelection(false);
    state.activeEvent = eventData;
    updateSidebarUI('edit', eventData);
    
    // Highlight the active event
    document.querySelectorAll('.event-block').forEach(el => {
      el.classList.remove('active-event');
    });
    
    const eventElement = document.querySelector(`[data-event-id="${eventData._id}"]`);
    if (eventElement) {
      eventElement.classList.add('active-event');
    }
  }

  function updateSidebarUI(mode = 'add', eventData = null) {
    if (mode === 'add') {
      elements.saveEventBtn.disabled = state.selectedSlots.size === 0;
      elements.deleteEventBtn.disabled = true;
      elements.recurringCheckbox.checked = false;
      elements.recurringLabelText.textContent = 'Apply to all weeks';
      
      if (state.selectedSlots.size === 0) {
        elements.sidebarTimeRange.textContent = 'Select time on calendar';
      }
    } else if (mode === 'edit') {
      const start = eventData.isRecurring 
        ? eventData.recurringStartTime 
        : new Date(eventData.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        
      const end = eventData.isRecurring 
        ? eventData.recurringEndTime 
        : new Date(eventData.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        
      elements.sidebarTimeRange.textContent = `${formatTime(start)} - ${formatTime(end)}`;
      elements.deleteEventBtn.disabled = false;
      elements.saveEventBtn.disabled = true;
      elements.recurringCheckbox.checked = state.activeEvent.isRecurring;
      
      elements.recurringLabelText.textContent = state.activeEvent.isRecurring 
        ? 'Change all recurring events' 
        : 'Change only this event';
        
      document.querySelector(`input[name="event-type"][value="${eventData.type}"]`).checked = true;
    }
  }

  function updateSelection(endSlot) {
    if (!state.selectionStartSlot || endSlot.dataset.day !== state.selectionStartSlot.dataset.day) return;
    
    // Clear previous selection
    document.querySelectorAll('.selection-active').forEach(s => s.classList.remove('selection-active'));
    state.selectedSlots.clear();
    
    const allSlots = Array.from(document.querySelectorAll(`.time-slot[data-day="${state.selectionStartSlot.dataset.day}"]`));
    const startIndex = allSlots.indexOf(state.selectionStartSlot);
    const endIndex = allSlots.indexOf(endSlot);
    
    if (startIndex === -1 || endIndex === -1) return;
    
    const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
    for (let i = min; i <= max; i++) {
      allSlots[i].classList.add('selection-active');
      state.selectedSlots.add(allSlots[i]);
    }
    
    updateSidebarWithSelection();
  }

  function updateSidebarWithSelection() {
    elements.saveEventBtn.disabled = state.selectedSlots.size === 0;
    
    if (state.selectedSlots.size === 0) {
      elements.sidebarTimeRange.textContent = 'Select time on calendar';
      return;
    }
    
    const times = Array.from(state.selectedSlots)
      .map(s => s.dataset.time)
      .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
      
    elements.sidebarTimeRange.textContent = 
      `${formatTime(times[0])} - ${formatTime(getEndTime(times[times.length - 1]))}`;
  }
  
  function clearSelection(resetSidebar = true) {
    state.selectedSlots.forEach(s => s.classList.remove('selection-active'));
    state.selectedSlots.clear();
    
    document.querySelectorAll('.event-block.active-event').forEach(el => el.classList.remove('active-event'));
    state.activeEvent = null;
    
    if (resetSidebar) updateSidebarUI('add');
  }

  // Utility functions
  const getEndTime = (startTimeStr) => {
    const [h, m] = startTimeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + 30);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  
  const timeToMinutes = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };
  
  const formatTime = (timeStr, includePeriod = true) => {
    if (!timeStr) return '';
    
    let h, m;
    if (typeof timeStr === 'string') {
      const timeParts = timeStr.toString().split(':');
      h = parseInt(timeParts[0]);
      m = timeParts[1] ? parseInt(timeParts[1]) : 0;
    } else if (timeStr instanceof Date) {
      h = timeStr.getHours();
      m = timeStr.getMinutes();
    } else {
      return '';
    }
    
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return '';
    }
    
    if (!includePeriod) return `${h}:${String(m).padStart(2, '0')}`;
    
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  };
  
  const ensureTimeFormat = (timeStr) => {
    if (!timeStr) return '00:00';
    
    if (typeof timeStr === 'string') {
      const [hours, minutes] = timeStr.split(':');
      return `${String(hours).padStart(2, '0')}:${String(minutes || '00').padStart(2, '0')}`;
    }
    
    return '00:00';
  };
  
  const getStartOfWeek = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };
  
  const getEndOfWeek = (date) => {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
  };

  function updateCurrentTimeIndicator() {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // Convert to Monday-based week (0-6)
    const startOfWeek = getStartOfWeek(state.mainViewDate);
    const endOfWeek = getEndOfWeek(state.mainViewDate);
    
    // Hide indicator if current time is not in the displayed week
    if (now < startOfWeek || now > endOfWeek) {
      elements.currentTimeIndicator.style.display = 'none';
      return;
    }
    
    const timeInMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Hide indicator if outside calendar hours (8am-10pm)
    if (timeInMinutes < 8 * 60 || timeInMinutes > 22 * 60) {
      elements.currentTimeIndicator.style.display = 'none';
      return;
    }
    
    // Calculate position
    const top = ((timeInMinutes - 8 * 60) / 30) * 45;
    const dayColumn = document.querySelector(`.day-column[data-day="${dayOfWeek}"]`);
    
    if (dayColumn) {
      elements.currentTimeIndicator.style.top = `${top}px`;
      elements.currentTimeIndicator.style.left = `${dayColumn.offsetLeft}px`;
      elements.currentTimeIndicator.style.display = 'block';
    }
  }

  // Initialize the calendar
  initializeCalendar();
});
