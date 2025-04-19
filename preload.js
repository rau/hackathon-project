// Preload script for Electron security best practices
// No APIs exposed yet, but can be extended for secure communication

const { contextBridge, ipcRenderer } = require("electron")
const path = require("path")
require("dotenv").config({ path: path.join(__dirname, ".env") })

// Import the logic module
const appLogic = require("./logic.js")

// Log when preload script runs
console.log("Preload script is running")
console.log("CLAUDE_API_KEY exists:", !!process.env.CLAUDE_API_KEY)
console.log("AppLogic loaded:", !!appLogic)

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld("electron", {
	capture: {
		getScreenshot: async () => {
			try {
				console.log("Requesting screenshot from main process...")
				// Ensure the IPC handler 'CAPTURE_SCREEN' exists in main.js
				return await ipcRenderer.invoke("CAPTURE_SCREEN")
			} catch (error) {
				console.error("Screenshot error in preload:", error)
				throw error // Re-throw for renderer to potentially handle
			}
		},
	},
	env: {
		CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
	},
	logic: {
		// Expose only the necessary public API from logic.js
		initialize: appLogic.initialize,
		getState: appLogic.getState,
		toggleMode: appLogic.toggleMode,
		toggleStatsVisibility: appLogic.toggleStatsVisibility,
		startProductivityCheck: appLogic.startProductivityCheck,
		stopProductivityCheck: appLogic.stopProductivityCheck,
		getHelpOrChat: appLogic.getHelpOrChat,
	},
})
