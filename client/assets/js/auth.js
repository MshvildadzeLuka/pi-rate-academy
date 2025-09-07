(() => {
  const token = localStorage.getItem('piRateToken');
  const currentPage = window.location.pathname;
  
  // This reliably checks if the user is on any page within the /login/ directory.
  const isLoginPage = currentPage.includes('/login/');

  if (!token && !isLoginPage) {
    // This is an absolute path from the root of the website.
    window.location.href = '/login/login.html';
  }
})();
