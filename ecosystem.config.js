module.exports = {
  apps: [
    {
      name: "discord-music",
      script: "C:\\Users\\Jake\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
      args: "-m uvicorn main:app --host 0.0.0.0 --port 8000",
      cwd: "D:\\Test\\discord-music\\backend",
      interpreter: "none",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
    },
  ],
};
