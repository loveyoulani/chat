document.addEventListener("DOMContentLoaded", function() {
    // Mobile menu toggle
    const mobileMenuToggle = document.querySelector(".mobile-menu-toggle");
    const header = document.querySelector("header");
    
    if (mobileMenuToggle && header) {
        mobileMenuToggle.addEventListener("click", function() {
            header.classList.toggle("mobile-menu-open");
        });
    }
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === "#") return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                if (header && header.classList.contains("mobile-menu-open")) {
                    header.classList.remove("mobile-menu-open");
                }
            }
        });
    });
    
    // Check if API is available
    checkApiStatus().then(isAvailable => {
        if (!isAvailable) {
            showApiUnavailableMessage();
        }
    });
});

function showApiUnavailableMessage() {
    // Create alert element
    const alertElement = document.createElement("div");
    alertElement.className = "api-alert";
    alertElement.innerHTML = `
        <div class="api-alert-content">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>The server is currently starting up. Some features may be unavailable for a few moments.</span>
            <button class="api-alert-close">&times;</button>
        </div>
    `;
    
    // Style the alert
    const style = document.createElement("style");
    style.textContent = `
        .api-alert {
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            border-radius: 4px;
            padding: 12px 16px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            animation: slideIn 0.3s ease forwards;
        }
        
        .api-alert-content {
            display: flex;
            align-items: center;
        }
        
        .api-alert svg {
            margin-right: 12px;
            flex-shrink: 0;
        }
        
        .api-alert-close {
            margin-left: auto;
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #721c24;
        }
        
        @keyframes slideIn {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        
        @media (min-width: 768px) {
            .api-alert {
                width: 400px;
                left: 20px;
                right: auto;
            }
        }
    `;
    
    // Add to document
    document.head.appendChild(style);
    document.body.appendChild(alertElement);
    
    // Add close button functionality
    const closeButton = alertElement.querySelector(".api-alert-close");
    if (closeButton) {
        closeButton.addEventListener("click", function() {
            alertElement.remove();
        });
    }
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (document.body.contains(alertElement)) {
            alertElement.remove();
        }
    }, 10000);
}