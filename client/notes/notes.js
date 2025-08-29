document.addEventListener('DOMContentLoaded', () => {
  /**
   * Sanitizes a string by converting special HTML characters into their corresponding entities.
   * This is a crucial security measure to prevent XSS (Cross-Site Scripting) attacks
   * when rendering data from the API into the DOM.
   * @param {string} str - The raw string to sanitize.
   * @returns {string} The sanitized string, safe for HTML rendering.
   */
  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (match) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[match];
    });
  }

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

  /**
   * Main function to load notes data from the server API and render them.
   */
  async function loadAndRenderNotes() {
    const notesListContainer = document.getElementById('notes-list');
    if (!notesListContainer) return;

    try {
      const notes = await apiFetch('/api/notes');

      if (notes && notes.length > 0) {
        renderNotesGrid(notes, notesListContainer);
      } else {
        renderEmptyMessage(notesListContainer);
      }
    } catch (error) {
      console.error('Error fetching notes data from server:', error);
      notesListContainer.innerHTML = `<div class="empty-notes-message"><p>Could not load notes. Please try again later.</p></div>`;
    }
  }

  /**
   * Renders the grid of note cards with sanitized data to prevent XSS.
   * @param {Array<Object>} notes - The array of note objects.
   * @param {HTMLElement} gridContainer - The container element for the grid.
   */
  function renderNotesGrid(notes, gridContainer) {
    gridContainer.innerHTML = notes
      .map(
        (note) => {
          // Create "safe" variables by sanitizing and validating API data before rendering.
          const safeTitle = escapeHTML(note.title);
          const safeDescription = escapeHTML(note.description);
          // Validate the URL to ensure it's a safe HTTP/HTTPS link.
          const safeFileUrl = (note.fileUrl && note.fileUrl.startsWith('http')) 
            ? note.fileUrl 
            : '#';

          return `
            <div class="note-item">
                <div class="note-thumbnail">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                </div>
                <div class="note-content">
                    <div class="note-info">
                        <h3 class="note-title">${safeTitle}</h3>
                        <p class="note-description">${safeDescription}</p>
                    </div>
                    <div class="note-actions">
                        <a href="${safeFileUrl}" class="note-btn btn-secondary" download="${note.fileName}">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                            Download
                        </a>
                    </div>
                </div>
            </div>
          `;
        }
      )
      .join('');
  }

  /**
   * Renders a message indicating that no notes are available.
   * @param {HTMLElement} gridContainer - The container element to place the message in.
   */
  function renderEmptyMessage(gridContainer) {
    gridContainer.innerHTML = `
            <div class="empty-notes-message">
                <p>No lecture notes have been added yet.</p>
            </div>
        `;
  }

  // Initial load when the page is ready.
  loadAndRenderNotes();
});