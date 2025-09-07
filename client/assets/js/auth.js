// This script acts as a guard for all protected pages.
// It runs immediately to check for an authentication token.
(() => {
  const token = localStorage.getItem('piRateToken');
  const currentPage = window.location.pathname;
  
  // Checks if the current page is the login page.
  const isLoginPage = currentPage.includes('/login/');

  // If there's no token and the user is NOT on the login page,
  // they are redirected to the login page.
  if (!token && !isLoginPage) {
    // ✅ FIX: Use an absolute path for redirection. This is more reliable
    // than relative paths like '../' as it works from any page depth.
    window.location.href = '/login/login.html';
  }
})();
