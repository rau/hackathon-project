const {
	app,
	BrowserWindow,
	screen,
	desktopCapturer,
	ipcMain,
	globalShortcut,
} = require("electron")
const path = require("path")
const activeWindow = require("active-win")

let mainWindow = null
let lastActiveAppName = null
let windowCheckInterval

const createWindow = () => {
	const { width } = screen.getPrimaryDisplay().workAreaSize
	mainWindow = new BrowserWindow({
		width: 300,
		height: 500,
		x: width - 320,
		y: 20,
		frame: false,
		alwaysOnTop: true,
		transparent: true,
		resizable: false,
		hasShadow: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: true,
			contextIsolation: true,
			enableRemoteModule: true,
			webSecurity: true,
		},
	})

	// Enable dev tools in development
	mainWindow.webContents.openDevTools({ mode: "detach" })

	mainWindow.loadFile("index.html")
	mainWindow.setSkipTaskbar(true)

	// Start monitoring active window changes
	startWindowMonitoring()
}

const startWindowMonitoring = () => {
	if (windowCheckInterval) {
		clearInterval(windowCheckInterval)
	}

	// Use BrowserWindow's blur and focus events instead of active-win
	mainWindow.on("blur", () => {
		const focusedWindow = BrowserWindow.getFocusedWindow()
		if (!focusedWindow) {
			// If no Electron window is focused, it means user switched to another app
			const appName = "External App" // Generic name for non-Electron apps
			if (appName !== lastActiveAppName) {
				lastActiveAppName = appName
				mainWindow.webContents.send("active-window-changed", {
					appName: appName,
					windowTitle: "External Application",
				})
			}
		}
	})

	mainWindow.on("focus", () => {
		const appName = "Sprite Widget"
		if (appName !== lastActiveAppName) {
			lastActiveAppName = appName
			mainWindow.webContents.send("active-window-changed", {
				appName: appName,
				windowTitle: "Sprite Widget",
			})
		}
	})
}

// Handle screen capture request
ipcMain.handle("CAPTURE_SCREEN", async () => {
	try {
		const sources = await desktopCapturer.getSources({
			types: ["screen"],
			thumbnailSize: { width: 1920, height: 1080 },
		})
		return sources[0].thumbnail.toDataURL()
	} catch (error) {
		console.error("Error capturing screen:", error)
		throw error
	}
})

app.whenReady().then(() => {
	createWindow()

	// Register the keyboard shortcut
	globalShortcut.register("CommandOrControl+Shift+H", () => {
		if (mainWindow.isVisible()) {
			mainWindow.hide()
		} else {
			mainWindow.show()
		}
	})

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

// Clean up shortcuts when app is quitting
app.on("will-quit", () => {
	globalShortcut.unregisterAll()
})

app.on("window-all-closed", () => {
	if (windowCheckInterval) {
		clearInterval(windowCheckInterval)
	}
	if (process.platform !== "darwin") app.quit()
})
