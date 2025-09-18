document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // 1. CONFIGURATION & API HELPER
    // =================================================================
    const API_BASE_URL = '/api';

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

      const submitBtn = elements.userForm.querySelector('button[type="submit']');
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
      document.getElementById('add-user-btn')?.addEventListener('click', () => setupUserModal());
      document.getElementById('add-video-btn')?.addEventListener('click', () => setupVideoModal());
      document.getElementById('add-group-btn')?.addEventListener('click', () => setupGroupModal());

      // Modal Close Buttons
      document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const modal = btn.closest('.modal');
          closeModal(modal);
        });
      });

      // Modal Overlay Clicks
      document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => {
          if (e.target === modal) closeModal(modal);
        });
      });

      // Form Submissions
      elements.userForm?.addEventListener('submit', handleUserFormSubmit);
      elements.videoForm?.addEventListener('submit', handleVideoFormSubmit);
      elements.groupForm?.addEventListener('submit', handleGroupFormSubmit);

      // Role toggle for user form
      const roleSelect = document.getElementById('user-role');
      const teacherFields = document.getElementById('teacher-fields');
      if (roleSelect && teacherFields) {
        roleSelect.addEventListener('change', () => {
          if (['Teacher', 'Admin'].includes(roleSelect.value)) {
            teacherFields.classList.remove('hidden');
          } else {
            teacherFields.classList.add('hidden');
          }
        });
      }
    }

    // =================================================================
    // 9. CALENDAR FUNCTIONS
    // =================================================================
    function initializeCalendar() {
      if (!elements.groupSelect) return;

      // Populate group select
      elements.groupSelect.innerHTML = '<option value="">-- აირჩიეთ ჯგუფი --</option>' +
        state.groups.map(g => `<option value="${g._id}">${escapeHTML(g.name)}</option>`).join('');

      // Set up event listeners
      setupCalendarEventListeners();
      setupCalendarGrid();

      // Initial load
      handleGroupSelection();
    }

    function setupCalendarEventListeners() {
      // Calendar navigation
      elements.prevWeekBtn?.addEventListener('click', () => navigateWeek(-1));
      elements.nextWeekBtn?.addEventListener('click', () => navigateWeek(1));
      elements.todayBtn?.addEventListener('click', () => navigateToToday());

      // Group selection
      elements.groupSelect?.addEventListener('change', handleGroupSelection);

      // Calendar interaction
      setupCalendarSlotInteractions();

      // Save/delete lecture buttons
      elements.saveLectureBtn?.addEventListener('click', saveLecture);
      elements.deleteLectureBtn?.addEventListener('click', deleteLecture);

      // Suggest lectures button
      elements.suggestLecturesBtn?.addEventListener('click', suggestLectures);
    }

    function setupCalendarGrid() {
      if (!elements.timeColumn || !elements.dayColumns) return;

      // Clear existing content
      elements.timeColumn.innerHTML = '';
      elements.dayColumns.forEach(col => col.innerHTML = '');

      // Create time slots (8am to 10pm)
      for (let hour = 8; hour <= 22; hour++) {
        // Time column
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        timeSlot.textContent = `${hour}:00`;
        elements.timeColumn.appendChild(timeSlot);

        // Day columns
        elements.dayColumns.forEach(col => {
          const slot = document.createElement('div');
          slot.className = 'calendar-slot';
          slot.dataset.hour = hour;
          slot.dataset.day = col.dataset.day;
          col.appendChild(slot);
        });
      }
    }

    function navigateWeek(direction) {
      const newDate = new Date(calendarState.mainViewDate);
      newDate.setDate(newDate.getDate() + (direction * 7));
      calendarState.mainViewDate = newDate;
      updateWeekDisplay();
      handleGroupSelection();
    }

    function navigateToToday() {
      calendarState.mainViewDate = new Date();
      updateWeekDisplay();
      handleGroupSelection();
    }

    function updateWeekDisplay() {
      if (!elements.weekDisplay) return;

      const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);

      const options = { month: 'long', day: 'numeric' };
      elements.weekDisplay.textContent = `${startOfWeek.toLocaleDateString('ka-GE', options)} - ${endOfWeek.toLocaleDateString('ka-GE', options)}`;
    }

    function updateCurrentTimeIndicator() {
      if (!elements.currentTimeIndicator) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Adjust for Monday start

      // Check if current time is within visible hours (8am-10pm)
      if (currentHour >= 8 && currentHour <= 22) {
        const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);

        // Only show if current day is in the displayed week
        if (now >= startOfWeek && now <= endOfWeek) {
          const position = ((currentHour - 8) * 60 + currentMinute) * 100 / (14 * 60); // 14 hours from 8am to 10pm
          elements.currentTimeIndicator.style.top = `${position}%`;
          elements.currentTimeIndicator.style.left = `${(dayOfWeek * 14.2857) + 7.14285}%`; // Center in the day column
          elements.currentTimeIndicator.classList.remove('hidden');
          return;
        }
      }

      elements.currentTimeIndicator.classList.add('hidden');
    }

    function setupCalendarSlotInteractions() {
      const dayColumns = document.querySelectorAll('.day-column');
      dayColumns.forEach(col => {
        col.addEventListener('mousedown', handleSlotMouseDown);
        col.addEventListener('mouseover', handleSlotMouseOver);
        col.addEventListener('mouseup', handleSlotMouseUp);
      });

      // Prevent text selection during drag
      document.addEventListener('selectstart', e => {
        if (calendarState.isDragging) e.preventDefault();
      });
    }

    function handleSlotMouseDown(e) {
      const slot = e.target.closest('.calendar-slot');
      if (!slot) return;

      e.preventDefault();
      calendarState.isDragging = true;
      calendarState.selectionStartSlot = slot;
      clearSelection();

      slot.classList.add('selected');
      calendarState.selectedSlots.add(slot);
    }

    function handleSlotMouseOver(e) {
      if (!calendarState.isDragging) return;

      const slot = e.target.closest('.calendar-slot');
      if (!slot || calendarState.selectedSlots.has(slot)) return;

      clearSelection();

      // Select all slots between start and current
      const startSlot = calendarState.selectionStartSlot;
      const startDay = parseInt(startSlot.dataset.day);
      const startHour = parseInt(startSlot.dataset.hour);
      const endDay = parseInt(slot.dataset.day);
      const endHour = parseInt(slot.dataset.hour);

      const minDay = Math.min(startDay, endDay);
      const maxDay = Math.max(startDay, endDay);
      const minHour = Math.min(startHour, endHour);
      const maxHour = Math.max(startHour, endHour);

      document.querySelectorAll('.calendar-slot').forEach(s => {
        const day = parseInt(s.dataset.day);
        const hour = parseInt(s.dataset.hour);

        if (day >= minDay && day <= maxDay && hour >= minHour && hour <= maxHour) {
          s.classList.add('selected');
          calendarState.selectedSlots.add(s);
        }
      });
    }

    function handleSlotMouseUp() {
      if (calendarState.isDragging) {
        calendarState.isDragging = false;
        updateSidebarWithSelection();
      }
    }

    function clearSelection() {
      calendarState.selectedSlots.forEach(slot => slot.classList.remove('selected'));
      calendarState.selectedSlots.clear();
      calendarState.activeLecture = null;

      const panelTitle = document.getElementById('calendar-panel-title');
      if (panelTitle) panelTitle.textContent = 'კალენდარი';

      updateSidebarWithSelection();
    }

    function updateSidebarWithSelection() {
      if (!elements.sidebarTimeRange) return;

      if (calendarState.selectedSlots.size > 0) {
        const slots = Array.from(calendarState.selectedSlots);
        const firstSlot = slots[0];
        const lastSlot = slots[slots.length - 1];

        const startHour = parseInt(firstSlot.dataset.hour);
        const endHour = parseInt(lastSlot.dataset.hour) + 1; // +1 to make it inclusive

        elements.sidebarTimeRange.textContent = `${startHour}:00 - ${endHour}:00`;

        if (calendarState.activeLecture) {
          elements.saveLectureBtn.textContent = 'განახლება';
          elements.deleteLectureBtn.classList.remove('hidden');
        } else {
          elements.saveLectureBtn.textContent = 'შენახვა';
          elements.deleteLectureBtn.classList.add('hidden');
        }
      } else if (calendarState.activeLecture) {
        // Format times properly
        const startTime = calendarState.activeLecture.startTime ? new Date(calendarState.activeLecture.startTime) : null;
        const endTime = calendarState.activeLecture.endTime ? new Date(calendarState.activeLecture.endTime) : null;

        if (startTime && endTime && !isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
          elements.sidebarTimeRange.textContent = `${formatTime(startTime)} - ${formatTime(endTime)}`;
        } else {
          elements.sidebarTimeRange.textContent = 'Invalid time range';
        }

        elements.saveLectureBtn.textContent = 'განახლება';
        elements.deleteLectureBtn.classList.remove('hidden');
      } else {
        elements.sidebarTimeRange.textContent = '--:-- - --:--';
        elements.saveLectureBtn.textContent = 'შენახვა';
        elements.deleteLectureBtn.classList.add('hidden');
      }
    }

    async function handleGroupSelection() {
      const groupId = elements.groupSelect?.value;
      if (!groupId) {
        clearCalendar();
        return;
      }

      try {
        // Fetch lectures and member availability
        const [lecturesRes, availabilityRes] = await Promise.all([
          apiFetch(`/lectures/group/${groupId}`),
          apiFetch(`/groups/${groupId}/availability`)
        ]);

        // Handle API responses
        const lectures = Array.isArray(lecturesRes?.data) ? lecturesRes.data : lecturesRes || [];
        const availability = availabilityRes?.data || availabilityRes || {};

        // Update state
        calendarState.lectures = lectures;
        calendarState.aggregatedAvailability = availability;

        // Render everything
        renderLectures();
        renderAvailabilityHeatmap();
      } catch (error) {
        console.error('Error loading group data:', error);
        showToast(`შეცდომა: ${error.message}`, 'error');
      }
    }

    function renderLectures() {
      // Clear existing lectures
      document.querySelectorAll('.lecture-block').forEach(block => block.remove());

      const startOfWeek = getStartOfWeek(calendarState.mainViewDate);

      calendarState.lectures.forEach(lecture => {
        const startTime = new Date(lecture.startTime);
        const endTime = new Date(lecture.endTime);

        // Check if this lecture occurs during the displayed week
        if (isDateInWeek(startTime, startOfWeek) || isDateInWeek(endTime, startOfWeek)) {
          createLectureBlock(lecture, startOfWeek);
        }
      });
    }

    function createLectureBlock(lecture, startOfWeek) {
      const startTime = new Date(lecture.startTime);
      const endTime = new Date(lecture.endTime);

      const dayOfWeek = startTime.getDay() === 0 ? 6 : startTime.getDay() - 1; // Adjust for Monday start
      const startHour = startTime.getHours() + (startTime.getMinutes() / 60);
      const endHour = endTime.getHours() + (endTime.getMinutes() / 60);

      // Calculate position and size
      const dayColumn = document.querySelector(`.day-column[data-day="${dayOfWeek}"]`);
      if (!dayColumn) return;

      const block = document.createElement('div');
      block.className = 'lecture-block';
      block.style.top = `${((startHour - 8) / 14) * 100}%`;
      block.style.height = `${((endHour - startHour) / 14) * 100}%`;
      block.innerHTML = `
        <div class="lecture-title">${escapeHTML(lecture.title)}</div>
        <div class="lecture-time">${formatTime(startTime)}-${formatTime(endTime)}</div>
      `;

      // Add click handler
      block.addEventListener('click', (e) => {
        e.stopPropagation();
        handleLectureClick(lecture);
      });

      dayColumn.appendChild(block);
    }

    function renderAvailabilityHeatmap() {
      // Clear existing heatmap
      document.querySelectorAll('.calendar-slot').forEach(slot => {
        slot.classList.remove('high-availability', 'medium-availability', 'low-availability');
      });

      const startOfWeek = getStartOfWeek(calendarState.mainViewDate);

      // Apply availability data to slots
      Object.entries(calendarState.aggregatedAvailability).forEach(([dateStr, availabilityData]) => {
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1; // Adjust for Monday start

        // Only show for current week
        if (isDateInWeek(date, startOfWeek)) {
          Object.entries(availabilityData).forEach(([hour, availability]) => {
            const slot = document.querySelector(`.calendar-slot[data-day="${dayOfWeek}"][data-hour="${hour}"]`);
            if (slot) {
              if (availability >= 0.7) slot.classList.add('high-availability');
              else if (availability >= 0.4) slot.classList.add('medium-availability');
              else if (availability > 0) slot.classList.add('low-availability');
            }
          });
        }
      });
    }

    function clearCalendar() {
      document.querySelectorAll('.lecture-block').forEach(block => block.remove());
      document.querySelectorAll('.calendar-slot').forEach(slot => {
        slot.classList.remove('high-availability', 'medium-availability', 'low-availability');
      });
    }

    function handleLectureClick(lecture) {
      clearSelection();
      calendarState.activeLecture = lecture;

      if (elements.lectureTitleInput) elements.lectureTitleInput.value = lecture.title;
      if (elements.sidebarTimeRange) {
        // Format times properly
        const startTime = lecture.startTime ? new Date(lecture.startTime) : null;
        const endTime = lecture.endTime ? new Date(lecture.endTime) : null;
        
        if (startTime && endTime && !isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
          elements.sidebarTimeRange.textContent = 
            `${formatTime(startTime)} - ${formatTime(endTime)}`;
        } else {
          elements.sidebarTimeRange.textContent = 'Invalid time range';
        }
      }

      const panelTitle = document.getElementById('calendar-panel-title');
      if (panelTitle) panelTitle.textContent = 'ლექციის რედაქტირება';

      updateSidebarWithSelection();
    }

    async function saveLecture() {
      const groupId = elements.groupSelect.value;
      if (!groupId) {
        showToast('გთხოვთ აირჩიოთ ჯგუფი', 'error');
        return;
      }

      if (!elements.lectureTitleInput.value.trim()) {
        showToast('გთხოვთ მიუთითოთ ლექციის სახელი', 'error');
        return;
      }

      if (calendarState.selectedSlots.size === 0 && !calendarState.activeLecture) {
        showToast('გთხოვთ აირჩიოთ დროის სლოტები', 'error');
        return;
      }

      try {
        elements.saveLectureBtn.classList.add('loading');

        const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
        const isRecurring = elements.recurringCheckbox?.checked || false;

        let startTime, endTime;

        if (calendarState.selectedSlots.size > 0) {
          // New lecture or rescheduling existing one
          const slots = Array.from(calendarState.selectedSlots);
          const firstSlot = slots[0];
          const lastSlot = slots[slots.length - 1];

          const dayIndex = parseInt(firstSlot.dataset.day);
          const startHour = parseInt(firstSlot.dataset.hour);
          const endHour = parseInt(lastSlot.dataset.hour) + 1; // +1 to make inclusive

          startTime = new Date(startOfWeek);
          startTime.setDate(startOfWeek.getDate() + dayIndex);
          startTime.setHours(startHour, 0, 0, 0);

          endTime = new Date(startTime);
          endTime.setHours(endHour, 0, 0, 0);
        } else if (calendarState.activeLecture) {
          // Editing existing lecture without changing time
          startTime = new Date(calendarState.activeLecture.startTime);
          endTime = new Date(calendarState.activeLecture.endTime);
        }

        const lectureData = {
          title: elements.lectureTitleInput.value.trim(),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          groupId: groupId,
          isRecurring: isRecurring
        };

        let response;
        if (calendarState.activeLecture) {
          // Update existing lecture
          response = await apiFetch(`/lectures/${calendarState.activeLecture._id}`, {
            method: 'PUT',
            body: JSON.stringify(lectureData)
          });
        } else {
          // Create new lecture
          response = await apiFetch('/lectures', {
            method: 'POST',
            body: JSON.stringify(lectureData)
          });
        }

        // Refresh lectures
        await handleGroupSelection();
        clearSelection();
        showToast(calendarState.activeLecture ? 'ლექცია განახლებულია' : 'ლექცია დაემატა', 'success');
      } catch (error) {
        console.error('Save lecture error:', error);
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
        
        // Get the correct date for this instance
        let dateString;
        if (isRecurring && !deleteAllRecurring) {
          // For a specific instance of a recurring event, calculate the date
          const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
          const dayIndex = parseInt(Array.from(calendarState.selectedSlots)[0]?.dataset.day || '0');
          const instanceDate = new Date(startOfWeek);
          instanceDate.setDate(startOfWeek.getDate() + dayIndex);
          dateString = instanceDate.toISOString().split('T')[0];
        } else {
          // For single events or all recurring events, use the original start time
          dateString = new Date(calendarState.activeLecture.startTime).toISOString().split('T')[0];
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

    async function suggestLectures() {
      const groupId = elements.groupSelect.value;
      if (!groupId) {
        showToast('გთხოვთ აირჩიოთ ჯგუფი', 'error');
        return;
      }

      try {
        elements.suggestLecturesBtn.classList.add('loading');

        const response = await apiFetch(`/lectures/suggest/${groupId}`, {
          method: 'POST',
          body: JSON.stringify({
            weekStart: getStartOfWeek(calendarState.mainViewDate).toISOString()
          })
        });

        if (response && response.success) {
          showToast('რეკომენდაციები მომზადებულია', 'success');
          // Refresh to see any automatically created lectures
          await handleGroupSelection();
        } else {
          showToast('რეკომენდაციების მომზადება ვერ მოხერხდა', 'error');
        }
      } catch (error) {
        console.error('Suggest lectures error:', error);
        showToast(`შეცდომა: ${error.message}`, 'error');
      } finally {
        elements.suggestLecturesBtn.classList.remove('loading');
      }
    }

    // =================================================================
    // 10. HELPER FUNCTIONS
    // =================================================================
    function escapeHTML(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function formatTime(date) {
      if (!date || isNaN(date.getTime())) return '--:--';
      return date.toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' });
    }

    function getStartOfWeek(date) {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
      return new Date(d.setDate(diff));
    }

    function getStartOfWeekFromYearAndWeek(year, week) {
      const date = new Date(year, 0, 1 + (week - 1) * 7);
      const dayOfWeek = date.getDay();
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      return startOfWeek;
    }

    function isDateInWeek(date, startOfWeek) {
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      return date >= startOfWeek && date <= endOfWeek;
    }

    function formatDateForApi(date) {
      if (!date) return null;
      
      // Handle both Date objects and ISO strings
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      
      if (isNaN(dateObj.getTime())) {
        console.error('Invalid date:', date);
        return null;
      }
      
      return dateObj.toISOString().split('T')[0];
    }

    function showErrorPage(title, message) {
      document.body.innerHTML = `
        <div class="error-page">
          <div class="error-content">
            <h1>${title}</h1>
            <p>${message}</p>
            <button id="retry-button" class="btn btn--primary">სცადეთ თავიდან</button>
          </div>
        </div>
      `;

      document.getElementById('retry-button').addEventListener('click', () => {
        window.location.reload();
      });
    }

    function renderWeeklyDetails(weekData) {
      const container = document.getElementById('student-points-content');
      if (!container) return;

      const weekStart = getStartOfWeekFromYearAndWeek(weekData._id.year, weekData._id.week);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      container.innerHTML = `
        <div class="detail-header">
          <button class="btn btn--secondary" id="back-to-points-btn">
            <i class="fa-solid fa-arrow-left"></i> უკან
          </button>
          <h2>კვირა ${weekData._id.week}, ${weekData._id.year} (${weekStart.toLocaleDateString('ka-GE')} - ${weekEnd.toLocaleDateString('ka-GE')})</h2>
        </div>
        <div class="weekly-details">
          <div class="total-points-card">
            <i class="fas fa-trophy"></i>
            <div>
              <h3>სულ დაგროვებული ქულები</h3>
              <p>${weekData.totalPointsEarned} / ${weekData.totalPointsPossible}</p>
            </div>
          </div>
          <h3>დავალებების ქულები</h3>
          <div class="assignments-list">
            ${weekData.assignments && weekData.assignments.length > 0 ? 
              weekData.assignments.map(assignment => `
                <div class="assignment-item">
                  <div class="assignment-info">
                    <h4>${escapeHTML(assignment.title)}</h4>
                    <p>${assignment.description ? escapeHTML(assignment.description) : 'No description'}</p>
                  </div>
                  <div class="assignment-points ${assignment.pointsEarned === assignment.pointsPossible ? 'full-points' : ''}">
                    ${assignment.pointsEarned} / ${assignment.pointsPossible}
                  </div>
                </div>
              `).join('') : 
              '<p class="empty-list-message">დავალებები არ მოიძებნა ამ კვირაში.</p>'
            }
          </div>
        </div>
      `;

      document.getElementById('back-to-points-btn').addEventListener('click', () => {
        renderStudentPointsDetails(state.students.find(s => s._id === state.selectedStudent?._id));
      });
    }

    // =================================================================
    // 11. INITIALIZE THE APPLICATION
    // =================================================================
    initializeApp();
});
