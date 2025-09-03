// API Configuration
const API_URL = "https://chat-8ynk.onrender.com";

// Check if API is available
async function checkApiStatus() {
    try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
            console.log("API is available");
            return true;
        } else {
            console.error("API returned an error:", await response.text());
            return false;
        }
    } catch (error) {
        console.error("Error connecting to API:", error);
        return false;
    }
}

// Keep the API alive with periodic health checks
function keepApiAlive() {
    setInterval(async () => {
        try {
            await fetch(`${API_URL}/health`);
        } catch (error) {
            console.error("Health check failed:", error);
        }
    }, 840000); // 14 minutes
}

// Start keeping the API alive
keepApiAlive();