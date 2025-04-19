// Preload script for Electron security best practices
// No APIs exposed yet, but can be extended for secure communication

const { contextBridge, ipcRenderer } = require("electron")
const path = require("path")
require("dotenv").config({ path: path.join(__dirname, ".env") })

// Log when preload script runs
console.log("Preload script is running")
console.log("CLAUDE_API_KEY exists:", !!process.env.CLAUDE_API_KEY)

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld("electron", {
	capture: {
		getScreenshot: async () => {
			try {
				console.log("Requesting screenshot from main process...")
				return await ipcRenderer.invoke("CAPTURE_SCREEN")
			} catch (error) {
				console.error("Screenshot error:", error)
				throw error
			}
		},
	},
	env: {
		CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
	},
})
