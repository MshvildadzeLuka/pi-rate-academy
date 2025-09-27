// client/admin/admin.js

document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // 1. CONFIGURATION & API HELPER
    // =================================================================
    const API_BASE_URL = '/api';
    
    // FIX: Rewritten to correctly preserve local date and time components 
    // without UTC offset logic when sending to the server.
    function toLocalISOString(date) {
        if (!date) return null;
        const pad = (num) => num.toString().padStart(2, '0');
        const YYYY = date.getFullYear();
        const MM = pad(date.getMonth() + 1);
        const DD = pad(date.getDate());
        const HH = pad(date.getHours());
        const mm = pad(date.getMinutes());
        // Return ISO-like string without Z or offset
        return `${YYYY}-${MM}-${DD}T${HH}:${mm}`;
    }

    // Toast notification function
    function showToast(message, type = 'info') {
      const toastContainer = document.getElementById('toast-container') || (() => {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
      })();

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;

      const icon = type === 'success' ? 'fa-check-circle' :
        type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';

      toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
      `;

      toastContainer.appendChild(toast);

      // Auto remove after 5 seconds
      setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
      }, 5000);
    }

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
          showToast(`API Error: ${error.message}`, 'error');
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
      students: [],
      studentPoints: [],
      currentUser: null,
      editingId: null,
      selectedGroup: null,
      selectedStudent: null,
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

    // DOM Elements
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
      // New Calendar Controls
      recurringCheckbox: document.getElementById('recurring-event-checkbox'),
      // Mobile sidebar toggle
      sidebarToggle: document.getElementById('sidebar-toggle'),
      adminSidebar: document.querySelector('.admin-sidebar'),
      // Student Points View
      studentListView: document.getElementById('student-list-view'),
      studentDetailView: document.getElementById('student-points-detail-view'),
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
        // Create sidebar toggle for mobile
        createSidebarToggle();

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

        const students = users.filter(u => u.role === 'Student');

        Object.assign(state, { currentUser, users, groups, videos, students });

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

    function createSidebarToggle() {
      // Only create on mobile
      if (window.innerWidth > 768) return;

      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'sidebar-toggle';
      toggleBtn.className = 'sidebar-toggle';
      toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
      toggleBtn.addEventListener('click', () => {
        elements.adminSidebar.classList.toggle('active');
      });

      document.body.appendChild(toggleBtn);

      // Close sidebar when clicking outside
      document.addEventListener('click', (e) => {
        if (elements.adminSidebar.classList.contains('active') &&
          !elements.adminSidebar.contains(e.target) &&
          e.target !== toggleBtn) {
          elements.adminSidebar.classList.remove('active');
        }
      });
    }

    // =================================================================
    // 4. DYNAMIC RENDERING FUNCTIONS
    // =================================================================
    function renderAllComponents() {
      renderDashboard();
      renderUsersTable();
      renderStudentsTable();
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
                  <button class="btn-edit" data-id="${user._id}">
                    <i class="fa-solid fa-pencil"></i>
                  </button>
                  <button class="btn-delete" data-id="${user._id}">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      // Add event listeners to the buttons
      container.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = btn.getAttribute('data-id');
          const user = state.users.find(u => u._id === userId);
          if (user) setupUserModal(user);
        });
      });

      container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = btn.getAttribute('data-id');
          deleteUser(userId);
        });
      });
    }

    function renderStudentsTable() {
      const container = document.getElementById('students-table-container');
      if (!container) return;

      if (state.students.length === 0) {
        container.innerHTML = '<p class="empty-list-message">სტუდენტები არ მოიძებნა.</p>';
        return;
      }

      container.innerHTML = `
        <table class="admin-list-table">
          <thead>
            <tr>
              <th>სახელი</th>
              <th>Email</th>
              <th>ჯგუფები</th>
              <th>მოქმედებები</th>
            </tr>
          </thead>
          <tbody>
            ${state.students.map(student => `
              <tr class="student-row" data-id="${student._id}">
                <td>${escapeHTML(student.firstName)} ${escapeHTML(student.lastName)}</td>
                <td>${escapeHTML(student.email)}</td>
                <td>${student.groups.map(g => escapeHTML(g.name)).join(', ')}</td>
                <td class="action-btns">
                  <button class="btn-view-points" data-id="${student._id}">
                    <i class="fa-solid fa-medal"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      container.querySelectorAll('.btn-view-points').forEach(btn => {
        btn.addEventListener('click', () => {
          const studentId = btn.getAttribute('data-id');
          const student = state.students.find(s => s._id === studentId);
          if (student) viewStudentPoints(student);
        });
      });
    }

    async function viewStudentPoints(student) {
      if (!student || !student._id) {
        console.error('Error: Invalid student object or missing student ID.');
        return;
      }

      elements.studentListView.classList.add('hidden');
      elements.studentDetailView.classList.remove('hidden');

      elements.studentDetailView.innerHTML = `
        <div class="detail-header">
          <button class="btn btn--secondary" id="back-to-students-btn">
            <i class="fa-solid fa-arrow-left"></i> უკან
          </button>
          <h2>${escapeHTML(student.firstName)} ${escapeHTML(student.lastName)} - ქულები</h2>
        </div>
        <div id="student-points-content">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>ქულების ჩატვირთვა...</p>
          </div>
        </div>
      `;

      document.getElementById('back-to-students-btn').addEventListener('click', () => {
        elements.studentListView.classList.remove('hidden');
        elements.studentDetailView.classList.add('hidden');
        elements.studentDetailView.innerHTML = '';
      });

      try {
        // Log the API endpoint to ensure it's being called correctly
        console.log('Fetching points for student ID:', student._id);
        const response = await apiFetch(`/users/profile/points?userId=${student._id}`);

        // Log the full API response to the console for debugging
        console.log('API Response for student points:', response);

        if (response && response.success && Array.isArray(response.data)) {
          state.studentPoints = response.data;
          renderStudentPointsDetails(student);
        } else {
          throw new Error(response?.message || 'API-დან მიღებული მონაცემები არასწორია');
        }

      } catch (error) {
        console.error('Failed to fetch student points:', error);
        document.getElementById('student-points-content').innerHTML = `
          <p style="text-align: center; color: var(--danger-accent);">ქულების ისტორიის ჩატვირთვა ვერ მოხერხდა: ${escapeHTML(error.message)}</p>
        `;
      }
    }

    function renderStudentPointsDetails(student) {
      const container = document.getElementById('student-points-content');
      if (!container) return;

      // Correctly calculate total earned and possible points by summing up weekly data
      const totalEarned = state.studentPoints.reduce((sum, week) => sum + week.totalPointsEarned, 0);
      const totalPossible = state.studentPoints.reduce((sum, week) => sum + week.totalPointsPossible, 0);
      const percentage = totalPossible > 0 ? ((totalEarned / totalPossible) * 100).toFixed(0) : 0;

      container.innerHTML = `
        <div class="total-points-card">
          <i class="fas fa-trophy"></i>
          <div>
            <h3>სულ დაგროვებული ქულები</h3>
            <p>${totalEarned} / ${totalPossible} (${percentage}%)</p>
          </div>
        </div>
        <h3>ქულების ისტორია</h3>
        <div class="weekly-points-list-wrapper">
          <div class="weekly-points-list" id="weekly-points-list">
            ${state.studentPoints.length > 0 ? state.studentPoints.map(week => {
              const weekStart = getStartOfWeekFromYearAndWeek(week._id.year, week._id.week);
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekEnd.getDate() + 6);
              return `
                <div class="weekly-item" data-week-id="${week._id.year}-${week._id.week}">
                  <div class="week-info">
                    <h4>კვირა ${week._id.week}, ${week._id.year}</h4>
                    <p>${weekStart.toLocaleDateString('ka-GE')} - ${weekEnd.toLocaleDateString('ka-GE')}</p>
                  </div>
                  <div class="week-total">${week.totalPointsEarned} / ${week.totalPointsPossible}</div>
                </div>
              `;
            }).join('') : '<p class="empty-list-message">ქულების ისტორია არ მოიძებნა.</p>'}
          </div>
        </div>
      `;

      document.querySelectorAll('.weekly-item').forEach(item => {
        item.addEventListener('click', () => {
          const weekId = item.dataset.weekId;
          const weekData = state.studentPoints.find(week => `${week._id.year}-${week._id.week}` === weekId);
          if (weekData) renderWeeklyDetails(weekData);
        });
      });
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
                    <button class="btn-edit" data-id="${group._id}">
                      <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-delete" data-id="${group._id}">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;

      // Add event listeners to the buttons
      container.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const groupId = btn.getAttribute('data-id');
          const group = state.groups.find(g => g._id === groupId);
          if (group) setupGroupModal(group);
        });
      });

      container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const groupId = btn.getAttribute('data-id');
          deleteGroup(groupId);
        });
      });
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
                  <button class="btn-edit" data-id="${video._id}">
                    <i class="fa-solid fa-pencil"></i>
                  </button>
                  <button class="btn-delete" data-id="${video._id}">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      // Add event listeners to the buttons
      container.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const videoId = btn.getAttribute('data-id');
          const video = state.videos.find(v => v._id === videoId);
          if (video) setupVideoModal(video);
        });
      });

      container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const videoId = btn.getAttribute('data-id');
          deleteVideo(videoId);
        });
      });
    }

    // =================================================================
    // 5. MODAL & FORM MANAGEMENT
    // =================================================================
    function openModal(modal) {
      if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeModal(modal) {
      if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
      }
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

      // Create a container for multi-select options
      studentMultiSelect.innerHTML = '';
      const container = document.createElement('div');
      container.className = 'multi-select-container';

      state.users
        .filter(u => u.role === 'Student')
        .forEach(s => {
          const label = document.createElement('label');
          label.className = 'multi-select-option';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = s._id;
          if (selectedStudentIds.includes(s._id)) checkbox.checked = true;

          const span = document.createElement('span');
          span.textContent = `${escapeHTML(s.firstName)} ${escapeHTML(s.lastName)}`;

          label.appendChild(checkbox);
          label.appendChild(span);
          container.appendChild(label);
        });

      studentMultiSelect.appendChild(container);
    }

    // =================================================================
    // 6. FORM SUBMISSION HANDLERS
    // =================================================================
    async function handleUserFormSubmit(e) {
      e.preventDefault();
      if (!elements.userForm) return;

      const submitBtn = elements.userForm.querySelector('button[type="submit"]');
      submitBtn.classList.add('loading');

      try {
        const data = Object.fromEntries(new FormData(elements.userForm).entries());
        if (!data.password) delete data.password;

        const endpoint = state.editingId ? `/users/${state.editingId}` : '/users';
        const method = state.editingId ? 'PUT' : 'POST';

        await apiFetch(endpoint, { method, body: JSON.stringify(data) });
        const usersRes = await apiFetch('/users');
        state.users = Array.isArray(usersRes?.data) ? usersRes.data : usersRes || [];

        renderAllComponents();
        closeModal(elements.userModal);
        showToast(state.editingId ? 'მომხმარებელი განახლებულია' : 'მომხმარებელი დაემატა', 'success');
      } catch (error) {
        showToast(`შეცდომა: ${error.message}`, 'error');
      } finally {
        submitBtn.classList.remove('loading');
      }
    }

    async function handleVideoFormSubmit(e) {
      e.preventDefault();
      if (!elements.videoForm) return;

      const submitBtn = elements.videoForm.querySelector('button[type="submit"]');
      submitBtn.classList.add('loading');

      try {
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
          showToast('გთხოვთ მიუთითოთ სწორი YouTube ბმული', 'error');
          return;
        }

        const endpoint = state.editingId ? `/videos/${state.editingId}` : '/videos';
        const method = state.editingId ? 'PUT' : 'POST';

        const response = await apiFetch(endpoint, {
          method,
          body: JSON.stringify(data),
          headers: { 'Content-Type': 'application/json' }
        });

        // Refresh videos list
        const videosRes = await apiFetch('/videos');
        state.videos = (videosRes && videosRes.data && videosRes.data.videos) || []; // CORRECTED LINE

        renderAllComponents();
        closeModal(elements.videoModal);
        showToast(state.editingId ? 'ვიდეო განახლებულია' : 'ვიდეო დაემატა', 'success');
      } catch (error) {
        showToast(`შეცდომა: ${error.message}`, 'error');
      } finally {
        submitBtn.classList.remove('loading');
      }
    }

    async function handleGroupFormSubmit(e) {
      e.preventDefault();
      if (!elements.groupForm) return;

      const submitBtn = elements.groupForm.querySelector('button[type="submit"]');
      submitBtn.classList.add('loading');

      try {
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

        await apiFetch(endpoint, { method, body: JSON.stringify(data) });
        const groupsRes = await apiFetch('/groups');
        state.groups = Array.isArray(groupsRes?.data) ? groupsRes.data : groupsRes || [];

        renderAllComponents();
        closeModal(elements.groupModal);
        showToast(state.editingId ? 'ჯგუფი განახლებულია' : 'ჯგუფი დაემატა', 'success');
      } catch (error) {
        showToast(`შეცდომა: ${error.message}`, 'error');
      } finally {
        submitBtn.classList.remove('loading');
      }
    }

    // =================================================================
    // 7. DELETE FUNCTIONS
    // =================================================================
    async function deleteUser(id) {
      if (!confirm('დარწმუნებული ხართ, რომ გსურთ ამ მომხმარებლის წაშლა?')) return;

      try {
        await apiFetch(`/users/${id}`, { method: 'DELETE' });
        const usersRes = await apiFetch('/users');
        state.users = Array.isArray(usersRes?.data) ? usersRes.data : usersRes || [];
        renderAllComponents();
        showToast('მომხმარებელი წაიშლა', 'success');
      } catch (error) {
        showToast(`შეცდომა: ${error.message}`, 'error');
      }
    }

    async function deleteGroup(id) {
      if (!confirm('დარწმუნებული ხართ, რომ გსურთ ამ ჯგუფის წაშლა?')) return;

      try {
        await apiFetch(`/groups/${id}`, { method: 'DELETE' });
        const groupsRes = await apiFetch('/groups');
        state.groups = Array.isArray(groupsRes?.data) ? groupsRes.data : groupsRes || [];
        renderAllComponents();
        showToast('ჯგუფი წაიშლა', 'success');
      } catch (error) {
        showToast(`შეცდომა: ${error.message}`, 'error');
      }
    }

    async function deleteVideo(id) {
      if (!confirm('დარწმუნებული ხართ, რომ გსურთ ამ ვიდეოს წაშლა?')) return;

      try {
        await apiFetch(`/videos/${id}`, { method: 'DELETE' });
        const videosRes = await apiFetch('/videos');
        state.videos = (videosRes && videosRes.data && videosRes.data.videos) || []; // CORRECTED LINE
        renderAllComponents();
        showToast('ვიდეო წაიშლა', 'success');
      } catch (error) {
        showToast(`შეცდომა: ${error.message}`, 'error');
      }
    }

    // =================================================================
    // 8. EVENT LISTENERS & PUBLIC API
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

            // Close sidebar on mobile after selection
            if (window.innerWidth <= 768) {
              elements.adminSidebar.classList.remove('active');
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

    // =================================================================
    // 9. CALENDAR LOGIC - FIXED AND ENHANCED
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

      // Add listener for new recurring checkbox
      elements.recurringCheckbox?.addEventListener('change', () => {
        const panelTitle = document.getElementById('calendar-panel-title');
        if (panelTitle && calendarState.activeLecture) {
          panelTitle.textContent = elements.recurringCheckbox.checked ? 'ლექციის რედაქტირება' : 'ლექციის ასლის რედაქტირება';
        }
      });
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
        showToast('ჯგუფის კალენდრების ჩატვირთვის შეცდომა: ' + error.message, 'error');
      }
    }

    // FIX: This function has been completely rewritten to handle UTC for consistent calculations.
    function aggregateAvailability(memberEvents, memberCount) {
      const availabilityMap = {};
      const startOfWeek = getStartOfWeek(calendarState.mainViewDate);

      // 1. Initialize the entire week's grid as 'free'
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        availabilityMap[dayIndex] = {};
        // 30 slots per day (8am to 11pm)
        for (let slot = 0; slot < 30; slot++) {
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
          // FIX: Use UTC methods for consistent calculations.
          const eventDate = new Date(event.startTime);
          const eventEndDate = new Date(event.endTime);

          // Get the UTC day of the week (Monday=1...Sunday=0). Convert to our 0=Mon, 6=Sun index.
          const dayIndex = (eventDate.getUTCDay() + 6) % 7;
          
          // Check if the event date matches the date of the current calendar column
          const currentColumnDate = new Date(startOfWeek);
          currentColumnDate.setDate(startOfWeek.getDate() + dayIndex);

          if (eventDateToLocalDayString(eventDate) === eventDateToLocalDayString(currentColumnDate)) {
              eventDays.push(dayIndex);
              eventStartMin = eventDate.getUTCHours() * 60 + eventDate.getUTCMinutes();
              eventEndMin = eventEndDate.getUTCHours() * 60 + eventEndDate.getUTCMinutes();
          }
        }

        // 3. Mark the slots in the availability map (8:00 AM grid start)
        for (const day of eventDays) {
          const START_OF_GRID_MINUTES = 8 * 60;
          
          const startSlot = Math.floor((eventStartMin - START_OF_GRID_MINUTES) / 30);
          const endSlot = Math.ceil((eventEndMin - START_OF_GRID_MINUTES) / 30);
          
          // Constrain slots to the visible grid (0 to 29 for 8:00 AM to 10:30 PM)
          const start = Math.max(0, startSlot);
          const end = Math.min(30, endSlot);

          for (let slot = start; slot < end; slot++) {
            if (availabilityMap[day] && availabilityMap[day][slot] && slot >= 0 && slot < 30) {
              if (event.type === 'busy') {
                availabilityMap[day][slot].busy++;
              } else if (event.type === 'preferred') {
                availabilityMap[day][slot].preferred++;
              }
            }
          }
        }
      });

      // 4. Classify each slot based on the counts
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        for (let slot = 0; slot < 30; slot++) {
          const counts = availabilityMap[dayIndex][slot] || { busy: 0, preferred: 0 };
          const requiredMembers = state.selectedGroupMembers.filter(u => u.role !== 'Admin').length || 1;

          if (counts.busy > 0) {
            // If anyone is busy, mark as busy
            availabilityMap[dayIndex][slot] = 'busy';
          } else if (counts.preferred === requiredMembers) {
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
      const endOfWeek = getEndOfWeek(startOfWeek);
      endOfWeek.setHours(23, 59, 59, 999);
      const dayNames = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

      // Clear existing events first
      document.querySelectorAll('.event-block[data-lecture-id]').forEach(el => el.remove());

      calendarState.lectures.forEach(lecture => {
        const lectureDate = new Date(lecture.startTime);
        const lectureEndDate = new Date(lecture.endTime);
        
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const currentDate = new Date(startOfWeek);
            currentDate.setDate(startOfWeek.getDate() + dayIndex);
            
            let render = false;
            let formattedStart, formattedEnd;
            
            if (lecture.isRecurring) {
                const rruleWeekdays = lecture.recurrenceRule?.byweekday || [];
                const dayName = dayNames[dayIndex];

                if (rruleWeekdays.includes(dayName)) {
                    const dtstart = lecture.recurrenceRule.dtstart ? new Date(lecture.recurrenceRule.dtstart) : lectureDate;
                    
                    // FIX: Check if current column's date is within the recurring range (using simple ISO date string comparison)
                    const currentDayStr = currentDate.toISOString().split('T')[0];
                    const startDayStr = dtstart.toISOString().split('T')[0];
                    
                    if (currentDayStr >= startDayStr) { 
                        render = true;
                        // FIX: Extract HH:MM from the saved Date object using UTC getters
                        formattedStart = `${String(lectureDate.getUTCHours()).padStart(2, '0')}:${String(lectureDate.getUTCMinutes()).padStart(2, '0')}`;
                        formattedEnd = `${String(lectureEndDate.getUTCHours()).padStart(2, '0')}:${String(lectureEndDate.getUTCMinutes()).padStart(2, '0')}`;
                    }
                }
            } else {
                // Single events: Check if the event's local date matches the current column's date
                const eventDayStr = lectureDate.toISOString().split('T')[0];
                const currentDayStr = currentDate.toISOString().split('T')[0];
                
                if (eventDayStr === currentDayStr) {
                    render = true;
                    // FIX: Extract HH:MM from the saved Date object using UTC getters
                    formattedStart = `${String(lectureDate.getUTCHours()).padStart(2, '0')}:${String(lectureDate.getUTCMinutes()).padStart(2, '0')}`;
                    formattedEnd = `${String(lectureEndDate.getUTCHours()).padStart(2, '0')}:${String(lectureEndDate.getUTCMinutes()).padStart(2, '0')}`;
                }
            }

            if (render) {
                createEventBlock({
                    _id: lecture._id,
                    title: lecture.title,
                    start: formattedStart,
                    end: formattedEnd,
                    type: 'lecture',
                    isRecurring: lecture.isRecurring
                }, dayIndex);
            }
        }
      });
    }

    function createEventBlock(event, dayIndex) {
            const dayColumn = document.querySelector(`.day-column[data-day="${dayIndex}"]`);
            if (!dayColumn) {
                return;
            }

            // Convert HH:MM time string to minutes past midnight
            const start = timeToMinutes(event.start);
            const end = timeToMinutes(event.end);
            
            // Correctly calculate top position and height based on a 40px slot height
            const START_OF_GRID_MINUTES = 8 * 60; // 480 minutes (Calendar starts at 8 AM)
            const slotHeight = 40; // Hardcoded slot height from CSS var

            // Calculate position relative to the 8:00 AM start of the visual grid
            const top = ((start - START_OF_GRID_MINUTES) / 30) * slotHeight;
            const height = ((end - start) / 30) * slotHeight;

            // Skip events outside the 8 AM - 11 PM range
            if (top < 0 || height <= 0 || start >= 23 * 60) return; 

            const eventBlock = document.createElement('div');
            eventBlock.className = `event-block event-${event.type}`;
            eventBlock.style.top = `${top}px`;
            eventBlock.style.height = `${height - 2}px`; // -2px for visual padding
            eventBlock.dataset.lectureId = event._id;

            if (event.title) {
                eventBlock.innerHTML = `
                  <div class="event-title">${escapeHTML(event.title)}</div>
                  <div class="event-time">${formatTime(event.start, false)} - ${formatTime(event.end, false)}</div>
                `;
            }

            if (event.type === 'lecture') {
                eventBlock.addEventListener('click', e => {
                    e.stopPropagation();
                    const lectureFromState = calendarState.lectures.find(l => l._id === event._id);
                    // Pass the dayIndex to the click handler
                    handleLectureClick(lectureFromState, dayIndex);
                });
            }

            dayColumn.appendChild(eventBlock);
    }

    function startDragSelection(e) {
      if (e.target.classList.contains('time-slot')) {
        calendarState.isDragging = true;
        calendarState.selectionStartSlot = e.target;
        clearSelection();
        updateSelection(e.target);
      }
    }

    function duringDragSelection(e) {
      if (calendarState.isDragging &&
        e.target.classList.contains('time-slot') &&
        e.target.dataset.day === calendarState.selectionStartSlot.dataset.day) {
        updateSelection(e.target);
      }
    }

    function endDragSelection() {
      if (calendarState.isDragging) {
        calendarState.isDragging = false;
        updateSidebarWithSelection();
      }
    }

    function updateSelection(endSlot) {
      document.querySelectorAll('.selection-active').forEach(s => s.classList.remove('selection-active'));
      calendarState.selectedSlots.clear();

      const allSlots = Array.from(
        document.querySelectorAll(`.time-slot[data-day="${calendarState.selectionStartSlot.dataset.day}"]`)
      );

      const startIndex = allSlots.indexOf(calendarState.selectionStartSlot);
      const endIndex = allSlots.indexOf(endSlot);

      if (startIndex === -1 || endIndex === -1) return;

      const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
      for (let i = min; i <= max; i++) {
        allSlots[i].classList.add('selection-active');
        calendarState.selectedSlots.add(allSlots[i]);
      }

      updateSidebarWithSelection();
    }

    function handleLectureClick(lecture, dayIndex) {
      clearSelection();
      calendarState.activeLecture = lecture;
      
      const lectureDate = new Date(lecture.startTime);
      const lectureEndDate = new Date(lecture.endTime);
      
      // FIX: Use UTC components for correct time display and calculation
      const startMinutes = lectureDate.getUTCHours() * 60 + lectureDate.getUTCMinutes();
      const endMinutes = lectureEndDate.getUTCHours() * 60 + lectureEndDate.getUTCMinutes();
      
      const startTimeStr = minutesToTime(startMinutes);
      const endTimeStr = minutesToTime(endMinutes);

      if (elements.lectureTitleInput) elements.lectureTitleInput.value = lecture.title;
      if (elements.sidebarTimeRange) {
        // FIX: Use the new formatTimeUTC helper for display
        elements.sidebarTimeRange.textContent = `${formatTimeUTC(lecture.startTime)} - ${formatTimeUTC(lecture.endTime)}`;
      }

      const panelTitle = document.getElementById('calendar-panel-title');
      if (panelTitle) panelTitle.textContent = 'ლექციის რედაქტირება';

      // Set selection for UI consistency if it's a single event
      if (!lecture.isRecurring) {
        const startSlotIndex = timeToSlotIndex(startTimeStr);
        // End slot index is exclusive of the slot itself.
        const endSlotIndex = timeToSlotIndex(endTimeStr); 
        
        const dayColumn = document.querySelector(`.day-column[data-day="${dayIndex}"]`);
        if (dayColumn) {
          const slots = dayColumn.querySelectorAll('.time-slot');
          for (let i = startSlotIndex; i < endSlotIndex; i++) {
            if (slots[i]) {
                slots[i].classList.add('selection-active');
                calendarState.selectedSlots.add(slots[i]);
            }
          }
        }
      }

      updateSidebarWithSelection();
    }

    function clearSelection() {
      document.querySelectorAll('.selection-active').forEach(s => s.classList.remove('selection-active'));
      calendarState.selectedSlots.clear();
      calendarState.activeLecture = null;

      if (elements.lectureTitleInput) elements.lectureTitleInput.value = '';
      // Reset recurring checkbox
      if (elements.recurringCheckbox) elements.recurringCheckbox.checked = false;
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
        // Hide recurring checkbox for new events
        if (elements.recurringCheckbox) elements.recurringCheckbox.parentElement.classList.add('hidden');
        return;
      }

      if (calendarState.activeLecture) {
        // Show recurring checkbox for editing an existing lecture
        if (elements.recurringCheckbox) {
          elements.recurringCheckbox.checked = calendarState.activeLecture.isRecurring;
          elements.recurringCheckbox.parentElement.classList.remove('hidden');
        }
      } else {
        // Show recurring checkbox for new events
        if (elements.recurringCheckbox) {
          elements.recurringCheckbox.checked = false;
          elements.recurringCheckbox.parentElement.classList.remove('hidden');
        }
      }

      // Don't override edit view
      if (calendarState.activeLecture && !hasSelection) return;

      const times = Array.from(calendarState.selectedSlots)
        .map(s => s.dataset.time)
        .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

      if (elements.sidebarTimeRange && times.length > 0) {
        elements.sidebarTimeRange.textContent =
          `${formatTime(times[0])} - ${formatTime(minutesToTime(timeToMinutes(times[times.length - 1]) + 30))}`;
      }
    }

    async function saveLecture() {
      const slots = Array.from(calendarState.selectedSlots);

      // Guard against saving without a selection or title
      if (slots.length === 0 || !elements.lectureTitleInput.value.trim()) {
        showToast("გთხოვთ აირჩიოთ დროის სლოტი კალენდარზე და მიუთითოთ სათაური.", "error");
        return;
      }

      // Find the start date and time from the first selected slot
      const startSlot = slots[0];
      const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
      const lectureDate = new Date(startOfWeek);
      lectureDate.setDate(lectureDate.getDate() + parseInt(startSlot.dataset.day));

      const [startH, startM] = startSlot.dataset.time.split(':');
      
      // Create a Date object representing the LOCAL start time and end time
      const startTimeLocal = new Date(lectureDate);
      startTimeLocal.setHours(parseInt(startH), parseInt(startM));

      // Calculate end time based on the number of 30-minute slots selected
      const endTimeLocal = new Date(startTimeLocal.getTime() + slots.length * 30 * 60000);

      const isRecurring = elements.recurringCheckbox.checked;

      const payload = {
        title: elements.lectureTitleInput.value.trim(),
        // FIX: Use the fixed toLocalISOString to preserve local time intent.
        startTime: toLocalISOString(startTimeLocal), 
        endTime: toLocalISOString(endTimeLocal),
        groupId: elements.groupSelect.value,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isRecurring
      };

      if (isRecurring) {
        const dayOfWeek = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][parseInt(startSlot.dataset.day)];
        payload.recurrenceRule = {
          freq: 'WEEKLY',
          // FIX: Use toLocalISOString for dtstart as well
          dtstart: toLocalISOString(startTimeLocal), 
          byweekday: [dayOfWeek]
        };
      }

      // Determine if we are creating a new lecture or updating an existing one
      const isUpdating = !!calendarState.activeLecture;
      const endpoint = isUpdating ? `/lectures/${calendarState.activeLecture._id}` : '/lectures';
      const method = isUpdating ? 'PUT' : 'POST';

      try {
        elements.saveLectureBtn.classList.add('loading');
        await apiFetch(endpoint, { method, body: JSON.stringify(payload) });

        // After successfully saving, refresh the entire calendar view for the group
        await handleGroupSelection();

        // Reset the selection and sidebar form
        clearSelection();
        showToast(isUpdating ? 'ლექცია განახლებულია' : 'ლექცია დაემატა', 'success');
      } catch (error) {
        console.error(`Error saving lecture:`, error);
        showToast(`შეცდომა: ${error.message}`, 'error');
      } finally {
        elements.saveLectureBtn.classList.remove('loading');
      }
    }

    async function deleteLecture() {
      if (!calendarState.activeLecture) return;

      const isRecurring = calendarState.activeLecture.isRecurring;
      const deleteAllRecurring = elements.recurringCheckbox.checked;
      
      let confirmationMessage = 'დარწმუნებული ხართ, რომ გსურთ ამ ლექციის წაშლა? ეს ქმედება შეუქცევადია.';

      if (isRecurring && !deleteAllRecurring) {
        confirmationMessage = 'დარწმუნებული ხართ, რომ გსურთ მხოლოდ ამ ლექციის წაშლა?';
      } 
      
      if (!confirm(confirmationMessage)) return;

      try {
        elements.deleteLectureBtn.classList.add('loading');
        
        let dateString;
        const lectureDate = new Date(calendarState.activeLecture.startTime);

        if (isRecurring && !deleteAllRecurring) {
          // For a specific instance of a recurring event, calculate the date
          const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
          const dayIndex = parseInt(Array.from(calendarState.selectedSlots)[0]?.dataset.day || '0');
          const instanceDate = new Date(startOfWeek);
          instanceDate.setDate(startOfWeek.getDate() + dayIndex);
          dateString = instanceDate.toISOString().split('T')[0];
        } else {
          // For single events or all recurring events, use the original start time
          dateString = lectureDate.toISOString().split('T')[0];
        }
        
        await apiFetch(`/lectures/${calendarState.activeLecture._id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            deleteAllRecurring,
            dateString: dateString
          }),
        });
        
        await handleGroupSelection();
        clearSelection();
        showToast('ლექცია წაიშლა', 'success');
      } catch (error) {
        console.error('Delete lecture error:', error);
        showToast(`შეცდომა: ${error.message}`, 'error');
      } finally {
        elements.deleteLectureBtn.classList.remove('loading');
      }
    }
    function generateTimeSlots() {
      if (!elements.timeColumn || !elements.dayColumns) return;

      elements.timeColumn.innerHTML = '';
      elements.dayColumns.forEach(col => col.innerHTML = '');

      for (let hour = 8; hour <= 22; hour++) {
        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label';
        timeLabel.textContent = formatTime(`${hour}:00`);
        timeLabel.style.gridRow = `${(hour - 8) * 2 + 1} / span 2`;
        elements.timeColumn.appendChild(timeLabel);
      }

      let slotIndex = 0;
      for (let hour = 8; hour <= 22; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

          elements.dayColumns.forEach((col, dayIndex) => {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            slot.dataset.time = time;
            slot.dataset.day = dayIndex;
            slot.dataset.slotIndex = slotIndex;
            col.appendChild(slot);
          });

          slotIndex++;
        }
      }
    }

    function updateCurrentTimeIndicator() {
      if (!elements.currentTimeIndicator) return;

      const now = new Date();
      const dayOfWeek = (now.getDay() + 6) % 7;
      const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
      const endOfWeek = getEndOfWeek(calendarState.mainViewDate);

      if (now < startOfWeek || now > endOfWeek) {
        elements.currentTimeIndicator.style.display = 'none';
        return;
      }

      const timeInMinutes = now.getHours() * 60 + now.getMinutes();
      if (timeInMinutes < 8 * 60 || timeInMinutes > 22 * 60) {
        elements.currentTimeIndicator.style.display = 'none';
        return;
      }

      const top = ((timeInMinutes - 8 * 60) / 30) * 40;
      const dayColumn = document.querySelector(`.day-column[data-day="${dayOfWeek}"]`);
      if (!dayColumn) return;

      elements.currentTimeIndicator.style.top = `${top}px`;
      elements.currentTimeIndicator.style.left = `${dayColumn.offsetLeft}px`;
      elements.currentTimeIndicator.style.display = 'block';
    }

    function suggestLectures() {
      clearSuggestions();
      const SUGGESTED_SLOT_DURATION = 4; // 2 hours = 4 * 30min slots

      const suggestions = [];

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dayAvail = calendarState.aggregatedAvailability[dayIndex] || {};
        const numSlots = Object.keys(dayAvail).length;

        for (let startIdx = 0; startIdx <= numSlots - SUGGESTED_SLOT_DURATION; startIdx++) {
          const block = Array.from(
            { length: SUGGESTED_SLOT_DURATION },
            (_, i) => dayAvail[startIdx + i]
          );

          if (!block.includes('busy')) {
            // Scoring preference: preferred-all (3) > preferred-some (2) > free (1)
            let score = block.filter(s => s === 'preferred-all').length * 3 +
              block.filter(s => s === 'preferred-some').length * 2 +
              block.filter(s => s === 'free').length * 1;
            suggestions.push({ dayIndex, startIdx, score });
          }
        }
      }

      if (suggestions.length === 0) {
        showToast('2-საათიანი თავისუფალი სლოტები რეკომენდაციისთვის არ მოიძებნა.', 'info');
        return;
      }

      // Sort by score (highest first), pick top 3
      suggestions.sort((a, b) => b.score - a.score);
      const topSuggestions = suggestions.slice(0, 3);

      topSuggestions.forEach(sug => {
        const dayColumn = document.querySelector(`.day-column[data-day="${sug.dayIndex}"]`);
        if (!dayColumn) return;

        const slots = Array.from(dayColumn.querySelectorAll('.time-slot'));
        for (let i = 0; i < SUGGESTED_SLOT_DURATION; i++) {
          if (slots[sug.startIdx + i]) {
            slots[sug.startIdx + i].classList.add('slot-suggested');
          }
        }
      });

      showToast('ნაპოვნია რეკომენდირებული დროის სლოტები', 'success');
    }

    // =================================================================
    // 10. UTILITY FUNCTIONS
    // =================================================================
    function getStartOfWeek(date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    }

    function getEndOfWeek(date) {
      const start = getStartOfWeek(date);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return end;
    }
    
    function getStartOfDay(date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    function getEndOfDay(date) {
      const d = new Date(date);
      d.setHours(23, 59, 59, 999);
      return d;
    }


    function getStartOfWeekFromYearAndWeek(year, week) {
      const date = new Date(year, 0, 1 + (week - 1) * 7);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff));
    }


    function timeToMinutes(timeStr) {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    }

    function timeToSlotIndex(timeStr) {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return (h - 8) * 2 + (m === 30 ? 1 : 0);
    }

    function minutesToTime(minutes) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function formatTime(timeStr, includePeriod = true) {
      if (!timeStr) return '';

      let h, m;
      if (typeof timeStr === 'string') {
        [h, m] = timeStr.split(':').map(Number);
      } else {
        h = timeStr.getHours();
        m = timeStr.getMinutes();
      }

      if (!includePeriod) return `${h}:${String(m).padStart(2, '0')}`;

      const period = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;
      return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
    }
    
    // FIX: Helper function to consistently get local time from UTC-stored Date objects
    function formatTimeUTC(date) {
        if (!date) return '';
        const d = new Date(date);
        const h = d.getUTCHours();
        const m = d.getUTCMinutes();
        const period = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
    }
    
    // FIX: New Helper for consistent date string comparison (local date from UTC components)
    function eventDateToLocalDayString(date) {
        const pad = (num) => num.toString().padStart(2, '0');
        // Use UTC getters because the server stores the local time components in the UTC fields
        return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    }

    function ensureTimeFormat(timeStr) {
      if (!timeStr) return '00:00';

      if (typeof timeStr === 'string') {
        const [hours, minutes] = timeStr.split(':');
        return `${String(hours).padStart(2, '0')}:${String(minutes || '00').padStart(2, '0')}`;
      }

      return '00:00';
    }

    function escapeHTML(str) {
      if (!str) return '';
      return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function showErrorPage(title, message) {
      document.body.innerHTML = `
        <div class="error-container">
          <h1>${escapeHTML(title)}</h1>
          <p>${escapeHTML(message)}</p>
          <a href="/login/login.html" class="btn btn--primary">ავტორიზაციის გვერდზე დაბრუნება</a>
        </div>
      `;
    }

    function clearAllCalendarEvents() {
      document.querySelectorAll('.event-block').forEach(el => el.remove());
    }

    function clearSlotClasses() {
      document.querySelectorAll('.time-slot').forEach(slot => {
        slot.classList.remove(
          'slot-busy',
          'slot-preferred-all',
          'slot-preferred-some',
          'slot-suggested'
        );
      });
    }

    function clearSuggestions() {
      document.querySelectorAll('.slot-suggested').forEach(slot =>
        slot.classList.remove('slot-suggested')
      );
    }

    // =================================================================
    // 11. START THE APPLICATION
    // =================================================================
    initializeApp();
  });
