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
    userGroups: []
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
  };

  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('piRateToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'API შეცდომა მოხდა');
    }
    return response.status === 204 ? null : response.json();
  }

  async function initializeCalendar() {
    try {
      await fetchUserGroups();
      await fetchEvents();
      generateTimeSlots();
      renderAll();
      addEventListeners();
    } catch (error) {
      console.error('კალენდრის ჩატვირთვა ვერ მოხერხდა:', error);
      alert('კალენდრის ჩატვირთვის შეცდომა: ' + error.message);
    }
  }

  async function fetchUserGroups() {
    try {
      const groupsData = await apiFetch('/groups/my-groups');
      state.userGroups = groupsData || [];
    } catch (error) {
      console.error('მომხმარებლის ჯგუფების ჩატვირთვა ვერ მოხერხდა:', error);
      state.userGroups = [];
    }
  }

  async function fetchEvents() {
    const startOfWeek = getStartOfWeek(state.mainViewDate);
    const endOfWeek = getEndOfWeek(startOfWeek);
    
    try {
      const personalEventsResponse = await apiFetch(
        `/calendar-events/my-schedule?start=${startOfWeek.toISOString()}&end=${endOfWeek.toISOString()}`
      );
      const personalEvents = personalEventsResponse?.data || [];
      
      let groupLectures = [];
      for (const group of state.userGroups) {
        try {
          const lecturesResponse = await apiFetch(
            `/lectures/group/${group._id}?start=${startOfWeek.toISOString()}&end=${endOfWeek.toISOString()}`
          );
          groupLectures = [...groupLectures, ...(lecturesResponse?.data || [])];
        } catch (error) {
          console.error(`ლექციების ჩატვირთვა ვერ მოხერხდა ჯგუფისთვის ${group._id}:`, error);
        }
      }
      
      const formattedLectures = groupLectures.map(lecture => ({
        _id: lecture._id,
        title: lecture.title,
        type: 'lecture',
        startTime: lecture.startTime,
        endTime: lecture.endTime,
        groupId: lecture.assignedGroup?._id || lecture.assignedGroup,
        groupName: lecture.assignedGroup?.name || 'უცნობი ჯგუფი',
        isRecurring: lecture.isRecurring,
        recurrenceRule: lecture.recurrenceRule,
        startTimeLocal: new Date(lecture.startTime).toLocaleTimeString('en-GB', { 
          hour: '2-digit', minute: '2-digit', hour12: false 
        }),
        endTimeLocal: new Date(lecture.endTime).toLocaleTimeString('en-GB', { 
          hour: '2-digit', minute: '2-digit', hour12: false 
        })
      }));
      
      state.allEvents = [...personalEvents, ...formattedLectures];
    } catch (error) {
      console.error('მოვლენების ჩატვირთვა ვერ მოხერხდა:', error);
      state.allEvents = [];
    }
  }

  function getEndOfWeek(start) {
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return end;
  }

  async function saveEvent() {
    if (state.selectedSlots.size === 0) return;

    const type = document.querySelector('input[name="event-type"]:checked').value;
    const isRecurring = elements.recurringCheckbox.checked;

    const slots = Array.from(state.selectedSlots).sort((a, b) => timeToMinutes(a.dataset.time) - timeToMinutes(b.dataset.time));
    const startSlot = slots[0];
    const endSlot = slots[slots.length - 1];

    const dayIndex = parseInt(startSlot.dataset.day);
    const dayName = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][dayIndex];

    const payload = { type, isRecurring };

    if (isRecurring) {
      payload.dayOfWeek = dayName;
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
      const { data } = await apiFetch('/calendar-events', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.allEvents.push(data);
      clearSelection();
      renderEventsForWeek();
    } catch (error) {
      console.error('მოვლენის შენახვა ვერ მოხერხდა:', error);
      alert('მოვლენის შენახვის შეცდომა: ' + error.message);
    }
  }

  async function deleteEvent(eventId) {
    if (!confirm('დარწმუნებული ხარ, რომ გსურს ამ მოვლენის წაშლა?')) return;

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
    } catch (error) {
      console.error('მოვლენის წაშლა ვერ მოხერხდა:', error);
      alert('მოვლენის წაშლის შეცდომა: ' + error.message);
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
    renderMiniCalendar();
    renderEventsForWeek();
    updateSidebarUI('add');
  }

  function renderWeekDisplay() {
    const start = getStartOfWeek(state.mainViewDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    elements.weekDisplay.textContent = `${start.toLocaleDateString('ka-GE', { month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('ka-GE', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }

  function renderMiniCalendar() {
    const month = state.miniCalDate.getMonth();
    const year = state.miniCalDate.getFullYear();
    elements.miniCalHeader.textContent = `${new Date(year, month).toLocaleString('ka-GE', { month: 'long' })} ${year}`;
    elements.miniCalDaysGrid.innerHTML = '';
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) {
      const day = document.createElement('div');
      day.className = 'mini-calendar-day other-month';
      elements.miniCalDaysGrid.appendChild(day);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const day = document.createElement('div');
      day.className = 'mini-calendar-day';
      day.textContent = d;
      if (d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear()) {
        day.classList.add('current-day');
      }
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

    document.querySelectorAll('.time-slot').forEach(slot => {
      slot.addEventListener('mousedown', startSelection);
      slot.addEventListener('mouseenter', continueSelection);
    });

    document.addEventListener('mouseup', endSelection);
  }

  function startSelection(e) {
    if (state.activeEvent) return;
    clearSelection(false);
    state.isDragging = true;
    state.selectionStartSlot = e.target;
    updateSelection(e.target);
  }

  function continueSelection(e) {
    if (!state.isDragging) return;
    updateSelection(e.target);
  }

  function endSelection() {
    state.isDragging = false;
  }

  function handleEventClick(eventData) {
    clearSelection(false);
    state.activeEvent = eventData;
    updateSidebarUI('edit', eventData);
    document.querySelector(`[data-event-id="${eventData._id}"]`).classList.add('active-event');
  }

  function updateSidebarUI(mode = 'add', eventData = null) {
    if (mode === 'add') {
      elements.saveEventBtn.disabled = false;
      elements.deleteEventBtn.disabled = true;
      elements.recurringCheckbox.checked = false;
      elements.recurringLabelText.textContent = 'გამოყენება ყველა კვირაში';
      if(state.selectedSlots.size === 0) elements.sidebarTimeRange.textContent = 'აირჩიე დრო კალენდარზე';
    } else if (mode === 'edit') {
      const start = eventData.isRecurring ? eventData.recurringStartTime : new Date(eventData.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const end = eventData.isRecurring ? eventData.recurringEndTime : new Date(eventData.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      elements.sidebarTimeRange.textContent = `${formatTime(start)} - ${formatTime(end)}`;
      elements.deleteEventBtn.disabled = false;
      elements.saveEventBtn.disabled = true;
      elements.recurringCheckbox.checked = state.activeEvent.isRecurring;
      elements.recurringLabelText.textContent = state.activeEvent.isRecurring ? 'ყველა განმეორებადი მოვლენის შეცვლა' : 'მხოლოდ ამ მოვლენის შეცვლა';
      document.querySelector(`input[name="event-type"][value="${eventData.type}"]`).checked = true;
    }
  }

  function updateSelection(endSlot) {
    if (endSlot.dataset.day !== state.selectionStartSlot.dataset.day) return;
    clearSelection(false);
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
    if (state.selectedSlots.size === 0) return;
    const times = Array.from(state.selectedSlots).map(s => s.dataset.time).sort((a,b) => timeToMinutes(a) - timeToMinutes(b));
    elements.sidebarTimeRange.textContent = `${formatTime(times[0])} - ${formatTime(getEndTime(times[times.length - 1]))}`;
  }
  
  function clearSelection(resetSidebar = true) {
    state.selectedSlots.forEach(s => s.classList.remove('selection-active'));
    state.selectedSlots.clear();
    document.querySelectorAll('.event-block.active-event').forEach(el => el.classList.remove('active-event'));
    state.activeEvent = null;
    if (resetSidebar) updateSidebarUI('add');
  }

  const getEndTime = (startTimeStr) => {
    const d = new Date(); const [h, m] = startTimeStr.split(':'); d.setHours(parseInt(h), parseInt(m) + 30);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const timeToMinutes = (timeStr) => {
    if(!timeStr || !timeStr.includes(':')) return 0; const [h, m] = timeStr.split(':').map(Number); return h * 60 + m;
  };
  const minutesToTime = (minutes) => {
      const h = Math.floor(minutes / 60); const m = minutes % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  
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
    const d = new Date(date); d.setHours(0, 0, 0, 0); const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.setDate(diff));
  };

  initializeCalendar();
});
