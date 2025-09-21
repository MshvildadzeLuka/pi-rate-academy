// client/calendar/calendar.js

document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = '/api';

  // State Management
  let state = {
    mainViewDate: new Date(),
    miniCalDate: new Date(),
    allEvents: [],
    isDragging: false,
    selectionStartSlot: null,
    selectedSlots: new Set(),
    activeEvent: null,
    userGroups: [],
    isMobile: window.innerWidth <= 767
  };

  // DOM Element Selectors
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
    eventForm: document.getElementById('event-form'),
    eventTitleInput: document.getElementById('event-title-input'),
    dayHeaders: document.querySelectorAll('.day-column-header'),
    allDayColumns: document.querySelectorAll('.day-column'),
    mobileNav: document.getElementById('mobile-nav'),
    addEventFab: document.getElementById('add-event-fab'),
    eventModalBackdrop: document.getElementById('event-modal-backdrop'),
    mobileEventForm: document.getElementById('mobile-event-form'),
    manualTimeInputs: document.getElementById('manual-time-inputs'),
    manualStartTime: document.getElementById('manual-start-time'),
    manualEndTime: document.getElementById('manual-end-time')
  };

  // Utility Functions
  const showNotification = (message, type = 'info') => {
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

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const timeParts = timeStr.toString().split(':');
    const h = parseInt(timeParts[0]);
    const m = timeParts[1] ? parseInt(timeParts[1]) : 0;
    if (isNaN(h) || isNaN(m)) return '';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

  // API Calls
  const apiFetch = async (endpoint, options = {}) => {
    const token = localStorage.getItem('piRateToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
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
  };

  const fetchUserGroups = async () => {
    try {
      const groupsData = await apiFetch('/groups/my-groups');
      state.userGroups = groupsData || [];
    } catch (error) {
      state.userGroups = [];
    }
  };

  const fetchEvents = async () => {
    const startOfWeek = getStartOfWeek(state.mainViewDate);
    const endOfWeek = getEndOfWeek(startOfWeek);
    try {
      document.body.classList.add('loading');
      const eventsResponse = await apiFetch(`/calendar-events/my-schedule?start=${startOfWeek.toISOString()}&end=${endOfWeek.toISOString()}`);
      state.allEvents = eventsResponse?.data || [];
    } catch (error) {
      state.allEvents = [];
    } finally {
      document.body.classList.remove('loading');
    }
  };

  // Rendering Functions
  const generateTimeSlots = () => {
    elements.timeColumn.innerHTML = '';
    elements.dayColumns.forEach(col => col.innerHTML = '');

    for (let hour = 8; hour < 22; hour++) {
      const timeLabel = document.createElement('div');
      timeLabel.className = 'time-label';
      timeLabel.textContent = formatTime(`${hour}:00`);
      elements.timeColumn.appendChild(timeLabel);
    }

    elements.dayColumns.forEach((column, dayIndex) => {
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
  };

  const renderAll = () => {
    renderWeekDisplay();
    renderDayHeaders();
    renderMiniCalendar();
    renderEventsForWeek();
    updateSidebarUI('add');
    
    if (state.isMobile) {
        setupMobileLayout();
    } else {
        setupDesktopLayout();
    }
  };
  
  const setupDesktopLayout = () => {
    elements.allDayColumns.forEach(col => col.style.display = 'grid');
    elements.dayHeaders.forEach(h => h.style.display = 'flex');
    elements.timeColumn.style.display = 'block';
    elements.addEventFab.style.display = 'none';
    elements.mobileDayNavButtons.forEach(btn => btn.style.display = 'none');
  };

  const setupMobileLayout = () => {
    elements.allDayColumns.forEach((col, index) => col.style.display = index === state.activeDayIndex ? 'grid' : 'none');
    elements.dayHeaders.forEach((header, index) => header.style.display = index === state.activeDayIndex ? 'flex' : 'none');
    elements.timeColumn.style.display = 'none';
    elements.addEventFab.style.display = 'flex';
    elements.mobileDayNavButtons.forEach(btn => btn.style.display = 'flex');
  };

  const renderWeekDisplay = () => {
    const start = getStartOfWeek(state.mainViewDate);
    const end = getEndOfWeek(start);
    elements.weekDisplay.textContent =
      `${start.toLocaleDateString('ka-GE', { month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('ka-GE', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  };

  const renderDayHeaders = () => {
    const startOfWeek = getStartOfWeek(state.mainViewDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    elements.dayHeaders.forEach((header, index) => {
      const headerDate = new Date(startOfWeek);
      headerDate.setDate(startOfWeek.getDate() + index);
      const dayNumberEl = header.querySelector('.day-number');
      if (dayNumberEl) dayNumberEl.textContent = headerDate.getDate();
      header.classList.toggle('current-day-header', headerDate.toDateString() === today.toDateString());
    });
  };

  const renderMiniCalendar = () => {
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
      if (currentDay.toDateString() === today.toDateString()) day.classList.add('current-day');
      if (currentDay >= startOfWeek && currentDay <= new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000)) {
        day.classList.add('in-selected-week');
      }
      day.addEventListener('click', () => {
        state.mainViewDate = new Date(currentDay);
        fetchEvents().then(() => renderAll());
      });
      elements.miniCalDaysGrid.appendChild(day);
    }
  };

  const renderEventsForWeek = () => {
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
              isException = exceptions.some(exc => exc.exceptionDate === dayStr && exc.title === `DELETED: ${event._id}`);
              if (!isException) {
                render = true;
                startTimeStr = formatTime(event.recurringStartTime);
                endTimeStr = formatTime(event.recurringEndTime);
              }
            }
          }
        } else {
          const eventStartDate = new Date(event.startTime);
          if (eventStartDate.toDateString() === currentDayDate.toDateString()) {
            render = true;
            startTimeStr = formatTime(eventStartDate);
            endTimeStr = formatTime(new Date(event.endTime));
          }
        }
        if (render) {
          renderEventBlock({ ...event, startTime: startTimeStr, endTime: endTimeStr }, dayColumn, isException);
        }
      });
    }
  };

  const renderEventBlock = (eventData, dayColumn, isException = false) => {
    if (isException) return;
    const startMinutes = timeToMinutes(eventData.startTime);
    const endMinutes = timeToMinutes(eventData.endTime);
    const durationMinutes = endMinutes - startMinutes;
    const slotHeight = 45;
    const top = ((startMinutes - 8 * 60) / 30) * slotHeight;
    const height = (durationMinutes / 30) * slotHeight - 2;
    const eventBlock = document.createElement('div');
    eventBlock.className = `event-block event-${eventData.type}`;
    if (eventData.type === 'lecture') eventBlock.classList.add('read-only');
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
  };
  
  // Layout Management
  const setupDesktopLayout = () => {
    elements.allDayColumns.forEach(col => col.classList.add('active'));
    elements.dayHeaders.forEach(h => h.classList.add('active'));
    elements.addEventFab.classList.add('hidden');
    elements.mobileNav.classList.add('hidden');
  };

  const setupMobileLayout = () => {
    elements.allDayColumns.forEach((col, index) => col.classList.toggle('active', index === state.activeDayIndex));
    elements.dayHeaders.forEach((header, index) => header.classList.toggle('active', index === state.activeDayIndex));
    elements.addEventFab.classList.remove('hidden');
    elements.mobileNav.classList.remove('hidden');
  };

  // Event Handlers
  const addEventListeners = () => {
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
    elements.eventForm.addEventListener('submit', e => {
      e.preventDefault();
      saveEvent();
    });
    
    // Add new event listeners for manual time input
    elements.sidebarTimeRange.addEventListener('click', () => {
      elements.manualTimeInputs.classList.toggle('hidden');
      if (elements.manualTimeInputs.classList.contains('hidden')) {
        elements.sidebarTimeRange.textContent = 'აირჩიე დრო კალენდარზე';
      }
    });

    elements.manualTimeInputs.querySelectorAll('input[type="time"]').forEach(input => {
      input.addEventListener('change', () => {
        const startTime = elements.manualTimeInputs.querySelector('#manual-start-time').value;
        const endTime = elements.manualTimeInputs.querySelector('#manual-end-time').value;
        if (startTime && endTime) {
          const startMinutes = timeToMinutes(startTime);
          const endMinutes = timeToMinutes(endTime);
          if (endMinutes > startMinutes) {
            elements.sidebarTimeRange.textContent = `${startTime} - ${endTime}`;
            elements.saveEventBtn.disabled = false;
          } else {
            elements.saveEventBtn.disabled = true;
            showNotification('დასრულების დრო უნდა იყოს დაწყების დროის შემდეგ.', 'error');
          }
        }
      });
    });

    // Time slot selection
    document.querySelectorAll('.time-slot').forEach(slot => {
      slot.addEventListener('mousedown', startSelection);
      slot.addEventListener('mouseenter', continueSelection);
      slot.addEventListener('touchstart', handleTouchStart);
    });
    document.addEventListener('mouseup', endSelection);
    document.addEventListener('touchend', endSelection);
    document.addEventListener('touchmove', handleTouchMove);

    // Mobile specific event listeners
    if (elements.mobileNav) {
        elements.mobileNav.addEventListener('click', (e) => {
            const target = e.target.closest('.mobile-nav-btn');
            if (target) {
                elements.mobileNav.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
            }
        });
    }

    if (elements.addEventFab) {
      elements.addEventFab.addEventListener('click', () => {
          document.getElementById('event-modal-backdrop').classList.add('active');
      });
    }
  };
  
  // Selection Logic
  const startSelection = (e) => {
      if (e.target.classList.contains('event-block')) {
          const eventData = state.allEvents.find(event => event._id === e.target.dataset.eventId);
          if (eventData) handleEventClick(eventData);
          return;
      }
      if (state.activeEvent) return;
      state.isDragging = true;
      const targetSlot = e.target.closest('.time-slot');
      if (!targetSlot) return;
      clearSelection();
      state.selectionStartSlot = targetSlot;
      updateSelection(targetSlot);
  };
  
  const continueSelection = (e) => {
      if (!state.isDragging) return;
      const targetSlot = e.target.closest('.time-slot');
      if (!targetSlot || targetSlot.dataset.day !== state.selectionStartSlot.dataset.day) return;
      updateSelection(targetSlot);
  };
  
  const endSelection = () => {
      if (!state.isDragging) return;
      state.isDragging = false;
      updateSidebarWithSelection();
  };
  
  const handleEventClick = (eventData) => {
      clearSelection(false);
      state.activeEvent = eventData;
      updateSidebarUI('edit', eventData);
      document.querySelectorAll('.event-block').forEach(el => el.classList.remove('active-event'));
      const eventElement = document.querySelector(`[data-event-id="${eventData._id}"]`);
      if (eventElement) eventElement.classList.add('active-event');
  };

  const updateSelection = (endSlot) => {
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
  };
  
  const updateSidebarWithSelection = () => {
      const hasSelection = state.selectedSlots.size > 0;
      elements.saveEventBtn.disabled = !hasSelection;
      elements.deleteEventBtn.disabled = !state.activeEvent;
      if (!hasSelection && !state.activeEvent) {
          elements.sidebarTimeRange.textContent = 'აირჩიე დრო კალენდარზე';
          elements.recurringCheckbox.parentElement.classList.add('hidden');
          return;
      }
      if (state.activeEvent) {
          elements.recurringCheckbox.checked = state.activeEvent.isRecurring;
          elements.recurringCheckbox.parentElement.classList.remove('hidden');
          elements.recurringLabelText.textContent = state.activeEvent.isRecurring ? 'Change all recurring events' : 'Change only this event';
      } else {
          elements.recurringCheckbox.checked = false;
          elements.recurringCheckbox.parentElement.classList.remove('hidden');
          elements.recurringLabelText.textContent = 'გამოყენება ყველა კვირაში';
      }
      if (state.activeEvent && !hasSelection) return;
      const times = Array.from(state.selectedSlots)
          .map(s => s.dataset.time)
          .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
      if (elements.sidebarTimeRange && times.length > 0) {
          elements.sidebarTimeRange.textContent = `${formatTime(times[0])} - ${formatTime(minutesToTime(timeToMinutes(times[times.length - 1]) + 30))}`;
      }
  };
  
  const clearSelection = (resetSidebar = true) => {
      state.selectedSlots.forEach(s => s.classList.remove('selection-active'));
      state.selectedSlots.clear();
      document.querySelectorAll('.event-block.active-event').forEach(el => el.classList.remove('active-event'));
      state.activeEvent = null;
      if (resetSidebar) updateSidebarUI('add');
  };

  const updateCurrentTimeIndicator = () => {
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
  };
  
  initializeCalendar();
});
