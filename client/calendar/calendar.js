document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = '/api';

  let state = {
    mainViewDate: new Date(),
    miniCalDate: new Date(),
    allEvents: [],
    isDragging: false,
    selectionStartSlot: null,
    selectedSlots: new Set(),
    activeEvent: null,
    userGroups: [],
    isRecurring: false,
    currentMobileDay: 0
  };

  const elements = {
    timeColumn: document.getElementById('time-column'),
    dayColumns: document.querySelectorAll('.day-column'),
    dayHeaders: document.querySelectorAll('.day-column-header'),
    weekDisplay: document.getElementById('current-week-display'),
    prevWeekBtn: document.getElementById('prev-week-btn'),
    nextWeekBtn: document.getElementById('next-week-btn'),
    todayBtn: document.getElementById('today-btn'),
    miniCalHeader: document.getElementById('mini-cal-month-year'),
    miniCalDaysGrid: document.getElementById('mini-calendar-days'),
    miniCalPrevBtn: document.getElementById('mini-cal-prev-month'),
    miniCalNextBtn: document.getElementById('mini-cal-next-month'),
    sidebarTimeRange: document.getElementById('sidebar-time-range'),
    saveEventBtn: document.getElementById('save-event-btn'),
    deleteEventBtn: document.getElementById('delete-event-btn'),
    recurringCheckbox: document.getElementById('recurring-event-checkbox'),
    recurringLabelText: document.getElementById('recurring-label-text'),
    gridWrapper: document.querySelector('.calendar-grid-wrapper'),
    currentTimeIndicator: document.getElementById('current-time-indicator'),
    eventForm: document.getElementById('event-form'),
    mobileDayNav: document.getElementById('mobile-day-nav'),
    mobileDayNavBtns: document.querySelectorAll('.mobile-day-nav-btn'),
    addEventFab: document.getElementById('add-event-fab'),
    eventModalBackdrop: document.getElementById('event-modal-backdrop'),
    mobileEventModal: document.getElementById('mobile-event-modal'),
    closeModalBtn: document.querySelector('.close-modal-btn'),
    mobileEventForm: document.getElementById('mobile-event-form'),
    mobileSaveBtn: document.getElementById('mobile-save-btn'),
    mobileTimeRange: document.getElementById('mobile-time-range'),
    manualTimeInputs: document.getElementById('manual-time-inputs'),
    manualStartTime: document.getElementById('manual-start-time'),
    manualEndTime: document.getElementById('manual-end-time'),
    eventTitleInput: document.getElementById('event-title-input'),
    mobileEventTypeSelect: document.getElementById('mobile-event-type-select'),
    mobileEventTitleInput: document.getElementById('mobile-event-title-input'),
    mobileRecurringCheckbox: document.getElementById('mobile-recurring-checkbox')
  };

  // Show notification toast
  function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }

  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('piRateToken');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API error: ${response.status}`);
      }

      return response.status === 204 ? null : response.json();
    } catch (error) {
      console.error('API request failed:', error);
      showNotification('Network error. Please try again.', 'error');
      throw error;
    }
  }

  async function initializeCalendar() {
    try {
      // FIX: Wait for events to be fetched before rendering
      await fetchUserGroups();
      await fetchEvents();
      generateTimeSlots();
      renderAll();
      addEventListeners();

      // Update time indicator every minute
      updateCurrentTimeIndicator();
      setInterval(updateCurrentTimeIndicator, 60000);
    } catch (error) {
      console.error('Calendar initialization failed:', error);
      showNotification('Calendar initialization failed', 'error');
    }
  }

  async function fetchUserGroups() {
    try {
      const groupsData = await apiFetch('/groups/my-groups');
      state.userGroups = groupsData || [];
    } catch (error) {
      console.error('Failed to load user groups:', error);
      state.userGroups = [];
    }
  }

  async function fetchEvents() {
    const startOfWeek = getStartOfWeek(state.mainViewDate);
    const endOfWeek = getEndOfWeek(startOfWeek);

    try {
      // Show loading state
      document.body.classList.add('loading');
      // FIX: The backend now handles fetching both personal events and lectures in one call
      const eventsResponse = await apiFetch(
        `/calendar-events/my-schedule?start=${startOfWeek.toISOString()}&end=${endOfWeek.toISOString()}`
      );

      state.allEvents = eventsResponse?.data || [];
    } catch (error) {
      console.error('Failed to load events:', error);
      state.allEvents = [];
    } finally {
      document.body.classList.remove('loading');
    }
  }

  async function saveEvent(isMobile = false) {
    let selectedSlots = state.selectedSlots;
    let type, title, isRecurring;

    if (isMobile) {
      // For mobile, get values from modal form
      type = elements.mobileEventTypeSelect.value;
      title = elements.mobileEventTitleInput.value || `${type} time`;
      isRecurring = elements.mobileRecurringCheckbox.checked;

      // For mobile, we need to create selectedSlots from manual inputs
      if (!state.selectedSlots.size) {
        const startTime = elements.manualStartTime.value;
        const endTime = elements.manualEndTime.value;

        if (!startTime || !endTime) {
          showNotification('Please select a time range', 'error');
          return;
        }

        // Convert time inputs to selected slots
        const dayIndex = state.currentMobileDay;
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);

        // Find all slots in the selected time range
        const allSlots = Array.from(document.querySelectorAll(`.time-slot[data-day="${dayIndex}"]`));
        allSlots.forEach(slot => {
          const slotTime = slot.dataset.time;
          const slotMinutes = timeToMinutes(slotTime);

          if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
            state.selectedSlots.add(slot);
          }
        });

        selectedSlots = state.selectedSlots;
      }
    } else {
      // For desktop, get values from sidebar form
      type = document.querySelector('input[name="event-type"]:checked').value;
      title = elements.eventTitleInput.value || `${type} time`;
      isRecurring = elements.recurringCheckbox.checked;
    }

    if (selectedSlots.size === 0) {
      showNotification('Please select a time range', 'error');
      return;
    }

    const slots = Array.from(selectedSlots).sort((a, b) => timeToMinutes(a.dataset.time) - timeToMinutes(b.dataset.time));
    const startSlot = slots[0];
    const endSlot = slots[slots.length - 1];

    const dayIndex = parseInt(startSlot.dataset.day);
    const dayOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][dayIndex];

    const payload = {
      type,
      title,
      isRecurring,
      groupId: state.userGroups.length > 0 ? state.userGroups[0]._id : null
    };

    if (isRecurring) {
      payload.dayOfWeek = dayOfWeek;
      payload.recurringStartTime = startSlot.dataset.time;
      payload.recurringEndTime = getEndTime(endSlot.dataset.time);
    } else {
      const startOfWeek = getStartOfWeek(state.mainViewDate);
      const eventDate = new Date(startOfWeek);
      eventDate.setDate(eventDate.getDate() + dayIndex);
      const startTime = new Date(eventDate);
      const [startH, startM] = startSlot.dataset.time.split(':').map(Number);
      startTime.setHours(startH, startM, 0, 0);

      const endTime = new Date(eventDate);
      const [endH, endM] = getEndTime(endSlot.dataset.time).split(':').map(Number);
      endTime.setHours(endH, endM, 0, 0);

      payload.startTime = startTime.toISOString();
      payload.endTime = endTime.toISOString();
    }

    try {
      const response = await apiFetch('/calendar-events', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      state.allEvents.push(response.data);
      clearSelection();
      renderEventsForWeek();

      // Close modal if on mobile
      if (isMobile) {
        closeEventModal();
      }

      showNotification('Event saved successfully!', 'success');
    } catch (error) {
      console.error('Failed to save event:', error);
      showNotification('Failed to save event: ' + error.message, 'error');
    }
  }

  async function deleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event?')) return;

    const event = state.allEvents.find(e => e._id === eventId);
    if (!event) return;

    const isRecurring = elements.recurringCheckbox.checked;

    try {
      await apiFetch(`/calendar-events/${eventId}`, {
        method: 'DELETE',
        body: JSON.stringify({
          dateString: event.startTime ? new Date(event.startTime).toISOString().split('T')[0] : null,
          deleteAllRecurring: isRecurring
        })
      });

      state.allEvents = state.allEvents.filter(e => e._id !== eventId);
      clearSelection();
      renderEventsForWeek();
      showNotification('Event deleted successfully!', 'success');
    } catch (error) {
      console.error('Failed to delete event:', error);
      showNotification('Failed to delete event: ' + error.message, 'error');
    }
  }

  function generateTimeSlots() {
    elements.timeColumn.innerHTML = '';
    elements.dayColumns.forEach((column, dayIndex) => {
        column.innerHTML = '';
        column.dataset.day = dayIndex;
    });

    for (let hour = 8; hour < 22; hour++) {
      const timeLabel = document.createElement('div');
      timeLabel.className = 'time-label';
      timeLabel.textContent = formatTime(`${hour}:00`, false);
      elements.timeColumn.appendChild(timeLabel);
    }

    elements.dayColumns.forEach((column, dayIndex) => {
      for (let slot = 0; slot < 28; slot++) {
        const hour = 8 + Math.floor(slot / 2);
        const minute = (slot % 2) * 30;
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
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
    setupMobileLayout();
    checkMobileView();
  }

  function setupMobileLayout() {
    // Set initial mobile day
    state.currentMobileDay = 0;

    // Show/hide mobile day navigation based on screen size
    checkMobileView();

    // Set up mobile day navigation
    elements.mobileDayNavBtns.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        setActiveMobileDay(index);
      });
    });
  }

  function checkMobileView() {
    const isMobile = window.innerWidth <= 992;

    if (isMobile) {
      elements.mobileDayNav.classList.remove('hidden');
      elements.addEventFab.classList.remove('hidden');

      // Show only the active day column
      setActiveMobileDay(state.currentMobileDay);
    } else {
      elements.mobileDayNav.classList.add('hidden');
      elements.addEventFab.classList.add('hidden');

      // Show all day columns
      elements.dayHeaders.forEach(header => {
        header.classList.add('active');
      });
      elements.dayColumns.forEach(column => {
        column.classList.add('active');
      });
    }
  }

  function setActiveMobileDay(dayIndex) {
    state.currentMobileDay = dayIndex;

    // Update mobile navigation buttons
    elements.mobileDayNavBtns.forEach((btn, index) => {
      if (index === dayIndex) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Show only the selected day column
    elements.dayHeaders.forEach((header, index) => {
      if (index === dayIndex) {
        header.classList.add('active');
      } else {
        header.classList.remove('active');
      }
    });

    elements.dayColumns.forEach((column, index) => {
      if (index === dayIndex) {
        column.classList.add('active');
      } else {
        column.classList.remove('active');
      }
    });
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

    elements.dayHeaders.forEach((header, index) => {
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

      // Check if this day is today
      if (currentDay.toDateString() === today.toDateString()) {
        day.classList.add('current-day');
      }

      // Check if this day is in the currently selected week
      if (currentDay >= startOfWeek && currentDay <= new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000)) {
        day.classList.add('in-selected-week');
      }

      // Add click event to select this day's week
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

    // Remove existing event blocks
    document.querySelectorAll('.event-block').forEach(el => el.remove());

    // Render events for each day
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const currentDayDate = new Date(startOfWeek);
      currentDayDate.setDate(currentDayDate.getDate() + dayIndex);
      const dayStr = currentDayDate.toISOString().split('T')[0];
      const dayColumn = elements.dayColumns[dayIndex];

      state.allEvents.forEach(event => {
        // Ignore deleted instances of recurring events
        if (event.title && event.title.startsWith('DELETED:')) return;

        let render = false;
        let isException = false;
        let startTimeStr = event.startTimeLocal;
        let endTimeStr = event.endTimeLocal;

        if (event.isRecurring) {
          if (event.dayOfWeek) { // From CalendarEvent model
            if (event.dayOfWeek === dayNames[dayIndex]) {
              isException = exceptions.some(exc =>
                exc.exceptionDate === dayStr && exc.title === `DELETED: ${event._id}`
              );
              if (!isException) {
                render = true;
                startTimeStr = ensureTimeFormat(event.recurringStartTime || startTimeStr);
                endTimeStr = ensureTimeFormat(event.recurringEndTime || endTimeStr);
              }
            }
          } else if (event.type === 'lecture' && event.recurrenceRule) { // From Lecture model
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
    const top = ((startMinutes - 8 * 60) / 30) * slotHeight;
    const height = (durationMinutes / 30) * slotHeight - 2;

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
    elements.saveEventBtn.addEventListener('click', () => saveEvent(false));
    elements.deleteEventBtn.addEventListener('click', () => {
      if (state.activeEvent) deleteEvent(state.activeEvent._id);
    });

    // Recurring checkbox change
    elements.recurringCheckbox.addEventListener('change', () => {
      if (state.activeEvent) {
        elements.recurringLabelText.textContent = elements.recurringCheckbox.checked ?
          'Change all recurring events' :
          'Change only this event';
      } else {
        elements.recurringLabelText.textContent = elements.recurringCheckbox.checked ?
          'Apply to all weeks' :
          'Apply only to this week';
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
    document.addEventListener('touchmove', handleTouchMove, { passive: true });

    // Manual time input toggle
    elements.sidebarTimeRange.addEventListener('click', toggleManualTimeInput);

    // Manual time input change
    elements.manualStartTime.addEventListener('change', updateSelectionFromManualTime);
    elements.manualEndTime.addEventListener('change', updateSelectionFromManualTime);

    // Mobile event FAB
    elements.addEventFab.addEventListener('click', openEventModal);

    // Modal event handling
    elements.closeModalBtn.addEventListener('click', closeEventModal);
    elements.eventModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.eventModalBackdrop) {
        closeEventModal();
      }
    });

    // Mobile form submission
    elements.mobileEventForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveEvent(true);
    });

    // Window resize for responsive behavior
    window.addEventListener('resize', checkMobileView);
  }

  function toggleManualTimeInput() {
    elements.manualTimeInputs.classList.toggle('hidden');

    if (!elements.manualTimeInputs.classList.contains('hidden')) {
      // If manual inputs are shown, clear any existing selection
      clearSelection(false);
    }
  }

  function updateSelectionFromManualTime() {
    const startTime = elements.manualStartTime.value;
    const endTime = elements.manualEndTime.value;

    if (!startTime || !endTime) return;

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    if (startMinutes >= endMinutes) {
      showNotification('End time must be after start time', 'error');
      return;
    }

    // Clear previous selection
    clearSelection(false);

    // For mobile, use the currently selected day
    const dayIndex = state.currentMobileDay;

    // Find all slots in the selected time range
    const allSlots = Array.from(document.querySelectorAll(`.time-slot[data-day="${dayIndex}"]`));
    allSlots.forEach(slot => {
      const slotTime = slot.dataset.time;
      const slotMinutes = timeToMinutes(slotTime);

      if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
        slot.classList.add('selection-active');
        state.selectedSlots.add(slot);
      }
    });

    // Update sidebar display
    elements.sidebarTimeRange.textContent = `${formatTime(startTime)} - ${formatTime(endTime)}`;
    elements.saveEventBtn.disabled = false;
  }

  function openEventModal() {
    elements.eventModalBackdrop.classList.remove('hidden');

    // Set default values in modal
    if (state.selectedSlots.size > 0) {
      const slots = Array.from(state.selectedSlots).sort((a, b) => timeToMinutes(a.dataset.time) - timeToMinutes(b.dataset.time));
      const startSlot = slots[0];
      const endSlot = slots[slots.length - 1];

      const startTime = startSlot.dataset.time;
      const endTime = getEndTime(endSlot.dataset.time);

      elements.mobileTimeRange.textContent = `${formatTime(startTime)} - ${formatTime(endTime)}`;
    } else {
      elements.mobileTimeRange.textContent = 'Select time on calendar';
    }
  }

  function closeEventModal() {
    elements.eventModalBackdrop.classList.add('hidden');
  }

  // Touch handling for mobile
  let touchStartX = 0;
  let touchStartY = 0;

  function handleTouchStart(e) {
    if (e.touches.length > 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    startSelection(e);
  }

  function handleTouchMove(e) {
    if (e.touches.length > 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = Math.abs(touchStartX - currentX);
    const diffY = Math.abs(touchStartY - currentY);

    // Check if it's a drag gesture rather than a selection attempt
    if (diffY > diffX * 2) {
      endSelection();
      return;
    }

    if (diffX > 50) { // Horizontal swipe detected
      if (currentX < touchStartX) {
        elements.nextWeekBtn.click();
      } else {
        elements.prevWeekBtn.click();
      }
      touchStartX = currentX; // Reset to prevent multiple rapid swipes
      return;
    }

    // Continue selection if it's a vertical drag
    if (state.isDragging) {
      const targetSlot = document.elementFromPoint(currentX, currentY)?.closest('.time-slot');
      if (targetSlot) {
        continueSelection({ target: targetSlot });
      }
    }
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
    const targetSlot = e.type.includes('touch') ?
      document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)?.closest('.time-slot') :
      e.target.closest('.time-slot');

    if (!targetSlot) return;

    clearSelection();
    state.selectionStartSlot = targetSlot;
    updateSelection(targetSlot);
  }

  function continueSelection(e) {
    if (!state.isDragging) return;

    const targetSlot = e.type.includes('touch') ?
      document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)?.closest('.time-slot') :
      e.target.closest('.time-slot');

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
        elements.eventTitleInput.value = '';
      }
    } else if (mode === 'edit') {
      const start = eventData.isRecurring ?
        eventData.recurringStartTime :
        new Date(eventData.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      const end = eventData.isRecurring ?
        eventData.recurringEndTime :
        new Date(eventData.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      elements.sidebarTimeRange.textContent = `${formatTime(start)} - ${formatTime(end)}`;
      elements.deleteEventBtn.disabled = false;
      elements.saveEventBtn.disabled = true;
      elements.recurringCheckbox.checked = state.activeEvent.isRecurring;
      elements.eventTitleInput.value = eventData.title || '';

      elements.recurringLabelText.textContent = state.activeEvent.isRecurring ?
        'Change all recurring events' :
        'Change only this event';

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
    const hasSelection = state.selectedSlots.size > 0;

    if (elements.saveEventBtn) elements.saveEventBtn.disabled = !hasSelection;
    if (elements.deleteEventBtn) elements.deleteEventBtn.disabled = !state.activeEvent;

    if (!hasSelection && !state.activeEvent) {
      if (elements.sidebarTimeRange) elements.sidebarTimeRange.textContent = 'Select time on calendar';
      return;
    }

    if (state.activeEvent) {
      // Don't override edit view
      return;
    }

    const times = Array.from(state.selectedSlots)
      .map(s => s.dataset.time)
      .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

    if (elements.sidebarTimeRange && times.length > 0) {
      elements.sidebarTimeRange.textContent =
        `${formatTime(times[0])} - ${formatTime(minutesToTime(timeToMinutes(times[times.length - 1]) + 30))}`;
    }
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

  const minutesToTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = getStartOfWeek(state.mainViewDate);
    const endOfWeek = getEndOfWeek(startOfWeek);

    // Hide indicator if current time is not in the displayed week
    if (now < startOfWeek || now > endOfWeek) {
      elements.currentTimeIndicator.style.display = 'none';
      return;
    }

    const timeInMinutes = now.getHours() * 60 + now.getMinutes();

    // Hide indicator if outside calendar hours (8am-9:59pm)
    if (timeInMinutes < 8 * 60 || timeInMinutes >= 22 * 60) {
      elements.currentTimeIndicator.style.display = 'none';
      return;
    }

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
