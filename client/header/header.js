/**
 * This script fetches the header HTML, injects it, sets the active nav link,
 * and populates user-specific data by fetching it from the secure server API.
 */
document.addEventListener('DOMContentLoaded', () => {
  const headerPlaceholder = document.getElementById('header-placeholder');
  if (!headerPlaceholder) return;

  // The header is loaded dynamically into the placeholder div on each page.
  // Using an absolute path ensures it works correctly from any page depth.
  fetch('/client/header/header.html')
    .then((response) => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.text();
    })
    .then((html) => {
      headerPlaceholder.innerHTML = html;
      setActiveLink();
      populateHeader(); // Populate user data after header is loaded
    })
    .catch((error) => {
      console.error('Failed to load header:', error);
      headerPlaceholder.innerHTML =
        '<p style="color: red; text-align: center;">Could not load header.</p>';
    });

  function setActiveLink() {
    const navLinks = document.querySelectorAll('.nav-links a');
    const currentPath = window.location.pathname;

    navLinks.forEach((link) => {
      // Create a URL object to easily access the pathname
      const linkPath = new URL(link.href).pathname;
      if (currentPath === linkPath) {
        link.classList.add('active');
      }
    });
  }

  /**
   * Populates the header with data for the currently logged-in user by
   * fetching their profile from the server's secure API endpoint.
   */
  async function populateHeader() {
    // Retrieve the authentication token saved by the login page.
    const token = localStorage.getItem('piRateToken');
    if (!token) {
      // If no token is found, do nothing. The auth.js script will handle redirection.
      return;
    }

    try {
      // Fetch the user's profile from the server.
      // The token is sent in the Authorization header for authentication.
      const response = await fetch('http://localhost:5001/api/users/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const currentUser = await response.json();

        // Update UI elements with the fetched user data
        const profileImg = document.querySelector(
          '.header-container .profile-img'
        );
        const profileName = document.querySelector(
          '.header-container .profile-name'
        );
        const adminNavLink = document.getElementById('admin-nav-link');

        if (profileImg) {
          profileImg.src =
            currentUser.photoUrl ||
            `https://placehold.co/100x100/2A2A2A/EAEAEA?text=${currentUser.firstName[0]}${currentUser.lastName[0]}`;
          profileImg.alt = `${currentUser.firstName}'s profile picture`;
        }
        if (profileName) {
          profileName.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
        }

        // Show/hide Admin link based on the user's role from the database
        if (adminNavLink && currentUser.role !== 'Admin') {
          adminNavLink.style.display = 'none';
        }
      } else {
        // If the token is invalid or expired, the server will send an error.
        // We log the user out for security.
        console.error('Authentication failed:', response.statusText);
        localStorage.removeItem('piRateToken');
        window.location.href = '/client/login/login.html';
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
    }

    // Add logout functionality
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        // Clear the token from storage to log the user out.
        localStorage.removeItem('piRateToken');
        window.location.href = '/client/login/login.html';
      });
    }
  }
});