document.addEventListener('DOMContentLoaded', () => {
  // --- Element Selectors ---
  const loginForm = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorMessage = document.getElementById('error-message');

  if (loginForm) {
    // --- Form Submission Logic ---
    // The event listener is now an async function to handle the API call.
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault(); // Prevent page reload

      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();

      if (email === '' || password === '') {
        showError('Please fill in all fields.');
        return;
      }

      hideError();

      // --- NEW: API-BASED AUTHENTICATION LOGIC ---
      try {
        // Use fetch() to send a POST request to the server's login endpoint.
        const response = await fetch('http://localhost:5001/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        // Check if the server responded with a success status code (e.g., 200 OK).
        if (response.ok) {
          // --- SUCCESS: Store the token and redirect ---
          // The token is the key to our application's security.
          // The auth.js script on other pages will look for this token.
          localStorage.setItem('piRateToken', data.token);

          // Redirect to the home page after successful login.
          window.location.href = '../home/home.html';
        } else {
          // --- FAILURE: Display the error message from the server ---
          // The server provides a specific error message (e.g., "Invalid email or password").
          showError(data.message || 'An unknown error occurred.');
        }
      } catch (error) {
        // This catch block handles network errors (e.g., server is down).
        console.error('Login failed:', error);
        showError('Could not connect to the server. Please try again later.');
      }
    });
  }

  // --- Error Handling Functions (Unchanged) ---
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('error-hidden');
    errorMessage.classList.add('error-visible');
  }

  function hideError() {
    errorMessage.textContent = ''; // Clear message
    errorMessage.classList.remove('error-visible');
    errorMessage.classList.add('error-hidden');
  }
});