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
        currentView: 'week',
        isMobile: window.innerWidth < 992,
        isDragging: false,
        dragStartSlot: null,
    };

    // DOM Elements: Centralized access to all DOM elements
    const elements = {
        timeColumn: document.getElementById('time-column'),
        dayViewTimeColumn: document.getElementById('day-view-time-column'),
        dayColumns: document.querySelectorAll('.day-column'),
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
        gridWrapper: document.querySelector('.calendar-grid-wrapper'),
        currentTimeIndicator: document.getElementById('current-time-indicator'),
        dayViewCurrentTimeIndicator: document.getElementById('day-view-current-time-indicator'),
        eventForm: document.getElementById('event-form'),
        eventDaySelect: document.getElementById('event-day-select'),
        eventStartTime: document.getElementById('event-start-time'),
        eventEndTime: document.getElementById('event-end-time'),
        eventTitleInput: document.getElementById('event-title-input'),
        addEventFab: document.getElementById('add-event-fab'),
        eventModalBackdrop: document.getElementById('event-modal-backdrop'),
        mobileDayNav: document.getElementById('mobile-day-nav'),
        mobileDaySelect: document.getElementById('mobile-day-select'),
        mobileStartTime: document.getElementById('mobile-start-time'),
        mobileEndTime: document.getElementById('mobile-end-time'),
        mobileEventTitleInput: document.getElementById('mobile-event-title-input'),
        mobileRecurringCheckbox: document.getElementById('mobile-recurring-checkbox'),
        mobileSaveBtn: document.getElementById('mobile-save-btn'),
        mobileDeleteBtn: document.getElementById('mobile-delete-btn'),
        sidebarToggle: document.getElementById('sidebar-toggle'),
        dayViewBtn: document.getElementById('day-view-btn'),
        weekViewBtn: document.getElementById('week-view-btn'),
        weekViewGrid: document.querySelector('.calendar-grid.week-view'),
        dayViewGrid: document.querySelector('.calendar-grid.day-view'),
        calendarSidebar: document.querySelector('.calendar-sidebar'),
        selectionTimeRange: document.getElementById('selection-time-range')
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
            generateTimeSlots();
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
            const groupsData = await apiFetch('/groups/my-groups');
            state.userGroups = groupsData || [];
        } catch (error) {
            console.error('Failed to load user groups:', error);
            state.userGroups = [];
        }
    }

    // Fetch all events for the current week
    async function fetchEvents() {
        const startOfWeek = getStartOfWeek(state.mainViewDate);
        const endOfWeek = getEndOfWeek(startOfWeek);

        try {
            document.body.classList.add('loading');
            
            // Fetch personal events
            const personalEventsResponse = await apiFetch(
                `/calendar-events/my-schedule?start=${startOfWeek.toISOString()}&end=${endOfWeek.toISOString()}`
            );
            const personalEvents = personalEventsResponse?.data || [];
            
            // Fetch lectures for all user's groups
            const lecturePromises = state.userGroups.map(group => 
                apiFetch(`/lectures/group/${group._id}?start=${startOfWeek.toISOString()}&end=${endOfWeek.toISOString()}`)
            );
            
            const lectureResponses = await Promise.all(lecturePromises);
            const lectures = lectureResponses.flatMap(res => res?.data || []);
            
            state.allEvents = [...personalEvents, ...lectures];

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
        const form = isMobile ? elements.eventModalBackdrop.querySelector('#mobile-event-form') : elements.eventForm;
        if (!form) return;

        type = form.querySelector('input[name="event-type"]:checked')?.value || form.querySelector('select[name="eventType"]')?.value;
        isRecurring = form.querySelector('#recurring-event-checkbox')?.checked || form.querySelector('#mobile-recurring-checkbox')?.checked;
        title = form.querySelector('input[type="text"]').value;
        dayIndex = form.querySelector('select').value;
        startTimeStr = form.querySelector('input[type="time"]').value;
        endTimeStr = form.querySelector('input[type="time"][name$="end-time"]').value;

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
            const response = await apiFetch('/calendar-events', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            state.allEvents.push(response.data);
            clearSelection();
            renderEventsForWeek();
            showNotification('მოვლენა წარმატებით შეინახა!', 'success');

            if (isMobile) {
                elements.eventModalBackdrop.classList.add('hidden');
            }
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

        const isRecurring = isMobile ? elements.mobileRecurringCheckbox.checked : elements.recurringCheckbox.checked;

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
            showNotification('მოვლენა წარმატებით წაიშალა!', 'success');

            if (isMobile) {
                elements.eventModalBackdrop.classList.add('hidden');
            }
        } catch (error) {
            console.error('Failed to delete event:', error);
            showNotification('მოვლენის წაშლა ვერ მოხერხდა: ' + error.message, 'error');
        }
    }

    // Generate time slots for the calendar grid
    function generateTimeSlots() {
        const timeColumn = elements.timeColumn;
        const dayViewTimeColumn = elements.dayViewTimeColumn;
        
        // Clear existing time slots
        timeColumn.innerHTML = '';
        if (dayViewTimeColumn) dayViewTimeColumn.innerHTML = '';

        for (let hour = 8; hour < 22; hour++) {
            const timeLabel = document.createElement('div');
            timeLabel.className = 'time-label';
            timeLabel.textContent = formatTime(`${hour}:00`, false);
            timeColumn.appendChild(timeLabel);

            if (dayViewTimeColumn) {
                const dayViewTimeLabel = document.createElement('div');
                dayViewTimeLabel.className = 'time-label';
                dayViewTimeLabel.textContent = formatTime(`${hour}:00`, false);
                dayViewTimeColumn.appendChild(dayViewTimeLabel);
            }
        }

        // Generate time slots for week view
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

        // Generate time slots for day view
        const dayViewColumns = document.querySelectorAll('.day-view .day-column');
        dayViewColumns.forEach((column, dayIndex) => {
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

    // Master render function to update all components
    function renderAll() {
        renderWeekDisplay();
        renderDayHeaders();
        renderMiniCalendar();
        renderEventsForWeek();
        updateSidebarUI('add');
        if (state.isMobile) {
            updateActiveDayForMobile();
        }
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

        document.querySelectorAll('.event-block').forEach(el => el.remove());

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const currentDayDate = new Date(startOfWeek);
            currentDayDate.setDate(currentDayDate.getDate() + dayIndex);
            const dayStr = currentDayDate.toISOString().split('T')[0];
            const dayColumn = document.querySelector(`.week-view .day-column[data-day="${dayIndex}"]`);
            const dayViewColumn = document.querySelector(`.day-view .day-column[data-day="${dayIndex}"]`);

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
                    renderEventBlock({ ...event, startTime: startTimeStr, endTime: endTimeStr }, dayColumn, isException);
                    if (dayViewColumn && dayIndex === state.activeDayIndex) {
                        renderEventBlock({ ...event, startTime: startTimeStr, endTime: endTimeStr }, dayViewColumn, isException);
                    }
                }
            });
        }
    }

    // Helper function to create and position an event block
    function renderEventBlock(eventData, dayColumn, isException = false) {
        if (isException || !dayColumn) return;

        const startMinutes = timeToMinutes(eventData.startTime);
        const endMinutes = timeToMinutes(eventData.endTime);
        const durationMinutes = endMinutes - startMinutes;
        const slotHeight = state.isMobile ? 40 : 45;
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

        elements.mobileDayNav.querySelectorAll('.mobile-day-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const dayIndex = parseInt(btn.dataset.day);
                state.activeDayIndex = dayIndex;
                updateActiveDayForMobile();
                renderEventsForWeek();
            });
        });

        elements.eventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveEvent(false);
        });

        elements.mobileSaveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveEvent(true);
        });
        
        elements.deleteEventBtn.addEventListener('click', () => {
            if (state.activeEvent) deleteEvent(state.activeEvent._id, false);
        });

        elements.mobileDeleteBtn.addEventListener('click', () => {
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

        const calendarGrid = document.querySelector('.calendar-grid-wrapper');
        if (calendarGrid) {
            calendarGrid.addEventListener('mousedown', handleMouseDown);
            calendarGrid.addEventListener('mouseup', handleMouseUp);
            calendarGrid.addEventListener('mousemove', handleMouseMove);
        }

        elements.eventDaySelect.addEventListener('change', updateFormValidity);
        elements.eventStartTime.addEventListener('change', updateFormValidity);
        elements.eventEndTime.addEventListener('change', updateFormValidity);
        elements.eventTitleInput.addEventListener('input', updateFormValidity);

        elements.mobileDaySelect.addEventListener('change', updateMobileFormValidity);
        elements.mobileStartTime.addEventListener('change', updateMobileFormValidity);
        elements.mobileEndTime.addEventListener('change', updateMobileFormValidity);
        elements.mobileEventTitleInput.addEventListener('input', updateMobileFormValidity);

        if (elements.addEventFab) {
            elements.addEventFab.addEventListener('click', () => {
                elements.eventModalBackdrop.classList.remove('hidden');
                clearMobileForm();
            });
        }

        if (elements.eventModalBackdrop) {
            elements.eventModalBackdrop.addEventListener('click', (e) => {
                if (e.target === elements.eventModalBackdrop || e.target.closest('.close-modal-btn')) {
                    elements.eventModalBackdrop.classList.add('hidden');
                }
            });
        }

        if (elements.sidebarToggle) {
            elements.sidebarToggle.addEventListener('click', () => {
                elements.calendarSidebar.classList.toggle('expanded');
            });
        }

        if (elements.dayViewBtn && elements.weekViewBtn) {
            elements.dayViewBtn.addEventListener('click', () => {
                if (state.currentView !== 'day') {
                    state.currentView = 'day';
                    updateView();
                }
            });

            elements.weekViewBtn.addEventListener('click', () => {
                if (state.currentView !== 'week') {
                    state.currentView = 'week';
                    updateView();
                }
            });
        }
    }
    
    // Update the active day for mobile view
    function updateActiveDayForMobile() {
        document.querySelectorAll('.mobile-day-nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.mobile-day-nav-btn[data-day="${state.activeDayIndex}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        document.querySelectorAll('.day-view .day-column-header').forEach(header => {
            header.classList.remove('active');
            if (parseInt(header.dataset.dayHeader) === state.activeDayIndex) {
                header.classList.add('active');
            }
        });

        document.querySelectorAll('.day-view .day-column').forEach(column => {
            column.classList.remove('active');
            if (parseInt(column.dataset.day) === state.activeDayIndex) {
                column.classList.add('active');
            }
        });

        const startOfWeek = getStartOfWeek(state.mainViewDate);
        const headerDate = new Date(startOfWeek);
        headerDate.setDate(headerDate.getDate() + state.activeDayIndex);
        
        const dayViewHeader = document.querySelector('.day-view .day-column-header.active');
        if (dayViewHeader && dayViewHeader.querySelector('.day-number')) {
            dayViewHeader.querySelector('.day-number').textContent = headerDate.getDate();
        }
    }

    // Handle window resize event to toggle mobile view
    function handleResize() {
        state.isMobile = window.innerWidth < 992;
        
        if (state.isMobile) {
            elements.mobileDayNav.classList.remove('hidden');
            if (state.currentView === 'week') {
                state.currentView = 'day';
                updateView();
            }
        } else {
            elements.mobileDayNav.classList.add('hidden');
            if (state.currentView === 'day') {
                state.currentView = 'week';
                updateView();
            }
        }
    }

    // Toggle between day and week view
    function updateView() {
        if (state.currentView === 'week') {
            elements.weekViewGrid.classList.remove('hidden');
            elements.dayViewGrid.classList.add('hidden');
            elements.weekViewBtn.classList.add('active');
            elements.dayViewBtn.classList.remove('active');
        } else {
            elements.weekViewGrid.classList.add('hidden');
            elements.dayViewGrid.classList.remove('hidden');
            elements.weekViewBtn.classList.remove('active');
            elements.dayViewBtn.classList.add('active');
            updateActiveDayForMobile();
        }
        renderEventsForWeek();
    }

    // New functions for drag-and-drop selection
    function handleMouseDown(e) {
        const targetSlot = e.target.closest('.time-slot');
        if (!targetSlot) {
            clearSelection();
            return;
        }

        if (state.isMobile && parseInt(targetSlot.dataset.day) !== state.activeDayIndex) {
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

        const allSlots = Array.from(document.querySelectorAll(`.time-slot[data-day="${state.dragStartSlot.dataset.day}"]`));
        const startIndex = allSlots.indexOf(state.dragStartSlot);
        const endIndex = allSlots.indexOf(endSlot);

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

        // Update selection display panel
        elements.selectionTimeRange.textContent = `${formatTime(startTime)} - ${formatTime(endTime)}`;

        updateFormValidity();
    }

    // Toggle selected time slots
    function toggleSlotSelection(e) {
        const targetSlot = e.target.closest('.time-slot');
        if (!targetSlot) return;
        
        if (state.isMobile && parseInt(targetSlot.dataset.day) !== state.activeDayIndex) {
            return;
        }

        if (targetSlot.classList.contains('selected')) {
            targetSlot.classList.remove('selected');
            state.selectedSlots.delete(targetSlot);
        } else {
            targetSlot.classList.add('selected');
            state.selectedSlots.add(targetSlot);
        }
        updateFormWithSelection();
    }

    // Handle click on an existing event block
    function handleEventClick(eventData) {
        clearSelection(false);
        state.activeEvent = eventData;
        updateSidebarUI('edit', eventData);
        updateMobileFormUI('edit', eventData);

        document.querySelectorAll('.event-block').forEach(el => el.classList.remove('active-event'));
        const eventElement = document.querySelector(`[data-event-id="${eventData._id}"]`);
        if (eventElement) {
            eventElement.classList.add('active-event');
        }
    }

    // Update sidebar form fields based on the selected event
    function updateSidebarUI(mode = 'add', eventData = null) {
        if (mode === 'add') {
            elements.deleteEventBtn.disabled = true;
            elements.recurringCheckbox.checked = false;
            elements.recurringLabelText.textContent = 'Apply to all weeks';
            clearForm();
        } else if (mode === 'edit') {
            const start = eventData.isRecurring ?
                eventData.recurringStartTime :
                new Date(eventData.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const end = eventData.isRecurring ?
                eventData.recurringEndTime :
                new Date(eventData.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const dayOfWeek = eventData.isRecurring ? 
                ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(eventData.dayOfWeek) :
                new Date(eventData.startTime).getDay();

            elements.eventDaySelect.value = (dayOfWeek + 6) % 7;
            elements.eventStartTime.value = start;
            elements.eventEndTime.value = end;
            elements.eventTitleInput.value = eventData.title || '';
            
            document.querySelector(`input[name="event-type"][value="${eventData.type}"]`).checked = true;
            
            elements.deleteEventBtn.disabled = false;
            elements.recurringCheckbox.checked = eventData.isRecurring;
            elements.recurringLabelText.textContent = eventData.isRecurring ?
                'Change all recurring events' :
                'Change only this event';
        }
    }

    // Update mobile form fields based on the selected event
    function updateMobileFormUI(mode = 'add', eventData = null) {
        if (mode === 'add') {
            elements.mobileDeleteBtn.disabled = true;
            elements.mobileRecurringCheckbox.checked = false;
            clearMobileForm();
        } else if (mode === 'edit') {
            const start = eventData.isRecurring ?
                eventData.recurringStartTime :
                new Date(eventData.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const end = eventData.isRecurring ?
                eventData.recurringEndTime :
                new Date(eventData.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const dayOfWeek = eventData.isRecurring ? 
                ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(eventData.dayOfWeek) :
                new Date(eventData.startTime).getDay();

            elements.mobileDaySelect.value = (dayOfWeek + 6) % 7;
            elements.mobileStartTime.value = start;
            elements.mobileEndTime.value = end;
            elements.mobileEventTitleInput.value = eventData.title || '';
            mobileEventTypeSelect.value = eventData.type;
            
            elements.mobileDeleteBtn.disabled = false;
            elements.mobileRecurringCheckbox.checked = eventData.isRecurring;
        }
    }

    // Validate main form inputs
    function updateFormValidity() {
        const hasValidInput = elements.eventDaySelect.value !== '' && 
                             elements.eventStartTime.value !== '' && 
                             elements.eventEndTime.value !== '' && 
                             elements.eventTitleInput.value.trim() !== '';
        elements.saveEventBtn.disabled = !hasValidInput;
    }

    // Validate mobile form inputs
    function updateMobileFormValidity() {
        const hasValidInput = elements.mobileDaySelect.value !== '' && 
                             elements.mobileStartTime.value !== '' && 
                             elements.mobileEndTime.value !== '' && 
                             elements.mobileEventTitleInput.value.trim() !== '';
        elements.mobileSaveBtn.disabled = !hasValidInput;
    }

    // Reset desktop form
    function clearForm() {
        elements.eventDaySelect.value = '0';
        elements.eventStartTime.value = '08:00';
        elements.eventEndTime.value = '09:00';
        elements.eventTitleInput.value = '';
        document.querySelector('input[name="event-type"][value="busy"]').checked = true;
        elements.recurringCheckbox.checked = false;
        elements.selectionTimeRange.textContent = 'აირჩიეთ დრო კალენდარზე';
        updateFormValidity();
    }

    // Reset mobile form
    function clearMobileForm() {
        elements.mobileDaySelect.value = '0';
        elements.mobileStartTime.value = '08:00';
        elements.mobileEndTime.value = '09:00';
        elements.mobileEventTitleInput.value = '';
        elements.mobileEventTypeSelect.value = 'busy';
        elements.mobileRecurringCheckbox.checked = false;
        elements.mobileDeleteBtn.disabled = true;
        updateMobileFormValidity();
    }

    // Clear all selected slots and active events
    function clearSelection(resetSidebar = true) {
        document.querySelectorAll('.time-slot.selected').forEach(s => s.classList.remove('selected'));
        state.selectedSlots.clear();

        document.querySelectorAll('.event-block.active-event').forEach(el => el.classList.remove('active-event'));
        state.activeEvent = null;

        if (resetSidebar) {
            updateSidebarUI('add');
        }
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

        if (now < startOfWeek || now > endOfWeek) {
            elements.currentTimeIndicator.style.display = 'none';
            if (elements.dayViewCurrentTimeIndicator) elements.dayViewCurrentTimeIndicator.style.display = 'none';
            return;
        }

        const timeInMinutes = now.getHours() * 60 + now.getMinutes();
        if (timeInMinutes < 8 * 60 || timeInMinutes >= 22 * 60) {
            elements.currentTimeIndicator.style.display = 'none';
            if (elements.dayViewCurrentTimeIndicator) elements.dayViewCurrentTimeIndicator.style.display = 'none';
            return;
        }

        const top = ((timeInMinutes - 8 * 60) / 30) * (state.isMobile ? 40 : 45);
        
        // Update week view indicator
        const weekViewDayColumn = document.querySelector(`.week-view .day-column[data-day="${dayOfWeek}"]`);
        if (weekViewDayColumn) {
            elements.currentTimeIndicator.style.top = `${top}px`;
            elements.currentTimeIndicator.style.left = `${weekViewDayColumn.offsetLeft}px`;
            elements.currentTimeIndicator.style.display = 'block';
        }

        // Update day view indicator if applicable
        if (elements.dayViewCurrentTimeIndicator && dayOfWeek === state.activeDayIndex) {
            elements.dayViewCurrentTimeIndicator.style.top = `${top}px`;
            elements.dayViewCurrentTimeIndicator.style.display = 'block';
        }
    }

    // Start the application
    initializeCalendar();
});
