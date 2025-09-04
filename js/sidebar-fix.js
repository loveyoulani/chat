document.addEventListener("DOMContentLoaded", function() {
    // Fix for sidebar visibility on mobile
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const mobileSidebarToggle = document.querySelector('.mobile-sidebar-toggle');
    
    function toggleSidebar() {
        if (sidebar) {
            sidebar.classList.toggle("active");
            
            // Create or remove overlay
            const existingOverlay = document.querySelector('.sidebar-overlay');
            
            if (sidebar.classList.contains("active")) {
                if (existingOverlay) {
                    existingOverlay.classList.add("active");
                } else {
                    const overlay = document.createElement("div");
                    overlay.className = "sidebar-overlay active";
                    document.body.appendChild(overlay);
                    
                    overlay.addEventListener("click", toggleSidebar);
                }
            } else if (existingOverlay) {
                existingOverlay.classList.remove("active");
            }
            
            // Ensure sidebar content is visible
            const sidebarSections = sidebar.querySelectorAll('.sidebar-nav, .sidebar-footer, .sidebar-header');
            sidebarSections.forEach(section => {
                section.style.display = 'block';
                section.style.visibility = 'visible';
            });
        }
    }
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", toggleSidebar);
    }
    
    if (mobileSidebarToggle) {
        mobileSidebarToggle.addEventListener("click", toggleSidebar);
    }
    
    // Close sidebar when clicking overlay
    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener("click", toggleSidebar);
    }
});

