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
   * Main function to load video data from the server and render the two sections.
   */
  async function loadAndRenderVideos() {
    const uploadedGrid = document.getElementById('uploaded-videos-grid');
    const linkedGrid = document.getElementById('linked-videos-grid');

    try {
      const allVideos = await apiFetch('/api/videos');

      // Filter videos into two separate arrays based on their type
      const uploadedVideos = allVideos.filter(
        (video) => video.type === 'upload'
      );
      const linkedVideos = allVideos.filter((video) => video.type === 'link');

      // Render Uploaded Videos Section
      if (uploadedGrid) {
        if (uploadedVideos.length > 0) {
          uploadedGrid.innerHTML = generateVideoGridHTML(uploadedVideos);
        } else {
          renderEmptyMessage(
            uploadedGrid,
            'No Lecture Recordings have been uploaded yet.'
          );
        }
      }

      // Render Linked Videos Section
      if (linkedGrid) {
        if (linkedVideos.length > 0) {
          linkedGrid.innerHTML = generateVideoGridHTML(linkedVideos);
        } else {
          renderEmptyMessage(
            linkedGrid,
            'No Additional Resources have been linked yet.'
          );
        }
      }
    } catch (error) {
      console.error('Error fetching videos data from server:', error);
      if (uploadedGrid) {
        renderEmptyMessage(uploadedGrid, 'Could not load videos.');
      }
      if (linkedGrid) {
        renderEmptyMessage(linkedGrid, 'Could not load resources.');
      }
    }
  }

  /**
   * Generates the HTML for a grid of video cards with sanitized data to prevent XSS.
   * @param {Array<Object>} videoArray - The array of video objects.
   * @returns {string} The complete HTML string for the grid.
   */
  function generateVideoGridHTML(videoArray) {
    return videoArray
      .map(
        (video) => {
          // Create "safe" variables by sanitizing and validating API data before rendering.
          const safeTitle = escapeHTML(video.title);
          const safeDescription = escapeHTML(video.description);
          // Validate the URL to ensure it's a safe HTTP/HTTPS link.
          const safeUrl = (video.url && video.url.startsWith('http')) 
            ? video.url 
            : '#';

          return `
                <div class="video-card">
                    <a href="${safeUrl}" class="video-thumbnail-link" target="_blank" rel="noopener noreferrer">
                        <div class="video-thumbnail">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                    </a>
                    <div class="video-content">
                        <div class="video-info">
                            <h3 class="video-title">${safeTitle}</h3>
                            <p class="video-description">${safeDescription}</p>
                        </div>
                        <div class="video-actions">
                            <a href="${safeUrl}" class="watch-btn" target="_blank" rel="noopener noreferrer">
                                Watch Video
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
   * Renders an empty state message in a given container.
   * @param {HTMLElement} container - The container element.
   * @param {string} message - The message to display.
   */
  function renderEmptyMessage(container, message) {
    if (container) {
      container.innerHTML = `<div class="empty-videos-message"><p>${message}</p></div>`;
    }
  }

  // Initial render on page load.
  loadAndRenderVideos();
});