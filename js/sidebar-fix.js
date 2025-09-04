document.addEventListener("DOMContentLoaded", function() {
    console.log("Sidebar fix script loaded");
    
    // Fix for sidebar visibility on mobile
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const mobileSidebarToggle = document.querySelector('.mobile-sidebar-toggle');
    
    console.log("Sidebar element:", sidebar);
    console.log("Sidebar toggle button:", sidebarToggle);
    console.log("Mobile sidebar toggle button:", mobileSidebarToggle);
    
    // Remove any existing overlay to avoid duplicates
    const existingOverlays = document.querySelectorAll('.sidebar-overlay');
    existingOverlays.forEach(overlay => overlay.remove());
    
    // Create new overlay
    const sidebarOverlay = document.createElement("div");
    sidebarOverlay.className = "sidebar-overlay";
    document.body.appendChild(sidebarOverlay);
    
    console.log("Created sidebar overlay:", sidebarOverlay);
    
    function openSidebar() {
        console.log("Opening sidebar");
        if (sidebar) {
            sidebar.classList.add("active");
            sidebarOverlay.classList.add("active");
            document.body.classList.add("sidebar-open");
            
            // Ensure sidebar content is visible
            const sidebarSections = sidebar.querySelectorAll('.sidebar-nav, .sidebar-footer, .sidebar-header');
            sidebarSections.forEach(section => {
                section.style.display = 'block';
                section.style.visibility = 'visible';
            });
        }
    }
    
    function closeSidebar() {
        console.log("Closing sidebar");
        if (sidebar) {
            sidebar.classList.remove("active");
            sidebarOverlay.classList.remove("active");
            document.body.classList.remove("sidebar-open");
        }
    }
    
    function toggleSidebar(event) {
        event.preventDefault();
        event.stopPropagation();
        console.log("Toggle sidebar called");
        
        if (sidebar && sidebar.classList.contains("active")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }
    
    // Add click event listeners with direct function calls to ensure they work
    if (sidebarToggle) {
        console.log("Adding click listener to sidebar toggle");
        sidebarToggle.onclick = toggleSidebar;
    }
    
    if (mobileSidebarToggle) {
        console.log("Adding click listener to mobile sidebar toggle");
        mobileSidebarToggle.onclick = toggleSidebar;
    }
    
    // Close sidebar when clicking overlay
    sidebarOverlay.onclick = closeSidebar;
    
    // Close sidebar when pressing Escape key
    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape" && sidebar && sidebar.classList.contains("active")) {
            closeSidebar();
        }
    });
    
    // Handle touch swipe to close sidebar
    let touchStartX = 0;
    
    if (sidebar) {
        sidebar.addEventListener("touchstart", function(e) {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        sidebar.addEventListener("touchend", function(e) {
            const touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            
            // If swiped left (diff > 0), close the sidebar
            if (diff > 50) {
                closeSidebar();
            }
        }, { passive: true });
    }
    
    // Check window width and close sidebar automatically on larger screens
    function checkWindowSize() {
        if (window.innerWidth > 768 && sidebar && sidebar.classList.contains("active")) {
            closeSidebar();
        }
    }
    
    // Listen for resize events
    window.addEventListener("resize", checkWindowSize);
    
    // Initial check
    checkWindowSize();
    
    // Add direct click handler to mobile toggle button for extra assurance
    document.querySelectorAll('.mobile-sidebar-toggle').forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            console.log("Mobile sidebar toggle clicked directly");
            openSidebar();
        });
    });
});

