class VideoManager {
  constructor() {
    this.uploadedVideos = [];
    this.linkedVideos = [];
    this.currentUploadedPage = 1;
    this.currentLinkedPage = 1;
    this.videosPerPage = 8;
    this.API_BASE_URL = '/api';

    this.init();
  }

  async init() {
    // Check authentication first
    if (!this.checkAuth()) {
      return;
    }

    // Set up event listeners
    this.setupEventListeners();

    // Load and render videos
    await this.loadAndRenderVideos();

    // Set up video modal
    this.setupVideoModal();
  }

  checkAuth() {
    const token = localStorage.getItem('piRateToken');
    if (!token) {
      window.location.href = '../login/login.html';
      return false;
    }
    return true;
  }

  async apiFetch(endpoint, options = {}) {
    if (!this.checkAuth()) return null;

    const token = localStorage.getItem('piRateToken');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      // Handle unauthorized responses
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('piRateToken');
        window.location.href = '../login/login.html';
        throw new Error('Authentication required');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  getYouTubeId(url) {
    if (!url) return null;

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  getYouTubeEmbedUrl(url) {
    const videoId = this.getYouTubeId(url);
    // CORRECTED: This now creates the proper embed URL and adds parameters
    // to ensure the video plays immediately and without showing related videos.
    return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1` : '';
  }

  async loadAndRenderVideos() {
    try {
      // Show loading state
      this.showLoadingState();

      // Fetch all videos
      const response = await this.apiFetch('/videos');

      if (!response || !response.success) {
        throw new Error(response?.message || 'Failed to load videos');
      }

      const allVideos = response.data?.videos || response.videos || [];

      // CORRECTED: Sort all videos by creation date (newest first)
      allVideos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Filter videos after sorting
      this.uploadedVideos = allVideos.filter(video => 
        video.type === 'upload' || 
        (video.tags && video.tags.includes('lecture')) ||
        (!video.type && !video.tags)
      );

      this.linkedVideos = allVideos.filter(video => 
        video.type === 'link' || 
        (video.tags && video.tags.includes('resource'))
      );

      // Render videos
      this.renderVideosSection(this.uploadedVideos, 'uploaded');
      this.renderVideosSection(this.linkedVideos, 'linked');

    } catch (error) {
      console.error('Error loading videos:', error);
      this.showError(error.message);
    }
  }

  showLoadingState() {
    const uploadedGrid = document.getElementById('uploaded-videos-grid');
    const linkedGrid = document.getElementById('linked-videos-grid');

    if (uploadedGrid) {
      uploadedGrid.innerHTML = '<div class="empty-videos-message"><p>Loading videos...</p></div>';
    }

    if (linkedGrid) {
      linkedGrid.innerHTML = '<div class="empty-videos-message"><p>Loading videos...</p></div>';
    }
  }

  renderVideosSection(videos, type) {
    const container = document.getElementById(`${type}-videos-grid`);
    if (!container) return;

    const currentPage = type === 'uploaded' ? this.currentUploadedPage : this.currentLinkedPage;
    const startIndex = (currentPage - 1) * this.videosPerPage;
    const endIndex = startIndex + this.videosPerPage;
    const paginatedVideos = videos.slice(startIndex, endIndex);

    if (paginatedVideos.length > 0) {
      container.innerHTML = this.generateVideoGridHTML(paginatedVideos);
    } else {
      const message = type === 'uploaded' 
        ? 'No lecture recordings available.' 
        : 'No additional resources available.';
      this.renderEmptyMessage(container, message);
    }

    this.updatePagination(videos, type);
  }

  generateVideoGridHTML(videoArray) {
    return videoArray
      .map(video => {
        const safeTitle = this.escapeHTML(video.title || 'Untitled Video');
        const safeDescription = this.escapeHTML(video.description || 'No description provided');
        const safeUrl = video.url || '#';

        // Get YouTube thumbnail
        const youtubeId = this.getYouTubeId(safeUrl);
        const thumbnailUrl = youtubeId 
          ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
          : '';

        return `
          <div class="video-card">
            <div class="video-thumbnail">
              ${thumbnailUrl ? 
                `<img src="${thumbnailUrl}" alt="${safeTitle}" onerror="this.onerror=null; this.src=''; this.parentNode.innerHTML='<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M8 5v14l11-7z\"/></svg>';" />` : 
                `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`
              }
            </div>
            <div class="video-content">
              <div class="video-info">
                <h3 class="video-title">${safeTitle}</h3>
                <p class="video-description">${safeDescription}</p>
              </div>
              <div class="video-actions">
                <button class="watch-btn" data-video-url="${safeUrl}">
                  <i class="fas fa-play"></i> Watch
                </button>
                <a href="${safeUrl}" class="youtube-btn" target="_blank" rel="noopener noreferrer">
                  <i class="fab fa-youtube"></i> On YouTube
                </a>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  updatePagination(videos, type) {
    const totalPages = Math.max(1, Math.ceil(videos.length / this.videosPerPage));
    const currentPage = type === 'uploaded' ? this.currentUploadedPage : this.currentLinkedPage;

    const currentPageElement = document.getElementById(`${type}-current-page`);
    const totalPagesElement = document.getElementById(`${type}-total-pages`);

    if (currentPageElement) currentPageElement.textContent = currentPage;
    if (totalPagesElement) totalPagesElement.textContent = totalPages;

    // Update button states
    const prevBtn = document.getElementById(`${type}-prev-page-btn`);
    const nextBtn = document.getElementById(`${type}-next-page-btn`);

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages || totalPages === 0;
  }

  renderEmptyMessage(container, message) {
    if (container) {
      container.innerHTML = `
        <div class="empty-videos-message">
          <p>${message}</p>
        </div>
      `;
    }
  }

  showError(message) {
    const uploadedGrid = document.getElementById('uploaded-videos-grid');
    const linkedGrid = document.getElementById('linked-videos-grid');

    if (uploadedGrid) {
      this.renderEmptyMessage(uploadedGrid, message);
    }

    if (linkedGrid) {
      this.renderEmptyMessage(linkedGrid, message);
    }
  }

  setupVideoModal() {
    const modal = document.getElementById('video-modal');
    const closeBtn = document.getElementById('close-modal');
    const videoPlayer = document.getElementById('video-player');

    if (!modal || !closeBtn || !videoPlayer) return;

    // Add event listeners to watch buttons
    document.addEventListener('click', (e) => {
      const watchBtn = e.target.closest('.watch-btn');
      if (watchBtn) {
        const videoUrl = watchBtn.getAttribute('data-video-url');
        const embedUrl = this.getYouTubeEmbedUrl(videoUrl);

        if (embedUrl) {
          videoPlayer.src = `${embedUrl}&autoplay=1`;
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
        } else {
          alert('Invalid YouTube URL. Please check the video link.');
        }
      }
    });

    // Close modal functionality
    closeBtn.addEventListener('click', () => this.closeVideoModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeVideoModal();
      }
    });

    // Close with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        this.closeVideoModal();
      }
    });
  }

  closeVideoModal() {
    const modal = document.getElementById('video-modal');
    const videoPlayer = document.getElementById('video-player');

    if (modal && videoPlayer) {
      modal.classList.remove('active');
      videoPlayer.src = '';
      document.body.style.overflow = '';
    }
  }

  setupEventListeners() {
    // Pagination event listeners
    document.getElementById('uploaded-prev-page-btn')?.addEventListener('click', () => {
      if (this.currentUploadedPage > 1) {
        this.currentUploadedPage--;
        this.renderVideosSection(this.uploadedVideos, 'uploaded');
      }
    });

    document.getElementById('uploaded-next-page-btn')?.addEventListener('click', () => {
      const totalPages = Math.ceil(this.uploadedVideos.length / this.videosPerPage);
      if (this.currentUploadedPage < totalPages) {
        this.currentUploadedPage++;
        this.renderVideosSection(this.uploadedVideos, 'uploaded');
      }
    });

    document.getElementById('linked-prev-page-btn')?.addEventListener('click', () => {
      if (this.currentLinkedPage > 1) {
        this.currentLinkedPage--;
        this.renderVideosSection(this.linkedVideos, 'linked');
      }
    });

    document.getElementById('linked-next-page-btn')?.addEventListener('click', () => {
      const totalPages = Math.ceil(this.linkedVideos.length / this.videosPerPage);
      if (this.currentLinkedPage < totalPages) {
        this.currentLinkedPage++;
        this.renderVideosSection(this.linkedVideos, 'linked');
      }
    });
  }
}

// Initialize the video manager when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new VideoManager();
});
