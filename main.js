const {
	app,
	BrowserWindow,
	screen,
	desktopCapturer,
	ipcMain,
} = require("electron")
const path = require("path")

const createWindow = () => {
	const { width } = screen.getPrimaryDisplay().workAreaSize
	const win = new BrowserWindow({
		width: 300,
		height: 300,
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
	win.webContents.openDevTools({ mode: "detach" })

	win.loadFile("index.html")
	win.setSkipTaskbar(true)
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
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit()
})
