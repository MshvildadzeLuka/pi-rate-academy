/**
 * ===================================================================
 * ADMIN DASHBOARD SCRIPT (v4.0 - Fully Implemented)
 * for Pi-Rate Academy
 * ===================================================================
 * - Implements full CRUD functionality for all management panels.
 * - Integrates a complete, interactive drag-and-drop calendar.
 * - Consolidates all logic into a single, robust script.
 * - Includes all previously discussed bug fixes.
 * ===================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
  // =================================================================
  // 1. CONFIGURATION & API HELPER
  // =================================================================
  const API_BASE_URL = 'http://localhost:5001/api';

  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('piRateToken');
    const headers = { ...(options.headers || {}) };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });
      if (response.status === 401 || response.status === 403) {
        window.location.href = '../login/login.html';
        throw new Error('Unauthorized');
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'An API error occurred');
      }
      return response.status === 204 ? null : response.json();
    } catch (error) {
      console.error('API Request Failed:', error);
      throw error;
    }
  }

  // =================================================================
  // 2. STATE MANAGEMENT & DOM ELEMENT SELECTION
  // =================================================================
  const state = {
    users: [],
    groups: [],
    notes: [],
    videos: [],
    currentUser: null,
    editingId: null,
  };

  const elements = {
    sidebarLinks: document.querySelectorAll('.sidebar-link'),
    adminPanels: document.querySelectorAll('.admin-panel'),
    // Modals
    userModal: document.getElementById('user-form-modal'),
    noteModal: document.getElementById('note-form-modal'),
    videoModal: document.getElementById('video-form-modal'),
    groupModal: document.getElementById('group-form-modal'),
    // Forms
    userForm: document.getElementById('user-form'),
    noteForm: document.getElementById('note-form'),
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
  };

  const calendarState = {
    mainViewDate: new Date(),
    isDragging: false,
    selectionStartSlot: null,
    selectedSlots: new Set(),
    activeLecture: null,
    lectures: [],
  };

  // =================================================================
  // 3. INITIALIZATION
  // =================================================================
  async function initializeApp() {
    try {
      const [currentUser, users, groups, notes, videos] = await Promise.all([
        apiFetch('/users/profile'),
        apiFetch('/users'),
        apiFetch('/groups'),
        apiFetch('/notes'),
        apiFetch('/videos'),
      ]);
      Object.assign(state, { currentUser, users, groups, notes, videos });
      renderAllComponents();
      setupAllEventListeners();
      initializeCalendar();
    } catch (error) {
      console.error('Initialization Error:', error);
      showErrorPage('Access Denied', 'Could not load admin data.');
    }
  }

  // =================================================================
  // 4. DYNAMIC RENDERING FUNCTIONS
  // =================================================================
  function renderAllComponents() {
    renderDashboard();
    renderUsersTable();
    renderGroupsTable();
    renderNotesTable();
    renderVideosTable();
  }

  function renderDashboard() {
    document.getElementById('total-users-stat').textContent = state.users.length;
    document.getElementById('total-groups-stat').textContent = state.groups.length;
    document.getElementById('total-notes-stat').textContent = state.notes.length;
    document.getElementById('total-videos-stat').textContent = state.videos.length;
  }

  function renderUsersTable() {
    const container = document.getElementById('users-table-container');
    if (state.users.length === 0) {
        container.innerHTML = '<p class="empty-list-message">No users found.</p>';
        return;
    }
    container.innerHTML = `
        <table class="admin-list-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>
                ${state.users.map(user => `
                    <tr>
                        <td>${escapeHTML(user.firstName)} ${escapeHTML(user.lastName)}</td>
                        <td>${escapeHTML(user.email)}</td>
                        <td><span class="role-tag ${user.role.toLowerCase()}">${escapeHTML(user.role)}</span></td>
                        <td class="action-btns">
                            <button onclick="adminApp.editUser('${user._id}')"><i class="fa-solid fa-pencil"></i></button>
                            <button onclick="adminApp.deleteUser('${user._id}')"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
  }

  function renderGroupsTable() {
    const container = document.getElementById('groups-table-container');
    if (state.groups.length === 0) {
        container.innerHTML = '<p class="empty-list-message">No groups created yet.</p>';
        return;
    }
    container.innerHTML = `
        <table class="admin-list-table">
            <thead><tr><th>Group Name</th><th>Teacher</th><th>Students</th><th>Actions</th></tr></thead>
            <tbody>
                ${state.groups.map(group => {
                    const validUsers = group.users.filter(u => u);
                    const teacher = validUsers.find(u => u.role === 'Teacher');
                    const studentCount = validUsers.filter(u => u.role === 'Student').length;
                    return `
                        <tr>
                            <td>${escapeHTML(group.name)}</td>
                            <td>${teacher ? `${escapeHTML(teacher.firstName)} ${escapeHTML(teacher.lastName)}` : 'N/A'}</td>
                            <td>${studentCount}</td>
                            <td class="action-btns">
                                <button onclick="adminApp.editGroup('${group._id}')"><i class="fa-solid fa-pencil"></i></button>
                                <button onclick="adminApp.deleteGroup('${group._id}')"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`;
                }).join('')}
            </tbody>
        </table>`;
  }

  function renderNotesTable() {
    const container = document.getElementById('notes-table-container');
    if (state.notes.length === 0) {
        container.innerHTML = '<p class="empty-list-message">No notes uploaded yet.</p>';
        return;
    }
    container.innerHTML = `
        <table class="admin-list-table">
            <thead><tr><th>Title</th><th>File Name</th><th>Actions</th></tr></thead>
            <tbody>
                ${state.notes.map(note => `
                    <tr>
                        <td>${escapeHTML(note.title)}</td>
                        <td>${escapeHTML(note.fileName)}</td>
                        <td class="action-btns">
                            <button onclick="adminApp.editNote('${note._id}')"><i class="fa-solid fa-pencil"></i></button>
                            <button onclick="adminApp.deleteNote('${note._id}')"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
  }

  function renderVideosTable() {
    const container = document.getElementById('videos-table-container');
    if (state.videos.length === 0) {
        container.innerHTML = '<p class="empty-list-message">No videos added yet.</p>';
        return;
    }
    container.innerHTML = `
        <table class="admin-list-table">
            <thead><tr><th>Title</th><th>Type</th><th>Source</th><th>Actions</th></tr></thead>
            <tbody>
                ${state.videos.map(video => `
                    <tr>
                        <td>${escapeHTML(video.title)}</td>
                        <td><span class="role-tag ${video.type}">${escapeHTML(video.type)}</span></td>
                        <td class="video-url">${escapeHTML(video.url)}</td>
                        <td class="action-btns">
                            <button onclick="adminApp.editVideo('${video._id}')"><i class="fa-solid fa-pencil"></i></button>
                            <button onclick="adminApp.deleteVideo('${video._id}')"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
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
      state.editingId = user ? user._id : null;
      elements.userForm.reset();
      document.getElementById('modal-title-user').textContent = user ? 'Edit User' : 'Create New User';
      document.getElementById('teacher-fields').classList.add('hidden');
      document.getElementById('password').required = !user;
      document.getElementById('password-label').textContent = user ? 'New Password (Optional)' : 'Temporary Password';
      if (user) {
          elements.userForm.querySelector('#first-name').value = user.firstName;
          elements.userForm.querySelector('#last-name').value = user.lastName;
          elements.userForm.querySelector('#email').value = user.email;
          elements.userForm.querySelector('#user-role').value = user.role;
          if (['Teacher', 'Admin'].includes(user.role)) {
              document.getElementById('teacher-fields').classList.remove('hidden');
              elements.userForm.querySelector('#about-me').value = user.aboutMe || '';
              elements.userForm.querySelector('#photo-url').value = user.photoUrl || '';
          }
      }
      openModal(elements.userModal);
  }

  function setupNoteModal(note = null) {
      state.editingId = note ? note._id : null;
      elements.noteForm.reset();
      document.getElementById('modal-title-note').textContent = note ? 'Edit Note' : 'Upload New Note';
      document.getElementById('note-file-name').textContent = 'No file selected';
      if (note) {
          elements.noteForm.querySelector('#note-title').value = note.title;
          elements.noteForm.querySelector('#note-description').value = note.description;
          document.getElementById('note-file-name').textContent = note.fileName;
      }
      openModal(elements.noteModal);
  }

  function setupVideoModal(video = null) {
      state.editingId = video ? video._id : null;
      elements.videoForm.reset();
      document.getElementById('modal-title-video').textContent = video ? 'Edit Video' : 'Add New Video';
      document.getElementById('video-file-name').textContent = 'No file selected';
      const isUpload = !video || video.type === 'upload';
      elements.videoForm.querySelector('input[name="video-source"][value="upload"]').checked = isUpload;
      elements.videoForm.querySelector('input[name="video-source"][value="link"]').checked = !isUpload;
      document.getElementById('video-file-group').classList.toggle('hidden', !isUpload);
      document.getElementById('video-link-group').classList.toggle('hidden', isUpload);
      if (video) {
          elements.videoForm.querySelector('#video-title').value = video.title;
          elements.videoForm.querySelector('#video-description').value = video.description;
          if (isUpload) document.getElementById('video-file-name').textContent = video.url.split('/').pop();
          else elements.videoForm.querySelector('#video-youtube-url').value = video.url;
      }
      openModal(elements.videoModal);
  }

  function setupGroupModal(group = null) {
      state.editingId = group ? group._id : null;
      elements.groupForm.reset();
      document.getElementById('modal-title-group').textContent = group ? 'Edit Group' : 'Create New Group';
      if (group) {
          elements.groupForm.querySelector('#group-name').value = group.name;
          elements.groupForm.querySelector('#group-zoom-link').value = group.zoomLink;
      }
      const teacherId = group ? group.users.find(u => u && u.role === 'Teacher')?._id : '';
      const studentIds = group ? group.users.filter(u => u && u.role === 'Student').map(u => u._id) : [];
      populateUserSelects(teacherId, studentIds);
      openModal(elements.groupModal);
  }

  function populateUserSelects(selectedTeacherId, selectedStudentIds) {
      const teacherSelect = document.getElementById('teacher-select');
      const studentMultiSelect = document.getElementById('student-multiselect');
      if (!teacherSelect || !studentMultiSelect) return;
      teacherSelect.innerHTML = '<option value="">-- No Teacher --</option>' + state.users
          .filter(u => u.role === 'Teacher')
          .map(t => `<option value="${t._id}" ${t._id === selectedTeacherId ? 'selected' : ''}>${escapeHTML(t.firstName)} ${escapeHTML(t.lastName)}</option>`)
          .join('');
      studentMultiSelect.innerHTML = state.users
          .filter(u => u.role === 'Student')
          .map(s => `<label class="multi-select-option"><input type="checkbox" value="${s._id}" ${selectedStudentIds.includes(s._id) ? 'checked' : ''}><span>${escapeHTML(s.firstName)} ${escapeHTML(s.lastName)}</span></label>`)
          .join('');
  }

  // =================================================================
  // 6. FORM SUBMISSION HANDLERS
  // =================================================================
  async function handleUserFormSubmit(e) {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(elements.userForm).entries());
      if (!data.password) delete data.password;
      const endpoint = state.editingId ? `/users/${state.editingId}` : '/users';
      const method = state.editingId ? 'PUT' : 'POST';
      try {
          await apiFetch(endpoint, { method, body: JSON.stringify(data) });
          state.users = await apiFetch('/users');
          renderAllComponents();
          closeModal(elements.userModal);
      } catch (error) { alert(`Error: ${error.message}`); }
  }

  async function handleNoteFormSubmit(e) {
      e.preventDefault();
      const formData = new FormData(elements.noteForm);
      const file = document.getElementById('note-file-input').files[0];
      if (!file && !state.editingId) return alert('A file is required to create a new note.');
      if (file) formData.append('file', file);
      const endpoint = state.editingId ? `/notes/${state.editingId}` : '/notes';
      const method = state.editingId ? 'PUT' : 'POST';
      try {
          await apiFetch(endpoint, { method, body: formData });
          state.notes = await apiFetch('/notes');
          renderAllComponents();
          closeModal(elements.noteModal);
      } catch (error) { alert(`Error: ${error.message}`); }
  }

  async function handleVideoFormSubmit(e) {
      e.preventDefault();
      const formData = new FormData(elements.videoForm);
      const source = formData.get('video-source');
      let payload, options;
      const endpoint = state.editingId ? `/videos/${state.editingId}` : '/videos';
      const method = state.editingId ? 'PUT' : 'POST';
      if (source === 'upload') {
          payload = new FormData();
          payload.append('title', formData.get('title'));
          payload.append('description', formData.get('description'));
          payload.append('type', 'upload');
          const file = document.getElementById('video-file-input').files[0];
          if (file) payload.append('video', file);
          else if (!state.editingId) return alert('A file is required for upload type.');
          options = { method, body: payload };
      } else {
          payload = {
              title: formData.get('title'),
              description: formData.get('description'),
              type: 'link',
              url: formData.get('url'),
          };
          if (!payload.url) return alert('A URL is required for link type.');
          options = { method, body: JSON.stringify(payload) };
      }
      try {
          await apiFetch(endpoint, options);
          state.videos = await apiFetch('/videos');
          renderAllComponents();
          closeModal(elements.videoModal);
      } catch (error) { alert(`Error: ${error.message}`); }
  }

  async function handleGroupFormSubmit(e) {
      e.preventDefault();
      const selectedStudents = Array.from(document.querySelectorAll('#student-multiselect input:checked')).map(el => el.value);
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
          state.groups = await apiFetch('/groups');
          renderAllComponents();
          closeModal(elements.groupModal);
      } catch (error) { alert(`Error: ${error.message}`); }
  }
  
  // =================================================================
  // 7. EVENT LISTENERS & PUBLIC API
  // =================================================================
  function setupAllEventListeners() {
      // Sidebar navigation
      elements.sidebarLinks.forEach(link => {
          link.addEventListener('click', e => {
              e.preventDefault();
              const targetId = link.dataset.target;
              elements.sidebarLinks.forEach(l => l.classList.remove('active'));
              link.classList.add('active');
              elements.adminPanels.forEach(p => p.classList.remove('active'));
              document.getElementById(targetId)?.classList.add('active');
              elements.calendarControlPanel.classList.toggle('hidden', targetId !== 'calendar-panel');
          });
      });

      // Modal Triggers
      document.getElementById('create-user-btn')?.addEventListener('click', () => setupUserModal());
      document.getElementById('quick-create-user-btn')?.addEventListener('click', () => setupUserModal());
      document.getElementById('upload-note-btn')?.addEventListener('click', () => setupNoteModal());
      document.getElementById('quick-upload-note-btn')?.addEventListener('click', () => setupNoteModal());
      document.getElementById('upload-video-btn')?.addEventListener('click', () => setupVideoModal());
      document.getElementById('create-group-btn')?.addEventListener('click', () => setupGroupModal());
      document.getElementById('quick-create-group-btn')?.addEventListener('click', () => setupGroupModal());

      // Modal Close Triggers
      document.querySelectorAll('.modal-overlay').forEach(modal => {
          modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal); });
          modal.querySelector('.close-modal')?.addEventListener('click', () => closeModal(modal));
      });

      // Form Submissions
      elements.userForm?.addEventListener('submit', handleUserFormSubmit);
      elements.noteForm?.addEventListener('submit', handleNoteFormSubmit);
      elements.videoForm?.addEventListener('submit', handleVideoFormSubmit);
      elements.groupForm?.addEventListener('submit', handleGroupFormSubmit);

      // Dynamic UI Listeners
      elements.userForm?.querySelector('#user-role')?.addEventListener('change', e => {
          document.getElementById('teacher-fields').classList.toggle('hidden', !['Teacher', 'Admin'].includes(e.target.value));
      });
      elements.videoForm?.querySelectorAll('input[name="video-source"]').forEach(radio => {
          radio.addEventListener('change', e => {
              const isUpload = e.target.value === 'upload';
              document.getElementById('video-file-group').classList.toggle('hidden', !isUpload);
              document.getElementById('video-link-group').classList.toggle('hidden', isUpload);
          });
      });
      document.getElementById('note-file-input')?.addEventListener('change', e => {
          document.getElementById('note-file-name').textContent = e.target.files[0]?.name || 'No file selected';
      });
      document.getElementById('video-file-input')?.addEventListener('change', e => {
          document.getElementById('video-file-name').textContent = e.target.files[0]?.name || 'No file selected';
      });
  }

  window.adminApp = {
      editUser: (id) => setupUserModal(state.users.find(i => i._id === id)),
      deleteUser: async (id) => {
          if (confirm('Delete user?')) try {
              await apiFetch(`/users/${id}`, { method: 'DELETE' });
              state.users = await apiFetch('/users');
              renderAllComponents();
          } catch (error) { alert(`Error: ${error.message}`); }
      },
      editGroup: (id) => setupGroupModal(state.groups.find(i => i._id === id)),
      deleteGroup: async (id) => {
          if (confirm('Delete group?')) try {
              await apiFetch(`/groups/${id}`, { method: 'DELETE' });
              state.groups = await apiFetch('/groups');
              renderAllComponents();
          } catch (error) { alert(`Error: ${error.message}`); }
      },
      editNote: (id) => setupNoteModal(state.notes.find(i => i._id === id)),
      deleteNote: async (id) => {
          if (confirm('Delete note?')) try {
              await apiFetch(`/notes/${id}`, { method: 'DELETE' });
              state.notes = await apiFetch('/notes');
              renderAllComponents();
          } catch (error) { alert(`Error: ${error.message}`); }
      },
      editVideo: (id) => setupVideoModal(state.videos.find(i => i._id === id)),
      deleteVideo: async (id) => {
          if (confirm('Delete video?')) try {
              await apiFetch(`/videos/${id}`, { method: 'DELETE' });
              state.videos = await apiFetch('/videos');
              renderAllComponents();
          } catch (error) { alert(`Error: ${error.message}`); }
      }
  };

  // =================================================================
  // 8. CALENDAR LOGIC
  // =================================================================
  function initializeCalendar() {
      generateTimeSlots();
      populateGroupDropdown();
      addCalendarEventListeners();
      renderCalendarWeek();
      updateCurrentTimeIndicator();
      setInterval(updateCurrentTimeIndicator, 60000);
  }

  function addCalendarEventListeners() {
      elements.prevWeekBtn.addEventListener('click', () => navigateWeek(-1));
      elements.nextWeekBtn.addEventListener('click', () => navigateWeek(1));
      elements.todayBtn.addEventListener('click', () => navigateWeek(0));
      elements.groupSelect.addEventListener('change', handleGroupSelection);
      document.querySelector('.calendar-grid-wrapper').addEventListener('mousedown', startDragSelection);
      document.querySelector('.calendar-grid-wrapper').addEventListener('mouseover', duringDragSelection);
      document.addEventListener('mouseup', endDragSelection);
      elements.saveLectureBtn.addEventListener('click', saveLecture);
      elements.deleteLectureBtn.addEventListener('click', deleteLecture);
  }

  function populateGroupDropdown() {
      elements.groupSelect.innerHTML = '<option value="">-- Choose a group --</option>' + 
          state.groups.map(g => `<option value="${g._id}">${escapeHTML(g.name)}</option>`).join('');
  }

  function navigateWeek(direction) {
      if (direction === 0) calendarState.mainViewDate = new Date();
      else calendarState.mainViewDate.setDate(calendarState.mainViewDate.getDate() + (direction * 7));
      renderCalendarWeek();
  }

  async function handleGroupSelection() {
      clearAllCalendarEvents();
      const groupId = elements.groupSelect.value;
      if (!groupId) return;
      try {
          calendarState.lectures = await apiFetch(`/lectures/group/${groupId}`);
          renderLectures();
      } catch (error) { alert("Could not load schedule for the selected group."); }
  }

  function renderCalendarWeek() {
      const start = getStartOfWeek(calendarState.mainViewDate);
      const end = getEndOfWeek(calendarState.mainViewDate);
      elements.weekDisplay.textContent = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      const today = new Date();
      for (let i = 0; i < 7; i++) {
          const date = new Date(start);
          date.setDate(start.getDate() + i);
          const header = document.querySelector(`.day-column-header[data-day-header="${i}"]`);
          header.querySelector('.day-number').textContent = date.getDate();
          header.classList.toggle('current-day-header', date.toDateString() === today.toDateString());
      }
      handleGroupSelection();
  }

  function renderLectures() {
      const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
      const endOfWeek = getEndOfWeek(calendarState.mainViewDate);
      calendarState.lectures.forEach(lecture => {
          const lectureDate = new Date(lecture.startTime);
          if (lectureDate >= startOfWeek && lectureDate <= endOfWeek) {
              renderEventBlock({
                  id: lecture._id,
                  title: lecture.title,
                  start: `${String(lectureDate.getHours()).padStart(2, '0')}:${String(lectureDate.getMinutes()).padStart(2, '0')}`,
                  end: `${String(new Date(lecture.endTime).getHours()).padStart(2, '0')}:${String(new Date(lecture.endTime).getMinutes()).padStart(2, '0')}`,
                  type: 'lecture'
              }, (lectureDate.getDay() + 6) % 7);
          }
      });
  }

  function renderEventBlock(event, dayIndex) {
      const dayColumn = document.querySelector(`.day-column[data-day="${dayIndex}"]`);
      const start = timeToMinutes(event.start);
      const end = timeToMinutes(event.end);
      const top = ((start - 8 * 60) / 30) * 40;
      const height = ((end - start) / 30) * 40;
      const eventBlock = document.createElement('div');
      eventBlock.className = `event-block event-${event.type}`;
      eventBlock.style.top = `${top}px`;
      eventBlock.style.height = `${height - 2}px`;
      if (event.title) eventBlock.innerHTML = `<div class="event-title">${escapeHTML(event.title)}</div><div class="event-time">${formatTime(event.start, false)} - ${formatTime(event.end, false)}</div>`;
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
          calendarState.isDragging = true;
          calendarState.selectionStartSlot = e.target;
          clearSelection();
          updateSelection(e.target);
      }
  }

  function duringDragSelection(e) {
      if (calendarState.isDragging && e.target.classList.contains('time-slot') && e.target.dataset.day === calendarState.selectionStartSlot.dataset.day) {
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
      const allSlots = Array.from(document.querySelectorAll(`.time-slot[data-day="${calendarState.selectionStartSlot.dataset.day}"]`));
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

  function clearSelection() {
      document.querySelectorAll('.selection-active').forEach(s => s.classList.remove('selection-active'));
      calendarState.selectedSlots.clear();
      calendarState.activeLecture = null;
      elements.lectureTitleInput.value = '';
      updateSidebarWithSelection();
      document.getElementById('calendar-panel-title').textContent = 'Schedule Lecture';
  }

  function updateSidebarWithSelection() {
      const hasSelection = calendarState.selectedSlots.size > 0;
      elements.saveLectureBtn.disabled = !hasSelection;
      elements.deleteLectureBtn.disabled = !calendarState.activeLecture;
      if (!hasSelection && !calendarState.activeLecture) {
          elements.sidebarTimeRange.textContent = 'Select a time on the calendar';
          return;
      }
      if (calendarState.activeLecture && !hasSelection) return; // Don't override edit view
      const times = Array.from(calendarState.selectedSlots).map(s => s.dataset.time).sort((a,b) => timeToMinutes(a) - timeToMinutes(b));
      elements.sidebarTimeRange.textContent = `${formatTime(times[0])} - ${formatTime(minutesToTime(timeToMinutes(times[times.length - 1]) + 30))}`;
  }

  function handleLectureClick(lecture) {
      clearSelection();
      calendarState.activeLecture = lecture;
      elements.lectureTitleInput.value = lecture.title;
      elements.sidebarTimeRange.textContent = `${formatTime(lecture.start)} - ${formatTime(lecture.end)}`;
      document.getElementById('calendar-panel-title').textContent = 'Edit Lecture';
      updateSidebarWithSelection();
  }

  async function saveLecture() {
      const slots = Array.from(calendarState.selectedSlots);
      if (slots.length === 0 || !elements.lectureTitleInput.value.trim()) {
          return alert("Please select a time slot and provide a title.");
      }
      const startSlot = slots[0];
      const startOfWeek = getStartOfWeek(calendarState.mainViewDate);
      const lectureDate = new Date(startOfWeek);
      lectureDate.setDate(startOfWeek.getDate() + parseInt(startSlot.dataset.day));
      const [startH, startM] = startSlot.dataset.time.split(':');
      const startTime = new Date(lectureDate.setHours(parseInt(startH), parseInt(startM)));
      const endTime = new Date(startTime.getTime() + slots.length * 30 * 60000);
      const payload = {
          title: elements.lectureTitleInput.value.trim(),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          groupId: elements.groupSelect.value,
          instructor: state.currentUser._id, // Assumes admin is the instructor
      };
      const endpoint = calendarState.activeLecture ? `/lectures/${calendarState.activeLecture.id}` : '/lectures';
      const method = calendarState.activeLecture ? 'PUT' : 'POST';
      try {
          await apiFetch(endpoint, { method, body: JSON.stringify(payload) });
          await handleGroupSelection();
          clearSelection();
      } catch (error) { alert(`Error: ${error.message}`); }
  }

  async function deleteLecture() {
      if (!calendarState.activeLecture || !confirm('Delete this lecture?')) return;
      try {
          await apiFetch(`/lectures/${calendarState.activeLecture.id}`, { method: 'DELETE' });
          await handleGroupSelection();
          clearSelection();
      } catch (error) { alert(`Error: ${error.message}`); }
  }

  function generateTimeSlots() {
      elements.timeColumn.innerHTML = '';
      elements.dayColumns.forEach(col => col.innerHTML = '');
      for (let hour = 8; hour <= 22; hour++) {
          const timeLabel = document.createElement('div');
          timeLabel.className = 'time-label';
          timeLabel.textContent = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
          elements.timeColumn.appendChild(timeLabel);
      }
      elements.dayColumns.forEach(col => {
          for (let h = 8; h <= 22; h++) {
              for (let m = 0; m < 60; m += 30) {
                  const slot = document.createElement('div');
                  slot.className = 'time-slot';
                  slot.dataset.day = col.dataset.day;
                  slot.dataset.time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                  col.appendChild(slot);
              }
          }
      });
  }

  function updateCurrentTimeIndicator() {
      const now = new Date();
      const startOfDay = new Date(now).setHours(8, 0, 0, 0);
      const minutesSinceStart = (now - startOfDay) / 60000;
      const topPosition = (minutesSinceStart / 30) * 40;
      const dayIndex = (now.getDay() + 6) % 7;
      const dayColumn = document.querySelector(`.day-column[data-day="${dayIndex}"]`);
      if (elements.currentTimeIndicator && dayColumn) {
          elements.currentTimeIndicator.style.left = `${dayColumn.offsetLeft}px`;
          elements.currentTimeIndicator.style.width = `${dayColumn.offsetWidth}px`;
          if (topPosition > 0 && topPosition < (15 * 80)) {
              elements.currentTimeIndicator.style.top = `${topPosition}px`;
              elements.currentTimeIndicator.style.display = 'block';
          } else {
              elements.currentTimeIndicator.style.display = 'none';
          }
      }
  }

  function clearAllCalendarEvents() {
      document.querySelectorAll('.event-block').forEach(el => el.remove());
  }

  // =================================================================
  // 9. UTILITY FUNCTIONS
  // =================================================================
  function escapeHTML(str) {
      if (!str) return '';
      return str.toString().replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]));
  }
  function getStartOfWeek(date) {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setHours(0, 0, 0, 0);
      return new Date(d.setDate(diff));
  }
  function getEndOfWeek(date) {
      const start = getStartOfWeek(date);
      const d = new Date(start);
      d.setDate(d.getDate() + 6);
      d.setHours(23, 59, 59, 999);
      return d;
  }
  function timeToMinutes(timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
  }
  function minutesToTime(minutes) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function formatTime(timeStr, showMins = true) {
      const [h, m] = timeStr.split(':');
      const hour = parseInt(h);
      const ampm = hour < 12 ? 'AM' : 'PM';
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      return `${displayHour}${showMins && m !== '00' ? `:${m}` : ''} ${ampm}`;
  }

  // =================================================================
  // 10. START THE APPLICATION
  // =================================================================
  initializeApp();
}); 