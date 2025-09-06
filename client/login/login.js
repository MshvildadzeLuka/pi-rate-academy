document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');

    // --- Form Validation Functions ---
    const isValidEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const isValidPassword = (password) => {
        return password.length >= 6;
    };

    // --- Error Handling Functions ---
    const showError = (message) => {
        errorMessage.textContent = message;
        errorMessage.classList.remove('error-hidden');
        errorMessage.classList.add('error-visible');
        
        // Add vibration effect on mobile devices for better UX
        if ('vibrate' in navigator) {
            navigator.vibrate(200);
        }
    };

    const hideError = () => {
        errorMessage.textContent = '';
        errorMessage.classList.remove('error-visible');
        errorMessage.classList.add('error-hidden');
    };

    // --- Input Validation on Blur ---
    emailInput.addEventListener('blur', () => {
        const email = emailInput.value.trim();
        if (email && !isValidEmail(email)) {
            showError('გთხოვთ, შეიყვანოთ მართებული ელ. ფოსტის მისამართი');
        } else {
            hideError();
        }
    });

    passwordInput.addEventListener('blur', () => {
        const password = passwordInput.value.trim();
        if (password && !isValidPassword(password)) {
            showError('პაროლი უნდა შედგებოდეს მინიმუმ 6 სიმბოლოსგან');
        } else {
            hideError();
        }
    });

    // --- Form Submission Logic ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            
            // Validate inputs
            if (email === '' || password === '') {
                showError('გთხოვთ, შეავსოთ ყველა ველი');
                return;
            }
            
            if (!isValidEmail(email)) {
                showError('გთხოვთ, შეიყვანოთ მართებული ელ. ფოსტის მისამართი');
                return;
            }
            
            if (!isValidPassword(password)) {
                showError('პაროლი უნდა შედგებოდეს მინიმუმ 6 სიმბოლოსგან');
                return;
            }
            
            hideError();
            
            // Show loading state
            const submitButton = loginForm.querySelector('.login-btn');
            const originalText = submitButton.textContent;
            submitButton.textContent = 'იხდება შესვლა...';
            submitButton.disabled = true;
            
            // --- API-Based Authentication Logic ---
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, password }),
                });

                const data = await response.json();

                if (response.ok) {
                    // Store token and redirect on success
                    localStorage.setItem('piRateToken', data.token);
                    window.location.href = '../home/home.html';
                } else {
                    // Display server error message
                    showError(data.message || 'დაფიქსირდა შეცდომა. გთხოვთ, სცადოთ მოგვიანებით');
                }
            } catch (error) {
                console.error('Login failed:', error);
                showError('სერვერთან დაკავშირება ვერ მოხერხდა. გთხოვთ, სცადოთ მოგვიანებით');
            } finally {
                // Restore button state
                submitButton.textContent = originalText;
                submitButton.disabled = false;
            }
        });
    }

    // --- Mobile-friendly Input Enhancements ---
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        // Improve touch experience on mobile
        input.addEventListener('touchstart', (e) => {
            e.target.style.backgroundColor = '#16213e';
        });
        
        input.addEventListener('touchend', (e) => {
            e.target.style.backgroundColor = '#16213e';
        });
        
        // Prevent zoom on focus for iOS
        input.addEventListener('focus', () => {
            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                document.body.style.zoom = '0.9';
            }
        });
        
        input.addEventListener('blur', () => {
            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                document.body.style.zoom = '1';
            }
        });
    });
    
    // Handle Android virtual keyboard appearance
    window.addEventListener('resize', () => {
        if (document.activeElement.tagName === 'INPUT') {
            document.activeElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    });
});
