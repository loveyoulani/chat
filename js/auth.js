document.addEventListener("DOMContentLoaded", function() {
    // Register form handling
    const registerForm = document.getElementById("register-form");
    if (registerForm) {
        registerForm.addEventListener("submit", async function(event) {
            event.preventDefault();
            
            const username = document.getElementById("username").value;
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            const errorElement = document.getElementById("register-error");
            
            try {
                // Clear previous errors
                errorElement.style.display = "none";
                
                // Validate inputs
                if (!username || !email || !password) {
                    throw new Error("All fields are required");
                }
                
                // Register user
                const response = await fetch(`${API_URL}/register`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        username,
                        email,
                        password
                    })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.detail || "Registration failed");
                }
                
                // Registration successful, now log in
                const tokenResponse = await fetch(`${API_URL}/token`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({
                        username,
                        password
                    })
                });
                
                const tokenData = await tokenResponse.json();
                
                if (!tokenResponse.ok) {
                    throw new Error("Login after registration failed");
                }
                
                // Save token and redirect
                localStorage.setItem("token", tokenData.access_token);
                localStorage.setItem("username", username);
                window.location.href = "dashboard.html";
                
            } catch (error) {
                errorElement.textContent = error.message;
                errorElement.style.display = "block";
            }
        });
        
        // Password strength meter
        const passwordInput = document.getElementById("password");
        const meterSections = document.querySelectorAll(".meter-section");
        const strengthText = document.querySelector(".strength-text");
        
        passwordInput.addEventListener("input", function() {
            const password = this.value;
            let strength = 0;
            
            if (password.length >= 8) strength++;
            if (/[A-Z]/.test(password)) strength++;
            if (/[0-9]/.test(password)) strength++;
            if (/[^A-Za-z0-9]/.test(password)) strength++;
            
            // Update meter
            meterSections.forEach((section, index) => {
                section.className = "meter-section";
                if (index < strength) {
                    if (strength <= 2) section.classList.add("weak");
                    else if (strength === 3) section.classList.add("medium");
                    else section.classList.add("strong");
                }
            });
            
            // Update text
            if (password.length === 0) {
                strengthText.textContent = "Password strength";
            } else if (strength <= 2) {
                strengthText.textContent = "Weak password";
            } else if (strength === 3) {
                strengthText.textContent = "Medium strength";
            } else {
                strengthText.textContent = "Strong password";
            }
        });
    }
    
    // Login form handling
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async function(event) {
            event.preventDefault();
            
            const username = document.getElementById("username").value;
            const password = document.getElementById("password").value;
            const errorElement = document.getElementById("login-error");
            
            try {
                // Clear previous errors
                errorElement.style.display = "none";
                
                // Validate inputs
                if (!username || !password) {
                    throw new Error("Username and password are required");
                }
                
                // Login
                const response = await fetch(`${API_URL}/token`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({
                        username,
                        password
                    })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.detail || "Login failed");
                }
                
                // Save token and redirect
                localStorage.setItem("token", data.access_token);
                localStorage.setItem("username", username);
                window.location.href = "dashboard.html";
                
            } catch (error) {
                errorElement.textContent = error.message;
                errorElement.style.display = "block";
            }
        });
    }
});

// Check if user is logged in
function isLoggedIn() {
    return !!localStorage.getItem("token");
}

// Logout function
function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    window.location.href = "login.html";
}

// Add event listeners to logout buttons
document.addEventListener("DOMContentLoaded", function() {
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }
    
    const dropdownLogout = document.getElementById("dropdown-logout");
    if (dropdownLogout) {
        dropdownLogout.addEventListener("click", function(e) {
            e.preventDefault();
            logout();
        });
    }
});