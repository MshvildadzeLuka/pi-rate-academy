// file: client/calendar/calendar.js
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = '/api';

    // Enhanced state management for mobile
    const state = {
        mainViewDate: new Date(),
        miniCalDate: new Date(),
        allEvents: [],
        selectedSlots: new Set(),
        activeEvent: null,
        userGroups: [],
        isRecurring: false,
        isDragging: false,
        dragStartSlot: null,
        // Mobile-specific state
        activeDayIndex: (new Date().getDay() + 6) % 7,
        mobileView: 'day', // 'day', 'week', 'time'
        mobileActiveDate: new Date(), // FIX: Ensure this is always a Date object
        // Draggable FAB state
        isFabDragging: false,
        fabOffsetX: 0,
        fabOffsetY: 0,
        // Touch/swipe state
        touchStartX: 0,
        touchStartY: 0,
    };
    
    // FIX: New utility function to correctly preserve local date and time components 
    // without UTC offset logic when sending to the server.
    const toLocalISOString = (date) => {
        if (!date) return null;
        const pad = (num) => num.toString().padStart(2, '0');
        const YYYY = date.getFullYear();
        const MM = pad(date.getMonth() + 1);
        const DD = pad(date.getDate());
        const HH = pad(date.getHours());
        const mm = pad(date.getMinutes());
        return `${YYYY}-${MM}-${DD}T${HH}:${mm}`;
    };

    // Helper function to check if an event is recurring (re-used logic)
    const eventIsRecurring = (event) => {
        return event.isRecurring && event.dayOfWeek && event.recurringStartTime && event.recurringEndTime;
    };
    
    // FIX: New Helper for consistent date string comparison (local date from UTC components)
    const eventDateToLocalDayString = (date) => {
        const pad = (num) => num.toString().padStart(2, '0');
        // Use UTC getters because the server stores the local time components in the UTC fields
        return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
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
            const endOfWeek = getEndOfWeek(state.mainViewDate);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            
            const personalEventsResponse = await apiFetch(
                // Use ISOString here because the server expects standard time query
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

    // Enhanced DOM Elements for mobile
    const elements = {
        // Desktop elements
        pageWrapper: document.querySelector('.page-wrapper'),
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
        sidebarCloseBtn: document.getElementById('sidebar-close-btn'),
        calendarGrid: document.querySelector('.calendar-grid'),
        dayHeaders: document.querySelectorAll('.day-column-header'),
        
        // Mobile elements
        mobileBottomNav: document.querySelector('.mobile-bottom-nav'),
        mobileNavItems: document.querySelectorAll('.mobile-nav-item'),
        mobileDayView: document.querySelector('.mobile-day-view'),
        mobileWeekView: document.querySelector('.mobile-week-view'),
        mobileTimeGrid: document.querySelector('.mobile-time-grid'),
        mobileDayTitle: document.getElementById('mobile-day-title'),
        mobileDayEvents: document.getElementById('mobile-day-events'),
        mobileWeekDays: document.getElementById('mobile-week-days'),
        mobileWeekEvents: document.getElementById('mobile-week-events'),
        mobileTimeSlots: document.getElementById('mobile-time-slots'),
        mobilePrevDayBtn: document.getElementById('mobile-prev-day'),
        mobileNextDayBtn: document.getElementById('mobile-next-day'),
        mobileAddEventBtn: document.getElementById('mobile-add-event-btn'),
        mobileFormContainer: document.getElementById('mobile-form-container'),
        mobileFormTitle: document.getElementById('mobile-form-title'),
        mobileFormClose: document.getElementById('mobile-form-close'),
        mobileForm: document.getElementById('event-mobile-form'),
        mobileDaySelect: document.getElementById('event-mobile-day-select'),
        mobileStartTime: document.getElementById('event-mobile-start-time'),
        mobileEndTime: document.getElementById('event-mobile-end-time'),
        mobileTitleInput: document.getElementById('event-mobile-title-input'),
        mobileRecurringCheckbox: document.getElementById('event-mobile-recurring-checkbox'),
        mobileDeleteBtn: document.getElementById('event-mobile-delete-btn'),
        mobileSaveBtn: document.getElementById('event-mobile-save-btn'),
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
            
            // Update mobile views if on mobile
            if (window.innerWidth <= 1199) {
                renderMobileDayView();
                renderMobileWeekView();
                renderMobileTimeGridView();
            }
        } catch (error) {
            console.error('Failed to load events:', error);
            state.allEvents = [];
        } finally {
            document.body.classList.remove('loading');
        }
    }

    // Handle saving a new event or updating an existing one
    async function saveEvent(isMobile = false) {
        let type, isRecurring, title, dayIndex, startTimeStr, endTimeStr, form;

        // Determine the active form
        if (isMobile) {
            form = document.getElementById('event-mobile-form');
        } else if (elements.calendarSidebar.classList.contains('open')) {
            form = document.getElementById('event-form');
        } else if (!elements.eventModalBackdrop.classList.contains('hidden')) {
            form = document.getElementById('event-modal-form');
        } else {
            showNotification('Form context error. Try again.', 'error');
            return;
        }
        
        // Extract values using general IDs which should match the active form's inputs
        type = form.querySelector('input[name="event-type"]:checked')?.value;
        isRecurring = form.querySelector('[id$="-recurring-checkbox"]')?.checked;
        title = form.querySelector('[id$="-title-input"]')?.value;
        dayIndex = form.querySelector('[id$="-day-select"]')?.value;
        startTimeStr = form.querySelector('[id$="-start-time"]')?.value;
        endTimeStr = form.querySelector('[id$="-end-time"]')?.value;
        
        if (!title || !dayIndex || !startTimeStr || !endTimeStr || !type) {
            showNotification('გთხოვთ, შეავსოთ ყველა ველი', 'error');
            return;
        }

        const dateFromForm = new Date(getStartOfWeek(state.mainViewDate));
        dateFromForm.setDate(dateFromForm.getDate() + parseInt(dayIndex));
        
        const [startH, startM] = startTimeStr.split(':').map(Number);
        const startDate = new Date(dateFromForm);
        startDate.setHours(startH, startM);

        const [endH, endM] = endTimeStr.split(':').map(Number);
        const endDate = new Date(dateFromForm);
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
            payload.startTime = null; 
            payload.endTime = null; 
        } else {
            // FIX: Use the fixed toLocalISOString to ensure the time components are preserved
            payload.startTime = toLocalISOString(startDate); 
            payload.endTime = toLocalISOString(endDate);
            payload.dayOfWeek = null;
            payload.recurringStartTime = null;
            payload.recurringEndTime = null;
        }

        try {
            const saveButton = form.querySelector('[id$="-save-btn"]');
            saveButton.disabled = true;
            saveButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;

            await apiService.saveEvent(payload);

            // Fetch all events again to get the server-processed version
            await fetchEvents(); 
            clearSelection();
            renderEventsForWeek();
            
            // Update mobile views
            if (window.innerWidth <= 1199) {
                renderMobileDayView();
                renderMobileWeekView();
                renderMobileTimeGridView();
            }
            
            showNotification('მოვლენა წარმატებით შეინახა!', 'success');
            
            // Close appropriate form
            if (isMobile) {
                elements.mobileFormContainer.classList.remove('active');
            } else {
                elements.eventModalBackdrop.classList.add('hidden');
                elements.calendarSidebar.classList.remove('open');
                elements.pageWrapper.classList.remove('sidebar-open');
            }
        } catch (error) {
            console.error('მოვლენის შენახვა ვერ მოხერხდა:', error);
            showNotification('მოვლენის შენახვა ვერ მოხერხდა: ' + error.message, 'error');
        } finally {
             const saveButton = form.querySelector('[id$="-save-btn"]');
             saveButton.disabled = false;
             saveButton.innerHTML = `<i class="fas fa-save"></i> შენახვა`;
        }
    }

    // Handle event deletion
    async function deleteEvent(eventId, isMobile = false) {
        if (!confirm('Are you sure you want to delete this event?')) return;

        const event = state.allEvents.find(e => e._id === eventId);
        if (!event) return;

        const isRecurring = isMobile ? 
            elements.mobileRecurringCheckbox.checked : 
            elements.recurringCheckbox.checked;

        try {
            await apiService.deleteEvent(eventId, {
                dateString: event.startTime ? new Date(event.startTime).toISOString().split('T')[0] : null,
                deleteAllRecurring: isRecurring
            });

            state.allEvents = state.allEvents.filter(e => e._id !== eventId);
            clearSelection();
            renderEventsForWeek();
            
            // Update mobile views
            if (window.innerWidth <= 1199) {
                renderMobileDayView();
                renderMobileWeekView();
                renderMobileTimeGridView();
            }
            
            showNotification('მოვლენა წარმატებით წაიშალა!', 'success');
            
            // Close appropriate form
            if (isMobile) {
                elements.mobileFormContainer.classList.remove('active');
            } else {
                elements.eventModalBackdrop.classList.add('hidden');
                elements.calendarSidebar.classList.remove('open');
                elements.pageWrapper.classList.remove('sidebar-open');
            }
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
        
        // Render mobile views if on mobile
        if (window.innerWidth <= 1199) {
            renderMobileDayView();
            renderMobileWeekView();
            renderMobileTimeGridView();
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
        const endOfWeek = getEndOfWeek(startOfWeek);
        endOfWeek.setHours(23, 59, 59, 999); 
        
        const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        
        // Filter out event exceptions
        const eventsToRender = state.allEvents.filter(event => 
            !(event.title && event.title.startsWith('DELETED:')) && event.type
        );
        
        const slotHeight = getComputedStyle(document.documentElement).getPropertyValue('--calendar-slot-height').trim();
        const slotHeightValue = parseFloat(slotHeight);

        document.querySelectorAll('.event-block').forEach(el => el.remove());

        const dayColumns = document.querySelectorAll('#calendar-main-grid .day-column');

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const currentDayDate = new Date(startOfWeek);
            currentDayDate.setDate(currentDayDate.getDate() + dayIndex);
            
            // FIX: Use simple ISO date string comparison for accurate date matching
            const currentDayDateStr = currentDayDate.toISOString().split('T')[0];
            const dayName = dayNames[dayIndex];
            const dayColumnsArray = Array.from(dayColumns);
            const dayColumn = dayColumnsArray[dayIndex];

            eventsToRender.forEach(event => {
                let render = false;
                let startTimeStr, endTimeStr;
                
                // Check if the current day is an exception for a recurring event
                const isException = state.allEvents.some(exc => 
                    exc.exceptionDate === currentDayDateStr && exc.title === `DELETED: ${event._id}`
                );
                
                if (isException) {
                    return;
                }
                
                // Consolidated and corrected logic for both personal events and lectures
                if (event.isRecurring) {
                    // Recurring events must match the day of week
                    if (event.dayOfWeek === dayName) {
                        render = true;
                        startTimeStr = ensureTimeFormat(event.recurringStartTime);
                        endTimeStr = ensureTimeFormat(event.recurringEndTime);
                    }
                } else if (event.startTime) {
                    const eventStartDate = new Date(event.startTime);
                    
                    // FIX: Use simple ISO date string comparison for accurate date matching
                    const eventDayStr = eventStartDate.toISOString().split('T')[0];

                    if (eventDayStr === currentDayDateStr) {
                        render = true;
                        // FIX: Extract time components using UTC getters, as server saved local time components as UTC.
                        startTimeStr = `${String(eventStartDate.getUTCHours()).padStart(2, '0')}:${String(eventStartDate.getUTCMinutes()).padStart(2, '0')}`;
                        const eventEndDate = new Date(event.endTime);
                        endTimeStr = `${String(eventEndDate.getUTCHours()).padStart(2, '0')}:${String(eventEndDate.getUTCMinutes()).padStart(2, '0')}`;
                    }
                }

                if (render) {
                    renderEventBlock({ ...event, startTime: startTimeStr, endTime: endTimeStr }, dayColumn, false, slotHeightValue);
                }
            });
        }
    }


    // Mobile-specific rendering functions
    function renderMobileDayView() {
        if (!elements.mobileDayView || !elements.mobileDayEvents) return;
        
        const currentDate = new Date(state.mobileActiveDate);
        elements.mobileDayTitle.textContent = currentDate.toLocaleDateString('ka-GE', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        elements.mobileDayEvents.innerHTML = '';
        
        const dayStr = currentDate.toISOString().split('T')[0];
        const dayIndex = (currentDate.getDay() + 6) % 7;
        const dayName = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][dayIndex];
        
        const dayEvents = state.allEvents.filter(event => {
            if (event.title && event.title.startsWith('DELETED:')) return false;
            
            if (event.isRecurring) {
                return event.dayOfWeek === dayName;
            } else if (event.startTime) {
                const eventDate = new Date(event.startTime);
                // FIX: Now compare the intended local date string
                const eventDayStr = eventDateToLocalDayString(eventDate);
                const currentDayStr = eventDateToLocalDayString(currentDate);

                return eventDayStr === currentDayStr;
            }
            return false;
        }).sort((a, b) => {
            const aTime = eventIsRecurring(a) ? timeToMinutes(a.recurringStartTime) : (a.startTime ? new Date(a.startTime).getUTCHours() * 60 + new Date(a.startTime).getUTCMinutes() : 0);
            const bTime = eventIsRecurring(b) ? timeToMinutes(b.recurringStartTime) : (b.startTime ? new Date(b.startTime).getUTCHours() * 60 + new Date(b.startTime).getUTCMinutes() : 0);
            return aTime - bTime;
        });
        
        if (dayEvents.length === 0) {
            elements.mobileDayEvents.innerHTML = `
                <div class="mobile-empty-state">
                    <i class="fas fa-calendar-plus"></i>
                    <h3>ამ დღეს მოვლენები არაა</h3>
                    <p>დაამატეთ ახალი მოვლენა ქვემოთ მდებარე ღილაკით</p>
                </div>
            `;
            return;
        }
        
        dayEvents.forEach(event => {
            const eventElement = document.createElement('div');
            eventElement.className = `mobile-event-card event-${event.type}`;
            eventElement.dataset.eventId = event._id;
            
            const startTime = eventIsRecurring(event) ? 
                formatTime(event.recurringStartTime) : 
                formatTimeUTC(new Date(event.startTime));
                
            const endTime = eventIsRecurring(event) ? 
                formatTime(event.recurringEndTime) : 
                formatTimeUTC(new Date(event.endTime));
            
            let title = event.title || event.type.toUpperCase();
            if (event.type === 'lecture' && event.groupName) {
                title += ` (${event.groupName})`;
            }
            
            eventElement.innerHTML = `
                <div class="mobile-event-time">${startTime} - ${endTime}</div>
                <div class="mobile-event-title">${title}</div>
                ${event.description ? `<div class="mobile-event-details">${event.description}</div>` : ''}
            `;
            
            if (event.type !== 'lecture') {
                eventElement.addEventListener('click', () => handleMobileEventClick(event));
            }
            
            elements.mobileDayEvents.appendChild(eventElement);
        });
    }
    
    function renderMobileWeekView() {
        if (!elements.mobileWeekDays || !elements.mobileWeekEvents) return;
        
        elements.mobileWeekDays.innerHTML = '';
        elements.mobileWeekEvents.innerHTML = '';
        
        const startOfWeek = getStartOfWeek(state.mobileActiveDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Create day headers
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek);
            dayDate.setDate(dayDate.getDate() + i);
            
            const dayElement = document.createElement('div');
            dayElement.className = 'mobile-week-day';
            if (i === state.activeDayIndex) {
                dayElement.classList.add('active');
            }
            if (dayDate.toDateString() === today.toDateString()) {
                dayElement.classList.add('current');
            }
            
            dayElement.innerHTML = `
                <span class="mobile-week-day-number">${dayDate.getDate()}</span>
                <span class="mobile-week-day-name">${dayDate.toLocaleDateString('ka-GE', { weekday: 'short' })}</span>
            `;
            
            dayElement.addEventListener('click', () => {
                state.activeDayIndex = i;
                state.mobileActiveDate = new Date(dayDate);
                switchMobileView('day');
                renderMobileDayView();
            });
            
            elements.mobileWeekDays.appendChild(dayElement);
        }
        
        // Show events for the active day in week view
        const activeDayDate = new Date(startOfWeek);
        activeDayDate.setDate(activeDayDate.getDate() + state.activeDayIndex);
        const dayStr = activeDayDate.toISOString().split('T')[0];
        const dayName = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][state.activeDayIndex];
        
        const dayEvents = state.allEvents.filter(event => {
            if (event.title && event.title.startsWith('DELETED:')) return false;
            
            if (event.isRecurring) {
                return event.dayOfWeek === dayName;
            } else if (event.startTime) {
                const eventDate = new Date(event.startTime);
                const eventDayStr = eventDateToLocalDayString(eventDate);
                const activeDayStr = eventDateToLocalDayString(activeDayDate);
                
                return eventDayStr === activeDayStr;
            }
            return false;
        }).sort((a, b) => {
            const aTime = eventIsRecurring(a) ? timeToMinutes(a.recurringStartTime) : (a.startTime ? new Date(a.startTime).getUTCHours() * 60 + new Date(a.startTime).getUTCMinutes() : 0);
            const bTime = eventIsRecurring(b) ? timeToMinutes(b.recurringStartTime) : (b.startTime ? new Date(b.startTime).getUTCHours() * 60 + new Date(b.startTime).getUTCMinutes() : 0);
            return aTime - bTime;
        });
        
        if (dayEvents.length === 0) {
            elements.mobileWeekEvents.innerHTML = `
                <div class="mobile-empty-state">
                    <i class="fas fa-calendar-plus"></i>
                    <h3>ამ დღეს მოვლენები არაა</h3>
                </div>
            `;
            return;
        }
        
        dayEvents.forEach(event => {
            const eventElement = document.createElement('div');
            eventElement.className = `mobile-event-card event-${event.type}`;
            eventElement.dataset.eventId = event._id;
            
            const startTime = eventIsRecurring(event) ? 
                formatTime(event.recurringStartTime) : 
                formatTimeUTC(new Date(event.startTime));
                
            const endTime = eventIsRecurring(event) ? 
                formatTime(event.recurringEndTime) : 
                formatTimeUTC(new Date(event.endTime));
            
            let title = event.title || event.type.toUpperCase();
            if (event.type === 'lecture' && event.groupName) {
                title += ` (${event.groupName})`;
            }
            
            eventElement.innerHTML = `
                <div class="mobile-event-time">${startTime} - ${endTime}</div>
                <div class="mobile-event-title">${title}</div>
            `;
            
            if (event.type !== 'lecture') {
                eventElement.addEventListener('click', () => handleMobileEventClick(event));
            }
            
            elements.mobileWeekEvents.appendChild(eventElement);
        });
    }
    
    function renderMobileTimeGridView() {
        if (!elements.mobileTimeSlots) return;
        
        elements.mobileTimeSlots.innerHTML = '';
        
        for (let hour = 8; hour < 23; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const timeSlot = document.createElement('div');
                timeSlot.className = 'mobile-time-slot';
                
                const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                const timeLabel = formatTime(timeStr);
                
                // Find events happening at this time
                const currentEvents = state.allEvents.filter(event => {
                    if (event.title && event.title.startsWith('DELETED:')) return false;
                    
                    let eventStart, eventEnd;
                    if (event.isRecurring) {
                        eventStart = timeToMinutes(event.recurringStartTime);
                        eventEnd = timeToMinutes(event.recurringEndTime);
                    } else if (event.startTime) {
                        const startDate = new Date(event.startTime);
                        const endDate = new Date(event.endTime);
                        eventStart = startDate.getUTCHours() * 60 + startDate.getUTCMinutes();
                        eventEnd = endDate.getUTCHours() * 60 + endDate.getUTCMinutes();
                    } else {
                        return false;
                    }
                    
                    const slotTime = hour * 60 + minute;
                    return slotTime >= eventStart && slotTime < eventEnd;
                });
                
                timeSlot.innerHTML = `
                    <div class="mobile-time-label">${timeLabel}</div>
                    <div class="mobile-time-content">
                        ${currentEvents.map(event => {
                            let title = event.title || event.type.toUpperCase();
                            if (event.type === 'lecture' && event.groupName) {
                                title += ` (${event.groupName})`;
                            }
                            return `<div class="mobile-time-event event-${event.type}">${title}</div>`;
                        }).join('')}
                    </div>
                `;
                
                // Make slot clickable for adding events
                if (currentEvents.length === 0) {
                    timeSlot.addEventListener('click', () => {
                        openMobileEventForm();
                        // Pre-fill the time
                        elements.mobileStartTime.value = timeStr;
                        const endTime = minutesToTime(timeToMinutes(timeStr) + 60); // Default 1 hour duration
                        elements.mobileEndTime.value = endTime;
                    });
                }
                
                elements.mobileTimeSlots.appendChild(timeSlot);
            }
        }
    }
    
    function switchMobileView(view) {
        state.mobileView = view;
        
        // Update active nav item
        elements.mobileNavItems.forEach(item => {
            if (item.dataset.view === view) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Show/hide appropriate views
        elements.mobileDayView.style.display = view === 'day' ? 'flex' : 'none';
        elements.mobileWeekView.style.display = view === 'week' ? 'flex' : 'none';
        elements.mobileTimeGrid.style.display = view === 'time' ? 'flex' : 'none';
    }
    
    function openMobileEventForm(event = null) {
        elements.mobileFormContainer.classList.add('active');
        
        if (event) {
            // Editing existing event
            elements.mobileFormTitle.textContent = 'მოვლენის რედაქტირება';
            elements.mobileDeleteBtn.disabled = false;
            
            const dayOfWeek = eventIsRecurring(event) ? 
                ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(event.dayOfWeek) :
                (new Date(event.startTime).getUTCDay() + 6) % 7; // FIX: Use UTC day
                
            const startTime = eventIsRecurring(event) ? 
                event.recurringStartTime : 
                `${String(new Date(event.startTime).getUTCHours()).padStart(2, '0')}:${String(new Date(event.startTime).getUTCMinutes()).padStart(2, '0')}`; // FIX: Use UTC getters
                
            const endTime = eventIsRecurring(event) ? 
                event.recurringEndTime : 
                `${String(new Date(event.endTime).getUTCHours()).padStart(2, '0')}:${String(new Date(event.endTime).getUTCMinutes()).padStart(2, '0')}`; // FIX: Use UTC getters
            
            elements.mobileDaySelect.value = dayOfWeek;
            elements.mobileStartTime.value = startTime;
            elements.mobileEndTime.value = endTime;
            elements.mobileTitleInput.value = event.title || '';
            
            const typeRadio = elements.mobileForm.querySelector(`input[name="event-type"][value="${event.type}"]`);
            if (typeRadio) typeRadio.checked = true;
            
            elements.mobileRecurringCheckbox.checked = event.isRecurring || false;
            
            // Store the event being edited
            state.activeEvent = event;
            updateFormValidity(elements.mobileForm);
        } else {
            // Creating new event
            elements.mobileFormTitle.textContent = 'ახალი მოვლენა';
            elements.mobileDeleteBtn.disabled = true;
            
            // Set default values
            elements.mobileDaySelect.value = state.activeDayIndex;
            elements.mobileStartTime.value = '08:00';
            elements.mobileEndTime.value = '09:00';
            elements.mobileTitleInput.value = '';
            
            const typeRadio = elements.mobileForm.querySelector('input[name="event-type"][value="busy"]');
            if (typeRadio) typeRadio.checked = true;
            
            elements.mobileRecurringCheckbox.checked = false;
            
            state.activeEvent = null;
            updateFormValidity(elements.mobileForm);
        }
    }
    
    function handleMobileEventClick(event) {
        openMobileEventForm(event);
    }

    // Helper function to create and position an event block
    function renderEventBlock(eventData, dayColumn, isException = false, slotHeight) {
        if (isException || !dayColumn) return;

        const startMinutes = timeToMinutes(eventData.startTime);
        const endMinutes = timeToMinutes(eventData.endTime);
        const durationMinutes = endMinutes - startMinutes;

        // Visual grid starts at 8 AM (480 minutes)
        const START_OF_GRID_MINUTES = 8 * 60; 

        // Correct calculation relative to the grid start
        const top = ((startMinutes - START_OF_GRID_MINUTES) / 30) * slotHeight;
        const height = (durationMinutes / 30) * slotHeight - 2;

        // Skip events outside the 8 AM - 11 PM visual range
        if (top < 0 || (startMinutes > 23 * 60)) return;


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
        // Desktop event listeners
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
        
        elements.eventForm.addEventListener('change', () => updateFormValidity(elements.eventForm));


        elements.eventModalSaveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveEvent(false);
        });
        
        if (document.getElementById('event-modal-form')) {
            document.getElementById('event-modal-form').addEventListener('change', () => updateFormValidity(document.getElementById('event-modal-form')));
        }
        
        
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
            updateFormValidity(elements.eventForm);
        });

        // Unified Sidebar Toggle Functionality
        const toggleSidebar = () => {
            const isOpening = !elements.calendarSidebar.classList.contains('open');
            elements.calendarSidebar.classList.toggle('open');
            elements.pageWrapper.classList.toggle('sidebar-open');
            
            if (isOpening) {
                // When opening, reset the form for a new event
                clearForm();
            } else {
                // When closing, clear selection in case user was selecting on calendar grid
                clearSelection();
            }
        };

        if (elements.addEventDesktopBtn) {
            elements.addEventDesktopBtn.addEventListener('click', toggleSidebar);
        }
        
        if (elements.sidebarCloseBtn) {
            elements.sidebarCloseBtn.addEventListener('click', toggleSidebar);
        }
        
        // Mobile event listeners
        if (elements.mobileNavItems) {
            elements.mobileNavItems.forEach(item => {
                item.addEventListener('click', () => {
                    const view = item.dataset.view;
                    if (view) {
                        switchMobileView(view);
                    }
                });
            });
        }
        
        if (elements.mobileAddEventBtn) {
            elements.mobileAddEventBtn.addEventListener('click', () => {
                openMobileEventForm();
            });
        }
        
        if (elements.mobileFormClose) {
            elements.mobileFormClose.addEventListener('click', () => {
                elements.mobileFormContainer.classList.remove('active');
                clearSelection();
            });
        }
        
        if (elements.mobileForm) {
            elements.mobileForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveEvent(true);
            });
            elements.mobileForm.addEventListener('change', () => updateFormValidity(elements.mobileForm));
        }
        
        if (elements.mobileDeleteBtn) {
            elements.mobileDeleteBtn.addEventListener('click', () => {
                if (state.activeEvent) deleteEvent(state.activeEvent._id, true);
            });
        }
        
        if (elements.mobilePrevDayBtn) {
            elements.mobilePrevDayBtn.addEventListener('click', () => {
                // FIX: Use the state object directly to manipulate the date
                state.mobileActiveDate.setDate(state.mobileActiveDate.getDate() - 1);
                renderMobileDayView();
            });
        }
        
        if (elements.mobileNextDayBtn) {
            elements.mobileNextDayBtn.addEventListener('click', () => {
                // FIX: Use the state object directly to manipulate the date
                state.mobileActiveDate.setDate(state.mobileActiveDate.getDate() + 1);
                renderMobileDayView();
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
        
        // Touch/swipe gestures for mobile
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);
    }

    // Touch gesture handlers for mobile
    function handleTouchStart(e) {
        if (window.innerWidth > 1199) return; // Only on mobile
        
        state.touchStartX = e.touches[0].clientX;
        state.touchStartY = e.touches[0].clientY;
    }
    
    function handleTouchMove(e) {
        if (window.innerWidth > 1199) return; // Only on mobile
        
        if (!state.touchStartX || !state.touchStartY) return;
        
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        
        const diffX = state.touchStartX - touchX;
        const diffY = state.touchStartY - touchY;
        
        // Horizontal swipe (for day navigation)
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
            e.preventDefault(); // Prevent scroll when swiping horizontally
            
            if (diffX > 0) {
                // Swipe left - next day
                state.mobileActiveDate.setDate(state.mobileActiveDate.getDate() + 1);
            } else {
                // Swipe right - previous day
                state.mobileActiveDate.setDate(state.mobileActiveDate.getDate() - 1);
            }
            
            renderMobileDayView();
            state.touchStartX = null;
            state.touchStartY = null;
        }
    }
    
    function handleTouchEnd() {
        state.touchStartX = null;
        state.touchStartY = null;
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
        const isMobileView = window.innerWidth <= 1199;

        if (isMobileView) {
            elements.addEventDesktopBtn.style.display = 'none';
            elements.addEventFab.classList.remove('hidden');
            // Ensure sidebar is closed on mobile
            elements.calendarSidebar.classList.remove('open');
            elements.pageWrapper.classList.remove('sidebar-open');
            
            // Initialize mobile view if not already done
            if (state.mobileView === 'day') {
                renderMobileDayView();
            }
        } else {
            elements.addEventDesktopBtn.style.display = 'flex';
            elements.addEventFab.classList.add('hidden');
            
            // Ensure mobile form is closed on desktop
            elements.mobileFormContainer.classList.remove('active');
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
            // Open modal if it's not already open and not in sidebar view
            if (!elements.calendarSidebar.classList.contains('open')) {
                elements.eventModalBackdrop.classList.remove('hidden');
            }
        } else {
            clearSelection();
        }
    }

    // Update form inputs with selected slots
    function updateFormWithSelection() {
        if (state.selectedSlots.size === 0) {
            clearSelection();
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

        // Update both sidebar and modal form inputs
        if(elements.eventDaySelect) elements.eventDaySelect.value = firstSlot.dataset.day;
        if(elements.eventStartTime) elements.eventStartTime.value = startTime;
        if(elements.eventEndTime) elements.eventEndTime.value = endTime;
        updateFormValidity(elements.eventForm);

        if(elements.eventModalDaySelect) elements.eventModalDaySelect.value = firstSlot.dataset.day;
        if(elements.eventModalStartTime) elements.eventModalStartTime.value = startTime;
        if(elements.eventModalEndTime) elements.eventModalEndTime.value = endTime;
        updateFormValidity(document.getElementById('event-modal-form'));
    }

    // Handle click on an existing event block
    function handleEventClick(eventData) {
        clearSelection(false);
        state.activeEvent = eventData;
        
        // FIX: Use UTC day for recurring events to avoid incorrect day mapping
        const dayOfWeek = eventIsRecurring(eventData) ? 
            ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(eventData.dayOfWeek) :
            (new Date(eventData.startTime).getUTCDay() + 6) % 7;
            
        const startTime = eventIsRecurring(eventData) ? 
            eventData.recurringStartTime : 
            `${String(new Date(eventData.startTime).getUTCHours()).padStart(2, '0')}:${String(new Date(eventData.startTime).getUTCMinutes()).padStart(2, '0')}`;
            
        const endTime = eventIsRecurring(eventData) ? 
            eventData.recurringEndTime : 
            `${String(new Date(eventData.endTime).getUTCHours()).padStart(2, '0')}:${String(new Date(eventData.endTime).getUTCMinutes()).padStart(2, '0')}`;
            
        const eventTitle = eventData.title || '';
        const eventType = eventData.type;
        const isRecurring = eventData.isRecurring;
        
        // Populate the correct form based on screen size
        if (window.innerWidth > 1199) {
            elements.calendarSidebar.classList.add('open');
            elements.pageWrapper.classList.add('sidebar-open');
            
            // Populate sidebar form
            const form = elements.eventForm;
            if(form.querySelector('[id$="-day-select"]')) form.querySelector('[id$="-day-select"]').value = dayOfWeek;
            if(form.querySelector('[id$="-start-time"]')) form.querySelector('[id$="-start-time"]').value = startTime;
            if(form.querySelector('[id$="-end-time"]')) form.querySelector('[id$="-end-time"]').value = endTime;
            if(form.querySelector('[id$="-title-input"]')) form.querySelector('[id$="-title-input"]').value = eventTitle;
            const busyRadio = form.querySelector(`input[name="event-type"][value="${eventType}"]`);
            if(busyRadio) busyRadio.checked = true;
            if(elements.recurringCheckbox) elements.recurringCheckbox.checked = isRecurring;
            if(elements.deleteEventBtn) elements.deleteEventBtn.disabled = false;
            updateFormValidity(form);

        } else {
             openMobileEventForm(eventData);
        }
        
        document.querySelectorAll('.event-block').forEach(el => el.classList.remove('active-event'));
        const eventElement = document.querySelector(`[data-event-id="${eventData._id}"]`);
        if (eventElement) {
            eventElement.classList.add('active-event');
        }
    }

    // Validate a form
    function updateFormValidity(form) {
        if (!form) return;
        
        const titleInput = form.querySelector('[id$="-title-input"]');
        const daySelect = form.querySelector('[id$="-day-select"]');
        const startTimeInput = form.querySelector('[id$="-start-time"]');
        const endTimeInput = form.querySelector('[id$="-end-time"]');
        const saveButton = form.querySelector('[id$="-save-btn"]');
        
        const hasValidInput = titleInput?.value.trim() !== '' && 
                             daySelect?.value !== '' && 
                             startTimeInput?.value !== '' && 
                             endTimeInput?.value !== '';
        
        if (saveButton) {
            saveButton.disabled = !hasValidInput;
        }
    }

    // Reset forms
    function clearForm() {
        // Reset Sidebar Form
        if(elements.eventForm) {
            if(elements.eventDaySelect) elements.eventDaySelect.value = '0';
            if(elements.eventStartTime) elements.eventStartTime.value = '08:00';
            if(elements.eventEndTime) elements.eventEndTime.value = '09:00';
            if(elements.eventTitleInput) elements.eventTitleInput.value = '';
            const busyRadio = elements.eventForm.querySelector('input[name="event-type"][value="busy"]');
            if(busyRadio) busyRadio.checked = true;
            if(elements.recurringCheckbox) elements.recurringCheckbox.checked = false;
            if(elements.deleteEventBtn) elements.deleteEventBtn.disabled = true;
            updateFormValidity(elements.eventForm);
        }
        
        // Reset Modal Form
        const modalForm = document.getElementById('event-modal-form');
        if(modalForm) {
            if(elements.eventModalDaySelect) elements.eventModalDaySelect.value = '0';
            if(elements.eventModalStartTime) elements.eventModalStartTime.value = '08:00';
            if(elements.eventModalEndTime) elements.eventModalEndTime.value = '09:00';
            if(elements.eventModalTitleInput) elements.eventModalTitleInput.value = '';
            const busyRadio = modalForm.querySelector('input[name="event-type"][value="busy"]');
            if(busyRadio) busyRadio.checked = true;
            if(elements.eventModalRecurringCheckbox) elements.eventModalRecurringCheckbox.checked = false;
            if(elements.eventModalDeleteBtn) elements.eventModalDeleteBtn.disabled = true;
            updateFormValidity(modalForm);
        }
    }
    
    function clearMobileForm() {
        if(elements.mobileForm) {
            if(elements.mobileDaySelect) elements.mobileDaySelect.value = '0';
            if(elements.mobileStartTime) elements.mobileStartTime.value = '08:00';
            if(elements.mobileEndTime) elements.mobileEndTime.value = '09:00';
            if(elements.mobileTitleInput) elements.mobileTitleInput.value = '';
            const typeRadio = elements.mobileForm.querySelector('input[name="event-type"][value="busy"]');
            if (typeRadio) typeRadio.checked = true;
            if (elements.mobileRecurringCheckbox) elements.mobileRecurringCheckbox.checked = false;
            if (elements.mobileDeleteBtn) elements.mobileDeleteBtn.disabled = true;
            updateFormValidity(elements.mobileForm);
        }
    }

    // Clear all selected slots and active events
    function clearSelection() {
        document.querySelectorAll('.time-slot.selected').forEach(s => s.classList.remove('selected'));
        state.selectedSlots.clear();

        document.querySelectorAll('.event-block.active-event').forEach(el => el.classList.remove('active-event'));
        state.activeEvent = null;

        clearForm();
        clearMobileForm();
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
    
    // FIX: Helper function to consistently get local time from UTC-stored Date objects
    const formatTimeUTC = (date) => {
        if (!date) return '';
        const d = new Date(date);
        const h = d.getUTCHours();
        const m = d.getUTCMinutes();
        const period = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
    }

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
            // Calculate left position based on the element's position within its parent
            const grid = dayColumn.closest('.calendar-grid');
            const timeColumn = grid ? grid.querySelector('.time-column-header') : null;
            const timeColWidth = timeColumn ? timeColumn.offsetWidth : 80;
            const columnWidth = dayColumn.offsetWidth;

            elements.currentTimeIndicator.style.left = `${timeColWidth + (dayOfWeek * columnWidth)}px`;
            elements.currentTimeIndicator.style.width = `${columnWidth}px`;
            elements.currentTimeIndicator.style.display = 'block';
        }
    }

    // Start the application
    initializeCalendar();
});
