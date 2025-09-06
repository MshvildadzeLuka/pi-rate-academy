/**
 * This script fetches the header HTML, injects it, sets the active nav link,
 * and populates user-specific data by fetching it from the secure server API.
 * Updated with mobile menu functionality and Georgian language support.
 */
document.addEventListener('DOMContentLoaded', () => {
  const headerPlaceholder = document.getElementById('header-placeholder');
  if (!headerPlaceholder) return;

  // Load header HTML
  // CORRECTED PATH: Changed from '/client/header/header.html'
  fetch('/header/header.html')
    .then((response) => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.text();
    })
    .then((html) => {
      headerPlaceholder.innerHTML = html;
      setActiveLink();
      setupMobileMenu();
      populateHeader();
    })
    .catch((error) => {
      console.error('Failed to load header:', error);
      headerPlaceholder.innerHTML =
        '<p style="color: red; text-align: center;">ჰედერის ჩატვირთვა ვერ მოხერხდა.</p>';
    });

  function setActiveLink() {
    const navLinks = document.querySelectorAll('.nav-links a');
    const currentPath = window.location.pathname;

    navLinks.forEach((link) => {
      const linkPath = new URL(link.href).pathname;
      if (currentPath === linkPath) {
        link.classList.add('active');
      }
    });
  }

  function setupMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const navContainer = document.querySelector('.nav-container');
    
    if (menuToggle && navContainer) {
      menuToggle.addEventListener('click', () => {
        navContainer.classList.toggle('active');
        menuToggle.classList.toggle('active');
        
        // Animate hamburger icon
        const spans = menuToggle.querySelectorAll('span');
        if (navContainer.classList.contains('active')) {
          spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
          spans[1].style.opacity = '0';
          spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
        } else {
          spans[0].style.transform = 'none';
          spans[1].style.opacity = '1';
          spans[2].style.transform = 'none';
        }
      });
      
      // Close menu when clicking on a link
      const navLinks = document.querySelectorAll('.nav-links a');
      navLinks.forEach(link => {
        link.addEventListener('click', () => {
          navContainer.classList.remove('active');
          menuToggle.classList.remove('active');
          
          const spans = menuToggle.querySelectorAll('span');
          spans[0].style.transform = 'none';
          spans[1].style.opacity = '1';
          spans[2].style.transform = 'none';
        });
      });
    }
  }

  async function populateHeader() {
    const token = localStorage.getItem('piRateToken');
    // If there's no token, there's nothing to do. The auth.js script will handle redirection.
    if (!token) {
      return;
    }

    try {
      const response = await fetch('/api/users/profile', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const currentUser = await response.json();

        const profileImg = document.querySelector('.header-container .profile-img');
        const profileName = document.querySelector('.header-container .profile-name');
        const adminNavLink = document.getElementById('admin-nav-link');

        if (profileImg) {
          profileImg.src =
            currentUser.photoUrl ||
            `https://placehold.co/100x100/2A2A2A/EAEAEA?text=${currentUser.firstName[0]}${currentUser.lastName[0]}`;
          profileImg.alt = `${currentUser.firstName}-ის პროფილის სურათი`;
        }
        if (profileName) {
          profileName.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
        }

        // Hide the "Admin" link if the user is not an Admin
        if (adminNavLink && currentUser.role !== 'Admin') {
          adminNavLink.style.display = 'none';
        }
      } else {
        // If the token is invalid or expired, log the user out.
        console.error('Authentication failed:', response.statusText);
        localStorage.removeItem('piRateToken');
        // CORRECTED PATH: Redirects to the correct login page URL.
        window.location.href = '/login/login.html';
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      // In case of a network error, it's safer to log out.
      localStorage.removeItem('piRateToken');
      window.location.href = '/login/login.html';
    }

    // Set up the logout button functionality
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('piRateToken');
        // CORRECTED PATH: Ensures the logout redirects correctly.
        window.location.href = '/login/login.html';
      });
    }
  }
});
