import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 7474,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8090",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/wmsapi": {
        target: "http://175.208.134.144:2521",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        rewrite: (path) => path.replace(/^\/wmsapi/, ""),
      },
      "/geoserver": {
        target: "https://gsvr.dlof.kr",
        changeOrigin: true,
        secure: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
