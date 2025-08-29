document.addEventListener('DOMContentLoaded', () => {
  // ======================================================
  // =============== CONFIG & API HELPERS =================
  // ======================================================
  const API_BASE_URL = 'http://localhost:5001';

  /**
   * A helper function to make authenticated API requests.
   * @param {string} endpoint - The API endpoint to call.
   * @param {object} options - The options for the fetch call.
   * @returns {Promise<any>} The JSON response from the server.
   */
  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('piRateToken');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'An API error occurred');
    }
    return response.json();
  }

  // --- STATE MANAGEMENT ---
  let mainViewDate = new Date();
  let miniCalDate = new Date();
  // This will be populated with data from the server
  let userEvents = {
    recurring: {},
    specific: {},
    exceptions: {},
    lectures: {},
  };
  let isDragging = false;
  let selectionStartSlot = null;
  let selectedSlots = new Set();
  let activeEvent = null;

  // --- ELEMENT SELECTORS ---
  const timeColumn = document.getElementById('time-column');
  const dayColumns = document.querySelectorAll('.day-column');
  const weekDisplay = document.getElementById('current-week-display');
  const prevWeekBtn = document.getElementById('prev-week-btn');
  const nextWeekBtn = document.getElementById('next-week-btn');
  const todayBtn = document.getElementById('today-btn');
  const miniCalHeader = document.getElementById('mini-cal-month-year');
  const miniCalDaysGrid = document.getElementById('mini-calendar-days');
  const miniCalPrevBtn = document.getElementById('mini-cal-prev-month');
  const miniCalNextBtn = document.getElementById('mini-cal-next-month');
  const sidebarTimeRange = document.getElementById('sidebar-time-range');
  const saveEventBtn = document.getElementById('save-event-btn');
  const deleteEventBtn = document.getElementById('delete-event-btn');
  const recurringCheckbox = document.getElementById('recurring-event-checkbox');
  const recurringLabelText = document.getElementById('recurring-label-text');
  const gridWrapper = document.querySelector('.calendar-grid-wrapper');

  // --- INITIALIZATION ---
  async function initializeCalendar() {
    try {
      // Fetch user profile and all lectures concurrently
      const [userProfile, allLectures] = await Promise.all([
        apiFetch('/api/users/profile'),
        apiFetch('/api/lectures'),
      ]);

      // Populate user's personal schedule
      if (userProfile && userProfile.calendarEvents) {
        userEvents.recurring = userProfile.calendarEvents.recurring || {};
        userEvents.specific = userProfile.calendarEvents.specific || {};
        userEvents.exceptions = userProfile.calendarEvents.exceptions || {};
      }

      // Process and populate official lecture schedules
      userEvents.lectures = {};
      allLectures.forEach(lecture => {
          const day = lecture.dayOfWeek.toLowerCase();
          if (!userEvents.lectures[day]) {
              userEvents.lectures[day] = [];
          }
          userEvents.lectures[day].push({
              id: lecture._id,
              start: lecture.startTime,
              end: lecture.endTime,
              type: 'lecture',
              title: lecture.title,
          });
      });

      generateTimeSlots();
      renderAll();
      addEventListeners();
    } catch (error) {
      console.error('Failed to initialize calendar:', error);
      alert('Could not load calendar data. Please refresh the page.');
    }
  }

  // --- DATA SAVING ---
  /**
   * Saves the user's personal calendar events to their profile on the server.
   */
  async function updateUserCalendarOnServer() {
    try {
      const payload = {
        calendarEvents: {
          recurring: userEvents.recurring,
          specific: userEvents.specific,
          exceptions: userEvents.exceptions,
        },
      };
      await apiFetch('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to save calendar updates to server:', error);
      alert('Error: Could not save your schedule changes.');
    }
  }

  // --- RENDER LOGIC (Largely Unchanged) ---
  function renderAll() {
    renderMainWeeklyGrid();
    renderMiniCalendar();
    updateSidebarUI('add');
  }

  function renderMainWeeklyGrid() {
    const startOfWeek = getStartOfWeek(mainViewDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    weekDisplay.textContent = `${startOfWeek.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
    })} – ${endOfWeek.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })}`;

    document.querySelectorAll('.event-block').forEach((el) => el.remove());

    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dayIndex = i;
      const dayName = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ][dayIndex];
      const dateString = date.toISOString().split('T')[0];

      const header = document.querySelector(
        `.day-column-header[data-day-header="${dayIndex}"]`
      );
      if (header) {
        header.querySelector('.day-number').textContent = date.getDate();
        header.classList.toggle(
          'current-day-header',
          date.toDateString() === today.toDateString()
        );
      }

      const eventsToRender = [
        ...(userEvents.lectures[dayName] || []),
        ...(userEvents.recurring[dayName] || []).filter(
          (event) =>
            !(
              userEvents.exceptions[dateString] &&
              userEvents.exceptions[dateString].includes(event.id)
            )
        ),
        ...(userEvents.specific[dateString] || []),
      ];
      eventsToRender.forEach((event) =>
        renderEventBlock(event, dayIndex, dateString)
      );
    }
  }

  function renderEventBlock(event, dayIndex, dateString) {
    const dayColumn = document.querySelector(`.day-column[data-day="${dayIndex}"]`);
    if (!dayColumn) return;

    const start = timeToMinutes(event.start);
    const end = timeToMinutes(event.end);
    const top = ((start - 8 * 60) / 30) * 40;
    const height = ((end - start) / 30) * 40;

    const eventBlock = document.createElement('div');
    eventBlock.className = `event-block event-${event.type}`;
    eventBlock.style.top = `${top}px`;
    eventBlock.style.height = `${height - 2}px`;

    const title =
      event.title || event.type.charAt(0).toUpperCase() + event.type.slice(1);
    eventBlock.innerHTML = `<div class="event-title">${title}</div><div class="event-time">${formatTime(
      event.start,
      false
    )} - ${formatTime(event.end, false)}</div>`;

    eventBlock.dataset.eventId = event.id;
    eventBlock.dataset.dateString = dateString;
    eventBlock.dataset.eventType = event.type;
    eventBlock.dataset.isRecurring = !!Object.keys(userEvents.recurring).find(
      (day) => userEvents.recurring[day].some((e) => e.id === event.id)
    );

    if (event.type !== 'lecture') {
      eventBlock.addEventListener('click', (e) => {
        e.stopPropagation();
        handleEventClick(eventBlock);
      });
    } else {
      eventBlock.classList.add('read-only');
    }

    dayColumn.appendChild(eventBlock);
  }

  // (renderMiniCalendar, generateTimeSlots, and other UI functions remain the same)
  function renderMiniCalendar() {
        miniCalDaysGrid.innerHTML = '';
        miniCalHeader.textContent = miniCalDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        
        const month = miniCalDate.getMonth(), year = miniCalDate.getFullYear();
        const firstDayOfMonth = new Date(year, month, 1);
        const startDayOffset = (firstDayOfMonth.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const startOfWeek = getStartOfWeek(mainViewDate);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);

        for (let i = 0; i < startDayOffset; i++) miniCalDaysGrid.insertAdjacentHTML('beforeend', `<div class="mini-calendar-day other-month"></div>`);

        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            const dayCell = document.createElement('div');
            dayCell.textContent = i;
            dayCell.className = 'mini-calendar-day';
            dayCell.dataset.date = date.toISOString();
            if (date.toDateString() === today.toDateString()) dayCell.classList.add('current-day');
            if (date >= startOfWeek && date <= endOfWeek) dayCell.classList.add('in-selected-week');
            dayCell.addEventListener('click', () => { mainViewDate = new Date(date); miniCalDate = new Date(date); renderAll(); });
            miniCalDaysGrid.appendChild(dayCell);
        }
    }

    function generateTimeSlots() {
        timeColumn.innerHTML = '';
        dayColumns.forEach(col => col.innerHTML = '');

        for (let hour = 8; hour <= 22; hour++) {
            const timeLabel = document.createElement('div');
            timeLabel.className = 'time-label';
            timeLabel.textContent = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
            timeColumn.appendChild(timeLabel);
        }
        
        dayColumns.forEach(col => {
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

  // --- EVENT LISTENERS & HANDLERS ---
  function addEventListeners() {
    [prevWeekBtn, nextWeekBtn, todayBtn, miniCalPrevBtn, miniCalNextBtn].forEach(
      (btn) => btn.addEventListener('click', handleNavClick)
    );
    gridWrapper.addEventListener('mousedown', startDrag);
    gridWrapper.addEventListener('mouseover', duringDrag);
    document.addEventListener('mouseup', endDrag);
    saveEventBtn.addEventListener('click', saveEvent);
    deleteEventBtn.addEventListener('click', deleteEvent);
  }

  async function saveEvent() {
    if (selectedSlots.size === 0) return;

    const type = document.querySelector('input[name="event-type"]:checked').value;
    const isRecurring = recurringCheckbox.checked;
    const times = Array.from(selectedSlots)
      .map((s) => s.dataset.time)
      .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    const dayIndex = parseInt(selectionStartSlot.dataset.day);
    const dayName = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ][dayIndex];

    const newEvent = {
      id: Date.now().toString(), // Use string IDs for consistency
      start: times[0],
      end: getEndTime(times[times.length - 1]),
      type: type,
    };

    if (isRecurring) {
      userEvents.recurring[dayName] = (
        userEvents.recurring[dayName] || []
      ).concat(newEvent);
    } else {
      const dateString = new Date(
        getStartOfWeek(mainViewDate).setDate(
          getStartOfWeek(mainViewDate).getDate() + dayIndex
        )
      )
        .toISOString()
        .split('T')[0];
      userEvents.specific[dateString] = (
        userEvents.specific[dateString] || []
      ).concat(newEvent);
    }

    await updateUserCalendarOnServer();
    renderAll();
    clearSelection();
  }

  async function deleteEvent() {
    if (!activeEvent) return;

    const { id, isRecurring, dateString } = activeEvent;
    if (isRecurring) {
      if (recurringCheckbox.checked) {
        // Delete all instances
        Object.keys(userEvents.recurring).forEach(
          (day) =>
            (userEvents.recurring[day] = userEvents.recurring[day].filter(
              (ev) => ev.id !== id
            ))
        );
      } else {
        // Delete just this one instance by creating an exception
        (userEvents.exceptions[dateString] =
          userEvents.exceptions[dateString] || []).push(id);
      }
    } else {
      // Delete a specific, non-recurring event
      if (userEvents.specific[dateString]) {
        userEvents.specific[dateString] = userEvents.specific[
          dateString
        ].filter((ev) => ev.id !== id);
      }
    }

    await updateUserCalendarOnServer();
    renderAll();
    clearSelection();
  }

  // (Other event handlers like handleNavClick, startDrag, duringDrag, endDrag, etc., remain the same)
    function handleNavClick(e) {
        const id = e.currentTarget.id;
        if (id === 'prev-week-btn') mainViewDate.setDate(mainViewDate.getDate() - 7);
        if (id === 'next-week-btn') mainViewDate.setDate(mainViewDate.getDate() + 7);
        if (id === 'today-btn') mainViewDate = new Date();
        if (id.includes('mini-cal')) {
            miniCalDate.setMonth(miniCalDate.getMonth() + (id.includes('next') ? 1 : -1));
            renderMiniCalendar();
        } else {
            miniCalDate = new Date(mainViewDate);
            renderAll();
        }
    }

    function startDrag(e) {
        if (e.target.classList.contains('time-slot')) {
            isDragging = true;
            selectionStartSlot = e.target;
            clearSelection(true);
            updateSelection(e.target);
            updateSidebarWithSelection();
        }
    }

    function duringDrag(e) { if (isDragging && e.target.classList.contains('time-slot')) updateSelection(e.target); }
    function endDrag() { if(isDragging) { isDragging = false; updateSidebarWithSelection(); } }
    
    function handleEventClick(eventBlock) {
        clearSelection(false);
        document.querySelectorAll('.event-block.active-event').forEach(el => el.classList.remove('active-event'));
        eventBlock.classList.add('active-event');
        
        activeEvent = { 
            id: eventBlock.dataset.eventId,
            isRecurring: eventBlock.dataset.isRecurring === 'true',
            dateString: eventBlock.dataset.dateString 
        };
        updateSidebarUI('edit', findEventById(activeEvent.id));
    }

    function updateSidebarUI(mode, eventData = null) {
        if (mode === 'add') {
            activeEvent = null;
            deleteEventBtn.disabled = true;
            saveEventBtn.disabled = selectedSlots.size === 0;
            recurringLabelText.textContent = 'Apply to all weeks';
            if(selectedSlots.size === 0) sidebarTimeRange.textContent = 'Select a time on the calendar';
        } else if (mode === 'edit') {
            sidebarTimeRange.textContent = `${formatTime(eventData.start)} - ${formatTime(eventData.end)}`;
            deleteEventBtn.disabled = false;
            saveEventBtn.disabled = true;
            recurringCheckbox.checked = activeEvent.isRecurring;
            recurringLabelText.textContent = activeEvent.isRecurring ? 'Affect all recurring' : 'Affect this instance only';
            document.querySelector(`input[name="event-type"][value="${eventData.type}"]`).checked = true;
        }
    }
    
    function updateSelection(endSlot) {
        clearSelection(false);
        const allSlots = Array.from(document.querySelectorAll(`.time-slot[data-day="${selectionStartSlot.dataset.day}"]`));
        const startIndex = allSlots.indexOf(selectionStartSlot);
        const endIndex = allSlots.indexOf(endSlot);
        if (startIndex === -1 || endIndex === -1) return;
        
        const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
        for (let i = min; i <= max; i++) {
            allSlots[i].classList.add('selection-active');
            selectedSlots.add(allSlots[i]);
        }
        if (selectedSlots.size > 0) updateSidebarWithSelection();
    }

    function updateSidebarWithSelection() {
        saveEventBtn.disabled = selectedSlots.size === 0;
        if (selectedSlots.size === 0) return;
        const times = Array.from(selectedSlots).map(s => s.dataset.time).sort((a,b) => timeToMinutes(a) - timeToMinutes(b));
        sidebarTimeRange.textContent = `${formatTime(times[0])} - ${formatTime(getEndTime(times[times.length - 1]))}`;
    }
    
    function clearSelection(resetSidebar = true) {
        selectedSlots.forEach(s => s.classList.remove('selection-active'));
        selectedSlots.clear();
        document.querySelectorAll('.event-block.active-event').forEach(el => el.classList.remove('active-event'));
        if (resetSidebar) updateSidebarUI('add');
    }

    function findEventById(id) {
        for (const type of ['lectures', 'recurring', 'specific']) {
            for (const key in userEvents[type]) {
                const event = userEvents[type][key].find(ev => ev.id === id);
                if (event) return event;
            }
        }
        return null;
    }

  // --- UTILITY FUNCTIONS (Unchanged) ---
  const getEndTime = (startTimeStr) => {
    const d = new Date();
    const [h, m] = startTimeStr.split(':');
    d.setHours(parseInt(h), parseInt(m) + 30);
    return `${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes()
    ).padStart(2, '0')}`;
  };
  const timeToMinutes = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };
  const formatTime = (timeStr, showMins = true) => {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}${showMins ? `:${m}` : ''} ${ampm}`;
  };
  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    d.setHours(0, 0, 0, 0);
    return new Date(d.setDate(diff));
  };

  initializeCalendar();
});