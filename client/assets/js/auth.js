// client/assets/js/auth.js

(() => {
  const token = localStorage.getItem('piRateToken');
  const currentPage = window.location.pathname;
  
  // Checks if the current page is the login page.
  const isLoginPage = currentPage.endsWith('/login/html');

  // If there is no token AND the user is not currently on the login page,
  // they are not authorized and will be redirected.
  if (!token && !isLoginPage) {
    // This absolute path works from anywhere in your site.
    window.location.href = '/login/login.html';
  }
})();
