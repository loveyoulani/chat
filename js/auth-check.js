document.addEventListener("DOMContentLoaded", function() {
    // Check if token exists
    const token = localStorage.getItem("token");
    
    if (!token) {
        // Redirect to login if no token
        window.location.href = "login.html";
        return;
    }
    
    // Set user info in UI
    const username = localStorage.getItem("username");
    const userInitials = document.getElementById("user-initials");
    const userName = document.getElementById("user-name");
    
    if (username && userInitials) {
        // Get initials from username
        const initials = username
            .split(" ")
            .map(name => name[0])
            .join("")
            .toUpperCase()
            .substring(0, 2);
        
        userInitials.textContent = initials;
    }
    
    if (username && userName) {
        userName.textContent = username;
    }
    
    // Toggle user dropdown
    const userDropdownToggle = document.querySelector(".user-dropdown-toggle");
    const userDropdownMenu = document.querySelector(".user-dropdown-menu");
    
    if (userDropdownToggle && userDropdownMenu) {
        userDropdownToggle.addEventListener("click", function() {
            userDropdownMenu.classList.toggle("active");
        });
        
        // Close dropdown when clicking outside
        document.addEventListener("click", function(event) {
            if (!userDropdownToggle.contains(event.target) && !userDropdownMenu.contains(event.target)) {
                userDropdownMenu.classList.remove("active");
            }
        });
    }
    
    // Toggle sidebar on mobile
    const sidebarToggle = document.querySelector(".sidebar-toggle");
    const sidebar = document.querySelector(".sidebar");
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", function() {
            sidebar.classList.toggle("active");
        });
    }
});