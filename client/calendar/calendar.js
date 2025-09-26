
// file: client/calendar/calendar.js
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = '/api';

    // State management: A single source of truth for all application data
    const state = {
        mainViewDate: new Date(),
        miniCalDate: new Date(),
        allEvents: [],
        selectedSlots: new Set(),
        activeEvent: null,
        userGroups: [],
        isRecurring: false,
        activeDayIndex: (new Date().getDay() + 6) % 7,
        isMobile: window.innerWidth < 992,
        isDragging: false,
        dragStartSlot: null,
        // Draggable FAB state
        isFabDragging: false,
        fabOffsetX: 0,
        fabOffsetY: 0,
    };
    
    // API Service to encapsulate all fetch calls
    const apiService = {
        fetchUserGroups: async () => {
            const token = localStorage.getItem('piRateToken');
            if (!token) {
                throw new Error('No authentication token found.');
            }
            const response = await fetch(`${API_BASE_URL}/groups/my-groups`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                throw new Error('Failed to fetch user groups.');
            }
            return response.json();
        },
        fetchEvents: async () => {
            const startOfWeek = getStartOfWeek(state.mainViewDate);
            const endOfWeek = getEndOfWeek(startOfWeek);
            const personalEventsResponse = await apiFetch(
                `/calendar-events/my-schedule?start=${startOfWeek.toISOString()}&end=${endOfWeek.toISOString()}`
            );
            const personalEvents = personalEventsResponse?.data || [];
            
            const lecturePromises = state.userGroups.map(group => 
                apiFetch(`/lectures/group/${group._id}?start=${startOfWeek.toISOString()}&end=${endOfWeek.toISOString()}`)
            );
            
            const lectureResponses = await Promise.all(lecturePromises);
            const lectures = lectureResponses.flatMap(res => res?.data || []);
            
            return [...personalEvents, ...lectures];
        },
        saveEvent: async (payload) => {
            const response = await apiFetch('/calendar-events', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            return response.data;
        },
        deleteEvent: async (eventId, payload) => {
            const response = await apiFetch(`/calendar-events/${eventId}`, {
                method: 'DELETE',
                body: JSON.stringify(payload)
            });
            return response.data;
        }
    };


    // DOM Elements: Centralized access to all DOM elements
    const elements = {
        timeColumnMain: document.getElementById('time-column-main'),
        dayColumnsMain: document.querySelectorAll('#calendar-main-grid .day-column'),
        weekDisplay: document.getElementById('current-week-display'),
        prevWeekBtn: document.getElementById('prev-week-btn'),
        nextWeekBtn: document.getElementById('next-week-btn'),
        todayBtn: document.getElementById('today-btn'),
        miniCalHeader: document.getElementById('mini-cal-month-year'),
        miniCalDaysGrid: document.getElementById('mini-calendar-days'),
        miniCalPrevBtn: document.getElementById('mini-cal-prev-month'),
        miniCalNextBtn: document.getElementById('mini-cal-next-month'),
        saveEventBtn: document.getElementById('save-event-btn'),
        deleteEventBtn: document.getElementById('delete-event-btn'),
        recurringCheckbox: document.getElementById('recurring-event-checkbox'),
        recurringLabelText: document.getElementById('recurring-label-text'),
        gridWrapper: document.getElementById('calendar-main-grid'),
        currentTimeIndicator: document.getElementById('current-time-indicator'),
        eventForm: document.getElementById('event-form'),
        eventDaySelect: document.getElementById('event-day-select'),
        eventStartTime: document.getElementById('event-start-time'),
        eventEndTime: document.getElementById('event-end-time'),
        eventTitleInput: document.getElementById('event-title-input'),
        eventModalDaySelect: document.getElementById('event-modal-day-select'),
        eventModalStartTime: document.getElementById('event-modal-start-time'),
        eventModalEndTime: document.getElementById('event-modal-end-time'),
        eventModalTitleInput: document.getElementById('event-modal-title-input'),
        eventModalRecurringCheckbox: document.getElementById('event-modal-recurring-checkbox'),
        eventModalSaveBtn: document.getElementById('event-modal-save-btn'),
        eventModalDeleteBtn: document.getElementById('event-modal-delete-btn'),
        calendarSidebar: document.querySelector('.calendar-sidebar'),
        addEventFab: document.querySelector('.fab'),
        eventModalBackdrop: document.getElementById('event-modal-backdrop'),
        addEventDesktopBtn: document.getElementById('add-event-desktop-btn'),
        mobileCalendarControls: document.getElementById('mobile-calendar-controls')
    };

    // Notification toast function
    function showNotification(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `notification-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // API fetch wrapper for robust error handling and authentication
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
            const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
            
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('piRateToken');
                window.location.href = '/login/login.html';
                throw new Error('Authentication required');
            }

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

    // Main initialization function
    async function initializeCalendar() {
        try {
            await fetchUserGroups();
            generateTimeSlots(elements.timeColumnMain, elements.dayColumnsMain);
            await fetchEvents();
            renderAll();
            addEventListeners();

            updateCurrentTimeIndicator();
            setInterval(updateCurrentTimeIndicator, 60000);

            handleResize();
            window.addEventListener('resize', handleResize);
        } catch (error) {
            console.error('Calendar initialization failed:', error);
            showNotification('Calendar initialization failed', 'error');
        }
    }
    
    // Fetch user groups to determine group context
    async function fetchUserGroups() {
        try {
            const groupsData = await apiService.fetchUserGroups();
            state.userGroups = groupsData || [];
        } catch (error) {
            console.error('Failed to load user groups:', error);
            state.userGroups = [];
        }
    }

    // Fetch all events for the current week
    async function fetchEvents() {
        try {
            document.body.classList.add('loading');
            state.allEvents = await apiService.fetchEvents();
        } catch (error) {
            console.error('Failed to load events:', error);
            state.allEvents = [];
        } finally {
            document.body.classList.remove('loading');
        }
    }

    // Handle saving a new event or updating an existing one
    async function saveEvent(isMobile = false) {
        let type, isRecurring, title, dayIndex, startTimeStr, endTimeStr;

        // Use the correct form based on the device
        const form = isMobile ? document.getElementById('event-modal-form') : document.getElementById('event-form');
        if (!form) return;

        const isBusy = form.querySelector('input[name="event-type"][value="busy"]')?.checked || form.querySelector('select[name="event-type"]')?.value === 'busy';
        type = isBusy ? 'busy' : 'preferred';

        isRecurring = form.querySelector('[id$="-recurring-checkbox"]')?.checked;
        title = form.querySelector('[id$="-title-input"]')?.value;
        dayIndex = form.querySelector('[id$="-day-select"]')?.value;
        startTimeStr = form.querySelector('[id$="-start-time"]')?.value;
        endTimeStr = form.querySelector('[id$="-end-time"]')?.value;

        if (!title || !dayIndex || !startTimeStr || !endTimeStr) {
            showNotification('გთხოვთ, შეავსოთ ყველა ველი', 'error');
            return;
        }

        const startDate = new Date(getStartOfWeek(state.mainViewDate));
        startDate.setDate(startDate.getDate() + parseInt(dayIndex));
        const [startH, startM] = startTimeStr.split(':').map(Number);
        startDate.setHours(startH, startM);

        const endDate = new Date(getStartOfWeek(state.mainViewDate));
        endDate.setDate(endDate.getDate() + parseInt(dayIndex));
        const [endH, endM] = endTimeStr.split(':').map(Number);
        endDate.setHours(endH, endM);

        if (endDate <= startDate) {
            showNotification('დასრულების დრო უნდა იყოს დაწყების შემდეგ', 'error');
            return;
        }

        const payload = {
            type,
            title,
            isRecurring,
            groupId: state.userGroups.length > 0 ? state.userGroups[0]._id : null
        };

        if (isRecurring) {
            payload.dayOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][parseInt(dayIndex)];
            payload.recurringStartTime = startTimeStr;
            payload.recurringEndTime = endTimeStr;
        } else {
            payload.startTime = startDate.toISOString();
            payload.endTime = endDate.toISOString();
        }

        try {
            const response = await apiService.saveEvent(payload);

            state.allEvents.push(response.data);
            clearSelection();
            renderEventsForWeek();
            showNotification('მოვლენა წარმატებით შეინახა!', 'success');
            elements.eventModalBackdrop.classList.add('hidden');
        } catch (error) {
            console.error('მოვლენის შენახვა ვერ მოხერხდა:', error);
            showNotification('მოვლენის შენახვა ვერ მოხერხდა: ' + error.message, 'error');
        }
    }

    // Handle event deletion
    async function deleteEvent(eventId, isMobile = false) {
        if (!confirm('Are you sure you want to delete this event?')) return;

        const event = state.allEvents.find(e => e._id === eventId);
        if (!event) return;

        const isRecurring = document.getElementById('event-modal-recurring-checkbox').checked;

        try {
            await apiService.deleteEvent(eventId, {
                dateString: event.startTime ? new Date(event.startTime).toISOString().split('T')[0] : null,
                deleteAllRecurring: isRecurring
            });

            state.allEvents = state.allEvents.filter(e => e._id !== eventId);
            clearSelection();
            renderEventsForWeek();
            showNotification('მოვლენა წარმატებით წაიშალა!', 'success');
            elements.eventModalBackdrop.classList.add('hidden');
        } catch (error) {
            console.error('Failed to delete event:', error);
            showNotification('მოვლენის წაშლა ვერ მოხერხდა: ' + error.message, 'error');
        }
    }

    // Generate time slots for the calendar grid
    function generateTimeSlots(timeColumn, dayColumns) {
        if (!timeColumn || !dayColumns || dayColumns.length === 0) return;
        
        timeColumn.innerHTML = '';
        dayColumns.forEach(column => column.innerHTML = '');

        // Generate time labels
        for (let hour = 8; hour < 23; hour++) {
            const timeLabel = document.createElement('div');
            timeLabel.className = 'time-label';
            timeLabel.textContent = formatTime(`${hour}:00`, false);
            timeColumn.appendChild(timeLabel);
        }

        // Generate time slots
        dayColumns.forEach((column, dayIndex) => {
            for (let hour = 8; hour < 23; hour++) {
                for (let minute = 0; minute < 60; minute += 30) {
                    const timeSlot = document.createElement('div');
                    timeSlot.className = 'time-slot';
                    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                    timeSlot.dataset.time = time;
                    timeSlot.dataset.day = dayIndex.toString();
                    column.appendChild(timeSlot);
                }
            }
        });
    }

    // Master render function to update all components
    function renderAll() {
        renderWeekDisplay();
        renderDayHeaders();
        renderMiniCalendar();
        renderEventsForWeek();
        handleResize();
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

        const dayHeaders = document.querySelectorAll('.day-column-header');
        
        dayHeaders.forEach((header, index) => {
            const headerDate = new Date(startOfWeek);
            headerDate.setDate(headerDate.getDate() + index);
            if (header.querySelector('.day-number')) {
                header.querySelector('.day-number').textContent = headerDate.getDate();
            }
            if (headerDate.toDateString() === today.toDateString()) {
                header.classList.add('current-day-header');
            } else {
                header.classList.remove('current-day-header');
            }
        });

        if (state.isMobile) {
            if (elements.mobileMiniCalHeader) elements.mobileMiniCalHeader.textContent = `${new Date(state.miniCalDate).toLocaleString('ka-GE', { month: 'long' })} ${state.miniCalDate.getFullYear()}`;
        }
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
                fetchEvents().then(() => renderAll());
            });

            elements.miniCalDaysGrid.appendChild(day);
        }
    }

    // Render events on the main calendar grid
    function renderEventsForWeek() {
        const startOfWeek = getStartOfWeek(state.mainViewDate);
        const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const exceptions = state.allEvents.filter(e => e.exceptionDate);
        
        const slotHeight = getComputedStyle(document.documentElement).getPropertyValue('--calendar-slot-height').trim();
        const slotHeightValue = parseFloat(slotHeight);

        document.querySelectorAll('.event-block').forEach(el => el.remove());

        const dayColumns = document.querySelectorAll('#calendar-main-grid .day-column');

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const currentDayDate = new Date(startOfWeek);
            currentDayDate.setDate(currentDayDate.getDate() + dayIndex);
            const dayStr = currentDayDate.toISOString().split('T')[0];
            const dayColumn = dayColumns[dayIndex];

            state.allEvents.forEach(event => {
                if (event.title && event.title.startsWith('DELETED:')) return;

                let render = false;
                let isException = false;
                let startTimeStr, endTimeStr;

                if (event.isRecurring) {
                    if (event.dayOfWeek) {
                        if (event.dayOfWeek === dayNames[dayIndex]) {
                            isException = exceptions.some(exc =>
                                exc.exceptionDate === dayStr && exc.title === `DELETED: ${event._id}`
                            );
                            if (!isException) {
                                render = true;
                                startTimeStr = ensureTimeFormat(event.recurringStartTime);
                                endTimeStr = ensureTimeFormat(event.recurringEndTime);
                            }
                        }
                    }
                } else {
                    const eventStartDate = new Date(event.startTime);
                    const eventEndDate = new Date(event.endTime);

                    if (eventStartDate.toDateString() === currentDayDate.toDateString()) {
                        render = true;
                        startTimeStr = `${String(eventStartDate.getHours()).padStart(2, '0')}:${String(eventStartDate.getMinutes()).padStart(2, '0')}`;
                        endTimeStr = `${String(eventEndDate.getHours()).padStart(2, '0')}:${String(eventEndDate.getMinutes()).padStart(2, '0')}`;
                    }
                }

                if (render) {
                    renderEventBlock({ ...event, startTime: startTimeStr, endTime: endTimeStr }, dayColumn, isException, slotHeightValue);
                }
            });
        }
    }

    // Helper function to create and position an event block
    function renderEventBlock(eventData, dayColumn, isException = false, slotHeight) {
        if (isException || !dayColumn) return;

        const startMinutes = timeToMinutes(eventData.startTime);
        const endMinutes = timeToMinutes(eventData.endTime);
        const durationMinutes = endMinutes - startMinutes;
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

    // Add all event listeners
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
        
        elements.eventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveEvent(false);
        });

        elements.eventModalSaveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveEvent(true);
        });
        
        elements.deleteEventBtn.addEventListener('click', () => {
            if (state.activeEvent) deleteEvent(state.activeEvent._id, false);
        });

        elements.eventModalDeleteBtn.addEventListener('click', () => {
            if (state.activeEvent) deleteEvent(state.activeEvent._id, true);
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

        // Open desktop modal from header button
        if(elements.addEventDesktopBtn) {
            elements.addEventDesktopBtn.addEventListener('click', () => {
                elements.calendarSidebar.classList.remove('hidden');
                clearForm();
            });
        }
        
        // Open modal with the FAB on mobile
        if (elements.addEventFab) {
             elements.addEventFab.addEventListener('click', (e) => {
                 if (!e.target.closest('.fab').classList.contains('dragging')) {
                     elements.eventModalBackdrop.classList.remove('hidden');
                     clearMobileForm();
                 }
             });
        }


        // Event listeners for drag-and-drop selection
        if (elements.gridWrapper) {
            elements.gridWrapper.addEventListener('mousedown', handleMouseDown);
            elements.gridWrapper.addEventListener('mouseup', handleMouseUp);
            elements.gridWrapper.addEventListener('mousemove', handleMouseMove);
        }

        if (elements.eventModalBackdrop) {
            elements.eventModalBackdrop.addEventListener('click', (e) => {
                if (e.target === elements.eventModalBackdrop || e.target.closest('.close-modal-btn')) {
                    elements.eventModalBackdrop.classList.add('hidden');
                }
            });
        }
        
        // Draggable FAB for mobile
        if (elements.addEventFab) {
            elements.addEventFab.addEventListener('mousedown', startFabDrag);
            elements.addEventFab.addEventListener('touchstart', startFabDrag, { passive: false });
            document.addEventListener('mousemove', dragFab);
            document.addEventListener('touchmove', dragFab, { passive: false });
            document.addEventListener('mouseup', endFabDrag);
            document.addEventListener('touchend', endFabDrag);
        }
    }

    // Draggable FAB logic
    function startFabDrag(e) {
        state.isFabDragging = true;
        const touch = e.touches ? e.touches[0] : e;
        state.fabOffsetX = touch.clientX - elements.addEventFab.getBoundingClientRect().left;
        state.fabOffsetY = touch.clientY - elements.addEventFab.getBoundingClientRect().top;
        elements.addEventFab.classList.add('dragging');
        e.preventDefault();
    }
    
    function dragFab(e) {
        if (!state.isFabDragging) return;
        const touch = e.touches ? e.touches[0] : e;
        const newX = touch.clientX - state.fabOffsetX;
        const newY = touch.clientY - state.fabOffsetY;
        elements.addEventFab.style.left = `${newX}px`;
        elements.addEventFab.style.top = `${newY}px`;
        elements.addEventFab.style.right = 'auto';
        elements.addEventFab.style.bottom = 'auto';
        e.preventDefault();
    }
    
    function endFabDrag() {
        state.isFabDragging = false;
        elements.addEventFab.classList.remove('dragging');
    }

    // Handle window resize event to toggle mobile/desktop view
    function handleResize() {
        const isMobileView = window.innerWidth <= 1200;

        if (isMobileView) {
            elements.addEventDesktopBtn.style.display = 'none';
            elements.calendarSidebar.style.display = 'none';
            elements.addEventFab.classList.remove('hidden');
        } else {
            elements.addEventDesktopBtn.style.display = 'flex';
            elements.calendarSidebar.style.display = 'flex';
            elements.addEventFab.classList.add('hidden');
        }
    }

    // New functions for drag-and-drop selection
    function handleMouseDown(e) {
        const targetSlot = e.target.closest('.time-slot');
        if (!targetSlot) {
            clearSelection();
            return;
        }

        state.isDragging = true;
        state.dragStartSlot = targetSlot;
        clearSelection();
        state.selectedSlots.add(targetSlot);
        targetSlot.classList.add('selected');
    }

    function handleMouseMove(e) {
        if (!state.isDragging || !state.dragStartSlot) return;

        const endSlot = e.target.closest('.time-slot');
        if (!endSlot || endSlot.dataset.day !== state.dragStartSlot.dataset.day) return;

        const allSlots = document.querySelectorAll(`.day-column[data-day="${state.dragStartSlot.dataset.day}"] .time-slot`);
        const startIndex = Array.from(allSlots).indexOf(state.dragStartSlot);
        const endIndex = Array.from(allSlots).indexOf(endSlot);

        if (startIndex === -1 || endIndex === -1) return;

        // Clear previous selection
        document.querySelectorAll('.time-slot.selected').forEach(slot => slot.classList.remove('selected'));
        state.selectedSlots.clear();

        // Select new range
        const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
        for (let i = min; i <= max; i++) {
            allSlots[i].classList.add('selected');
            state.selectedSlots.add(allSlots[i]);
        }
        updateFormWithSelection();
    }

    function handleMouseUp() {
        state.isDragging = false;
        if (state.selectedSlots.size > 0) {
            updateFormWithSelection();
        } else {
            clearForm();
        }
    }

    // Update form inputs with selected slots
    function updateFormWithSelection() {
        if (state.selectedSlots.size === 0) {
            clearForm();
            return;
        }

        const sortedSlots = Array.from(state.selectedSlots).sort((a, b) => {
            const dayA = parseInt(a.dataset.day);
            const dayB = parseInt(b.dataset.day);
            if (dayA !== dayB) return dayA - dayB;
            
            const timeA = timeToMinutes(a.dataset.time);
            const timeB = timeToMinutes(b.dataset.time);
            return timeA - timeB;
        });

        const firstSlot = sortedSlots[0];
        const lastSlot = sortedSlots[sortedSlots.length - 1];
        
        const startTime = firstSlot.dataset.time;
        const endTimeInMinutes = timeToMinutes(lastSlot.dataset.time) + 30; // End of the last selected slot
        const endTime = minutesToTime(endTimeInMinutes);

        // Update form inputs
        elements.eventDaySelect.value = firstSlot.dataset.day;
        elements.eventStartTime.value = startTime;
        elements.eventEndTime.value = endTime;

        elements.eventModalDaySelect.value = firstSlot.dataset.day;
        elements.eventModalStartTime.value = startTime;
        elements.eventModalEndTime.value = endTime;

        updateFormValidity(elements.eventForm);
        updateFormValidity(document.getElementById('event-modal-form'));
    }

    // Handle click on an existing event block
    function handleEventClick(eventData) {
        clearSelection(false);
        state.activeEvent = eventData;
        
        // Populate the desktop sidebar form
        elements.eventDaySelect.value = (new Date(eventData.startTime).getDay() + 6) % 7;
        elements.eventStartTime.value = eventData.startTime.split('T')[1].substring(0, 5);
        elements.eventEndTime.value = eventData.endTime.split('T')[1].substring(0, 5);
        elements.eventTitleInput.value = eventData.title || '';
        document.querySelector(`#event-form input[name="event-type"][value="${eventData.type}"]`).checked = true;
        elements.recurringCheckbox.checked = eventData.isRecurring;
        elements.deleteEventBtn.disabled = false;
        
        // Populate the modal form
        elements.eventModalDaySelect.value = (new Date(eventData.startTime).getDay() + 6) % 7;
        elements.eventModalStartTime.value = eventData.startTime.split('T')[1].substring(0, 5);
        elements.eventModalEndTime.value = eventData.endTime.split('T')[1].substring(0, 5);
        elements.eventModalTitleInput.value = eventData.title || '';
        document.querySelector(`#event-modal-form select[name="event-type"]`).value = eventData.type;
        elements.eventModalRecurringCheckbox.checked = eventData.isRecurring;
        elements.eventModalDeleteBtn.disabled = false;

        document.querySelectorAll('.event-block').forEach(el => el.classList.remove('active-event'));
        const eventElement = document.querySelector(`[data-event-id="${eventData._id}"]`);
        if (eventElement) {
            eventElement.classList.add('active-event');
        }
    }

    // Validate a form
    function updateFormValidity(form) {
        const hasValidInput = form.querySelector('[id$="-day-select"]').value !== '' && 
                             form.querySelector('[id$="-start-time"]').value !== '' && 
                             form.querySelector('[id$="-end-time"]').value !== '' && 
                             form.querySelector('[id$="-title-input"]').value.trim() !== '';
        
        const saveButton = form.querySelector('[id$="-save-btn"]');
        if (saveButton) {
            saveButton.disabled = !hasValidInput;
        }
    }

    // Reset forms
    function clearForm() {
        if(elements.eventForm) {
            elements.eventDaySelect.value = '0';
            elements.eventStartTime.value = '08:00';
            elements.eventEndTime.value = '09:00';
            elements.eventTitleInput.value = '';
            document.querySelector('input[name="event-type"][value="busy"]').checked = true;
            elements.recurringCheckbox.checked = false;
            elements.deleteEventBtn.disabled = true;
            updateFormValidity(elements.eventForm);
        }
        if(document.getElementById('event-modal-form')) {
            elements.eventModalDaySelect.value = '0';
            elements.eventModalStartTime.value = '08:00';
            elements.eventModalEndTime.value = '09:00';
            elements.eventModalTitleInput.value = '';
            document.querySelector('#event-modal-form select[name="event-type"]').value = 'busy';
            elements.eventModalRecurringCheckbox.checked = false;
            elements.eventModalDeleteBtn.disabled = true;
            updateFormValidity(document.getElementById('event-modal-form'));
        }
    }

    // Clear all selected slots and active events
    function clearSelection() {
        document.querySelectorAll('.time-slot.selected').forEach(s => s.classList.remove('selected'));
        state.selectedSlots.clear();

        document.querySelectorAll('.event-block.active-event').forEach(el => el.classList.remove('active-event'));
        state.activeEvent = null;

        clearForm();
    }

    // Utility functions for time manipulation and formatting
    const timeToMinutes = (timeStr) => {
        if (!timeStr || !timeStr.includes(':')) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const minutesToTime = (totalMinutes) => {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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

        if (!includePeriod) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

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

    // Update the current time indicator on the calendar grid
    function updateCurrentTimeIndicator() {
        const now = new Date();
        const dayOfWeek = (now.getDay() + 6) % 7;
        const startOfWeek = getStartOfWeek(state.mainViewDate);
        const endOfWeek = getEndOfWeek(startOfWeek);
        
        const slotHeight = getComputedStyle(document.documentElement).getPropertyValue('--calendar-slot-height').trim();
        const slotHeightValue = parseFloat(slotHeight);

        if (now < startOfWeek || now > endOfWeek) {
            elements.currentTimeIndicator.style.display = 'none';
            return;
        }

        const timeInMinutes = now.getHours() * 60 + now.getMinutes();
        if (timeInMinutes < 8 * 60 || timeInMinutes >= 23 * 60) {
            elements.currentTimeIndicator.style.display = 'none';
            return;
        }

        const top = ((timeInMinutes - 8 * 60) / 30) * slotHeightValue;
        
        const dayColumn = document.querySelector(`.day-column[data-day="${dayOfWeek}"]`);
        if (dayColumn) {
            elements.currentTimeIndicator.style.top = `${top}px`;
            elements.currentTimeIndicator.style.left = `${dayColumn.offsetLeft}px`;
            elements.currentTimeIndicator.style.display = 'block';
        }
    }

    // Start the application
    initializeCalendar();
});
