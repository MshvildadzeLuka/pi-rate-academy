/**
 * GLOBAL AUTHENTICATION SCRIPT
 * ----------------------------
 * This script solves the "No Global Authentication Enforcement" problem.
 * It runs on every page (except login) to ensure that only authenticated
 * users can view the content.
 *
 * It should be included in the <head> of each HTML file to execute
 * before the page content is rendered.
 */

(() => {
  // Retrieve the authentication token from localStorage.
  // The login page will set this token upon successful login.
  const token = localStorage.getItem('piRateToken');

  // Get the current page's path.
  const currentPage = window.location.pathname;

  // Check if the user is on the login page.
  const isLoginPage = currentPage.endsWith('/login/login.html') || currentPage.endsWith('/login/');

  // If there is no token AND the user is not on the login page,
  // they are not authorized. Redirect them to the login page.
  if (!token && !isLoginPage) {
    // CORRECTED PATH: Ensures it redirects correctly from any page.
    window.location.href = '/login/login.html';
  }
})();
