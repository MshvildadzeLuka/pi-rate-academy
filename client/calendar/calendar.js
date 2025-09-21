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
    isRecurring: false
  };

  const elements = {
    timeColumn: document.getElementById('time-column'),
    dayColumns: document.querySelectorAll('.day-column'),
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
  };

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
      await fetchUserGroups();
      await fetchEvents();
      generateTimeSlots();
      renderAll();
      addEventListeners();

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
      document.body.classList.add('loading');

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

  async function saveEvent() {
    if (state.selectedSlots.size === 0) return;

    const type = document.querySelector('input[name="event-type"]:checked').value;
    const isRecurring = elements.recurringCheckbox.checked;

    const slots = Array.from(state.selectedSlots).sort((a, b) => timeToMinutes(a.dataset.time) - timeToMinutes(b.dataset.time));
    const startSlot = slots[0];
    const endSlot = slots[slots.length - 1];

    const dayIndex = parseInt(startSlot.dataset.day);
    const dayOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][dayIndex];

    const payload = {
      type,
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

    for (let hour = 8; hour < 22; hour++) {
      const timeLabel = document.createElement('div');
      timeLabel.className = 'time-label';
      timeLabel.textContent = formatTime(`${hour}:00`, false);
      elements.timeColumn.appendChild(timeLabel);
    }

    elements.dayColumns.forEach((column, dayIndex) => {
      column.innerHTML = '';
      column.dataset.day = dayIndex;
      for (let slot = 0; slot < 28; slot++) {
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
    setupMobileLayout();
  }

  function setupMobileLayout() {
    // Determine current day of the week
    const today = new Date();
    const dayIndex = (today.getDay() + 6) % 7;
  
    // Update mobile navigation text to the current day
    if (elements.dayHeaders[dayIndex]) {
        elements.mobileViewText.textContent = elements.dayHeaders[dayIndex].querySelector('.day-name').textContent;
    }
  
    // Set the initial active day on mobile to today
    elements.allDayColumns.forEach((col, index) => {
      col.classList.toggle('active', index === dayIndex);
    });
    elements.dayHeaders.forEach((header, index) => {
      header.classList.toggle('active', index === dayIndex);
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

    for (let i = 0; i < (firstDay + 6) % 7; i++) {
      const day = document.createElement('div');
      day.className = 'mini-calendar-day other-month';
      elements.miniCalDaysGrid.appendChild(day);
    }

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
          if (event.dayOfWeek) {
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

    elements.miniCalPrevBtn.addEventListener('click', () => {
      state.miniCalDate.setMonth(state.miniCalDate.getMonth() - 1);
      renderMiniCalendar();
    });

    elements.miniCalNextBtn.addEventListener('click', () => {
      state.miniCalDate.setMonth(state.miniCalDate.getMonth() + 1);
      renderMiniCalendar();
    });

    elements.saveEventBtn.addEventListener('click', saveEvent);
    elements.deleteEventBtn.addEventListener('click', () => {
      if (state.activeEvent) deleteEvent(state.activeEvent._id);
    });

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
    
    // Fix: This event listener was not present in the previous code.
    // It's essential for the user to be able to click an event and have it update the sidebar.
    elements.dayColumns.forEach(col => {
      col.addEventListener('click', e => {
        if (e.target.classList.contains('event-block')) {
          const eventId = e.target.dataset.eventId;
          const eventData = state.allEvents.find(event => event._id === eventId);
          if (eventData) {
            handleEventClick(eventData);
          }
        }
      });
    });

    document.querySelectorAll('.time-slot').forEach(slot => {
      slot.addEventListener('mousedown', startSelection);
      slot.addEventListener('mouseenter', continueSelection);
      slot.addEventListener('touchstart', handleTouchStart, { passive: true });
    });

    document.addEventListener('mouseup', endSelection);
    document.addEventListener('touchend', endSelection);
    document.addEventListener('touchmove', handleTouchMove, { passive: true });

    elements.eventForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveEvent();
    });
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
  
    if (diffY > diffX * 2) { 
      endSelection();
      return;
    }
  
    if (diffX > 50) { 
      if (currentX < touchStartX) {
        elements.nextWeekBtn.click();
      } else {
        elements.prevWeekBtn.click();
      }
      touchStartX = currentX; 
      return;
    }
  
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

      elements.recurringLabelText.textContent = state.activeEvent.isRecurring ?
        'Change all recurring events' :
        'Change only this event';

      document.querySelector(`input[name="event-type"][value="${eventData.type}"]`).checked = true;
    }
  }

  function updateSelection(endSlot) {
    if (!state.selectionStartSlot || endSlot.dataset.day !== state.selectionStartSlot.dataset.day) return;

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
      if (elements.recurringCheckbox) elements.recurringCheckbox.parentElement.classList.add('hidden');
      return;
    }

    if (state.activeEvent) {
      if (elements.recurringCheckbox) {
        elements.recurringCheckbox.checked = state.activeEvent.isRecurring;
        elements.recurringCheckbox.parentElement.classList.remove('hidden');
      }
    } else {
      if (elements.recurringCheckbox) {
        elements.recurringCheckbox.checked = false;
        elements.recurringCheckbox.parentElement.classList.remove('hidden');
      }
    }

    if (state.activeEvent && !hasSelection) return;

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
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = getStartOfWeek(state.mainViewDate);
    const endOfWeek = getEndOfWeek(state.mainViewDate);

    if (now < startOfWeek || now > endOfWeek) {
      elements.currentTimeIndicator.style.display = 'none';
      return;
    }

    const timeInMinutes = now.getHours() * 60 + now.getMinutes();

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

  initializeCalendar();
});
